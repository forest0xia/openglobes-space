import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlanetData } from '../data/planets';
import { makeProceduralTexture } from '../utils/textures';
import { useStore } from '../stores/store';

interface PlanetProps {
  data: PlanetData;
  index: number;
}

export function Planet({ data, index }: PlanetProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  const texture = useMemo(() => makeProceduralTexture(data.color, data.textureType), [data.color, data.textureType]);

  const simulationTime = useStore((s) => s.simulationTime);
  const setFocusTarget = useStore((s) => s.setFocusTarget);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    // Orbital position
    const angle = simulationTime * data.speed;
    groupRef.current.position.x = Math.cos(angle) * data.distance;
    groupRef.current.position.z = Math.sin(angle) * data.distance;

    // Self-rotation
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.3;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh
        ref={meshRef}
        rotation={[0, 0, (data.tilt * Math.PI) / 180]}
        onClick={(e) => {
          e.stopPropagation();
          setFocusTarget({ type: 'planet', data, index });
        }}
      >
        <sphereGeometry args={[data.radius, 48, 48]} />
        <meshStandardMaterial
          map={texture}
          roughness={data.textureType === 'gas' ? 0.8 : 0.6}
          metalness={0.1}
          emissive={data.emissive}
          emissiveIntensity={0.15}
        />
      </mesh>

      {/* Saturn ring */}
      {data.hasRing && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[data.radius * 1.4, data.radius * 2.5, 64]} />
          <meshBasicMaterial
            color="#D4C090"
            side={THREE.DoubleSide}
            transparent
            opacity={0.45}
          />
        </mesh>
      )}
    </group>
  );
}
