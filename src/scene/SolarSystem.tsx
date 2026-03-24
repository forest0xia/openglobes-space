import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { Stars } from './Stars';
import { Sun } from './Sun';
import { Planet } from './Planet';
import { OrbitLine } from './OrbitLine';
import { Probes } from './Probes';
import { CameraController } from './CameraController';
import { PLANETS } from '../data/planets';
import { useStore } from '../stores/store';

function TimeAdvancer() {
  const advanceTime = useStore((s) => s.advanceTime);
  useFrame((_, delta) => {
    advanceTime(delta);
  });
  return null;
}

export function SolarSystem() {
  const setLoaded = useStore((s) => s.setLoaded);

  return (
    <Canvas
      camera={{ fov: 55, near: 0.1, far: 2000, position: [0, 60, 80] }}
      style={{
        position: 'fixed',
        inset: 0,
        cursor: 'grab',
        background: '#030014',
      }}
      onCreated={() => {
        setTimeout(() => setLoaded(), 800);
      }}
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 2]}
    >
      <ambientLight color="#222244" intensity={0.3} />

      <TimeAdvancer />
      <CameraController />
      <Stars count={5000} />
      <Sun />

      {/* Planets (skip sun at index 0) */}
      {PLANETS.slice(1).map((planet, i) => (
        <group key={planet.id}>
          <OrbitLine radius={planet.distance} opacity={0.12} />
          <Planet data={planet} index={i + 1} />
        </group>
      ))}

      <Probes />

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.4}
          luminanceSmoothing={0.8}
          intensity={1.2}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  );
}
