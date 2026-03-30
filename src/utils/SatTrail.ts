import * as THREE from 'three';

// ═══ Trail constants ═══
export const TRAIL_MAX = 400;      // max segments per satellite
const TRAIL_HALF = 200;            // segments kept on compaction
const TRAIL_LIFE = 1500;           // ticks until full fade

// ═══ Shared index buffer (identical for all trails) ═══
let _sharedIndex: THREE.BufferAttribute | null = null;
function getSharedIndex(): THREE.BufferAttribute {
  if (_sharedIndex) return _sharedIndex;
  const idx = new Uint32Array((TRAIL_MAX - 1) * 6);
  for (let i = 0; i < TRAIL_MAX - 1; i++) {
    const v = i * 2, nv = (i + 1) * 2, o = i * 6;
    idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = nv;
    idx[o + 3] = v + 1; idx[o + 4] = nv + 1; idx[o + 5] = nv;
  }
  _sharedIndex = new THREE.BufferAttribute(idx, 1);
  return _sharedIndex;
}

// ═══ Shader ═══
const vertexShader = /* glsl */ `
  attribute float birth;
  uniform float uNow, uLife;
  varying float vFade;
  void main() {
    float age = uNow - birth;
    vFade = 1.0 - clamp(age / uLife, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying float vFade;
  void main() {
    float f = vFade * vFade;
    if (f < 0.003) discard;
    gl_FragColor = vec4(uColor * (0.35 + 0.85 * f), f * 0.75);
  }
`;

export class SatTrail {
  /** Current number of segments written */
  n = 0;
  /** Monotonic tick counter (incremented per emit) */
  tick = 0;

  private readonly pa: Float32Array;   // positions: TRAIL_MAX * 2 * 3
  private readonly ba: Float32Array;   // births:    TRAIL_MAX * 2
  private readonly pAttr: THREE.BufferAttribute;
  private readonly bAttr: THREE.BufferAttribute;
  private readonly geo: THREE.BufferGeometry;
  private readonly w: number;

  readonly mesh: THREE.Mesh;

  constructor(color: string | number, width: number) {
    this.w = width;
    this.pa = new Float32Array(TRAIL_MAX * 2 * 3);
    this.ba = new Float32Array(TRAIL_MAX * 2);

    this.geo = new THREE.BufferGeometry();
    this.pAttr = new THREE.BufferAttribute(this.pa, 3);
    this.pAttr.setUsage(THREE.DynamicDrawUsage);
    this.bAttr = new THREE.BufferAttribute(this.ba, 1);
    this.bAttr.setUsage(THREE.DynamicDrawUsage);

    this.geo.setAttribute('position', this.pAttr);
    this.geo.setAttribute('birth', this.bAttr);
    this.geo.setIndex(getSharedIndex());
    this.geo.setDrawRange(0, 0);

    const c = new THREE.Color(color);
    this.mesh = new THREE.Mesh(this.geo, new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Vector3(c.r, c.g, c.b) },
        uNow: { value: 0 },
        uLife: { value: TRAIL_LIFE },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
  }

  /**
   * Append one ribbon segment.
   * @param px,py,pz  Position in ECI-scaled coordinates
   * @param tx,ty,tz  Tangent vector (unnormalized, from ECI difference)
   */
  emit(px: number, py: number, pz: number, tx: number, ty: number, tz: number): void {
    // Normalize tangent
    let tl = tx * tx + ty * ty + tz * tz;
    if (tl < 1e-16) return;
    tl = 1 / Math.sqrt(tl);
    tx *= tl; ty *= tl; tz *= tl;

    // Up axis — avoid degenerate cross when tangent ≈ Y
    let ux = 0, uy = 1, uz = 0;
    if (Math.abs(ty) > 0.85) { ux = 0; uy = 0; uz = 1; }

    // side = cross(tangent, up) × width
    let sx = ty * uz - tz * uy;
    let sy = tz * ux - tx * uz;
    let sz = tx * uy - ty * ux;
    let sl = sx * sx + sy * sy + sz * sz;
    if (sl < 1e-16) return;
    sl = this.w / Math.sqrt(sl);
    sx *= sl; sy *= sl; sz *= sl;

    // Compaction: when full, keep the newer half
    if (this.n >= TRAIL_MAX) {
      const keep = TRAIL_HALF;
      const src = (this.n - keep) * 2;
      this.pa.copyWithin(0, src * 3, this.n * 2 * 3);
      this.ba.copyWithin(0, src, this.n * 2);
      this.n = keep;
      // Full upload after shift
      this.pAttr.needsUpdate = true;
      this.bAttr.needsUpdate = true;
    }

    // Write two vertices (left + right of ribbon)
    const o6 = this.n * 6;
    this.pa[o6]     = px + sx; this.pa[o6 + 1] = py + sy; this.pa[o6 + 2] = pz + sz;
    this.pa[o6 + 3] = px - sx; this.pa[o6 + 4] = py - sy; this.pa[o6 + 5] = pz - sz;

    const b2 = this.n * 2;
    this.ba[b2] = this.tick; this.ba[b2 + 1] = this.tick;

    this.n++;
    this.tick++;
    this.pAttr.needsUpdate = true;
    this.bAttr.needsUpdate = true;
  }

  /** Call each frame to advance shader time and draw range. */
  update(): void {
    const mat = this.mesh.material as THREE.ShaderMaterial;
    mat.uniforms.uNow.value = this.tick;
    this.geo.setDrawRange(0, Math.max(0, this.n - 1) * 6);
  }

  /** Reset trail to empty (e.g., after re-materialize). */
  clear(): void {
    this.n = 0;
    // tick intentionally NOT reset — keeps shader fade monotonic
    this.geo.setDrawRange(0, 0);
  }

  /** Dispose GPU resources. */
  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
