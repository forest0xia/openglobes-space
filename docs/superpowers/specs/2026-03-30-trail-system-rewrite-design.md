# Trail System Rewrite + All-Speed Position Optimization

## Problem

The current satellite trail system has fundamental architectural limitations:

1. **Trails hidden at high speed** — `SPEED_HIDE_TRAILS = 1800` hides all trails above 30min/s. Satellites disappear entirely above `SPEED_SKIP_SATS = 86400` (1day/s).
2. **Full recomputation every N frames** — Each stagger frame recomputes all 80 SGP4 historical points per satellite (~9000 SGP4 calls/frame average). Wasteful since most points haven't changed.
3. **Fixed sampling density** — Always 80 points regardless of speed. At high speed, points are too spread; at low speed, they're unnecessarily dense.
4. **THREE.Line has no visual width** — Trails are invisible hairlines, especially at zoomed-out views.

## Solution Overview

Replace the trail system with an append-only ribbon mesh architecture inspired by the solar-system-voyage reference. Key principles:

- **Append-only**: emit new points each frame, historical vertices never modified
- **Angular-density sampling**: emit proportional to arc swept, not time elapsed
- **Ribbon mesh**: triangle strip with width, birth-based shader fade
- **No speed cutoffs**: trails and satellites visible at all speeds
- **ECI coordinate storage**: parent group rotation handles GMST transform (O(1) per frame)

## A. SatTrail Class (`src/utils/SatTrail.ts`)

### Constants

```
TRAIL_MAX = 400      // max segments per satellite
TRAIL_HALF = 200     // keep count on compaction
TRAIL_LIFE = 1500    // ticks until full fade
```

### Data Layout

Sequential arrays, NOT ring buffer (ring buffer wrapping produces ghost lines connecting tail to head):

```
positions:  Float32Array(TRAIL_MAX * 2 * 3)   // 2 vertices per segment, xyz each
births:     Float32Array(TRAIL_MAX * 2)        // birth tick per vertex
index:      Uint32Array((TRAIL_MAX-1) * 6)     // sequential quad triangles — SHARED across all instances
```

Index buffer is identical for all satellites — create once, reuse via shared `THREE.BufferAttribute`.

### emit(px, py, pz, tx, ty, tz)

Input: position in ECI-scaled coordinates + tangent vector.

1. Normalize tangent
2. Choose up axis: `(0,1,0)` unless `|ty| > 0.85`, then `(0,0,1)`
3. `side = cross(tangent, up) * ribbonWidth`
4. Write two vertices: `pos + side`, `pos - side`
5. Write birth tick for both vertices
6. Mark `positionAttr.updateRange` and `birthAttr.updateRange` for incremental GPU upload (NOT full-buffer `needsUpdate`)
7. Increment `n` and `tick`

### Compaction

When `n >= TRAIL_MAX`:
```javascript
const keep = TRAIL_HALF;
const src = (this.n - keep) * 2;
positions.copyWithin(0, src * 3, n * 2 * 3);
births.copyWithin(0, src, n * 2);
n = keep;
// After compaction: full upload required (reset updateRange to 0..n)
```

### update() — called each frame

```javascript
material.uniforms.uNow.value = this.tick;
geometry.setDrawRange(0, Math.max(0, n - 1) * 6);
```

### Shader

Vertex:
```glsl
attribute float birth;
uniform float uNow, uLife;
varying float vFade;
void main() {
  float age = uNow - birth;
  vFade = 1.0 - clamp(age / uLife, 0.0, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

Fragment:
```glsl
uniform vec3 uColor;
varying float vFade;
void main() {
  float f = vFade * vFade;          // quadratic decay — tail fades fast
  if (f < 0.003) discard;           // skip fully transparent fragments
  gl_FragColor = vec4(uColor * (0.35 + 0.85 * f), f * 0.75);
}
```

Material: `transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide`.

### Ribbon Width

`ribbonWidth` is in the same coordinate space as stored positions (`eci * kmToScene`). Default: `20 * kmToScene` (~20km equivalent, where `kmToScene = earthSceneR / 6371`). The parent group's `scale` (set to `scaleFactor`) automatically scales ribbon width with zoom. Stations get `3x` width.

## B. ECI Coordinate Storage + Parent Group

### Architecture

```
trailGroup (THREE.Group)
  ├─ position: earthCenter (updated each frame)
  ├─ rotation.y: -gmst + earthRotY (updated each frame)
  └─ children: [satTrail[0].mesh, satTrail[1].mesh, ...]
```

All trail vertices are stored in **ECI coordinates × kmToScene × scaleFactor**:
```javascript
const eciScaled = {
  x: eci.x * kmToScene * scaleFactor,
  y: eci.y * kmToScene * scaleFactor,
  z: eci.z * kmToScene * scaleFactor,
};
```

Where `kmToScene = earthSceneR / 6371` (constant) and `scaleFactor = baseScale(EARTH_IDX)`.

### Why This Works

- ECI positions for a given time are immutable — append-only is naturally correct
- Frame-to-frame GMST change is handled by one group rotation update (O(1))
- No per-vertex GMST transformation needed
- When `scaleFactor` changes (focus transitions), `trailGroup.scale` can be updated to match. Alternatively, if scaleFactor is stable (which it is for most interactions), bake it into vertex positions.

### scaleFactor Handling

If `baseScale(EARTH_IDX)` changes during focus transitions:
- Store `lastScale` at emission time
- On scale change, update `trailGroup.scale.setScalar(newScale / baseEciScale)` to rescale all existing vertices
- New emissions use the new scale value in their ECI-scaled coordinates

Simpler alternative: always store raw `eci * kmToScene` (without scaleFactor), and set `trailGroup.scale.setScalar(scaleFactor)` each frame. This makes scale changes free.

**Chosen approach**: store `eci * kmToScene` in vertices, apply `scaleFactor` via group scale.

## C. Angular-Density Trail Emission

### Per-satellite emission logic (each frame or stagger frame)

```javascript
const periodSec = (2 * Math.PI / sat.satrec.no) * 60;
const dtSim = dt * spd;  // simulation seconds elapsed this frame
const angleSwept = (dtSim / periodSec) * 2 * Math.PI;

let nEmit = Math.ceil(Math.abs(angleSwept) / ANGLE_STEP);
nEmit = Math.max(1, Math.min(nEmit, MAX_EMIT_PER_SAT));

const subDt = dtSim / nEmit;
for (let k = 1; k <= nEmit; k++) {
  const tSample = simTimeSec - dtSim + k * subDt;
  const sampleDate = new Date(simStartMs + tSample * 1000);
  const eci = getSatPositionECI(sat, sampleDate);
  // tangent from difference with previous ECI (prevEci stored per satellite)
  const tangent = { x: eci.x - prevEci.x, y: eci.y - prevEci.y, z: eci.z - prevEci.z };
  trail.emit(eci.x * kmToScene, eci.y * kmToScene, eci.z * kmToScene,
             tangent.x, tangent.y, tangent.z);
  prevEci = eci;
}
// Store prevEci per satellite: satPrevEci[i] = lastEci

```

### Constants

```
ANGLE_STEP = 0.05        // ~2.9° per sample — smooth curve
MAX_EMIT_PER_SAT = 8     // safety cap per satellite per frame
```

### Performance at Different Speeds

| Speed | LEO (90min) angle/frame @60fps | Emit points | SGP4 calls |
|-------|-------------------------------|-------------|------------|
| 1s/s (real-time) | 0.07° | 1 | 1 |
| 5min/s | 20° | 7 | 7 |
| 30min/s | 120° | 8 (capped) | 8 |
| 1day/s | 16 orbits | 8 (capped) | 8 |
| 1yr/s | 5847 orbits | 8 (capped) | 8 |

For GEO satellites (24hr period), even at 1yr/s: 365 orbits/frame → 8 points (capped). Much less than LEO at the same speed.

### Staggering Across Satellites

Not all satellites emit every frame. A per-frame SGP4 budget controls total cost:

```javascript
const SGP4_BUDGET = 500;  // max total SGP4 calls per frame across all satellites
const emitInterval = Math.max(1, Math.ceil(visibleSatCount * maxEmitPerSat / SGP4_BUDGET));
// satellite i emits when: frameCount % emitInterval === (i % emitInterval)
```

At 2000 visible sats with MAX_EMIT = 8: `emitInterval = ceil(16000/500) = 32`. Each satellite emits every 32 frames (~0.5s). On its emit frame, it emits up to 8 points covering the accumulated arc since its last emit.

### Accumulated Arc on Stagger Frames

When a satellite hasn't emitted for K frames, it needs to cover K frames worth of arc:

```javascript
const accumDtSim = accumFrames * avgDt * spd;
const accumAngle = (accumDtSim / periodSec) * 2 * Math.PI;
let nEmit = Math.ceil(Math.abs(accumAngle) / ANGLE_STEP);
nEmit = Math.max(1, Math.min(nEmit, MAX_EMIT_PER_SAT));
```

This ensures the trail stays smooth even with staggering — the gap from skipped frames is filled in one burst.

## D. Remove Speed Cutoffs

### Delete

| Constant/Logic | Location | Action |
|---------------|----------|--------|
| `SPEED_HIDE_TRAILS = 1800` | App.tsx:82 | Delete |
| `SPEED_SKIP_SATS = 86400` | App.tsx:84 | Delete |
| `TRAIL_LEN = 80` | App.tsx:90 | Delete (replaced by SatTrail.TRAIL_MAX) |
| Trail hiding block | App.tsx:1835 `spd <= SPEED_HIDE_TRAILS` | Remove condition |
| SGP4 skip block | App.tsx:1729 `spd >= SPEED_SKIP_SATS` | Remove condition |
| Progressive trail recovery | App.tsx:1888-1937 | Delete entirely |
| `trailsWereHidden`, `trailRecoveryIdx` | App.tsx | Delete variables |
| `satTrailReady[]` | App.tsx | Delete (ribbon is always ready after first emit) |

### Keep

| Feature | Reason |
|---------|--------|
| Orbit line computation | Optional overlay, no longer auto-switched |
| `satInterval` stagger | Still useful, but no longer gates trail visibility |
| `SPEED_HIDE_UI = 1800` | Label/bracket hiding at high speed is still useful UX |
| `showTrails` toggle | UI checkbox still controls trail visibility globally |

## E. Position Computation for All Objects

### Satellites

- Always compute SGP4 positions at simulation time (no skip threshold)
- Stagger: `satInterval = spd < 300 ? 1 : spd < 3600 ? 3 : 10` (existing, keep)
- Freeze detection: keep existing altitude-deviation check
- On freeze: hide mesh + stop trail emission (don't emit bad positions)

### Moon

At extreme speed (1yr/s), moon moves ~80°/frame. Accept jumping — it's physically correct at this timescale. No trail needed (user confirmed trails are for artificial objects only).

### Planets

Analytic positions via Kepler equation: O(1), works at all speeds. No changes needed. At 1yr/s, Earth moves ~6°/frame — smooth enough.

### Earth Visual Rotation

GMST at extreme speed wraps multiple times per frame. The Earth texture rotation becomes meaningless visual noise, but the satellite positions remain correct because SGP4+GMST math is continuous. No change needed — this is cosmetically imperfect but functionally correct.

## F. Integration into App.tsx

### materializeSat(i)

Replace:
```javascript
// OLD: Float32Array + THREE.Line
const trailArr = new Float32Array(TRAIL_LEN * 3);
const trailGeo = new THREE.BufferGeometry();
// ...
const trailLine = new THREE.Line(trailGeo, tMat);
scene.add(trailLine);
```

With:
```javascript
// NEW: SatTrail ribbon mesh
const trail = new SatTrail(sat.color, ribbonWidth);
trailGroup.add(trail.mesh);  // child of ECI-rotated group
satTrailObjects[i] = trail;
```

### dematerializeSat(i)

Replace trail line cleanup with:
```javascript
const trail = satTrailObjects[i];
if (trail) { trailGroup.remove(trail.mesh); trail.dispose(); satTrailObjects[i] = null; }
```

### Initial trail population (lines 662-694)

Delete the initial 80-point SGP4 loop. With append-only, trails build up naturally from the first frame. The trail starts empty and grows — no pre-computation needed.

### Animation loop satellite block (lines 1727-1937)

Simplify to:
```
1. Compute satellite ECI position via SGP4 (staggered)
2. Convert to scene coords for mesh placement (existing eciToScene)
3. If this satellite's stagger frame: emit trail point(s) in ECI-scaled coords
4. Update trail.update() for shader uniforms
```

Delete: trail recompute logic, head-only update, progressive recovery, speed-based trail hiding.

### Animation loop frame setup

Add near the top of anim():
```javascript
// Update trail group transform
const gmst = gstime(now);
trailGroup.position.copy(meshes[EARTH_IDX].position);
trailGroup.rotation.y = -gmst + meshes[EARTH_IDX].rotation.y;
trailGroup.scale.setScalar(baseScale(EARTH_IDX));
```

## G. File Changes

| File | Action |
|------|--------|
| `src/utils/SatTrail.ts` | **New** — SatTrail class, ribbon shader, shared index buffer |
| `src/App.tsx` | **Modify** — replace trail creation/update, remove cutoffs, add trailGroup |
| `src/config/constants.ts` | **Modify** — add TRAIL_MAX, ANGLE_STEP, MAX_EMIT_PER_SAT; remove TRAIL_LEN if defined here |
| `src/utils/trailShader.ts` | **Delete** — replaced by SatTrail's built-in shader |

## H. Memory Budget

| Component | Per Satellite | 2000 Visible |
|-----------|--------------|--------------|
| Positions (400 × 2 × 3 × 4B) | 9.6 KB | 19.2 MB |
| Births (400 × 2 × 4B) | 3.2 KB | 6.4 MB |
| Shared index buffer | — | 9.6 KB |
| **Total** | **12.8 KB** | **25.6 MB** |

Acceptable for desktop. Mobile devices typically have 500-1000 visible satellites due to group filtering, reducing to ~6-13 MB.

## I. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Draw calls (2000 ribbon meshes) | Same count as current Line objects; monitor and batch if needed |
| SGP4 accuracy far from TLE epoch | Existing altitude-deviation freeze handles this |
| Buffer upload cost | `updateRange` for incremental upload; full upload only on compaction |
| scaleFactor changes during focus | Store raw `eci*kmToScene`, apply scaleFactor via group.scale |
| Trail gap when satellite hidden then re-shown | Clear trail on re-materialize; it rebuilds in <1 second |
| Ribbon degenerate at polar orbits | Up-axis adaptive selection in emit() handles `|ty| > 0.85` case |
| prevEci stale after pause/speed change | Reset prevEci on first emit after gap; use current position as both prev and current (zero tangent → skip emit) |
