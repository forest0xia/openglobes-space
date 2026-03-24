import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';

interface OrbitLineProps {
  radius: number;
  color?: string;
  opacity?: number;
  segments?: number;
}

export function OrbitLine({
  radius,
  color = '#4FC3F7',
  opacity = 0.08,
  segments = 128,
}: OrbitLineProps) {
  const lineRef = useRef<THREE.Line>(null);

  const geometry = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [radius, segments]);

  const material = useMemo(
    () => new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    [color, opacity]
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return <primitive ref={lineRef} object={new THREE.Line(geometry, material)} />;
}
