import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

/** Beyond this, full per-base meshes freeze the browser — subsample for preview. */
const MAX_VISUAL_BASES = 220;

const DNAHelix = ({ sequence, mutatedMarkers = [], orfSegments = [], cutSites = [], showCutAnimation = true, showOrfs = true }) => {
  const mountRef = useRef(null);
  const [helixHint, setHelixHint] = useState(null);

  useEffect(() => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1c);

    const width = 1000;
    const height = 600;

    const camera = new THREE.PerspectiveCamera(
      75,
      width / height,
      0.1,
      8000
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);

    const mount = mountRef.current;
    if (!mount) return;

    const length = sequence.length;
    if (length < 1) {
      setHelixHint(null);
      return;
    }

    mount.appendChild(renderer.domElement);

    // Mouse controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.minDistance = 20;
    controls.maxDistance = Math.max(220, 80 + length * 0.35);
    controls.target.set(0, 0, 0);
    controls.update();

    const visualStep =
      length <= MAX_VISUAL_BASES ? 1 : Math.ceil(length / MAX_VISUAL_BASES);
    const visualIndices = [];
    for (let i = 0; i < length; i += visualStep) {
      visualIndices.push(i);
    }
    if (visualIndices[visualIndices.length - 1] !== length - 1) {
      visualIndices.push(length - 1);
    }
    setHelixHint(
      visualStep > 1
        ? `Long sequence (${length} bp): preview shows every ${visualStep} bases (performance).`
        : null
    );

    // 🔥 SMART SCALING (fills screen first, shrinks only when needed)
    let heightStep;
    if (length < 30) {
      heightStep = 1.5;
    } else if (length < 80) {
      heightStep = 1.0;
    } else {
      heightStep = 60 / length;
    }

    let radius;
    if (length < 30) {
      radius = 6;
    } else if (length < 80) {
      radius = 5;
    } else {
      radius = 4;
    }

    // 📸 CAMERA (controlled scaling, not too aggressive)
    camera.position.z = 50 + Math.min(length, 100) * 0.2;
    camera.position.y = Math.min(length, 100) * 0.15;

    // 💡 LIGHTING
    const light = new THREE.PointLight(0xffffff, 3);
    light.position.set(20, 20, 20);
    scene.add(light);

    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambient);

    // 🎨 COLORS
    const colors = {
      A: 0x00ff00,
      T: 0xff0000,
      G: 0xffff00,
      C: 0x0000ff,
    };

    const angleStep = 0.6;

    // 🔥 CENTERING
    const offset = (length * heightStep) / 2;

    // Helpers
    const complementOf = (b) => {
      switch (b) {
        case "A": return "T";
        case "T": return "A";
        case "G": return "C";
        case "C": return "G";
        default: return "N";
      }
    };

    const sphereGeometry = new THREE.SphereGeometry(1.2, 32, 32);
    const glowSphereGeometry = new THREE.SphereGeometry(1.8, 24, 24);
    const markerByIndex = new Map();
    mutatedMarkers.forEach((m) => markerByIndex.set(m.index, m.type));

    const cylinders = []; // store to dispose if needed later
    const createCylinderBetween = (start, end, radiusVal, colorVal) => {
      const direction = new THREE.Vector3().subVectors(end, start);
      const lengthSeg = direction.length();
      const cylinderGeo = new THREE.CylinderGeometry(radiusVal, radiusVal, lengthSeg, 8, 1, true);
      const cylinderMat = new THREE.MeshStandardMaterial({ color: colorVal, metalness: 0.1, roughness: 0.6 });
      const cylinder = new THREE.Mesh(cylinderGeo, cylinderMat);

      // Orient cylinder from start to end
      const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      cylinder.position.copy(midpoint);
      cylinder.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.clone().normalize()
      );
      scene.add(cylinder);
      cylinders.push(cylinder);
    };

    const strand1Points = [];
    const strand2Points = [];

    visualIndices.forEach((i) => {
      const base = sequence[i];
      const angle = i * angleStep;

      // Strand 1 (original)
      const x1 = radius * Math.cos(angle);
      const y = i * heightStep - offset;
      const z1 = radius * Math.sin(angle);

      const mat1 = new THREE.MeshStandardMaterial({ color: colors[base] || 0x999999, emissive: 0x000000, emissiveIntensity: 0.6 });
      const s1 = new THREE.Mesh(sphereGeometry, mat1);
      s1.position.set(x1, y, z1);
      scene.add(s1);
      strand1Points.push(new THREE.Vector3(x1, y, z1));

      // Strand 2 (complement at 180° around)
      const comp = complementOf(base);
      const angle2 = angle + Math.PI;
      const x2 = radius * Math.cos(angle2);
      const z2 = radius * Math.sin(angle2);
      const mat2 = new THREE.MeshStandardMaterial({ color: colors[comp] || 0x999999, emissive: 0x000000, emissiveIntensity: 0.6 });
      const s2 = new THREE.Mesh(sphereGeometry, mat2);
      s2.position.set(x2, y, z2);
      scene.add(s2);
      strand2Points.push(new THREE.Vector3(x2, y, z2));

      // Mutated glow/halo
      const markerType = markerByIndex.get(i);
      if (markerType === "SNP" || markerType === "Insertion") {
        const color = markerType === "SNP" ? 0xef4444 : 0x22c55e;
        const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 });
        const glow1 = new THREE.Mesh(glowSphereGeometry, glowMat);
        glow1.position.set(x1, y, z1);
        scene.add(glow1);
        const glow2 = new THREE.Mesh(glowSphereGeometry, glowMat);
        glow2.position.set(x2, y, z2);
        scene.add(glow2);
        // Emissive tint for cores
        mat1.emissive = new THREE.Color(color);
        mat2.emissive = new THREE.Color(color);
      }

      // Base-pair connector (rung)
      createCylinderBetween(s1.position, s2.position, 0.15, 0x86efac);
    });

    // Backbones: connect neighboring nucleotides within each strand
    for (let i = 1; i < strand1Points.length; i++) {
      createCylinderBetween(strand1Points[i - 1], strand1Points[i], 0.08, 0x93c5fd);
      createCylinderBetween(strand2Points[i - 1], strand2Points[i], 0.08, 0xfca5a5);
    }

    // ORF highlight sleeves around helix axis
    if (showOrfs) {
      orfSegments.forEach((seg) => {
        const startY = (seg.start * heightStep) - offset;
        const endY = ((seg.end - 1) * heightStep) - offset;
        const midY = (startY + endY) / 2;
        const heightLen = Math.max(0.1, Math.abs(endY - startY) + heightStep);
        const sleeveRadius = radius + 1.2;
        const sleeveGeo = new THREE.CylinderGeometry(sleeveRadius, sleeveRadius, heightLen, 48, 1, true);
        const sleeveMat = new THREE.MeshBasicMaterial({
          color: seg.color || 0x22c55e,
          transparent: true,
          opacity: seg.selected ? 0.24 : 0.12,
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
        });
        const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
        sleeve.position.set(0, midY, 0);
        sleeve.renderOrder = 5;
        scene.add(sleeve);
      });
    }

    // Restriction enzyme cut-site markers (pulsing rings)
    const snipMeshes = [];
    if (Array.isArray(cutSites)) {
      cutSites.forEach((cs, idx) => {
        const y = (cs.index * heightStep) - offset;
        // Slight radial offset per strand to prevent z-fighting when two cuts share the same index
        const radialJitter = cs.strand === "bottom" ? 0.08 : 0.0;
        const ringRadius = radius + 0.8 + radialJitter;
        const ringGeo = new THREE.TorusGeometry(ringRadius, 0.14, 16, 64);
        const color = cs.color || 0xef4444;
        const ringMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.95,
          depthTest: false,
          depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(0, y, 0.001 + (cs.strand === "bottom" ? 0.0005 : 0));
        ring.rotation.x = Math.PI / 2;
        ring.renderOrder = 10;
        scene.add(ring);
        snipMeshes.push(ring);

        // Filled disc (brighter green) to make the cut very recognizable
        const discGeo = new THREE.CircleGeometry(ringRadius * 0.92, 64);
        const discMat = new THREE.MeshBasicMaterial({
          color: 0x22ff88, // bright mint green
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
        });
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.position.set(0, y, 0.002 + (cs.strand === "bottom" ? 0.0005 : 0));
        disc.rotation.x = Math.PI / 2;
        disc.renderOrder = 11;
        scene.add(disc);
        snipMeshes.push(disc);

        // Soft glow sprite (subtle halo)
        const spriteMat = new THREE.SpriteMaterial({
          color: 0x86efac,
          opacity: 0.28,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const glow = new THREE.Sprite(spriteMat);
        glow.position.set(0, y, 0.003 + (cs.strand === "bottom" ? 0.0005 : 0));
        const glowSize = ringRadius * 2.0;
        glow.scale.set(glowSize, glowSize, 1);
        glow.renderOrder = 12;
        scene.add(glow);
        snipMeshes.push(glow);
      });
    }

    // 🔁 ANIMATION
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      scene.rotation.y += 0.01;
      // Pulse cut-site markers
      if (showCutAnimation) {
        const t = performance.now() * 0.003;
        snipMeshes.forEach((m, idx) => {
          const s = 1 + 0.12 * Math.sin(t + idx);
          m.scale.set(s, s, s);
          m.material.opacity = 0.65 + 0.25 * (0.5 + 0.5 * Math.sin(t + idx));
        });
      } else {
        snipMeshes.forEach((m) => {
          m.scale.set(1, 1, 1);
          m.material.opacity = 0.7;
        });
      }
      renderer.render(scene, camera);
    };

    animate();

    // 🧹 CLEANUP
    return () => {
      cancelAnimationFrame(raf);
      controls.dispose();
      renderer.dispose();
      if (typeof renderer.forceContextLoss === "function") {
        renderer.forceContextLoss();
      }
      if (mount && renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [sequence, JSON.stringify(cutSites), JSON.stringify(orfSegments), JSON.stringify(mutatedMarkers), showCutAnimation, showOrfs]);

  return (
    <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      {helixHint && (
        <div
          style={{
            maxWidth: 720,
            padding: "8px 12px",
            fontSize: 12,
            color: "#94a3b8",
            background: "#0f172a",
            border: "1px solid #1f2a44",
            borderRadius: 8,
            textAlign: "center",
          }}
        >
          {helixHint}
        </div>
      )}
      <div
        ref={mountRef}
        style={{
          display: "flex",
          justifyContent: "center",
        }}
      />
    </div>
  );
};

export default DNAHelix;