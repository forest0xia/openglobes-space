import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PLANETS } from '../data/planets';
import { makeProceduralTexture } from '../utils/textures';
import { useStore } from '../stores/store';

const sunData = PLANETS[0];

export function Sun() {
  const meshRef = useRef<THREE.Mesh>(null);
  const glow1Ref = useRef<THREE.Mesh>(null);
  const glow2Ref = useRef<THREE.Mesh>(null);

  const texture = useMemo(() => makeProceduralTexture(sunData.color, 'sun'), []);

  const setFocusTarget = useStore((s) => s.setFocusTarget);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.05;
    }
    // Pulsing glow
    if (glow1Ref.current) {
      const scale = 1.3 + Math.sin(Date.now() * 0.001) * 0.05;
      glow1Ref.current.scale.setScalar(scale);
    }
    if (glow2Ref.current) {
      const scale = 1.8 + Math.sin(Date.now() * 0.0007) * 0.1;
      glow2Ref.current.scale.setScalar(scale);
    }
  });

  return (
    <group>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          setFocusTarget({ type: 'planet', data: sunData, index: 0 });
        }}
      >
        <sphereGeometry args={[sunData.radius, 64, 64]} />
        <meshBasicMaterial map={texture} />
      </mesh>

      {/* Inner glow */}
      <mesh ref={glow1Ref}>
        <sphereGeometry args={[sunData.radius * 1.15, 32, 32]} />
        <meshBasicMaterial color="#FDB813" transparent opacity={0.08} depthWrite={false} />
      </mesh>

      {/* Outer glow — subtle haze */}
      <mesh ref={glow2Ref}>
        <sphereGeometry args={[sunData.radius * 1.5, 32, 32]} />
        <meshBasicMaterial color="#FFA500" transparent opacity={0.025} depthWrite={false} />
      </mesh>

      {/* Point light from sun */}
      <pointLight color="#FFF5E0" intensity={3} distance={500} decay={1} />
    </group>
  );
}
