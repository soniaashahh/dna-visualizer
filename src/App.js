import React, { useState } from "react";
import DNAHelix from "./DNAHelix";

function App() {
  const [sequence, setSequence] = useState("ATGCGTAC");

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

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h1>🧬 DNA Helix Visualizer</h1>

      {/* INPUT */}
      <input
        value={sequence}
        onChange={(e) => setSequence(e.target.value.toUpperCase())}
        placeholder="Enter DNA sequence (A, T, G, C)"
        style={{
          padding: "10px",
          width: "300px",
          marginBottom: "15px",
        }}
      />

      {/* STATS */}
      <div style={{ marginBottom: "20px" }}>
        <p><strong>Length:</strong> {length}</p>
        <p><strong>GC Content:</strong> {gcContent}%</p>

        <div>
          <p>A: {counts.A}</p>
          <p>T: {counts.T}</p>
          <p>G: {counts.G}</p>
          <p>C: {counts.C}</p>
        </div>
      </div>

      {/* 3D HELIX */}
      <DNAHelix sequence={sequence} />
    </div>
  );
}

export default App;