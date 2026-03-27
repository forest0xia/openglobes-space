import * as THREE from 'three';

const vertexShader = /* glsl */ `
  attribute float trailIndex;
  uniform float activePoints;
  varying float vAlpha;

  void main() {
    float progress = trailIndex / max(activePoints - 1.0, 1.0);
    // Front 50% (near satellite): full opacity. Rear 50%: smooth fade to 0
    vAlpha = progress < 0.5 ? smoothstep(0.0, 0.5, progress) : 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 trailColor;
  uniform float opacity;
  varying float vAlpha;

  void main() {
    gl_FragColor = vec4(trailColor, vAlpha * opacity);
  }
`;

export function createTrailMaterial(color: string | number): THREE.ShaderMaterial {
  const c = new THREE.Color(color);
  return new THREE.ShaderMaterial({
    uniforms: {
      trailColor: { value: new THREE.Vector3(c.r, c.g, c.b) },
      activePoints: { value: 0.0 },
      opacity: { value: 0.6 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
}

export function createTrailIndexAttribute(count: number): THREE.BufferAttribute {
  const indices = new Float32Array(count);
  for (let i = 0; i < count; i++) indices[i] = i;
  return new THREE.BufferAttribute(indices, 1);
}
