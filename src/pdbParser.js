const EMPTY_SUMMARY = {
  valid: false,
  pdbId: "",
  title: "",
  classification: "",
  method: "",
  modelCount: 0,
  atomCount: 0,
  heteroAtomCount: 0,
  residueCount: 0,
  chainCount: 0,
  chains: [],
  bounds: null,
  warnings: [],
};

function asNumber(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

export function parsePdbSummary(text) {
  if (!text || !text.trim()) {
    return { ...EMPTY_SUMMARY, warnings: ["No PDB text provided."] };
  }

  const lines = text.replace(/\r/g, "").split("\n");
  const titleParts = [];
  const expdtaParts = [];
  const warnings = [];
  const chainResidues = new Map();
  const chains = new Set();

  let pdbId = "";
  let classification = "";
  let atomCount = 0;
  let heteroAtomCount = 0;
  let modelCount = 0;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const line of lines) {
    if (!line) continue;
    const rec = line.slice(0, 6).trim();

    if (rec === "HEADER") {
      if (!classification) classification = line.slice(10, 50).trim();
      if (!pdbId) pdbId = line.slice(62, 66).trim().toUpperCase();
      continue;
    }

    if (rec === "TITLE") {
      titleParts.push(line.slice(10).trim());
      continue;
    }

    if (rec === "EXPDTA") {
      expdtaParts.push(line.slice(10).trim());
      continue;
    }

    if (rec === "MODEL") {
      modelCount += 1;
      continue;
    }

    if (rec !== "ATOM" && rec !== "HETATM") continue;

    const chain = (line[21] || "_").trim() || "_";
    const resName = line.slice(17, 20).trim() || "UNK";
    const resSeq = line.slice(22, 26).trim() || "?";
    const insCode = (line[26] || "").trim();
    const residueKey = `${resName}:${resSeq}:${insCode || "-"}`;

    chains.add(chain);
    if (!chainResidues.has(chain)) chainResidues.set(chain, new Set());
    chainResidues.get(chain).add(residueKey);

    if (rec === "ATOM") atomCount += 1;
    else heteroAtomCount += 1;

    const x = asNumber(line.slice(30, 38));
    const y = asNumber(line.slice(38, 46));
    const z = asNumber(line.slice(46, 54));
    if (x === null || y === null || z === null) continue;

    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  if (atomCount + heteroAtomCount === 0) {
    return {
      ...EMPTY_SUMMARY,
      pdbId,
      title: titleParts.join(" ").trim(),
      classification,
      method: expdtaParts.join(" ").trim(),
      warnings: ["No ATOM/HETATM records were found. Check whether this file is valid PDB text."],
    };
  }

  const chainList = Array.from(chains).sort((a, b) => a.localeCompare(b));
  const chainSummaries = chainList.map((id) => ({
    id,
    residueCount: chainResidues.get(id)?.size || 0,
  }));

  const residueCount = chainSummaries.reduce((sum, item) => sum + item.residueCount, 0);
  const hasBounds =
    Number.isFinite(minX) &&
    Number.isFinite(minY) &&
    Number.isFinite(minZ) &&
    Number.isFinite(maxX) &&
    Number.isFinite(maxY) &&
    Number.isFinite(maxZ);

  if (!hasBounds) warnings.push("Coordinates were missing for one or more atoms.");
  if (!modelCount) modelCount = 1;

  return {
    valid: true,
    pdbId,
    title: titleParts.join(" ").trim(),
    classification,
    method: expdtaParts.join(" ").trim(),
    modelCount,
    atomCount,
    heteroAtomCount,
    residueCount,
    chainCount: chainList.length,
    chains: chainSummaries,
    bounds: hasBounds
      ? {
          min: { x: minX, y: minY, z: minZ },
          max: { x: maxX, y: maxY, z: maxZ },
        }
      : null,
    warnings,
  };
}
