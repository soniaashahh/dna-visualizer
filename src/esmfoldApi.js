/**
 * Calls the local Express proxy (server.js).
 * REACT_APP_ESMFOLD_BACKEND_URL — default http://localhost:5001
 */

function backendBaseUrl() {
  const raw = process.env.REACT_APP_ESMFOLD_BACKEND_URL;
  const fallback = "http://localhost:5001";
  const trimmed = (raw && String(raw).trim()) || fallback;
  if (!/^https?:\/\//i.test(trimmed)) {
    return fallback.replace(/\/$/, "");
  }
  return trimmed.replace(/\/$/, "");
}

function normalizeProteinSequence(seq) {
  return (seq || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

/**
 * @param {string} aminoAcidSequence — one-letter amino acid string
 * @returns {Promise<string>} PDB text
 */
export async function predictPdbWithEsmFold(aminoAcidSequence) {
  const cleaned = normalizeProteinSequence(aminoAcidSequence);
  if (cleaned.length < 4) {
    throw new Error("Protein sequence too short.");
  }

  const base = backendBaseUrl();
  const url = `${base}/esmfold`;

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sequence: cleaned }),
    });
  } catch (e) {
    const hint =
      `Cannot connect to ${url}. In a second terminal run: npm run server ` +
      `(HF_TOKEN in .env). If you use another port, set REACT_APP_ESMFOLD_BACKEND_URL and restart npm start.`;
    throw new Error(process.env.NODE_ENV === "development" ? `${hint} (${e.message})` : hint);
  }

  const text = await res.text();

  if (res.status === 404) {
    throw new Error(
      `No route at ${url} — open ${base}/health . If /health is OK, restart npm run server after pulling latest code. Body: ${text.slice(0, 200)}`
    );
  }

  if (!res.ok) {
    throw new Error(text.slice(0, 1200) || `Proxy error ${res.status}`);
  }

  if (!text.includes("ATOM") && !text.includes("HEADER") && !text.includes("MODEL")) {
    throw new Error("Invalid PDB from server. First chars: " + text.slice(0, 120));
  }

  return text;
}
