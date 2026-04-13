/**
 * Local proxy for ESMFold via ESM Atlas public API (no token needed).
 * Run: npm run server
 */
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const PORT = Number(process.env.PORT) || 5001;
const ESMATLAS_URL = "https://api.esmatlas.com/foldSequence/v1/pdb/";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "esmfold-proxy", port: PORT });
});

app.get("/esmfold", (_req, res) => {
  res.status(405).type("text/plain").send('Use POST with JSON body: { "sequence": "MKT..." }');
});

const postEsmfold = async (req, res) => {
  const raw =
    (typeof req.body === "string" ? req.body : null) ||
    (req.body && typeof req.body.sequence === "string" ? req.body.sequence : "") ||
    "";

  const sequence = String(raw)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

  if (sequence.length < 4) {
    return res.status(400).type("text/plain").send("Sequence too short (need 4+ amino acids).");
  }

  // ESM Atlas has a ~400 AA limit for the free endpoint
  if (sequence.length > 400) {
    return res.status(400).type("text/plain").send(
      `Sequence too long (${sequence.length} AA). ESM Atlas free endpoint supports up to ~400 AA. Try a shorter sequence.`
    );
  }

  try {
    console.log(`[ESMAtlas] Folding sequence of length ${sequence.length}...`);

    const atlasRes = await fetch(ESMATLAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: sequence,
    });

    const text = await atlasRes.text();

    if (!atlasRes.ok) {
      console.error(`[ESMAtlas] ${atlasRes.status}\n${text.slice(0, 800)}`);
      return res.status(502).type("text/plain").send(
        `[ESMAtlas ${atlasRes.status}] ${text.slice(0, 3500)}`
      );
    }

    if (!text.includes("ATOM") && !text.includes("HEADER") && !text.includes("MODEL")) {
      return res.status(502).type("text/plain").send(
        "ESMAtlas did not return valid PDB. First bytes: " + text.slice(0, 400)
      );
    }

    console.log(`[ESMAtlas] Success — ${text.length} bytes of PDB`);
    return res.type("text/plain").send(text);

  } catch (err) {
    console.error("[ESMAtlas] fetch error:", err.message);
    return res.status(502).type("text/plain").send("ESMAtlas request failed: " + err.message);
  }
};

app.post("/esmfold", postEsmfold);
app.post("/esmfold/", postEsmfold);

app.use((req, res) => {
  console.warn(`[no route] ${req.method} ${req.originalUrl}`);
  res.status(404).type("text/plain").send(`No route for ${req.method} ${req.originalUrl}`);
});

const server = app.listen(PORT, () => {
  console.log(`ESMFold proxy: http://localhost:${PORT}/esmfold (POST JSON { "sequence": "..." })`);
  console.log(`Health:        http://localhost:${PORT}/health`);
  console.log(`ESMAtlas upstream: ${ESMATLAS_URL}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\nPort ${PORT} is already in use. Stop the other process, or run:\n  PORT=${PORT + 1} npm run server\nThen set REACT_APP_ESMFOLD_BACKEND_URL=http://localhost:${PORT + 1} in .env.local\n`
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});