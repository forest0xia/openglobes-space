import * as THREE from 'three';

/** Number of sample points per trail (covers 50% of orbit) */
export const TRAIL_N = 80;

const VS = /* glsl */ `
  attribute float trailIndex;
  uniform float activePoints;
  varying float vAlpha;
  void main() {
    float progress = trailIndex / max(activePoints - 1.0, 1.0);
    // Tail (index 0): fades. Head (index N-1): full opacity.
    vAlpha = progress < 0.5 ? smoothstep(0.0, 0.5, progress) : 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FS = /* glsl */ `
  uniform vec3 trailColor;
  uniform float opacity;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(trailColor, vAlpha * opacity);
  }
`;

// Shared trailIndex attribute (same for all trails)
let _sharedTrailIdx: THREE.BufferAttribute | null = null;
function sharedTrailIndex(): THREE.BufferAttribute {
  if (_sharedTrailIdx) return _sharedTrailIdx;
  const arr = new Float32Array(TRAIL_N);
  for (let i = 0; i < TRAIL_N; i++) arr[i] = i;
  _sharedTrailIdx = new THREE.BufferAttribute(arr, 1);
  return _sharedTrailIdx;
}

/**
 * Create a trail line with position-based fade shader.
 * Positions are written directly into the returned Float32Array.
 * Call `line.geometry.attributes.position.needsUpdate = true` after writing.
 */
export function createTrailLine(): { line: THREE.Line; positions: Float32Array } {
  const positions = new Float32Array(TRAIL_N * 3);
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('trailIndex', sharedTrailIndex());
  geo.setDrawRange(0, 0);

  const line = new THREE.Line(geo, new THREE.ShaderMaterial({
    uniforms: {
      trailColor: { value: new THREE.Vector3(1, 1, 1) },
      activePoints: { value: 0 },
      opacity: { value: 0.85 },
    },
    vertexShader: VS,
    fragmentShader: FS,
    transparent: true,
    depthWrite: false,
  }));
  line.frustumCulled = false;
  return { line, positions };
}
