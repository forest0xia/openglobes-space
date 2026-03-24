import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PROBES } from '../data/probesMeta';
import { PLANETS } from '../data/planets';
import { useStore } from '../stores/store';

function ProbeBody({ probe, index }: { probe: (typeof PROBES)[number]; index: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const trailPositions = useRef<number[]>([]);

  const trailLine = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const mat = new THREE.LineBasicMaterial({ color: probe.color, transparent: true, opacity: 0.3 });
    return new THREE.Line(geo, mat);
  }, [probe.color]);

  const simulationTime = useStore((s) => s.simulationTime);
  const setFocusTarget = useStore((s) => s.setFocusTarget);

  const parentPlanetIndex = useMemo(() => {
    const pos = probe.fallbackPosition;
    if ('orbitPlanetId' in pos) {
      return PLANETS.findIndex((p) => p.id === pos.orbitPlanetId);
    }
    return -1;
  }, [probe]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    const pos = probe.fallbackPosition;

    if ('orbitPlanetId' in pos && parentPlanetIndex >= 0) {
      const parent = PLANETS[parentPlanetIndex];
      const parentAngle = simulationTime * parent.speed;
      const px = Math.cos(parentAngle) * parent.distance;
      const pz = Math.sin(parentAngle) * parent.distance;

      const orbitAngle = simulationTime * 1.5 + index * 2;
      meshRef.current.position.x = px + Math.cos(orbitAngle) * pos.orbitDist;
      meshRef.current.position.y = Math.sin(orbitAngle * 0.5) * 0.3;
      meshRef.current.position.z = pz + Math.sin(orbitAngle) * pos.orbitDist;
    } else if ('distance' in pos) {
      const driftAngle = pos.angle + simulationTime * 0.002;
      meshRef.current.position.x = Math.cos(driftAngle) * pos.distance;
      meshRef.current.position.y = Math.sin(simulationTime * 0.1 + index) * 1.5;
      meshRef.current.position.z = Math.sin(driftAngle) * pos.distance;
    }

    meshRef.current.rotation.y += delta * 2;
    meshRef.current.rotation.x += delta * 0.5;

    // Update trail
    const tp = trailPositions.current;
    tp.push(meshRef.current.position.x, meshRef.current.position.y, meshRef.current.position.z);
    if (tp.length > 180) tp.splice(0, 3);

    const arr = new Float32Array(tp);
    trailLine.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    trailLine.geometry.attributes.position.needsUpdate = true;
  });

  useEffect(() => {
    return () => {
      trailLine.geometry.dispose();
      (trailLine.material as THREE.Material).dispose();
    };
  }, [trailLine]);

  return (
    <group>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          setFocusTarget({ type: 'probe', data: probe, index });
        }}
      >
        <octahedronGeometry args={[0.3, 0]} />
        <meshBasicMaterial color={probe.color} />
        {/* Glow sphere */}
        <mesh>
          <sphereGeometry args={[0.6, 8, 8]} />
          <meshBasicMaterial color={probe.color} transparent opacity={0.15} depthWrite={false} />
        </mesh>
      </mesh>

      <primitive object={trailLine} />
    </group>
  );
}

export function Probes() {
  const showProbes = useStore((s) => s.showProbes);
  if (!showProbes) return null;

  return (
    <group>
      {PROBES.map((probe, i) => (
        <ProbeBody key={probe.id} probe={probe} index={i} />
      ))}
    </group>
  );
}
