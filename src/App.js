import React, { useState } from "react";
import DNAHelix from "./DNAHelix";
import ProteinViewer from "./ProteinViewer";
import { predictPdbWithEsmFold } from "./esmfoldApi";
import "./App.css";

function App() {
  const [baseSequence, setBaseSequence] = useState("ATGCGTAC"); // user input baseline
  const [sequence, setSequence] = useState("ATGCGTAC"); // derived current after mutations
  const [mutations, setMutations] = useState([]);
  const [selectedMutationIds, setSelectedMutationIds] = useState(new Set());
  const [positionText, setPositionText] = useState("0");
  const [mutationType, setMutationType] = useState("SNP"); // SNP | Insertion | Deletion
  const [newBase, setNewBase] = useState("A");
  const [mutatedMarkers, setMutatedMarkers] = useState([]); // [{index, type}]
  const [orfs, setOrfs] = useState([]);
  const [selectedOrfIdx, setSelectedOrfIdx] = useState(null);
  const [minOrfLength, setMinOrfLength] = useState(21); // nt
  const [highlightAllFrames, setHighlightAllFrames] = useState(false);
  const [selectedEnzymes, setSelectedEnzymes] = useState(() => new Set(["EcoRI", "BamHI", "HindIII"]));
  const [cutSites, setCutSites] = useState([]); // [{ enzyme, index, strand, color }]
  const [fragments, setFragments] = useState([]); // [{ start, end, length }]
  const [showCutAnimation, setShowCutAnimation] = useState(true);
  const [showOrfs, setShowOrfs] = useState(false);
  const [fastaMeta, setFastaMeta] = useState(null);
  const [previewMode, setPreviewMode] = useState("dna"); // "dna" | "protein"
  const [esmfoldPdbText, setEsmfoldPdbText] = useState(null);
  const [esmfoldLoading, setEsmfoldLoading] = useState(false);
  const [esmfoldError, setEsmfoldError] = useState(null);

  // 🧬 BIO STATS
  const length = sequence.length;

  const gcCount = (sequence.match(/[GC]/g) || []).length;
  const gcContent =
    length > 0 ? ((gcCount / length) * 100).toFixed(2) : 0;

  const counts = {
    A: (sequence.match(/A/g) || []).length,
    T: (sequence.match(/T/g) || []).length,
    G: (sequence.match(/G/g) || []).length,
    C: (sequence.match(/C/g) || []).length,
  };

  // FASTA utils
  function parseFasta(text) {
    const lines = (text || "").replace(/\r/g, "").split("\n");
    const entries = [];
    let header = null;
    let seqChunks = [];
    for (const line of lines) {
      if (line.startsWith(">")) {
        if (header) {
          entries.push({
            id: header.split(/\s+/)[0] || "sequence",
            desc: header.trim(),
            seq: seqChunks.join(""),
          });
        }
        header = line.slice(1).trim() || "sequence";
        seqChunks = [];
      } else if (line.trim()) {
        seqChunks.push(line.trim());
      }
    }
    if (header) {
      entries.push({
        id: header.split(/\s+/)[0] || "sequence_last",
        desc: header.trim(),
        seq: seqChunks.join(""),
      });
    }
    return entries;
  }

  function normalizeDna(seq) {
    if (!seq) return "";
    // Unicode normalize and map common lookalikes from PDF exports (Greek/Cyrillic/full-width)
    let s = seq.normalize("NFKD")
      // Remove zero-width and control formatting chars
      .replace(/[\u200B-\u200D\uFEFF\u00AD\u2060]/g, "");
    // Map common homoglyphs to ASCII
    const map = {
      // Greek capitals
      "Α":"A","Τ":"T","Γ":"G","Σ":"C", // Σ isn't C but sometimes used; keep conservative
      "Π":"T", // occasionally mapped
      // Greek lowercase
      "α":"A","τ":"T","γ":"G","σ":"C","ς":"C",
      // Cyrillic capitals
      "А":"A","Т":"T","Г":"G","С":"C",
      // Cyrillic lowercase
      "а":"A","т":"T","г":"G","с":"C",
      // Full-width
      "Ａ":"A","Ｔ":"T","Ｇ":"G","Ｃ":"C",
      "ａ":"A","ｔ":"T","ｇ":"G","ｃ":"C",
    };
    s = s.replace(/[\u0391\u03A4\u0393\u03A3\u03A0\u03B1\u03C4\u03B3\u03C3\u03C2\u0410\u0422\u0413\u0421\u0430\u0442\u0433\u0441\uFF21\uFF34\uFF27\uFF23\uFF41\uFF54\uFF47\uFF43]/g, (ch) => map[ch] || ch);
    s = s.toUpperCase();
    // Keep only ASCII A/T/G/C
    return s.replace(/[^ATGC]/g, "");
  }

  function loadSequenceFromPlainText(text) {
    if (!text) return "";
    if (/^>\S/m.test(text)) {
      const entries = parseFasta(text);
      if (entries.length > 0) return normalizeDna(entries[0].seq);
    }
    return normalizeDna(text);
  }

  async function handleSequenceUpload(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) {
        alert("File too large (>5MB). Try a smaller FASTA.");
        ev.target.value = "";
        return;
      }
      const rawText = await file.text();
      const cleaned = loadSequenceFromPlainText(rawText);
      if (!cleaned) {
        alert("No FASTA header or A/T/G/C sequence detected. Please upload a valid .fasta/.fa file.");
        return;
      }
      const preview = cleaned.slice(0, 60) + (cleaned.length > 60 ? "..." : "");
      const ok = window.confirm(`Load sequence (${cleaned.length} bp)?\n\nPreview:\n${preview}`);
      if (!ok) return;
      setFastaMeta({
        id: file.name,
        desc: file.name,
        length: cleaned.length,
        filename: file.name,
      });
      setBaseSequence(cleaned);
      recomputeFromMutations(mutations, cleaned);
    } finally {
      ev.target.value = "";
    }
  }

  // Restriction enzymes (simple exact sites, linear DNA)
  const ENZYMES = React.useMemo(() => ([
    { name: "EcoRI",  site: "GAATTC",  cutTop: 1, cutBottom: 5, color: 0x22c55e },
    { name: "BamHI",  site: "GGATCC",  cutTop: 1, cutBottom: 5, color: 0x3b82f6 },
    { name: "HindIII",site: "AAGCTT",  cutTop: 1, cutBottom: 5, color: 0xf59e0b },
    { name: "XhoI",   site: "CTCGAG",  cutTop: 1, cutBottom: 5, color: 0xef4444 },
    { name: "NotI",   site: "GCGGCCGC",cutTop: 2, cutBottom: 6, color: 0xa855f7 },
  ]), []);

  const complementOf = (b) => {
    switch (b) {
      case "A": return "T";
      case "T": return "A";
      case "G": return "C";
      case "C": return "G";
      default: return "N";
    }
  };
  const reverseComplement = (s) => s.split("").reverse().map(complementOf).join("");

  function findAllIndices(haystack, needle) {
    const idxs = [];
    let i = 0;
    while (i <= haystack.length - needle.length) {
      const j = haystack.indexOf(needle, i);
      if (j === -1) break;
      idxs.push(j);
      i = j + 1;
    }
    return idxs;
  }

  // Compute enzyme cut positions whenever sequence or selection changes
  React.useEffect(() => {
    const s = sequence.toUpperCase().replace(/[^ATGC]/g, "");
    const enabled = new Set(selectedEnzymes);
    const cuts = [];
    ENZYMES.forEach((e) => {
      if (!enabled.has(e.name)) return;
      // Forward matches
      const idxsF = findAllIndices(s, e.site);
      idxsF.forEach((start) => {
        cuts.push({ enzyme: e.name, index: start + e.cutTop, strand: "top", color: e.color });
        cuts.push({ enzyme: e.name, index: start + e.site.length - (e.site.length - e.cutBottom), strand: "bottom", color: e.color });
      });
      // Reverse complement matches (recognition site is palindromic for listed enzymes, but include for completeness)
      const rc = reverseComplement(e.site);
      if (rc !== e.site) {
        const idxsR = findAllIndices(s, rc);
        idxsR.forEach((start) => {
          // Map RC site cut positions back to forward indexing.
          // For RC match, the "top" cut relative to rc corresponds to bottom cut on the forward strand.
          const topIndex = start + (rc.length - e.cutBottom);
          const bottomIndex = start + (rc.length - e.cutTop);
          cuts.push({ enzyme: e.name, index: topIndex, strand: "top", color: e.color });
          cuts.push({ enzyme: e.name, index: bottomIndex, strand: "bottom", color: e.color });
        });
      }
    });
    // Clamp within sequence
    const filtered = cuts.filter(c => c.index >= 0 && c.index <= s.length);
    filtered.sort((a, b) => a.index - b.index || a.enzyme.localeCompare(b.enzyme));
    setCutSites(filtered);

    // Compute linear digest fragments (include 0 and length as boundaries)
    const cutPositions = Array.from(new Set(filtered.map(c => c.index))).sort((a, b) => a - b);
    const boundaries = [0, ...cutPositions, s.length];
    const frags = [];
    for (let i = 1; i < boundaries.length; i++) {
      const start = boundaries[i - 1];
      const end = boundaries[i];
      frags.push({ start, end, length: end - start });
    }
    setFragments(frags);
  }, [sequence, ENZYMES, JSON.stringify(Array.from(selectedEnzymes))]);

  // 🧠 Core recompute from base (user input) using a list of mutations in order
  const recomputeFromMutations = (list, base = null) => {
    let s = base !== null ? base : baseSequence;
    const markers = [];
    for (const m of list) {
      const pos = Math.max(
        0,
        Math.min(m.pos, s.length - (m.type === "Insertion" ? 0 : 1))
      );
      if (m.type === "SNP") {
        s = s.slice(0, pos) + m.newBase + s.slice(pos + 1);
        markers.push({ index: pos, type: "SNP" });
      } else if (m.type === "Insertion") {
        s = s.slice(0, pos) + m.newBase + s.slice(pos);
        markers.push({ index: pos, type: "Insertion" });
      } else if (m.type === "Deletion") {
        s = s.slice(0, pos) + s.slice(pos + 1);
        // Deletions remove a base; optional future highlight can use { index: pos, type: "Deletion" }
      }
    }
    setSequence(s);
    setMutations(list);
    setMutatedMarkers(markers);
    // Recompute ORFs based on new derived sequence
    const nextOrfs = findOrfs(s, { minLen: minOrfLength });
    setOrfs(nextOrfs);
    setSelectedOrfIdx(null);
  };

  // 🧠 APPLY MUTATION
  const applyMutation = () => {
    if (!sequence) return;
    const posNum = parseInt(positionText || "0", 10);
    const safePos = isNaN(posNum) ? 0 : posNum;
    const pos = Math.max(
      0,
      Math.min(safePos, sequence.length - (mutationType === "Insertion" ? 0 : 1))
    );
    const upperBase = (newBase || "A").toUpperCase();
    const beforeBase = sequence[pos] || "";
    const entry = {
      id: `${Date.now()}`,
      pos,
      type: mutationType,
      newBase: upperBase,
      beforeBase,
    };
    recomputeFromMutations([...mutations, entry]);
  };

  const clearAll = () => {
    setSequence(baseSequence);
    setMutations([]);
    setSelectedMutationIds(new Set());
    setPositionText("0");
    setMutationType("SNP");
    setNewBase("A");
  };

  // ORF utils
  const STOP_CODONS = new Set(["TAA", "TAG", "TGA"]);
  const CODON_TABLE = {
    TTT:"F",TTC:"F",TTA:"L",TTG:"L",
    CTT:"L",CTC:"L",CTA:"L",CTG:"L",
    ATT:"I",ATC:"I",ATA:"I",ATG:"M",
    GTT:"V",GTC:"V",GTA:"V",GTG:"V",
    TCT:"S",TCC:"S",TCA:"S",TCG:"S",
    CCT:"P",CCC:"P",CCA:"P",CCG:"P",
    ACT:"T",ACC:"T",ACA:"T",ACG:"T",
    GCT:"A",GCC:"A",GCA:"A",GCG:"A",
    TAT:"Y",TAC:"Y",TAA:"*",TAG:"*",
    CAT:"H",CAC:"H",CAA:"Q",CAG:"Q",
    AAT:"N",AAC:"N",AAA:"K",AAG:"K",
    GAT:"D",GAC:"D",GAA:"E",GAG:"E",
    TGT:"C",TGC:"C",TGA:"*",TGG:"W",
    CGT:"R",CGC:"R",CGA:"R",CGG:"R",
    AGT:"S",AGC:"S",AGA:"R",AGG:"R",
    GGT:"G",GGC:"G",GGA:"G",GGG:"G",
  };

  function findOrfs(seq, { minLen = 90 } = {}) {
    const S = seq.toUpperCase().replace(/[^ATGC]/g, "");
    const res = [];
    for (let frame = 0; frame < 3; frame++) {
      for (let i = frame; i + 2 < S.length; i += 3) {
        if (S.slice(i, i + 3) === "ATG") {
          for (let j = i + 3; j + 2 < S.length; j += 3) {
            const codon = S.slice(j, j + 3);
            if (STOP_CODONS.has(codon)) {
              const len = j + 3 - i;
              if (len >= minLen) res.push({ frame, start: i, end: j + 3, ntLength: len });
              i = j + 2;
              break;
            }
          }
        }
      }
    }
    return res.sort((a, b) => a.start - b.start);
  }

  function translate(seqIn) {
    const s = seqIn.toUpperCase().replace(/[^ATGC]/g, "");
    let prot = "";
    for (let i = 0; i + 2 < s.length; i += 3) {
      const aa = CODON_TABLE[s.slice(i, i + 3)];
      if (!aa || aa === "*") break;
      prot += aa;
    }
    return prot;
  }

  function proteinForOrf(seqIn, orf) {
    const coding = seqIn.slice(orf.start, orf.end);
    return translate(coding);
  }

  /**
   * Protein string for ESMFold: prefer selected ORF; else smallest valid ORF; else translate from first ATG to end (no stop required).
   */
  function getProteinSequenceForFolding(dnaSeq, orfList, selectedIdx) {
    const S = dnaSeq.toUpperCase().replace(/[^ATGC]/g, "");
    if (orfList.length > 0) {
      const i = selectedIdx !== null && selectedIdx >= 0 ? selectedIdx : 0;
      return proteinForOrf(S, orfList[i]);
    }
    const relaxed = findOrfs(S, { minLen: 9 });
    if (relaxed.length) return proteinForOrf(S, relaxed[0]);
    const atg = S.indexOf("ATG");
    if (atg < 0) return "";
    const len = S.length - atg;
    const trim = len - (len % 3);
    if (trim < 3) return "";
    return translate(S.slice(atg, atg + trim));
  }

  // Recompute ORFs whenever sequence or min length changes
  React.useEffect(() => {
    const next = findOrfs(sequence, { minLen: minOrfLength });
    setOrfs(next);
    setSelectedOrfIdx(null);
  }, [sequence, minOrfLength]);

  // New DNA → drop stale ESMFold structure so the viewer matches current sequence
  React.useEffect(() => {
    setEsmfoldPdbText(null);
    setEsmfoldError(null);
  }, [sequence]);

  const toggleSelected = (id) => {
    setSelectedMutationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeSelected = () => {
    const filtered = mutations.filter((m) => !selectedMutationIds.has(m.id));
    recomputeFromMutations(filtered);
    setSelectedMutationIds(new Set());
  };

  const removeOne = (id) => {
    const filtered = mutations.filter((m) => m.id !== id);
    recomputeFromMutations(filtered);
    setSelectedMutationIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  async function handleEsmfoldPredict() {
    setEsmfoldError(null);
    const prot = getProteinSequenceForFolding(sequence, orfs, selectedOrfIdx);
    if (!prot || prot.length < 4) {
      setEsmfoldError(
        "Could not get a protein sequence: include an ATG start and at least ~4 amino acids (or enable ORFs and pick one)."
      );
      return;
    }
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.info("[ESMFold] aa length:", prot.length, "preview:", prot.slice(0, 40) + (prot.length > 40 ? "…" : ""));
    }
    setEsmfoldLoading(true);
    try {
      const pdb = await predictPdbWithEsmFold(prot);
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.info("[ESMFold] PDB chars:", pdb.length);
      }
      setEsmfoldPdbText(pdb);
    } catch (e) {
      setEsmfoldPdbText(null);
      setEsmfoldError(e.message || String(e));
    } finally {
      setEsmfoldLoading(false);
    }
  }

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="app-title">          <span className="logo"></span>
          <div>
            <h1>DNA Mutation Simulator</h1>
            <p className="subtitle">Visualize enzyme cuts, mutations, and DNA sequences in 3D</p>
          </div>
        </div>
      </header>

      <main className="layout-grid">
        <section className="card preview-card">
          <div className="card-header">
            <h2>3D Preview</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div className="badges">
                <span className="badge">Length: {length}</span>
                <span className="badge">GC: {gcContent}%</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className={`btn small ${previewMode === "dna" ? "primary" : ""}`}
                  onClick={() => setPreviewMode("dna")}
                >
                  DNA helix
                </button>
                <button
                  type="button"
                  className={`btn small ${previewMode === "protein" ? "primary" : ""}`}
                  onClick={() => setPreviewMode("protein")}
                >
                  Protein 3D
                </button>
              </div>
            </div>
          </div>
          {previewMode === "protein" && (
            <div
              className="protein-toolbar"
              style={{
                padding: "0 0 12px",
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
                fontSize: 13,
                color: "#94a3b8",
              }}
            >
              <span style={{ marginRight: 4 }}>
                Structure:{" "}
                <strong style={{ color: esmfoldPdbText ? "#86efac" : "#cbd5e1" }}>
                  {esmfoldPdbText ? "Predicted (ESMFold)" : "1A3N reference (PDB file)"}
                </strong>
              </span>
              <button
                type="button"
                className="btn small"
                disabled={esmfoldLoading}
                onClick={() => {
                  setEsmfoldPdbText(null);
                  setEsmfoldError(null);
                }}
              >
                Show 1A3N file
              </button>
              <button
                type="button"
                className="btn small primary"
                disabled={esmfoldLoading}
                onClick={handleEsmfoldPredict}
              >
                {esmfoldLoading ? "Running ESMFold…" : "Predict from DNA (ESMFold)"}
              </button>
              {esmfoldError && (
                <span style={{ color: "#f87171", fontSize: 12, maxWidth: 420 }}>
                  {esmfoldError}
                </span>
              )}
              {esmfoldPdbText && !esmfoldError && (
                <span style={{ color: "#86efac", fontSize: 12 }}>
                  Using API output — change DNA above and predict again to update.
                </span>
              )}
            </div>
          )}
          <div className="preview-canvas">
            {previewMode === "protein" ? (
              <ProteinViewer
                key={esmfoldPdbText ? `pred-${esmfoldPdbText.length}` : "file-1a3n"}
                pdbPath={esmfoldPdbText ? undefined : "/proteins/1A3N.pdb"}
                pdbText={esmfoldPdbText}
              />
            ) : (
              <DNAHelix
                sequence={sequence}
                mutatedMarkers={mutatedMarkers}
                orfSegments={orfs.map((o, idx) => ({
                  start: o.start,
                  end: o.end,
                  frame: o.frame,
                  color: o.frame === 0 ? 0x22c55e : o.frame === 1 ? 0x3b82f6 : 0xf59e0b,
                  selected: idx === selectedOrfIdx,
                }))}
                cutSites={cutSites}
                showCutAnimation={showCutAnimation}
                showOrfs={showOrfs}
              />
            )}
          </div>

          <div className="sequence-preview">
            <label>
              Sequence preview
              <span style={{ marginLeft: 10, fontWeight: 400, color: "#94a3b8", fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={highlightAllFrames}
                  onChange={(e) => setHighlightAllFrames(e.target.checked)}
                  style={{ marginRight: 6 }}
                />
                All frames
              </span>
            </label>
            <div className="sequence-chip">
              {(() => {
                const s = sequence.toUpperCase();
                const classes = new Array(s.length).fill("");
                const hasStart = new Array(s.length).fill(false);
                const hasStop = new Array(s.length).fill(false);
                // Highlight selected ORF range if any
                if (typeof selectedOrfIdx === "number" && selectedOrfIdx >= 0) {
                  const o = (function() {
                    // reconstruct current ORFs using same logic as panel (frames already computed in state)
                    // use 'orfs' state which is in closure above
                    return orfs[selectedOrfIdx];
                  })();
                  if (o) {
                    for (let i = o.start; i < o.end && i < classes.length; i++) {
                      classes[i] = (classes[i] + " seq-orf").trim();
                    }
                  }
                }
                // Start/stop codons
                // Limit highlights to a target frame to avoid mixed-frame artifacts like a lone 'A' from ATG followed by a stop in another frame.
                const targetFrames = (() => {
                  if (typeof selectedOrfIdx === "number" && selectedOrfIdx >= 0 && orfs[selectedOrfIdx]) {
                    return new Set([orfs[selectedOrfIdx].frame]);
                  }
                  return highlightAllFrames ? new Set([0,1,2]) : new Set([0]);
                })();
                for (let i = 0; i + 2 < s.length; i++) {
                  if (!targetFrames.has(i % 3)) continue;
                  const codon = s.slice(i, i + 3);
                  if (codon === "ATG") {
                    for (let k = 0; k < 3; k++) hasStart[i + k] = true;
                  } else if (codon === "TAA" || codon === "TAG" || codon === "TGA") {
                    for (let k = 0; k < 3; k++) hasStop[i + k] = true;
                  }
                }
                // Priority: start over stop; then ORF
                for (let i = 0; i < s.length; i++) {
                  if (hasStart[i]) classes[i] = "seq-start";
                  else if (hasStop[i]) classes[i] = "seq-stop";
                }
                return s.split("").map((ch, idx) => (
                  <span key={idx} className={`seq-token${classes[idx] ? " " + classes[idx] : ""}`}>{ch}</span>
                ));
              })()}
            </div>
          </div>
        </section>

        {/* Sequence Comparison */}
        <section className="card compare-card">
          <div className="card-header">
            <h2>Sequence Comparison</h2>
          </div>
          <div className="compare-grid">
            <div className="compare-col">
              <div className="compare-title">Original</div>
              <div className="compare-metric">
                <span className="metric-label">Length</span>
                <span className="metric-value">{baseSequence.length}</span>
              </div>
              <div className="compare-metric">
                <span className="metric-label">GC Content</span>
                <span className="metric-value">
                  {baseSequence.length > 0
                    ? (((baseSequence.match(/[GC]/g) || []).length / baseSequence.length) * 100).toFixed(2)
                    : 0}%
                </span>
              </div>
            </div>
            <div className="compare-col">
              <div className="compare-title current">Current</div>
              <div className="compare-metric">
                <span className="metric-label">Length</span>
                <span className="metric-value">{length}</span>
              </div>
              <div className="compare-metric">
                <span className="metric-label">GC Content</span>
                <span className="metric-value">{gcContent}%</span>
              </div>
            </div>
          </div>
        </section>

        <aside className="right-rail">
          <section className="card">
            <div className="card-header">
              <h3>Sequence Input</h3>
            </div>
            <div className="field">
              <label>DNA sequence</label>
              <input
                className="input"
                value={baseSequence}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^ATGC]/gi, "").toUpperCase();
                  setBaseSequence(cleaned);
                  // Reapply existing mutations to new base
                  recomputeFromMutations(mutations, cleaned);
                }}
                placeholder="Enter A, T, G, C"
              />
            </div>
            <div className="field" style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
              <label className="btn">
                Upload FASTA
                <input
                  type="file"
                  accept=".fa,.fasta,.fna,text/fasta,text/plain"
                  style={{ display: "none" }}
                  onChange={handleSequenceUpload}
                />
              </label>
              {fastaMeta && (
                <span className="mono" title={fastaMeta.desc || fastaMeta.id}>
                  {(fastaMeta.filename || fastaMeta.id)} • {fastaMeta.length} bp
                </span>
              )}
            </div>

            <div className="stats-row">
              <div className="stat">
                <span className="stat-label">A</span>
                <span className="stat-value">{counts.A}</span>
              </div>
              <div className="stat">
                <span className="stat-label">T</span>
                <span className="stat-value">{counts.T}</span>
              </div>
              <div className="stat">
                <span className="stat-label">G</span>
                <span className="stat-value">{counts.G}</span>
              </div>
              <div className="stat">
                <span className="stat-label">C</span>
                <span className="stat-value">{counts.C}</span>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h3>Add Mutation</h3>
            </div>
            <div className="field">
              <label>Position</label>
              <div className="spin-input">
                <button
                  type="button"
                  className="spin-btn"
                  onClick={() => {
                    const num = parseInt(positionText || "0", 10);
                    const next = Math.max(0, (isNaN(num) ? 0 : num) - 1);
                    setPositionText(String(next));
                  }}
                >
                  −
                </button>
                <input
                  className="input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={positionText}
                  onChange={(e) => {
                    let v = e.target.value.replace(/[^0-9]/g, "");
                    if (v.length > 1) v = v.replace(/^0+/, "");
                    if (v === "") v = "0";
                    setPositionText(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      const num = parseInt(positionText || "0", 10);
                      const max = sequence.length - (mutationType === "Insertion" ? 0 : 1);
                      const safeMax = Math.max(0, max);
                      let next = isNaN(num) ? 0 : num;
                      if (e.key === "ArrowUp") next = Math.min(next + 1, safeMax);
                      else next = Math.max(next - 1, 0);
                      setPositionText(String(next));
                    }
                  }}
                  onBlur={() => {
                    const num = parseInt(positionText || "0", 10);
                    const max = sequence.length - (mutationType === "Insertion" ? 0 : 1);
                    const clamped = Math.max(0, Math.min(isNaN(num) ? 0 : num, Math.max(0, max)));
                    setPositionText(String(clamped));
                  }}
                  placeholder="0"
                />
                <button
                  type="button"
                  className="spin-btn"
                  onClick={() => {
                    const num = parseInt(positionText || "0", 10);
                    const max = sequence.length - (mutationType === "Insertion" ? 0 : 1);
                    const safeMax = Math.max(0, max);
                    const next = Math.min((isNaN(num) ? 0 : num) + 1, safeMax);
                    setPositionText(String(next));
                  }}
                >
                  +
                </button>
              </div>
            </div>

            <div className="two-col">
              <div className="field">
                <label>Type</label>
                <select
                  className="input"
                  value={mutationType}
                  onChange={(e) => setMutationType(e.target.value)}
                >
                  <option value="SNP">SNP</option>
                  <option value="Insertion">Insertion</option>
                  <option value="Deletion">Deletion</option>
                </select>
              </div>
              <div className="field">
                <label>New Base</label>
                <select
                  className="input"
                  value={newBase}
                  onChange={(e) => setNewBase(e.target.value)}
                >
                  <option value="A">A</option>
                  <option value="T">T</option>
                  <option value="G">G</option>
                  <option value="C">C</option>
                </select>
              </div>
            </div>

            <button className="btn primary wide" onClick={applyMutation}>
              Add Mutation
            </button>
          </section>

          {/* Mutations panel (non-functional UI) */}
          <section className="card">
            <div className="card-header">
              <h3>Mutations ({mutations.length})</h3>
              <div className="toggle">
                <input type="checkbox" id="toggle-show" defaultChecked />
                <label htmlFor="toggle-show">Show</label>
              </div>
            </div>
            <div className="button-row">
              <button className="btn" disabled>Random (3)</button>
              <button className="btn danger" disabled={selectedMutationIds.size === 0} onClick={removeSelected}>
                Remove Selected
              </button>
            </div>
            <div className="button-row">
              <button className="btn" onClick={clearAll}>Clear All</button>
            </div>
            {mutations.length === 0 ? (
              <div className="mutations-empty">No mutations added</div>
            ) : (
              <ul className="mutations-list">
                {mutations.map((m) => (
                  <li key={m.id} className="mutation-item">
                    <div className="mut-content">
                      <input
                        type="checkbox"
                        checked={selectedMutationIds.has(m.id)}
                        onChange={() => toggleSelected(m.id)}
                      />
                      <span className="pill">{m.type}</span>
                      <span className="mono">pos {m.pos}</span>
                      {m.type === "SNP" && (
                        <span className="mono">
                          {m.beforeBase} → {m.newBase}
                        </span>
                      )}
                      {m.type === "Insertion" && (
                        <span className="mono">+{m.newBase}</span>
                      )}
                      {m.type === "Deletion" && (
                        <span className="mono">-{m.beforeBase}</span>
                      )}
                    </div>
                    <div className="mut-actions">
                      <button className="btn small danger" onClick={() => removeOne(m.id)}>✕</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ORFs */}
          <section className="card">
            <div className="card-header">
              <h3>Open Reading Frames</h3>
              <div className="toggle">
                <label style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 12 }}>
                  <input
                    type="checkbox"
                    checked={showOrfs}
                    onChange={(e) => setShowOrfs(e.target.checked)}
                    style={{ marginRight: 4 }}
                  />
                  Show ORFs
                </label>
                <label style={{ marginRight: 8 }}>Min length</label>
                <input
                  className="input"
                  type="number"
                  min="3"
                  step="3"
                  value={minOrfLength}
                  onChange={(e) => setMinOrfLength(parseInt(e.target.value || "0", 10))}
                  style={{ width: 90 }}
                />
              </div>
            </div>
            {orfs.length === 0 ? (
              <div className="mutations-empty">No ORFs found (adjust min length)</div>
            ) : (
              <ul className="mutations-list">
                {orfs.map((o, idx) => (
                  <li key={`${o.start}-${o.end}-${o.frame}`} className="mutation-item">
                    <div className="mut-content">
                      <input
                        type="radio"
                        name="orf"
                        checked={selectedOrfIdx === idx}
                        onChange={() => setSelectedOrfIdx(idx)}
                      />
                      <span className="pill">Frame {o.frame}</span>
                      <span className="mono">[{o.start}–{o.end})</span>
                      <span className="mono">{o.ntLength} nt</span>
                      <span className="mono">{Math.floor(o.ntLength / 3)} aa</span>
                    </div>
                    <div className="mut-actions">
                      <button
                        className="btn small"
                        onClick={() => {
                          const prot = proteinForOrf(sequence, o);
                          if (navigator.clipboard) navigator.clipboard.writeText(prot);
                        }}
                      >
                        Copy protein
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Restriction Enzyme Mapper */}
          <section className="card">
            <div className="card-header">
              <h3>Restriction Enzyme Mapper</h3>
            </div>
            <div style={{ padding: 12 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {ENZYMES.map((e) => {
                  const countPairs = Math.floor(cutSites.filter(cs => cs.enzyme === e.name).length / 2);
                  return (
                    <label key={e.name} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", border: "1px solid #1f2a44", borderRadius: 999, background: selectedEnzymes.has(e.name) ? "#0f172a" : "#0b1220", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={selectedEnzymes.has(e.name)}
                        onChange={(ev) => {
                          setSelectedEnzymes(prev => {
                            const next = new Set(prev);
                            if (ev.target.checked) next.add(e.name);
                            else next.delete(e.name);
                            return next;
                          });
                        }}
                      />
                      <span className="mono" style={{ color: "#cbd5e1" }}>{e.name}</span>
                      <span className="mono" style={{ color: "#64748b" }}>{countPairs}</span>
                    </label>
                  );
                })}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="mono" style={{ color: "#cbd5e1" }}>Show Cut Animation</span>
                  <input type="checkbox" checked={showCutAnimation} onChange={(e) => setShowCutAnimation(e.target.checked)} />
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn"
                    onClick={() => setSelectedEnzymes(new Set(ENZYMES.map(e => e.name)))}
                  >
                    Cut All
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      // Clear all selected enzymes and derived visuals
                      setSelectedEnzymes(new Set());
                      setCutSites([]);
                      setFragments([]);
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
            {(() => {
              // Deduplicate to show one row per (enzyme, position) with context like G|AATTC
              const keyToItem = new Map();
              const S = sequence.toUpperCase();
              cutSites.forEach((cs) => {
                const key = `${cs.enzyme}@${cs.index}`;
                if (!keyToItem.has(key)) {
                  const left = Math.max(0, cs.index - 3);
                  const right = Math.min(S.length, cs.index + 6);
                  const leftStr = S.slice(left, cs.index);
                  const rightStr = S.slice(cs.index, right);
                  keyToItem.set(key, {
                    enzyme: cs.enzyme,
                    index: cs.index,
                    color: cs.color,
                    context: `${leftStr}|${rightStr}`
                  });
                }
              });
              const list = Array.from(keyToItem.values()).sort((a,b)=> a.index-b.index || a.enzyme.localeCompare(b.enzyme));
              if (list.length === 0) {
                return <div className="mutations-empty">No cut sites for selected enzymes</div>;
              }
              return (
                <ul className="mutations-list">
                  {list.map((item, i) => (
                    <li key={`${item.enzyme}-${item.index}-${i}`} className="mutation-item" style={{ borderLeft: `3px solid ${`#${(item.color>>>0).toString(16).padStart(6,"0")}`}` }}>
                      <div className="mut-content" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span className="pill">{item.enzyme}</span>
                        <span className="mono">Position {item.index}</span>
                        <span className="mono" style={{ color: "#94a3b8" }}>{item.context}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </section>

          {/* Virtual Digest (linear) */}
          <section className="card">
            <div className="card-header">
              <h3>Virtual Digest</h3>
            </div>
            {fragments.length <= 1 ? (
              <div className="mutations-empty">No fragments (no cuts)</div>
            ) : (
              <>
                <div style={{ display: "flex", width: "100%", height: 20, background: "#0b1220", border: "1px solid #1f2a44", borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>
                  {(() => {
                    const total = fragments.reduce((a,b)=>a+b.length,0) || 1;
                    const palette = [ "#10b981", "#22c55e", "#16a34a", "#34d399", "#059669" ];
                    return fragments.map((f, i) => {
                      const w = (f.length / total) * 100;
                      return <div key={`bar-${i}`} style={{ width: `${w}%`, background: palette[i % palette.length] }} />;
                    });
                  })()}
                </div>
                <ul className="mutations-list">
                  {fragments.map((f, idx) => (
                    <li key={`${f.start}-${f.end}-${idx}`} className="mutation-item">
                      <div className="mut-content">
                        <span className="pill">Fragment {idx + 1}</span>
                        <span className="mono">[{f.start}–{f.end})</span>
                        <span className="mono">{f.length} bp</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* Legend card */}
          <section className="card">
            <div className="card-header">
              <h3>Legend</h3>
            </div>
            <ul className="legend">
              <li><span className="dot a" /> A - Adenine</li>
              <li><span className="dot t" /> T - Thymine</li>
              <li><span className="dot g" /> G - Guanine</li>
              <li><span className="dot c" /> C - Cytosine</li>
            </ul>
            <ul className="legend subtle">
              <li><span className="chip-dot red" /> Mutated position (red glow)</li>
              <li><span className="chip-dot green" /> Insertion (green ring)</li>
              <li><span className="chip-dot orange" /> Deletion (orange ring)</li>
            </ul>
          </section>
        </aside>
      </main>
    </div>
  );
}

export default App;