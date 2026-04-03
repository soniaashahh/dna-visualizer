import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

const DNAHelix = ({ sequence, mutatedMarkers = [], orfSegments = [] }) => {
  const mountRef = useRef(null);

  useEffect(() => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1c);

    const width = 1000;
    const height = 600;

    const camera = new THREE.PerspectiveCamera(
      75,
      width / height,
      0.1,
      1000
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);

    const mount = mountRef.current;
    if (!mount) return;

    mount.appendChild(renderer.domElement);

    // Mouse controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.minDistance = 20;
    controls.maxDistance = 180;
    controls.target.set(0, 0, 0);
    controls.update();

    const length = sequence.length;

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

    sequence.split("").forEach((base, i) => {
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
        opacity: seg.selected ? 0.28 : 0.16,
        side: THREE.DoubleSide,
      });
      const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
      sleeve.position.set(0, midY, 0);
      scene.add(sleeve);
    });

    // 🔁 ANIMATION
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      scene.rotation.y += 0.01;
      renderer.render(scene, camera);
    };

    animate();

    // 🧹 CLEANUP
    return () => {
      if (mount && renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      controls.dispose();
    };
  }, [sequence]);

  return (
    <div
      ref={mountRef}
      style={{
        marginTop: "20px",
        display: "flex",
        justifyContent: "center",
      }}
    />
  );
};

export default DNAHelix;