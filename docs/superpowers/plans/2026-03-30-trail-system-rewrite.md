# Trail System Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the satellite trail system with append-only ribbon mesh rendering that works at all simulation speeds, and remove all hard speed cutoffs.

**Architecture:** New `SatTrail` class handles ribbon geometry with birth-based shader fade and shift compaction. All trail vertices stored in ECI coordinates; a parent `THREE.Group` applies GMST rotation each frame (O(1)). Angular-density sampling emits trail points proportional to orbital arc swept, capped per-satellite per-frame. Speed cutoffs (`SPEED_HIDE_TRAILS`, `SPEED_SKIP_SATS`) removed entirely.

**Tech Stack:** Three.js (BufferGeometry, ShaderMaterial, Group), satellite.js (SGP4, gstime), TypeScript, Vite

**Verification:** No test framework — verify via `npx tsc --noEmit` (type-check) and `npm run dev` (visual browser testing).

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/utils/SatTrail.ts` | **Create** | SatTrail class: ribbon mesh, emit/compact/update/dispose, shader, shared index buffer |
| `src/config/constants.ts` | **Modify** | Add trail constants (TRAIL_MAX, ANGLE_STEP, etc.) |
| `src/App.tsx` | **Modify** | Replace trail creation/update, add trailGroup, remove speed cutoffs |
| `src/utils/trailShader.ts` | **Delete** | Replaced by SatTrail's built-in shader |

---

### Task 1: Create SatTrail class

**Files:**
- Create: `src/utils/SatTrail.ts`

- [ ] **Step 1: Create the SatTrail class with ribbon shader, shared index buffer, emit, compact, update, and dispose**

Create `src/utils/SatTrail.ts`:

```typescript
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/utils/SatTrail.ts
git commit -m "feat: add SatTrail class — append-only ribbon mesh with birth-based fade"
```

---

### Task 2: Add trail constants to config

**Files:**
- Modify: `src/config/constants.ts`

- [ ] **Step 1: Add angular-density sampling constants**

At the end of the SPEED_PRESETS block (after line 33), add:

```typescript
// ═══ Trail system (append-only ribbon) ═══
export const ANGLE_STEP = 0.05;         // ~2.9° per trail sample — smooth curve
export const MAX_EMIT_PER_SAT = 8;      // max trail points per satellite per emit cycle
export const SGP4_BUDGET_PER_FRAME = 500; // max total SGP4 calls for trail emission per frame
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/config/constants.ts
git commit -m "feat: add angular-density trail constants"
```

---

### Task 3: Integrate SatTrail into materializeSat / dematerializeSat

**Files:**
- Modify: `src/App.tsx` (imports, satellite data arrays, materializeSat, dematerializeSat)

- [ ] **Step 1: Update imports**

In `src/App.tsx` line 9, replace:
```typescript
import { createTrailMaterial, createTrailIndexAttribute } from './utils/trailShader';
```
with:
```typescript
import { SatTrail } from './utils/SatTrail';
```

In `src/App.tsx` line 14, add the new constants to the import from `./config/constants`:
```typescript
import { h2n, darkenHex, TRACKS_LIST, BASE, SPEED_PRESETS, TEX_FILES, procTex, P, PR, ANGLE_STEP, MAX_EMIT_PER_SAT, SGP4_BUDGET_PER_FRAME } from './config/constants';
```

Note: `gstime` import is added later in Task 4 (after the export is created).

- [ ] **Step 2: Replace satellite trail data arrays**

In `src/App.tsx` around lines 558-560, replace:
```typescript
    const satTrails: (Float32Array | null)[] = [];
    const satTrailLines: (THREE.Line | null)[] = [];
    const satTrailReady: boolean[] = [];
```
with:
```typescript
    const satTrailObjects: (SatTrail | null)[] = [];
    const satPrevEci: ({ x: number; y: number; z: number } | null)[] = [];
```

Add the trailGroup and kmToScene constant right after (around line 563, after `satFrozen`):
```typescript
    const kmToScene = earthSceneR / 6371;
    const trailGroup = new THREE.Group();
    trailGroup.name = 'satTrailGroup';
    scene.add(trailGroup);
```

- [ ] **Step 3: Replace materializeSat trail creation**

In `src/App.tsx` `materializeSat()` function (lines 577-602), replace the trail section (lines 588-601):
```typescript
      // Per-satellite trail line (THREE.Line + fading shader)
      const trailArr = new Float32Array(TRAIL_LEN * 3);
      satTrails[i] = trailArr;
      satTrailReady[i] = false;
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(trailArr, 3));
      trailGeo.setAttribute('trailIndex', createTrailIndexAttribute(TRAIL_LEN));
      trailGeo.setDrawRange(0, 0);
      const tMat = createTrailMaterial('#ffffff');
      const trailLine = new THREE.Line(trailGeo, tMat);
      trailLine.visible = false;
      trailLine.frustumCulled = false;
      scene.add(trailLine);
      satTrailLines[i] = trailLine;
```
with:
```typescript
      // Per-satellite ribbon trail (append-only, birth-based fade)
      const ribbonW = kmToScene * 20; // ~20km ribbon width in ECI-scaled space
      const trail = new SatTrail(sat.color, sat.groupId === GID_STATIONS ? ribbonW * 3 : ribbonW);
      trailGroup.add(trail.mesh);
      satTrailObjects[i] = trail;
      satPrevEci[i] = null; // will be set on first SGP4 position
```

- [ ] **Step 4: Replace dematerializeSat trail cleanup**

In `src/App.tsx` `dematerializeSat()` function (lines 604-615), replace:
```typescript
      const trail = satTrailLines[i];
      if (trail) { scene.remove(trail); trail.geometry.dispose(); (trail.material as THREE.Material).dispose(); satTrailLines[i] = null; }
      satTrails[i] = null;
      satTrailReady[i] = false;
```
with:
```typescript
      const trail = satTrailObjects[i];
      if (trail) { trailGroup.remove(trail.mesh); trail.dispose(); satTrailObjects[i] = null; }
      satPrevEci[i] = null;
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: errors in the animation loop (trail references not yet updated) — that's OK, we fix those in the next tasks. Check that the NEW code in materializeSat/dematerializeSat has no errors.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire SatTrail into materializeSat/dematerializeSat, add trailGroup"
```

---

### Task 4: Export gstime from celestrak.ts

**Files:**
- Modify: `src/services/celestrak.ts`

- [ ] **Step 1: Re-export gstime**

At the bottom of `src/services/celestrak.ts`, add:
```typescript
export { gstime } from 'satellite.js';
```

Then in `src/App.tsx`, update the celestrak import to include `gstime`:
```typescript
import { fetchAllSatellites, fetchStarlinkSatellites, getSatPositionECI, eciToScene, SAT_GROUPS, type SatRecord, gstime } from './services/celestrak';
```

This makes gstime available to App.tsx for the trailGroup rotation computation.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors from this file (animation loop errors from Task 3 still expected)

- [ ] **Step 3: Commit**

```bash
git add src/services/celestrak.ts
git commit -m "feat: re-export gstime from celestrak for trail group rotation"
```

---

### Task 5: Delete old trail constants and initial trail population

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Delete old trail constants**

In `src/App.tsx` around lines 82-90, delete these three lines:
```typescript
    const SPEED_HIDE_TRAILS = 1800;    // spd > this: hide trails, show orbit lines
    const SPEED_SKIP_SATS = 86400;     // spd >= this: skip all satellite SGP4
    const TRAIL_LEN = 80;             // SGP4 sample points per trail
```

- [ ] **Step 2: Delete initial trail population loop**

In `src/App.tsx` around lines 662-694 (the block starting with `// Pre-compute initial trail positions for visible satellites`), delete the entire `sats.forEach` block that pre-computes 80 SGP4 positions per satellite. This is approximately:
```typescript
      // Pre-compute initial trail positions for visible satellites
      sats.forEach((sat, i) => {
        if (!satTrails[i] || !satMeshes[i]?.visible) return;
        ... (entire forEach body) ...
      });
```

With append-only trails, this is unnecessary — trails build up naturally from frame 1.

- [ ] **Step 3: Type-check (expect remaining errors only in animation loop)**

Run: `npx tsc --noEmit`
Expected: errors only in the animation loop where `SPEED_HIDE_TRAILS`, `SPEED_SKIP_SATS`, `TRAIL_LEN`, `satTrails`, `satTrailLines`, `satTrailReady` are still referenced.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: delete old trail constants and initial population loop"
```

---

### Task 6: Rewrite animation loop — remove speed cutoffs, add trailGroup transform and emission logic

This is the largest task. It replaces the satellite position + trail update block in the animation loop.

**Files:**
- Modify: `src/App.tsx` (animation loop, lines ~1571-1937)

- [ ] **Step 1: Delete recovery state variables**

Near lines 1578-1582, delete:
```typescript
    let trailRecoveryIdx = -1; // -1 = not recovering, >= 0 = next sat index to restore
    let trailsWereHidden = false; // track if trails were hidden by high speed
```

- [ ] **Step 2: Rewrite the satellite update preamble**

Replace lines ~1727-1731:
```typescript
      // ═══ Update satellite positions + trails ═══
      const sd = satDataRef.current;
      const satSkip = spd >= SPEED_SKIP_SATS;
      const satInterval = spd < 300 ? 1 : spd < 3600 ? 3 : 10;
      const satThisFrame = !satSkip && (frameCount % satInterval === 0);
```
with:
```typescript
      // ═══ Update satellite positions + trails ═══
      const sd = satDataRef.current;
      const satInterval = spd < 300 ? 1 : spd < 3600 ? 3 : 10;
      const satThisFrame = frameCount % satInterval === 0;
```

- [ ] **Step 3: Add trailGroup transform update**

Right after the `const sd = ...` block (before the `if (sd.meshes.length > 0)` check), add:
```typescript
      // Update trail group: ECI→scene transform via GMST rotation + Earth position
      if (sd.meshes.length > 0) {
        const _trailNow = new Date(simStartMs + t * 1000);
        const _gmst = gstime(_trailNow);
        const _eIdx = EARTH_IDX;
        trailGroup.position.copy(meshes[_eIdx].position);
        trailGroup.rotation.y = -_gmst + meshes[_eIdx].rotation.y;
        trailGroup.scale.setScalar(baseScale(_eIdx));
      }
```

Note: the `new Date()` is redundant with the `now` computed inside the existing block — but placing it here avoids restructuring the existing scope. Alternatively, hoist the `now` computation.

Actually, a cleaner approach: inside the existing `if (sd.meshes.length > 0)` block, after `now` is computed (line 1734), add the trailGroup update there instead:

```typescript
        // Update trail group transform: ECI→scene via GMST + Earth rotation
        const gmst = gstime(now);
        trailGroup.position.copy(ep);
        trailGroup.rotation.y = -gmst + eRotY;
        trailGroup.scale.setScalar(sc);
```

- [ ] **Step 4: Remove `hideAllSats` dependency on `satSkip`**

Replace line ~1746:
```typescript
        const hideAllSats = satSkip || earthScreenForSats < innerHeight / cfg.satBracketHideFrac;
```
with:
```typescript
        const hideAllSats = earthScreenForSats < innerHeight / cfg.satBracketHideFrac;
```

- [ ] **Step 5: Update satellite visibility block to use new trail objects**

In the loop at `for (let i = 0; i < sd.sats.length; i++)`, replace references to old trail system.

Replace the group-off / hideAllSats block (lines ~1753-1758):
```typescript
          if (!groupOn || hideAllSats) {
            sm.visible = false;
            if (satTrailLines[i]) satTrailLines[i]!.visible = false;
            // Only zero trail data when GROUP is off (not when just zoomed out)
            if (!groupOn && satTrails[i]) { satTrails[i]!.fill(0); satTrailReady[i] = false; }
            continue;
          }
```
with:
```typescript
          if (!groupOn || hideAllSats) {
            sm.visible = false;
            const tr = satTrailObjects[i];
            if (tr) tr.mesh.visible = false;
            if (!groupOn && tr) { tr.clear(); satPrevEci[i] = null; }
            continue;
          }
```

Replace the frozen block (lines ~1762-1765):
```typescript
          if (satFrozen[i]) {
            sm.visible = false;
            if (satTrailLines[i]) satTrailLines[i]!.visible = false;
            continue;
          }
```
with:
```typescript
          if (satFrozen[i]) {
            sm.visible = false;
            const tr = satTrailObjects[i];
            if (tr) tr.mesh.visible = false;
            continue;
          }
```

Replace the altitude-deviation freeze block's trail hide (line ~1782):
```typescript
            if (satTrailLines[i]) satTrailLines[i]!.visible = false;
```
with:
```typescript
            const tr = satTrailObjects[i];
            if (tr) tr.mesh.visible = false;
```

- [ ] **Step 6: Replace the entire trail update block with append-only emission**

Delete the entire old trail block (lines ~1832-1885, from `// Trail: SGP4 past positions` through the `else if (satTrailLines[i] && spd > SPEED_HIDE_TRAILS)` block).

Replace with the new append-only emission logic, placed right after the satellite mesh positioning code (after `sm.scale.setScalar(...)` at ~line 1827):

Compute `emitInterval` **once before the satellite loop** (after the trailGroup transform, before the `for (let i = 0; ...)` loop):

```typescript
        // Trail emission stagger: spread SGP4 budget evenly across satellites
        const emitInterval = Math.max(1, Math.ceil(sd.sats.length * MAX_EMIT_PER_SAT / SGP4_BUDGET_PER_FRAME));
```

Then inside the per-satellite loop, after the satellite mesh positioning, add:

```typescript
          // ═══ Trail emission (append-only, angular-density) ═══
          const trail = satTrailObjects[i];
          if (trail && showTrails) {
            if (frameCount % emitInterval === (i % emitInterval)) {
              const sr2 = sat.satrec as any;
              const periodSec = sr2.no ? (2 * Math.PI / sr2.no) * 60 : 5400;
              // How many simulation seconds since last emit for this satellite
              const dtSim = dt * spd * emitInterval; // approximate: emitInterval frames of dt
              const angleSwept = (dtSim / periodSec) * 2 * Math.PI;
              let nEmit = Math.ceil(Math.abs(angleSwept) / ANGLE_STEP);
              nEmit = Math.max(1, Math.min(nEmit, MAX_EMIT_PER_SAT));

              const subDt = dtSim / nEmit;
              const nowMs = now.getTime();
              const sampleDate = new Date(nowMs);
              let prev = satPrevEci[i];

              for (let k = 1; k <= nEmit; k++) {
                sampleDate.setTime(nowMs - dtSim * 1000 + k * subDt * 1000);
                const sEci = getSatPositionECI(sat, sampleDate);
                if (!sEci) continue;
                if (prev) {
                  trail.emit(
                    sEci.x * kmToScene, sEci.y * kmToScene, sEci.z * kmToScene,
                    sEci.x - prev.x, sEci.y - prev.y, sEci.z - prev.z,
                  );
                }
                prev = sEci;
              }
              satPrevEci[i] = prev;
            }
            trail.mesh.visible = trail.n > 1;
            trail.update();
          } else if (trail) {
            trail.mesh.visible = false;
          }
```

- [ ] **Step 7: Delete the progressive trail recovery block**

Delete lines ~1888-1937 (the entire `// ═══ Progressive trail recovery ═══` block through its closing brace).

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If there are remaining references to `satTrails`, `satTrailLines`, `satTrailReady`, `TRAIL_LEN`, `SPEED_HIDE_TRAILS`, `SPEED_SKIP_SATS`, `trailsWereHidden`, or `trailRecoveryIdx`, find and remove/replace them.

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx
git commit -m "feat: rewrite animation loop with append-only trail emission, remove all speed cutoffs"
```

---

### Task 7: Clean up remaining old trail references

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/utils/trailShader.ts`

- [ ] **Step 1: Search for and fix remaining old references**

Search `src/App.tsx` for any remaining references to:
- `satTrails` (the old Float32Array array)
- `satTrailLines` (the old THREE.Line array)
- `satTrailReady` (the old boolean array)
- `TRAIL_LEN`
- `SPEED_HIDE_TRAILS`
- `SPEED_SKIP_SATS`
- `satSkip`
- `trailsWereHidden`
- `trailRecoveryIdx`
- `createTrailMaterial`
- `createTrailIndexAttribute`

For each occurrence:
- If it's a trail visibility check: replace with `satTrailObjects[i]?.mesh.visible`
- If it's a trail data fill/reset: replace with `satTrailObjects[i]?.clear()`
- If it's a deleted constant: remove the line
- If it's in orbit line auto-show logic tied to `SPEED_HIDE_TRAILS`: remove the condition (orbit lines become user-toggle only)

- [ ] **Step 2: Delete the old trail shader file**

Delete `src/utils/trailShader.ts`.

- [ ] **Step 3: Type-check — must be clean**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 4: Commit**

```bash
git rm src/utils/trailShader.ts
git add src/App.tsx
git commit -m "refactor: remove old trail system remnants and trailShader.ts"
```

---

### Task 8: Visual verification and tuning

**Files:**
- Possibly tweak: `src/utils/SatTrail.ts`, `src/App.tsx`

- [ ] **Step 1: Start dev server and test at real-time speed**

Run: `npm run dev`

Verify:
- Satellite trails appear as glowing ribbons (not hairlines)
- Trails fade smoothly from bright (near satellite) to transparent (tail)
- Trails follow the orbital arc correctly (smooth curves, not S-shaped)
- Trails stay aligned with Earth as it rotates

- [ ] **Step 2: Test at medium speed (5min/s, 30min/s)**

Increase speed to 5分钟/秒 and 30分钟/秒.

Verify:
- Trails remain visible (NOT hidden like the old system)
- More trail points are emitted (angular-density scaling)
- Trails are smooth, not jagged
- Performance stays fluid (no frame drops)

- [ ] **Step 3: Test at extreme speed (1天/s, 1年/s)**

Increase speed to 1天/秒 and 1年/秒.

Verify:
- Satellites are still visible (NOT hidden)
- Trails gradually fill in to form orbital rings
- No browser freeze or severe frame drops
- Switching back to low speed: trails resume smoothly (no "recovery" delay)

- [ ] **Step 4: Test showTrails toggle**

Toggle the "人造卫星轨迹线" checkbox off and on.

Verify:
- Off: all trails hidden
- On: trails resume from current position (empty, then build up)

- [ ] **Step 5: Test group toggle**

Toggle satellite groups (e.g., Starlink off/on).

Verify:
- Off: trails cleared for that group
- On: trails start fresh, building up from scratch

- [ ] **Step 6: Tune ribbon width if needed**

If ribbons are too thick or thin:
- Adjust `kmToScene * 20` in materializeSat — try values from `kmToScene * 10` to `kmToScene * 40`
- If station ribbons are too thick: adjust the `3x` multiplier

If trail fades too fast or slow:
- Adjust `TRAIL_LIFE` in SatTrail.ts (higher = longer visible trail)

- [ ] **Step 7: Tune TRAIL_MAX if memory is a concern**

If browser memory usage is too high with many satellites:
- Reduce `TRAIL_MAX` from 400 to 200 or 300
- Correspondingly reduce `TRAIL_HALF`

- [ ] **Step 8: Build check**

Run: `npm run build`
Expected: successful build with no errors

- [ ] **Step 9: Commit any tuning changes**

```bash
git add -A
git commit -m "tune: adjust trail width, fade, and buffer size after visual testing"
```
