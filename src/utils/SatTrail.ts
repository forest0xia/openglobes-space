import * as THREE from 'three';

/**
 * SatTrail — tapered ribbon trail built from center-line positions.
 *
 * Usage: call rebuild(positions, count) with scene-coordinate offsets from Earth center.
 * The ribbon tapers from full width at the head (near satellite) to zero at the tail.
 * Opacity also fades from bright at head to transparent at tail.
 *
 * Coordinates: trail.mesh is positioned at Earth center each frame (same as old THREE.Line).
 * Positions are in scene coordinates — computed via eciToScene() for perfect alignment.
 */

const TRAIL_N = 80; // number of center-line sample points (same as old TRAIL_LEN)

// ═══ Shared index buffer ═══
let _sharedIdx: THREE.BufferAttribute | null = null;
function sharedIndex(): THREE.BufferAttribute {
  if (_sharedIdx) return _sharedIdx;
  const idx = new Uint32Array((TRAIL_N - 1) * 6);
  for (let i = 0; i < TRAIL_N - 1; i++) {
    const v = i * 2, nv = (i + 1) * 2, o = i * 6;
    idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = nv;
    idx[o + 3] = v + 1; idx[o + 4] = nv + 1; idx[o + 5] = nv;
  }
  _sharedIdx = new THREE.BufferAttribute(idx, 1);
  return _sharedIdx;
}

// ═══ Shader ═══
const VS = /* glsl */ `
  attribute float taper;
  varying float vFade;
  void main() {
    // taper: 0 at tail, 1 at head (near satellite)
    // Front 50%: full opacity. Rear 50%: smooth fade to 0.
    vFade = taper < 0.5 ? smoothstep(0.0, 0.5, taper) : 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FS = /* glsl */ `
  uniform vec3 uColor;
  varying float vFade;
  void main() {
    if (vFade < 0.003) discard;
    gl_FragColor = vec4(uColor, vFade * 0.85);
  }
`;

export { TRAIL_N };

export class SatTrail {
  private readonly verts: Float32Array;  // TRAIL_N * 2 * 3
  private readonly tapers: Float32Array; // TRAIL_N * 2
  private readonly vAttr: THREE.BufferAttribute;
  private readonly tAttr: THREE.BufferAttribute;
  private readonly geo: THREE.BufferGeometry;
  private readonly w: number;
  private count = 0; // how many center-line points are valid

  readonly mesh: THREE.Mesh;

  constructor(_color: string | number, width: number) {
    this.w = width;
    this.verts = new Float32Array(TRAIL_N * 2 * 3);
    this.tapers = new Float32Array(TRAIL_N * 2);

    this.geo = new THREE.BufferGeometry();
    this.vAttr = new THREE.BufferAttribute(this.verts, 3);
    this.vAttr.setUsage(THREE.DynamicDrawUsage);
    this.tAttr = new THREE.BufferAttribute(this.tapers, 1);
    this.tAttr.setUsage(THREE.DynamicDrawUsage);

    this.geo.setAttribute('position', this.vAttr);
    this.geo.setAttribute('taper', this.tAttr);
    this.geo.setIndex(sharedIndex());
    this.geo.setDrawRange(0, 0);

    this.mesh = new THREE.Mesh(this.geo, new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Vector3(1, 1, 1) },
      },
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
  }

  /**
   * Rebuild the entire ribbon from center-line positions.
   * @param centers  Float32Array of xyz positions (offsets from Earth center, in scene coords)
   * @param n        Number of valid points (max TRAIL_N). Index 0=tail, n-1=head.
   * @param camRel   Camera position relative to Earth center (for per-vertex pixel-width)
   * @param pxFactor Precomputed 2*tan(fov/2)/screenHeight*1.5 (multiply by depth → half-width in scene units for 3px)
   */
  rebuild(centers: Float32Array, n: number, camRel?: { x: number; y: number; z: number }, pxFactor?: number): void {
    if (n < 2) { this.count = n; this.geo.setDrawRange(0, 0); return; }
    this.count = n;
    const last = n - 1;
    const usePxWidth = camRel !== undefined && pxFactor !== undefined;

    for (let i = 0; i < n; i++) {
      const ci = i * 3;
      const cx = centers[ci], cy = centers[ci + 1], cz = centers[ci + 2];

      // Tangent: central difference (forward/backward at edges)
      let tx: number, ty: number, tz: number;
      if (i === 0) {
        tx = centers[3] - cx; ty = centers[4] - cy; tz = centers[5] - cz;
      } else if (i === last) {
        tx = cx - centers[ci - 3]; ty = cy - centers[ci - 2]; tz = cz - centers[ci - 1];
      } else {
        tx = centers[ci + 3] - centers[ci - 3];
        ty = centers[ci + 4] - centers[ci - 2];
        tz = centers[ci + 5] - centers[ci - 1];
      }

      // Normalize tangent
      let tl = tx * tx + ty * ty + tz * tz;
      if (tl < 1e-16) { tx = 1; ty = 0; tz = 0; }
      else { tl = 1 / Math.sqrt(tl); tx *= tl; ty *= tl; tz *= tl; }

      // Side = cross(tangent, radial) — ribbon faces outward from Earth
      const rd = Math.sqrt(cx * cx + cy * cy + cz * cz);
      let rx = cx, ry = cy, rz = cz;
      if (rd > 1e-10) { const ri = 1 / rd; rx *= ri; ry *= ri; rz *= ri; }
      let sx = ty * rz - tz * ry;
      let sy = tz * rx - tx * rz;
      let sz = tx * ry - ty * rx;
      let sl = sx * sx + sy * sy + sz * sz;
      if (sl < 1e-16) { sx = 1; sy = 0; sz = 0; sl = 1; }

      // Taper: 0 at tail → 1 at head
      const taper = i / last;
      const widthFactor = taper < 0.5 ? taper * 2 : 1.0;

      // Per-vertex width: fixed 3px based on THIS vertex's distance from camera
      let halfW: number;
      if (usePxWidth) {
        const dx = cx - camRel!.x, dy = cy - camRel!.y, dz = cz - camRel!.z;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), 0.001);
        halfW = pxFactor! * dist * widthFactor;
      } else {
        halfW = this.w * widthFactor;
      }

      sl = halfW / Math.sqrt(sl);
      sx *= sl; sy *= sl; sz *= sl;

      const vi = i * 6;
      this.verts[vi]     = cx + sx; this.verts[vi + 1] = cy + sy; this.verts[vi + 2] = cz + sz;
      this.verts[vi + 3] = cx - sx; this.verts[vi + 4] = cy - sy; this.verts[vi + 5] = cz - sz;

      const ti = i * 2;
      this.tapers[ti] = taper; this.tapers[ti + 1] = taper;
    }

    this.vAttr.needsUpdate = true;
    this.tAttr.needsUpdate = true;
    this.geo.setDrawRange(0, Math.max(0, n - 1) * 6);
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
