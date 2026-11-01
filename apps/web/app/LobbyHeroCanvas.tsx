'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

function makeHalf(flip: boolean) {
  const shape = new THREE.Shape();
  if (!flip) {
    shape.moveTo(-1, -1);
    shape.lineTo(1, -1);
    shape.lineTo(-1, 1);
  } else {
    shape.moveTo(1, 1);
    shape.lineTo(-1, 1);
    shape.lineTo(1, -1);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 2,
    bevelEnabled: false,
  });
  geometry.translate(0, 0, -1);
  return geometry;
}

const SEPARATION = new THREE.Vector3(1, 1, 0).normalize();

function SplitCube({ snap }: { snap: boolean }) {
  const group = useRef<THREE.Group>(null);
  const teal = useRef<THREE.Mesh>(null);
  const amber = useRef<THREE.Mesh>(null);
  const gap = useRef(1.2);
  const clock = useRef(0);

  const tealGeometry = useRef(makeHalf(false));
  const amberGeometry = useRef(makeHalf(true));

  useFrame((_, delta) => {
    clock.current += delta;
    const target = snap ? 0 : 1 + Math.sin(clock.current * 0.8) * 0.15;
    gap.current = THREE.MathUtils.damp(gap.current, target, snap ? 9 : 2.5, delta);
    if (teal.current) {
      teal.current.position.copy(SEPARATION).multiplyScalar(-gap.current);
    }
    if (amber.current) {
      amber.current.position.copy(SEPARATION).multiplyScalar(gap.current);
    }
    if (group.current) {
      group.current.rotation.y += delta * (snap ? 1.2 : 0.25);
      group.current.rotation.x = Math.sin(clock.current * 0.4) * 0.25;
    }
  });

  return (
    <group ref={group}>
      <mesh ref={teal} geometry={tealGeometry.current}>
        <meshStandardMaterial color="#2DD4BF" roughness={0.35} metalness={0.15} />
      </mesh>
      <mesh ref={amber} geometry={amberGeometry.current}>
        <meshStandardMaterial color="#F59E0B" roughness={0.35} metalness={0.15} />
      </mesh>
    </group>
  );
}

export default function LobbyHeroCanvas({ snap }: { snap: boolean }) {
  return (
    <div className="hero3d-canvas">
      <Canvas camera={{ position: [0, 0, 6.5], fov: 45 }} dpr={[1, 2]}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 6, 5]} intensity={1.4} />
        <SplitCube snap={snap} />
      </Canvas>
    </div>
  );
}
