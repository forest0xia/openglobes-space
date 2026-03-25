import * as THREE from 'three';

const vertexShader = /* glsl */ `
  attribute float trailIndex;
  uniform float activePoints;
  varying float vAlpha;

  void main() {
    // progress: 0 = oldest (tail), 1 = newest (head, connected to satellite)
    float progress = trailIndex / max(activePoints - 1.0, 1.0);
    // Front 50% (near satellite): full opacity
    // Rear 50% (tail): smooth fade to 0
    vAlpha = progress < 0.5 ? smoothstep(0.0, 0.5, progress) : 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 trailColor;
  varying float vAlpha;

  void main() {
    gl_FragColor = vec4(trailColor, vAlpha * 0.6);
  }
`;

/**
 * Creates a ShaderMaterial for satellite contrails.
 * White by default. Front 50% fully visible, rear 50% fades with smoothstep.
 */
export function createTrailMaterial(color: string | number): THREE.ShaderMaterial {
  const c = new THREE.Color(color);

  return new THREE.ShaderMaterial({
    uniforms: {
      trailColor: { value: new THREE.Vector3(c.r, c.g, c.b) },
      activePoints: { value: 0.0 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending, // Normal blending for white contrail look
  });
}

/**
 * Sequential index attribute for trail vertices.
 */
export function createTrailIndexAttribute(count: number): THREE.BufferAttribute {
  const indices = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    indices[i] = i;
  }
  return new THREE.BufferAttribute(indices, 1);
}
