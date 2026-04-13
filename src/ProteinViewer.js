import React, { useEffect, useRef, useCallback } from "react";

const D3MOL_CDN = "https://cdnjs.cloudflare.com/ajax/libs/3Dmol/2.0.4/3Dmol-min.js";
const VIEWER_BG = "#1e293b";
const H = 520;

function confidenceColorFromBFactor(b) {
  if (!Number.isFinite(b)) return "#94a3b8";
  if (b >= 90) return "#2563eb"; // very high confidence
  if (b >= 70) return "#22c55e"; // confident
  if (b >= 50) return "#f59e0b"; // low confidence
  return "#ef4444"; // very low confidence
}

function colorLegendText(mode) {
  if (mode === "chain") return "Ribbon: by chain";
  if (mode === "confidence") return "Ribbon: confidence (B-factor / pLDDT-like)";
  return "Ribbon: spectrum (rainbow along sequence)";
}

function load3DmolOnce() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.$3Dmol) return Promise.resolve();
  if (window.__d3molPromise) return window.__d3molPromise;
  window.__d3molPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById("3dmol-script");
    if (existing) {
      if (window.$3Dmol) { resolve(); return; }
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const el = document.createElement("script");
    el.id = "3dmol-script";
    el.async = true;
    el.src = D3MOL_CDN;
    el.onload = resolve;
    el.onerror = () => reject(new Error("Failed to load 3Dmol"));
    document.head.appendChild(el);
  });
  return window.__d3molPromise;
}

function ProteinViewer({ pdbPath = "/proteins/1A3N.pdb", pdbText = null, colorMode = "sequence" }) {
  const wrapperRef = useRef(null);
  const mountRef = useRef(null);
  const viewerRef = useRef(null);

  const applyStyles = useCallback((viewer) => {
    let cartoonStyle = { color: "spectrum", style: "oval", thickness: 0.72, arrows: true, opacity: 1 };
    if (colorMode === "chain") {
      cartoonStyle = { ...cartoonStyle, colorscheme: "chain" };
      delete cartoonStyle.color;
    } else if (colorMode === "confidence") {
      cartoonStyle = {
        ...cartoonStyle,
        colorfunc: (atom) => confidenceColorFromBFactor(Number(atom?.b)),
      };
      delete cartoonStyle.color;
    }
    viewer.setStyle({ hetflag: false }, {
      cartoon: cartoonStyle,
    });
    viewer.setStyle({ hetflag: true }, {
      stick: { radius: 0.22, colorscheme: "Jmol" },
      sphere: { scale: 0.32, colorscheme: "Jmol" },
    });
    viewer.setStyle({ resn: "HOH" }, { hidden: true });
    viewer.zoomTo();
    viewer.render();
    requestAnimationFrame(() => {
      try { viewer.zoom(0.88, 400); viewer.render(); } catch { /* ignore */ }
    });
  }, [colorMode]);

  useEffect(() => {
    const mount = mountRef.current;
    const wrapper = wrapperRef.current;
    if (!mount || !wrapper) return;
    let cancelled = false;

    function createViewer(pdbString) {
      if (cancelled || !mount) return;

      if (viewerRef.current) {
        try { viewerRef.current.clear(); } catch { /* ignore */ }
        viewerRef.current = null;
      }
      mount.innerHTML = "";

      // Measure the wrapper (which has width:100%), never the mount itself
      const W = Math.max(300, wrapper.clientWidth || 600);
      mount.style.cssText = `width:${W}px;height:${H}px;display:block;`;

      try {
        const viewer = window.$3Dmol.createViewer(mount, {
          backgroundColor: VIEWER_BG,
          antialias: true,
          width: W,
          height: H,
        });
        viewerRef.current = viewer;
        viewer.addModel(pdbString, "pdb");
        applyStyles(viewer);
      } catch (err) {
        console.error("3Dmol failed:", err);
        if (!cancelled && mount) {
          mount.innerHTML = `<p style="color:#f87171;padding:16px;">Viewer error: ${err.message}</p>`;
        }
      }
    }

    function buildViewer(pdbString) {
      load3DmolOnce()
        .then(() => {
          if (!cancelled) createViewer(pdbString);
        })
        .catch((e) => {
          if (!cancelled && mount) {
            mount.innerHTML = `<p style="color:#f87171;padding:16px;">Could not load 3D viewer: ${e.message}</p>`;
          }
        });
    }

    if (pdbText && pdbText.trim().length > 0) {
      buildViewer(pdbText.trim());
    } else {
      fetch(pdbPath)
        .then((r) => { if (!r.ok) throw new Error(`PDB fetch ${r.status}`); return r.text(); })
        .then((text) => { if (!cancelled) buildViewer(text); })
        .catch((e) => {
          if (!cancelled && mount) {
            mount.innerHTML = `<p style="color:#f87171;padding:16px;">${e.message}</p>`;
          }
        });
    }

    return () => {
      cancelled = true;
      if (viewerRef.current) {
        try { viewerRef.current.clear(); } catch { /* ignore */ }
        viewerRef.current = null;
      }
      if (mount) mount.innerHTML = "";
    };
  }, [pdbPath, pdbText, applyStyles]);

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "relative",
        width: "100%",
        height: H,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #334155",
        background: VIEWER_BG,
      }}
    >
      <div ref={mountRef} />
      <div style={{
        position: "absolute", bottom: 10, left: 12,
        color: "#64748b", fontSize: 11, pointerEvents: "none",
        display: "flex", gap: 14,
      }}>
        <span>{colorLegendText(colorMode)}</span>
        <span>Drag rotate · Scroll zoom · Right-drag pan</span>
      </div>
    </div>
  );
}

export default ProteinViewer;