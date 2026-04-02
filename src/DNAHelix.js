import React, { useEffect, useRef } from "react";
import * as THREE from "three";

const DNAHelix = ({ sequence }) => {
  const mountRef = useRef(null);

  useEffect(() => {
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);

    // ✅ SAVE STABLE REF
    const mount = mountRef.current;
    if (!mount) return;

    mount.appendChild(renderer.domElement);

    camera.position.z = 20;

    // LIGHT
    const light = new THREE.PointLight(0xffffff, 1);
    light.position.set(10, 10, 10);
    scene.add(light);

    // COLORS
    const colors = {
      A: 0x00ff00,
      T: 0xff0000,
      G: 0xffff00,
      C: 0x0000ff,
    };

    // HELIX SETTINGS
    const radius = 5;
    const heightStep = 1;
    const angleStep = 0.5;

    sequence.split("").forEach((base, i) => {
      const angle = i * angleStep;

      const x = radius * Math.cos(angle);
      const y = i * heightStep;
      const z = radius * Math.sin(angle);

      const geometry = new THREE.SphereGeometry(0.5, 16, 16);
      const material = new THREE.MeshStandardMaterial({
        color: colors[base] || 0xffffff,
      });

      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.set(x, y, z);

      scene.add(sphere);
    });

    // ANIMATE
    const animate = () => {
      requestAnimationFrame(animate);
      scene.rotation.y += 0.01;
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      if (mount && renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [sequence]);

  return <div ref={mountRef}></div>;
};

export default DNAHelix;