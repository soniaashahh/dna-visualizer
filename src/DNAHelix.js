import React, { useEffect, useRef } from "react";
import * as THREE from "three";

const DNAHelix = ({ sequence }) => {
  const mountRef = useRef(null);

  useEffect(() => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f5);

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

    sequence.split("").forEach((base, i) => {
      const angle = i * angleStep;

      const x = radius * Math.cos(angle);
      const y = i * heightStep - offset;
      const z = radius * Math.sin(angle);

      const geometry = new THREE.SphereGeometry(1.2, 32, 32);
      const material = new THREE.MeshStandardMaterial({
        color: colors[base] || 0x999999,
      });

      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.set(x, y, z);

      scene.add(sphere);
    });

    // 🔁 ANIMATION
    const animate = () => {
      requestAnimationFrame(animate);
      scene.rotation.y += 0.01;
      renderer.render(scene, camera);
    };

    animate();

    // 🧹 CLEANUP
    return () => {
      if (mount && renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
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