import React, { useState } from "react";
import DNAHelix from "./DNAHelix";
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

  // Recompute ORFs whenever sequence or min length changes
  React.useEffect(() => {
    const next = findOrfs(sequence, { minLen: minOrfLength });
    setOrfs(next);
    setSelectedOrfIdx(null);
  }, [sequence, minOrfLength]);

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

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="app-title">
          <span className="logo">🧬</span>
          <div>
            <h1>DNA Mutation Simulator</h1>
            <p className="subtitle">Visualize SNPs, insertions, and deletions in 3D</p>
          </div>
        </div>
      </header>

      <main className="layout-grid">
        <section className="card preview-card">
          <div className="card-header">
            <h2>3D Preview</h2>
            <div className="badges">
              <span className="badge">Length: {length}</span>
              <span className="badge">GC: {gcContent}%</span>
            </div>
          </div>
          <div className="preview-canvas">
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
            />
          </div>

          <div className="sequence-preview">
            <label>Sequence preview</label>
            <div className="sequence-chip">
              {(() => {
                const s = sequence.toUpperCase();
                const classes = new Array(s.length).fill("");
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
                for (let i = 0; i + 2 < s.length; i++) {
                  const codon = s.slice(i, i + 3);
                  if (codon === "ATG") {
                    for (let k = 0; k < 3; k++) classes[i + k] = (classes[i + k] + " seq-start").trim();
                  } else if (codon === "TAA" || codon === "TAG" || codon === "TGA") {
                    for (let k = 0; k < 3; k++) classes[i + k] = (classes[i + k] + " seq-stop").trim();
                  }
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