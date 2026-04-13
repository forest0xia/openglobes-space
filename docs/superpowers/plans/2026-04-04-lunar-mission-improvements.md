# Lunar Mission Simulation Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the Chang'e 5 lunar mission simulation with better UI layout, adaptive camera, smooth trajectories, visible spacecraft models, launch sub-phase annotations, and auto-speed mode.

**Architecture:** All new constants/data go in `src/data/lunarMission.ts`. Trajectory math stays in `src/simulation/lunarMission.ts`. Visual models in `src/simulation/lunarMissionVisuals.ts`. UI/animation loop in `src/App.tsx` + `src/index.css`. No new files.

**Tech Stack:** React, Three.js, TypeScript, Vite

**Verification:** This project has no test runner. Use `npm run build` (tsc + vite) to verify each task compiles. Visual verification in browser via `npm run dev`.

---

## File Map

| File | Changes |
|------|---------|
| `src/data/lunarMission.ts` | Add `LAUNCH_SUB_PHASES`, `PHASE_AUTO_SPEED`, `PHASE_CAMERA_DISTANCE` exports |
| `src/simulation/lunarMission.ts` | Fix trajectory math: easing, LOI spiral, phase continuity, angular resolution |
| `src/simulation/lunarMissionVisuals.ts` | Bigger models with MeshStandardMaterial, separable rocket parts, trail buffer 5000 |
| `src/App.tsx` | Move launch button to timebar, auto-speed logic, adaptive camera, sub-phase overlay |
| `src/index.css` | Remove standalone launch button styles, add sub-phase overlay styles |

---

### Task 1: Add New Data Constants

**Files:**
- Modify: `src/data/lunarMission.ts`

- [ ] **Step 1: Add LaunchSubPhase interface and data**

Add after the existing `MISSION_INFO` export (after line 241):

```typescript
// ═══════════════════════════════════════════════════════════════
// LAUNCH SUB-PHASES
// ═══════════════════════════════════════════════════════════════

export interface LaunchSubPhase {
  timeSeconds: number;
  nameCn: string;
  descriptionCn: string;
  visualAction?: 'drop_boosters' | 'drop_fairing' | 'stage_separate';
}

export const LAUNCH_SUB_PHASES: LaunchSubPhase[] = [
  { timeSeconds: 0,   nameCn: '点火起飞',       descriptionCn: '长征五号一级发动机及4个助推器同时点火' },
  { timeSeconds: 12,  nameCn: '程序转弯',       descriptionCn: '火箭开始俯仰程序转弯，偏离垂直方向' },
  { timeSeconds: 174, nameCn: '助推器分离',     descriptionCn: '4个3.35米助推器耗尽推进剂，分离脱落', visualAction: 'drop_boosters' },
  { timeSeconds: 185, nameCn: '整流罩抛罩',     descriptionCn: '有效载荷整流罩分离，暴露嫦娥五号探测器', visualAction: 'drop_fairing' },
  { timeSeconds: 460, nameCn: '一二级分离',     descriptionCn: '芯一级发动机关机，一二级火工品分离', visualAction: 'stage_separate' },
  { timeSeconds: 480, nameCn: '二级发动机点火', descriptionCn: '芯二级氢氧发动机启动，继续加速' },
  { timeSeconds: 500, nameCn: '入轨',           descriptionCn: '进入200公里近地停泊轨道' },
];
```

- [ ] **Step 2: Add auto-speed map**

Add after the launch sub-phases block:

```typescript
// ═══════════════════════════════════════════════════════════════
// AUTO-SPEED MAP (speed multiplier per phase for "Auto" mode)
// ═══════════════════════════════════════════════════════════════

export const PHASE_AUTO_SPEED: Record<string, number> = {
  launch:           50,
  parking:          200,
  tli:              50,
  transfer:         30000,
  loi:              100,
  lunar_orbit:      20000,
  descent:          50,
  surface:          5000,
  ascent:           50,
  rendezvous:       2000,
  tei:              30,
  return_transfer:  30000,
  reentry:          50,
};
```

- [ ] **Step 3: Add camera distance map**

Add after the auto-speed map:

```typescript
// ═══════════════════════════════════════════════════════════════
// CAMERA DISTANCE PER PHASE (scene units for adaptive focus)
// ═══════════════════════════════════════════════════════════════

export const PHASE_CAMERA_DISTANCE: Record<string, number> = {
  launch:           2.5,
  parking:          4,
  tli:              3,
  transfer:         35,
  loi:              5,
  lunar_orbit:      4,
  descent:          2,
  surface:          2,
  ascent:           3,
  rendezvous:       4,
  tei:              5,
  return_transfer:  35,
  reentry:          3,
};
```

- [ ] **Step 4: Build verification**

Run: `npm run build`
Expected: Clean build with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/data/lunarMission.ts
git commit -m "feat(lunar): add launch sub-phases, auto-speed map, and camera distance constants"
```

---

### Task 2: Fix Trajectory Math

**Files:**
- Modify: `src/simulation/lunarMission.ts`

- [ ] **Step 1: Add easeInOutQuint function**

Add below the existing `easeInOutCubic` function (after line 70):

```typescript
/**
 * Quintic easing for more natural gravitational arc (longer acceleration/deceleration tails)
 */
function easeInOutQuint(t: number): number {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
}
```

- [ ] **Step 2: Replace transfer easing with quintic**

In the `case 'transfer':` block (around line 152), change:
```typescript
const t = easeInOutCubic(progress);
```
to:
```typescript
const t = easeInOutQuint(progress);
```

In the `case 'return_transfer':` block (around line 262), change:
```typescript
const t = easeInOutCubic(progress);
```
to:
```typescript
const t = easeInOutQuint(progress);
```

- [ ] **Step 3: Fix LOI spiral — use logarithmic spiral**

Replace the entire `case 'loi':` block (lines 172-185) with:

```typescript
    case 'loi': {
      // Lunar Orbit Insertion — logarithmic spiral approach
      // r = a * e^(b*theta) where a = target orbit radius, spiral inward
      const orbitR = (1 + 200 / 1737) * MOON_RADIUS_SCENE * sc;
      const approachR = orbitR * 3;
      // Logarithmic spiral: radius decays exponentially as angle increases
      const theta = progress * Math.PI * 2;  // ~360° spiral
      const b = Math.log(orbitR / approachR) / (Math.PI * 2);
      const r = approachR * Math.exp(b * theta);
      const angle = theta;
      x = moonPos.x + r * Math.cos(angle) * emNx + r * Math.sin(angle) * perpX;
      y = moonPos.y;
      z = moonPos.z + r * Math.cos(angle) * emNz + r * Math.sin(angle) * perpZ;
      break;
    }
```

- [ ] **Step 4: Ensure phase continuity for parking → TLI transition**

In `case 'tli':` (around line 133), the `startAngle` is hardcoded to `Math.PI` but parking orbit ends at `Math.PI * 0.3 + 1.0 * Math.PI * 0.7 = Math.PI`. This matches, so no change needed here — just verify.

- [ ] **Step 5: Smooth the lunar_orbit angular resolution**

Replace the `case 'lunar_orbit':` block (lines 187-200) with:

```typescript
    case 'lunar_orbit': {
      // Circular orbit around Moon, then lower to 15×200km elliptical
      const highR = (1 + 200 / 1737) * MOON_RADIUS_SCENE * sc;
      const lowR = (1 + 15 / 1737) * MOON_RADIUS_SCENE * sc;
      // Smooth radius transition using easing (not abrupt step at 0.67)
      const rProgress = Math.max(0, (progress - 0.5) / 0.5);
      const r = highR + (lowR - highR) * easeInOutCubic(Math.max(0, Math.min(1, rProgress)));
      // Multiple orbits with consistent angular velocity
      const totalOrbits = 6;
      const angle = progress * Math.PI * 2 * totalOrbits;
      x = moonPos.x + r * Math.cos(angle) * emNx + r * Math.sin(angle) * perpX;
      y = moonPos.y;
      z = moonPos.z + r * Math.cos(angle) * emNz + r * Math.sin(angle) * perpZ;
      break;
    }
```

- [ ] **Step 6: Smooth the rendezvous orbit**

Replace the `case 'rendezvous':` block (lines 237-245) with:

```typescript
    case 'rendezvous': {
      // Orbit Moon, rendezvous and docking maneuver
      const orbitR = (1 + 200 / 1737) * MOON_RADIUS_SCENE * sc;
      const totalOrbits = 3;
      const angle = progress * Math.PI * 2 * totalOrbits;
      x = moonPos.x + orbitR * Math.cos(angle) * emNx + orbitR * Math.sin(angle) * perpX;
      y = moonPos.y;
      z = moonPos.z + orbitR * Math.cos(angle) * emNz + orbitR * Math.sin(angle) * perpZ;
      break;
    }
```

- [ ] **Step 7: Smooth the ascent trajectory**

Replace the `case 'ascent':` block (lines 226-235) with:

```typescript
    case 'ascent': {
      // Rise from Moon surface to orbit — smooth arc
      const surfaceR = MOON_RADIUS_SCENE * sc;
      const orbitR = (1 + 180 / 1737) * MOON_RADIUS_SCENE * sc;
      const r = surfaceR + (orbitR - surfaceR) * easeInOutCubic(progress);
      // Gentler arc — 90° instead of 90°
      const angle = Math.PI * 0.3 + progress * Math.PI * 0.4;
      x = moonPos.x + r * Math.cos(angle) * emNx + r * Math.sin(angle) * perpX;
      y = moonPos.y;
      z = moonPos.z + r * Math.cos(angle) * emNz + r * Math.sin(angle) * perpZ;
      break;
    }
```

- [ ] **Step 8: Build verification**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 9: Commit**

```bash
git add src/simulation/lunarMission.ts
git commit -m "feat(lunar): smooth trajectory math — quintic easing, logarithmic LOI spiral, better orbital arcs"
```

---

### Task 3: Increase Trail Buffer and Density

**Files:**
- Modify: `src/simulation/lunarMissionVisuals.ts`

- [ ] **Step 1: Increase max trail points from 2000 to 5000**

In the `createTrajectoryLine` function (line 176), change:

```typescript
  const maxPoints = 2000;
```
to:
```typescript
  const maxPoints = 5000;
```

- [ ] **Step 2: Build verification**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/simulation/lunarMissionVisuals.ts
git commit -m "feat(lunar): increase trail buffer to 5000 points for smoother trajectory display"
```

---

### Task 4: Improved Spacecraft Models

**Files:**
- Modify: `src/simulation/lunarMissionVisuals.ts`

- [ ] **Step 1: Rewrite createLongMarch5 with MeshStandardMaterial and named parts**

Replace the entire `createLongMarch5` function (lines 20-82) with:

```typescript
function createLongMarch5(): THREE.Group {
  const group = new THREE.Group();

  const bodyColor = 0xE8E0D0;
  const boosterColor = 0xD8D0C0;
  const fairingColor = 0xDDDDDD;
  const nozzleColor = 0x333333;
  const stripeColor = 0xCC0000;
  const ringColor = 0x666666;
  const emissiveIntensity = 0.15;

  // Helper to create self-illuminated material
  const mat = (color: number, emissive?: number) => new THREE.MeshStandardMaterial({
    color,
    emissive: emissive ?? color,
    emissiveIntensity,
    roughness: 0.6,
    metalness: 0.2,
  });

  // ── Core stage ──
  const coreGeo = new THREE.CylinderGeometry(0.024, 0.028, 0.28, 16);
  const core = new THREE.Mesh(coreGeo, mat(bodyColor));
  core.name = 'core';
  group.add(core);

  // Red stripe band (wider, more visible)
  const stripeGeo = new THREE.CylinderGeometry(0.029, 0.029, 0.025, 16);
  const stripe = new THREE.Mesh(stripeGeo, mat(stripeColor, stripeColor));
  stripe.position.y = 0.04;
  stripe.name = 'stripe';
  group.add(stripe);

  // Stage separation ring (dark band between stages)
  const sepRingGeo = new THREE.CylinderGeometry(0.030, 0.030, 0.008, 16);
  const sepRing = new THREE.Mesh(sepRingGeo, mat(ringColor));
  sepRing.position.y = -0.02;
  sepRing.name = 'sep_ring';
  group.add(sepRing);

  // ── Payload fairing ──
  const fairingGeo = new THREE.ConeGeometry(0.032, 0.12, 16);
  const fairing = new THREE.Mesh(fairingGeo, mat(fairingColor));
  fairing.position.y = 0.20;
  fairing.name = 'fairing';
  group.add(fairing);

  // Fairing transition ring
  const fRingGeo = new THREE.CylinderGeometry(0.033, 0.026, 0.012, 16);
  const fRing = new THREE.Mesh(fRingGeo, mat(ringColor));
  fRing.position.y = 0.14;
  fRing.name = 'fairing_ring';
  group.add(fRing);

  // ── 4 Boosters ──
  const boosterGeo = new THREE.CylinderGeometry(0.014, 0.017, 0.22, 10);
  const boosterNoseGeo = new THREE.ConeGeometry(0.014, 0.035, 10);
  const boosterNozzleGeo = new THREE.CylinderGeometry(0.010, 0.015, 0.020, 10);

  const boosterOffsets: [number, number][] = [
    [0.045, 0], [-0.045, 0], [0, 0.045], [0, -0.045],
  ];
  for (let bi = 0; bi < boosterOffsets.length; bi++) {
    const [ox, oz] = boosterOffsets[bi];
    const booster = new THREE.Mesh(boosterGeo, mat(boosterColor));
    booster.position.set(ox, -0.03, oz);
    booster.name = `booster_${bi}`;
    group.add(booster);

    const nose = new THREE.Mesh(boosterNoseGeo, mat(boosterColor));
    nose.position.set(ox, 0.0925, oz);
    nose.name = `booster_nose_${bi}`;
    group.add(nose);

    const nozzle = new THREE.Mesh(boosterNozzleGeo, mat(nozzleColor, 0x111111));
    nozzle.position.set(ox, -0.15, oz);
    nozzle.name = `booster_nozzle_${bi}`;
    group.add(nozzle);
  }

  // ── Core nozzle cluster ──
  const coreNzGeo = new THREE.CylinderGeometry(0.016, 0.024, 0.025, 12);
  const coreNz = new THREE.Mesh(coreNzGeo, mat(nozzleColor, 0x111111));
  coreNz.position.y = -0.155;
  coreNz.name = 'core_nozzle';
  group.add(coreNz);

  // Second engine nozzle (smaller, for upper stage)
  const upperNzGeo = new THREE.CylinderGeometry(0.010, 0.016, 0.018, 10);
  const upperNz = new THREE.Mesh(upperNzGeo, mat(nozzleColor, 0x111111));
  upperNz.position.y = -0.005;
  upperNz.visible = false;  // shown after stage separation
  upperNz.name = 'upper_nozzle';
  group.add(upperNz);

  return group;
}
```

- [ ] **Step 2: Rewrite createChangE5Module with MeshStandardMaterial and bigger parts**

Replace the entire `createChangE5Module` function (lines 88-147) with:

```typescript
function createChangE5Module(): THREE.Group {
  const group = new THREE.Group();

  const bodyColor = 0xCCBB88;
  const panelColor = 0x1a3366;
  const goldColor = 0xCCA020;
  const legColor = 0x888888;
  const dishColor = 0xCCCCCC;
  const emissiveIntensity = 0.15;

  const mat = (color: number, emissive?: number) => new THREE.MeshStandardMaterial({
    color,
    emissive: emissive ?? color,
    emissiveIntensity,
    roughness: 0.5,
    metalness: 0.3,
  });

  // ── Main body — octagonal (cylinder with 8 sides), larger ──
  const bodyGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.055, 8);
  const body = new THREE.Mesh(bodyGeo, mat(bodyColor));
  body.rotation.x = Math.PI / 2;
  group.add(body);

  // Gold foil thermal blanket with warm emissive glow
  const foilGeo = new THREE.CylinderGeometry(0.047, 0.047, 0.050, 8);
  const foilMat = new THREE.MeshStandardMaterial({
    color: goldColor,
    emissive: 0xDD8800,
    emissiveIntensity: 0.25,
    transparent: true,
    opacity: 0.35,
    roughness: 0.3,
    metalness: 0.6,
  });
  const foil = new THREE.Mesh(foilGeo, foilMat);
  foil.rotation.x = Math.PI / 2;
  group.add(foil);

  // ── 2 Solar panels — larger, with grid subdivisions ──
  const panelGeo = new THREE.BoxGeometry(0.18, 0.003, 0.06, 6, 1, 2);
  const panelMat = new THREE.MeshStandardMaterial({
    color: panelColor,
    emissive: 0x0a1a44,
    emissiveIntensity: 0.2,
    roughness: 0.2,
    metalness: 0.5,
  });
  const leftPanel = new THREE.Mesh(panelGeo, panelMat);
  leftPanel.position.set(-0.135, 0, 0);
  group.add(leftPanel);

  const rightPanel = new THREE.Mesh(panelGeo, panelMat);
  rightPanel.position.set(0.135, 0, 0);
  group.add(rightPanel);

  // Panel arms (connecting struts)
  const armGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.06, 4);
  const armMat = mat(legColor);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(side * 0.075, 0, 0);
    group.add(arm);
  }

  // ── Antenna dish — larger with feed horn ──
  const dishGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.005, 16);
  const dish = new THREE.Mesh(dishGeo, mat(dishColor));
  dish.position.set(0, 0.04, -0.01);
  group.add(dish);

  // Feed horn
  const hornGeo = new THREE.ConeGeometry(0.006, 0.015, 8);
  const horn = new THREE.Mesh(hornGeo, mat(legColor));
  horn.position.set(0, 0.05, -0.01);
  group.add(horn);

  // ── 4 Landing legs — more prominent with struts ──
  const legGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.09, 4);
  const strutGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.065, 4);
  const footGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.003, 8);

  const legPos: [number, number][] = [[0.05, 0.05], [-0.05, 0.05], [0.05, -0.05], [-0.05, -0.05]];
  for (const [lx, lz] of legPos) {
    const leg = new THREE.Mesh(legGeo, mat(legColor));
    leg.position.set(lx, -0.055, lz);
    leg.rotation.z = lx > 0 ? -0.25 : 0.25;
    leg.rotation.x = lz > 0 ? -0.25 : 0.25;
    group.add(leg);

    // Diagonal strut
    const strut = new THREE.Mesh(strutGeo, mat(legColor));
    strut.position.set(lx * 0.7, -0.04, lz * 0.7);
    strut.rotation.z = lx > 0 ? -0.5 : 0.5;
    strut.rotation.x = lz > 0 ? -0.5 : 0.5;
    group.add(strut);

    // Foot pad
    const foot = new THREE.Mesh(footGeo, mat(legColor));
    foot.position.set(lx * 1.5, -0.09, lz * 1.5);
    group.add(foot);
  }

  return group;
}
```

- [ ] **Step 3: Update scale constants in createSpacecraftModel and add scale export**

No changes needed to `createSpacecraftModel` function itself — scale is set in App.tsx. But add exported constants at the top of the file (after the imports, before line 20):

```typescript
// Spacecraft scale constants
export const ROCKET_BASE_SCALE = 0.15;
export const MODULE_BASE_SCALE = 0.12;
export const SPACECRAFT_MIN_SCALE = 0.05;
export const SPACECRAFT_MAX_SCALE = 0.25;
```

- [ ] **Step 4: Upgrade exhaust effect to multi-cone for rocket**

Replace the `createExhaustEffect` function (lines 232-243) with:

```typescript
/**
 * Create engine exhaust glow — multi-cone for realistic rocket cluster.
 */
export function createExhaustEffect(): THREE.Group {
  const group = new THREE.Group();

  const exhaustMat = new THREE.MeshBasicMaterial({
    color: 0xFF6600,
    transparent: true,
    opacity: 0.7,
  });

  // Main exhaust cone
  const mainGeo = new THREE.ConeGeometry(0.025, 0.12, 10);
  const main = new THREE.Mesh(mainGeo, exhaustMat);
  main.rotation.x = Math.PI;
  main.name = 'exhaust_main';
  group.add(main);

  // Inner bright core
  const coreGeo = new THREE.ConeGeometry(0.012, 0.15, 8);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xFFCC44,
    transparent: true,
    opacity: 0.6,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.rotation.x = Math.PI;
  core.name = 'exhaust_core';
  group.add(core);

  group.visible = false;
  return group;
}
```

- [ ] **Step 5: Update isEngineBurning return type — unchanged, but verify**

The `isEngineBurning` function is fine as-is. No changes.

- [ ] **Step 6: Fix exhaust type in App.tsx ref**

Since `createExhaustEffect` now returns `THREE.Group` instead of `THREE.Mesh`, update the ref type in `src/App.tsx`. In the `lunarMissionRef` type definition (around line 88), change:

```typescript
    exhaust: THREE.Mesh | null;
```
to:
```typescript
    exhaust: THREE.Group | null;
```

- [ ] **Step 7: Build verification**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 8: Commit**

```bash
git add src/simulation/lunarMissionVisuals.ts src/App.tsx
git commit -m "feat(lunar): improved spacecraft models with MeshStandardMaterial, bigger scale, separable parts"
```

---

### Task 5: Move Launch Button Into Timebar

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Move the launch button into the timebar**

In `src/App.tsx`, find the timebar JSX (around line 2959-2965). Add the launch button at the end, before the closing `</div>`:

Replace:
```tsx
        <button className="tb" onClick={() => (window as any).__resetCam()}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>
      </div>
```

With:
```tsx
        <button className="tb" onClick={() => (window as any).__resetCam()}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>
        {!lunarMissionActive && (
          <button
            className="tb lunar-tb"
            onClick={() => (window as any).__startLunarMission()}
            title="启动嫦娥五号登月任务模拟"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
              <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
              <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
              <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
            </svg>
          </button>
        )}
      </div>
```

- [ ] **Step 2: Remove the standalone launch button**

Delete the entire standalone launch button block (around lines 3364-3378):

```tsx
      {/* Lunar Mission Launch Button (when not active) */}
      {!lunarMissionActive && !uiHidden && introDone && (
        <button
          className="lunar-launch-btn"
          onClick={() => (window as any).__startLunarMission()}
          title="启动嫦娥五号登月任务模拟"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
            <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
            <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
            <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
          </svg>
          登月
        </button>
      )}
```

- [ ] **Step 3: Update CSS — remove standalone styles, add timebar integration**

In `src/index.css`, replace the `.lunar-launch-btn` block (lines 464-475):

```css
.lunar-launch-btn{
  position:fixed;bottom:70px;left:50%;transform:translateX(-50%);z-index:100;
  display:flex;align-items:center;gap:6px;
  padding:8px 16px;border:1px solid rgba(255,213,79,0.3);border-radius:20px;
  background:rgba(255,213,79,0.08);color:#FFD54F;
  font-family:var(--font-cn);font-size:12px;cursor:pointer;
  backdrop-filter:blur(8px);transition:all .3s;
}
.lunar-launch-btn:hover{
  background:rgba(255,213,79,0.18);border-color:rgba(255,213,79,0.5);
  box-shadow:0 0 20px rgba(255,213,79,0.15);
}
```

With:

```css
.lunar-tb{color:#FFD54F !important;}
.lunar-tb:hover{color:#FFD54F !important;background:rgba(255,213,79,0.15);box-shadow:0 0 12px rgba(255,213,79,0.15);}
```

- [ ] **Step 4: Build verification**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/index.css
git commit -m "feat(lunar): move launch button into timebar row"
```

---

### Task 6: Auto-Speed Mode

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add import for PHASE_AUTO_SPEED**

At the top of App.tsx (line 18), update the import from `./data/lunarMission`:

Replace:
```typescript
import { MISSION_PHASES, MISSION_INFO } from './data/lunarMission';
```
With:
```typescript
import { MISSION_PHASES, MISSION_INFO, PHASE_AUTO_SPEED, LAUNCH_SUB_PHASES } from './data/lunarMission';
```

Also update the import from `./simulation/lunarMissionVisuals` (line 20):

Replace:
```typescript
import { createSpacecraftModel, createTrajectoryLine, appendTrailPoint, createExhaustEffect, isEngineBurning, getPhaseColor } from './simulation/lunarMissionVisuals';
```
With:
```typescript
import { createSpacecraftModel, createTrajectoryLine, appendTrailPoint, createExhaustEffect, isEngineBurning, getPhaseColor, ROCKET_BASE_SCALE, MODULE_BASE_SCALE, SPACECRAFT_MIN_SCALE, SPACECRAFT_MAX_SCALE } from './simulation/lunarMissionVisuals';
```

- [ ] **Step 2: Add autoSpeed flag to lunarMissionRef**

In the lunarMissionRef type (around line 80), add `autoSpeed: boolean` and `focusLunar: boolean` and `lastSubPhaseIdx: number` to the interface and default value:

The ref type was already partially updated in Task 4 Step 6 (exhaust: `THREE.Group`). Now add the remaining new fields. Replace the ref type and default (the version after Task 4's change):

```typescript
  const lunarMissionRef = useRef<{
    active: boolean;
    elapsed: number;
    speed: number;
    autoSpeed: boolean;
    paused: boolean;
    focusLunar: boolean;
    spacecraft: THREE.Group | null;
    trail: ReturnType<typeof createTrajectoryLine> | null;
    exhaust: THREE.Group | null;
    trailPointCount: number;
    lastTrailTime: number;
    lastPhaseId: string;
    lastSubPhaseIdx: number;
    rocketModel: THREE.Group | null;
    moduleModel: THREE.Group | null;
  }>({
    active: false, elapsed: 0, speed: 50, autoSpeed: true, paused: false,
    focusLunar: false,
    spacecraft: null, trail: null, exhaust: null,
    trailPointCount: 0, lastTrailTime: 0, lastPhaseId: '',
    lastSubPhaseIdx: -1,
    rocketModel: null, moduleModel: null,
  });
```

- [ ] **Step 3: Add lunarSubPhase state for overlay**

After the existing lunar state variables (after line 79), add:

```typescript
  const [lunarSubPhase, setLunarSubPhase] = useState<{ nameCn: string; descriptionCn: string } | null>(null);
```

- [ ] **Step 4: Update __startLunarMission to set autoSpeed and trigger focus**

Replace the `__startLunarMission` window function (around line 774-783):

```typescript
    (window as any).__startLunarMission = () => {
      lm.active = true; lm.elapsed = 0; lm.paused = false;
      lm.trailPointCount = 0; lm.lastTrailTime = 0; lm.lastPhaseId = '';
      lm.trail!.line.geometry.setDrawRange(0, 0);
      lm.trail!.line.visible = true;
      setLunarMissionActive(true);
      setLunarPhaseIndex(0);
      setLunarPhaseProgress(0);
      setLunarMissionElapsed(0);
    };
```

With:

```typescript
    (window as any).__startLunarMission = () => {
      lm.active = true; lm.elapsed = 0; lm.paused = false;
      lm.autoSpeed = true; lm.speed = PHASE_AUTO_SPEED['launch'] ?? 50;
      lm.trailPointCount = 0; lm.lastTrailTime = 0; lm.lastPhaseId = '';
      lm.lastSubPhaseIdx = -1;
      lm.trail!.line.geometry.setDrawRange(0, 0);
      lm.trail!.line.visible = true;
      lm.focusLunar = true;
      setLunarMissionActive(true);
      setLunarPhaseIndex(0);
      setLunarPhaseProgress(0);
      setLunarMissionElapsed(0);
      setLunarSubPhase(null);
      // Auto-focus camera on spacecraft (deferred to next frame when position is computed)
      requestAnimationFrame(() => (window as any).__focusLunarMission?.());
    };
```

- [ ] **Step 5: Update __setLunarSpeed to handle auto toggle**

Replace:
```typescript
    (window as any).__setLunarSpeed = (s: number) => { lm.speed = s; };
```

With:
```typescript
    (window as any).__setLunarSpeed = (s: number | 'auto') => {
      if (s === 'auto') {
        lm.autoSpeed = true;
      } else {
        lm.autoSpeed = false;
        lm.speed = s;
      }
    };
```

- [ ] **Step 6: Update model scale in setup**

Replace the rocket/module scale setup (lines 752-758):

```typescript
    lm.rocketModel = createSpacecraftModel('launch');
    lm.rocketModel.scale.setScalar(0.04);
    lm.rocketModel.visible = false;
    scene.add(lm.rocketModel);

    lm.moduleModel = createSpacecraftModel('transfer');
    lm.moduleModel.scale.setScalar(0.04);
```

With:

```typescript
    lm.rocketModel = createSpacecraftModel('launch');
    lm.rocketModel.scale.setScalar(ROCKET_BASE_SCALE);
    lm.rocketModel.visible = false;
    scene.add(lm.rocketModel);

    lm.moduleModel = createSpacecraftModel('transfer');
    lm.moduleModel.scale.setScalar(MODULE_BASE_SCALE);
```

- [ ] **Step 7: Update exhaust setup for Group type**

Replace the exhaust scale line (line 770):
```typescript
    lm.exhaust = createExhaustEffect();
    lm.exhaust.scale.setScalar(0.04);
```
With:
```typescript
    lm.exhaust = createExhaustEffect();
    lm.exhaust.scale.setScalar(ROCKET_BASE_SCALE);
```

- [ ] **Step 8: Add auto-speed computation in the animation loop**

In the lunar mission animation loop section (around line 2172), after `if (!lm.paused) lm.elapsed += dt * lm.speed;`, add auto-speed logic. Replace:

```typescript
      if (lm.active) {
        if (!lm.paused) lm.elapsed += dt * lm.speed;
        const totalDur = getTotalMissionDuration();
        if (lm.elapsed > totalDur) { lm.elapsed = totalDur; }
```

With:

```typescript
      if (lm.active) {
        if (!lm.paused) lm.elapsed += dt * lm.speed;
        const totalDur = getTotalMissionDuration();
        if (lm.elapsed > totalDur) { lm.elapsed = totalDur; }
```

(This stays the same.) Then after `computeMissionState` is called (after line 2186), add auto-speed update:

After:
```typescript
        const ms = computeMissionState(
          lm.elapsed,
          { x: earthPos3.x, y: earthPos3.y, z: earthPos3.z },
          { x: moonPos3.x, y: moonPos3.y, z: moonPos3.z },
          eScale,
        );
```

Add:
```typescript
        // Auto-speed: update speed based on current phase
        if (lm.autoSpeed) {
          const targetSpeed = PHASE_AUTO_SPEED[ms.phase.id] ?? 5000;
          // Smooth transition: lerp toward target speed
          lm.speed += (targetSpeed - lm.speed) * Math.min(1, dt * 3);
        }
```

- [ ] **Step 9: Update dynamic scaling to use new constants**

Replace the dynamic scaling block (around lines 2202-2208):

```typescript
          const distToEarth = Math.sqrt(
            (ms.position.x - earthPos3.x) ** 2 +
            (ms.position.y - earthPos3.y) ** 2 +
            (ms.position.z - earthPos3.z) ** 2
          );
          const scaleVal = Math.max(0.02, Math.min(0.15, distToEarth * 0.005)) * eScale;
          lm.spacecraft.scale.setScalar(scaleVal);
```

With:

```typescript
          const distToEarth = Math.sqrt(
            (ms.position.x - earthPos3.x) ** 2 +
            (ms.position.y - earthPos3.y) ** 2 +
            (ms.position.z - earthPos3.z) ** 2
          );
          const scaleVal = Math.max(SPACECRAFT_MIN_SCALE, Math.min(SPACECRAFT_MAX_SCALE, distToEarth * 0.008)) * eScale;
          lm.spacecraft.scale.setScalar(scaleVal);
```

- [ ] **Step 10: Update exhaust effect for Group type**

Replace the exhaust block (around lines 2222-2231):

```typescript
        if (lm.exhaust) {
          const burning = isEngineBurning(ms.phase.id);
          lm.exhaust.visible = burning;
          if (burning && lm.spacecraft) {
            lm.exhaust.position.copy(lm.spacecraft.position);
            lm.exhaust.scale.copy(lm.spacecraft.scale);
            // Flicker
            (lm.exhaust.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.random() * 0.3;
          }
        }
```

With:

```typescript
        if (lm.exhaust) {
          const burning = isEngineBurning(ms.phase.id);
          lm.exhaust.visible = burning;
          if (burning && lm.spacecraft) {
            lm.exhaust.position.copy(lm.spacecraft.position);
            lm.exhaust.scale.copy(lm.spacecraft.scale);
            // Flicker all exhaust children
            lm.exhaust.children.forEach(child => {
              const m = child as THREE.Mesh;
              if (m.material && 'opacity' in m.material) {
                (m.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.random() * 0.4;
              }
            });
          }
        }
```

- [ ] **Step 11: Increase trail emission density**

Replace the trail emission block (around lines 2234-2242):

```typescript
        if (lm.trail && lm.elapsed - lm.lastTrailTime > totalDur * 0.002) {
```

With:

```typescript
        if (lm.trail && lm.elapsed - lm.lastTrailTime > totalDur * 0.0005) {
```

- [ ] **Step 12: Update the speed selector UI to include Auto option**

Replace the speed selector in the lunar panel (around lines 3332-3342):

```tsx
            <select
              className="lunar-speed-select"
              value={lunarMissionRef.current.speed}
              onChange={(e) => (window as any).__setLunarSpeed(Number(e.target.value))}
            >
              <option value={1000}>1000x</option>
              <option value={2000}>2000x</option>
              <option value={5000}>5000x</option>
              <option value={10000}>10000x</option>
              <option value={50000}>50000x</option>
            </select>
```

With:

```tsx
            <select
              className="lunar-speed-select"
              value={lunarMissionRef.current.autoSpeed ? 'auto' : lunarMissionRef.current.speed}
              onChange={(e) => {
                const v = e.target.value;
                (window as any).__setLunarSpeed(v === 'auto' ? 'auto' : Number(v));
              }}
            >
              <option value="auto">Auto · {Math.round(lunarMissionRef.current.speed)}x</option>
              <option value={1000}>1000x</option>
              <option value={2000}>2000x</option>
              <option value={5000}>5000x</option>
              <option value={10000}>10000x</option>
              <option value={50000}>50000x</option>
            </select>
```

- [ ] **Step 13: Build verification**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 14: Commit**

```bash
git add src/App.tsx
git commit -m "feat(lunar): add auto-speed mode with per-phase speed multipliers"
```

---

### Task 7: Camera Phase-Adaptive Auto-Focus

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add PHASE_CAMERA_DISTANCE import**

Update the lunarMission import (line 18) to add `PHASE_CAMERA_DISTANCE`:

Replace:
```typescript
import { MISSION_PHASES, MISSION_INFO, PHASE_AUTO_SPEED, LAUNCH_SUB_PHASES } from './data/lunarMission';
```
With:
```typescript
import { MISSION_PHASES, MISSION_INFO, PHASE_AUTO_SPEED, PHASE_CAMERA_DISTANCE, LAUNCH_SUB_PHASES } from './data/lunarMission';
```

- [ ] **Step 2: Update __focusLunarMission to set focusLunar flag**

Replace the `__focusLunarMission` function (around line 1480-1487):

```typescript
    (window as any).__focusLunarMission = () => {
      if (lm.spacecraft && lm.spacecraft.visible) {
        focIdx = -1; focSatIdx = -1; focMoonMesh = null;
        tT.copy(lm.spacecraft.position);
        tD = 5;
        (window as any).__closeAllPanels();
      }
    };
```

With:

```typescript
    (window as any).__focusLunarMission = () => {
      if (lm.spacecraft) {
        focIdx = -1; focSatIdx = -1; focMoonMesh = null;
        lm.focusLunar = true;
        tT.copy(lm.spacecraft.position);
        tD = PHASE_CAMERA_DISTANCE['launch'] ?? 5;
        (window as any).__closeAllPanels();
      }
    };
```

- [ ] **Step 3: Add camera tracking logic in the animation loop**

In the lunar mission animation loop, after the trail emission block but before the React state update throttle (before `if (frameCount % 10 === 0)`), add camera tracking:

```typescript
        // Camera tracking: follow spacecraft and adapt distance by phase
        if (lm.focusLunar && lm.spacecraft) {
          // Auto-clear lunar focus if user selected another focus target
          if (focIdx >= 0 || focSatIdx >= 0 || focMoonMesh) {
            lm.focusLunar = false;
          } else {
            tT.copy(lm.spacecraft.position);
            const targetDist = PHASE_CAMERA_DISTANCE[ms.phase.id] ?? 5;
            // Smooth lerp toward target distance (~1 second transition)
            tD += (targetDist - tD) * Math.min(1, dt * 2);
          }
        }
```

This handles unlocking: when the user clicks a planet, satellite, or moon (which sets `focIdx`, `focSatIdx`, or `focMoonMesh`), the lunar focus auto-clears on the next frame. No need to modify individual focus functions.

- [ ] **Step 5: Clear focusLunar on mission stop**

In `__stopLunarMission` (around line 784), add:

After `lm.active = false;`:
```typescript
      lm.focusLunar = false;
```

- [ ] **Step 6: Build verification**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "feat(lunar): phase-adaptive camera auto-focus with smooth distance transitions"
```

---

### Task 8: Launch Sub-Phase Annotations and Visual Actions

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Add sub-phase detection in the animation loop**

In the lunar mission animation loop, after the auto-speed block (added in Task 6 Step 8) and before the spacecraft model swap, add sub-phase detection:

```typescript
        // Launch sub-phase annotations
        if (ms.phase.id === 'launch') {
          // Find current sub-phase
          let currentSubIdx = -1;
          for (let si = LAUNCH_SUB_PHASES.length - 1; si >= 0; si--) {
            if (ms.missionElapsed >= LAUNCH_SUB_PHASES[si].timeSeconds) {
              currentSubIdx = si;
              break;
            }
          }
          if (currentSubIdx >= 0 && currentSubIdx !== lm.lastSubPhaseIdx) {
            lm.lastSubPhaseIdx = currentSubIdx;
            const sub = LAUNCH_SUB_PHASES[currentSubIdx];
            setLunarSubPhase({ nameCn: sub.nameCn, descriptionCn: sub.descriptionCn });

            // Visual actions on the rocket model
            if (sub.visualAction && lm.rocketModel) {
              const rk = lm.rocketModel;
              if (sub.visualAction === 'drop_boosters') {
                rk.children.forEach(c => {
                  if (c.name.startsWith('booster_')) c.visible = false;
                });
              } else if (sub.visualAction === 'drop_fairing') {
                rk.children.forEach(c => {
                  if (c.name === 'fairing' || c.name === 'fairing_ring') c.visible = false;
                });
              } else if (sub.visualAction === 'stage_separate') {
                // Hide core stage parts, show upper nozzle
                rk.children.forEach(c => {
                  if (c.name === 'core_nozzle' || c.name === 'sep_ring') c.visible = false;
                  if (c.name === 'upper_nozzle') c.visible = true;
                });
              }
            }
          }
        } else if (lm.lastSubPhaseIdx >= 0) {
          // Leaving launch phase — clear sub-phase overlay
          lm.lastSubPhaseIdx = -1;
          setLunarSubPhase(null);
        }
```

- [ ] **Step 2: Reset rocket model visibility when phase resets to launch**

In the `__jumpLunarPhase` function (around line 794), add rocket reset:

Replace:
```typescript
    (window as any).__jumpLunarPhase = (idx: number) => {
      lm.elapsed = getPhaseStartTime(idx);
      lm.trailPointCount = 0;
      lm.trail!.line.geometry.setDrawRange(0, 0);
    };
```

With:
```typescript
    (window as any).__jumpLunarPhase = (idx: number) => {
      lm.elapsed = getPhaseStartTime(idx);
      lm.trailPointCount = 0;
      lm.lastSubPhaseIdx = -1;
      lm.trail!.line.geometry.setDrawRange(0, 0);
      // Reset rocket model parts visibility
      if (lm.rocketModel) {
        lm.rocketModel.children.forEach(c => {
          c.visible = c.name !== 'upper_nozzle';
        });
        // upper_nozzle starts hidden
        const un = lm.rocketModel.getObjectByName('upper_nozzle');
        if (un) un.visible = false;
      }
      setLunarSubPhase(null);
    };
```

- [ ] **Step 3: Add sub-phase overlay JSX**

In the JSX, add the sub-phase overlay after the lunar panel and before the toast popup. Find the comment `{/* Toast popup */}` (around line 3380) and add before it:

```tsx
      {/* Lunar sub-phase annotation overlay */}
      {lunarSubPhase && lunarMissionActive && (
        <div className="lunar-subphase-overlay" key={lunarSubPhase.nameCn}>
          <div className="lunar-subphase-name">{lunarSubPhase.nameCn}</div>
          <div className="lunar-subphase-desc">{lunarSubPhase.descriptionCn}</div>
        </div>
      )}
```

- [ ] **Step 4: Add sub-phase overlay CSS**

In `src/index.css`, after the `.lunar-time` block (after line 527), add:

```css
.lunar-subphase-overlay{
  position:fixed;bottom:180px;left:50%;transform:translateX(-50%);z-index:250;
  padding:10px 20px;border-radius:10px;
  background:rgba(0,0,0,0.7);border:1px solid rgba(255,213,79,0.3);
  backdrop-filter:blur(8px);text-align:center;
  animation:lunar-subphase-in 0.4s ease-out;
  pointer-events:none;max-width:min(400px, calc(100vw - 40px));
}
.lunar-subphase-name{
  font-size:14px;font-weight:600;color:#FFD54F;
  font-family:var(--font-cn);margin-bottom:4px;
}
.lunar-subphase-desc{
  font-size:11px;color:var(--text-dim);
  font-family:var(--font-cn);line-height:1.5;
}
@keyframes lunar-subphase-in{
  from{opacity:0;transform:translateX(-50%) translateY(10px)}
  to{opacity:1;transform:translateX(-50%) translateY(0)}
}
```

- [ ] **Step 5: Build verification**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/index.css
git commit -m "feat(lunar): launch sub-phase annotations with visual rocket stage separation"
```

---

### Task 9: Final Integration and Build Verification

**Files:**
- All modified files

- [ ] **Step 1: Full build verification**

Run: `npm run build`
Expected: Clean build with no TypeScript errors and no warnings.

- [ ] **Step 2: Verify all imports resolve**

Check that all new imports in App.tsx are satisfied:
- `PHASE_AUTO_SPEED`, `PHASE_CAMERA_DISTANCE`, `LAUNCH_SUB_PHASES` from `./data/lunarMission`
- `ROCKET_BASE_SCALE`, `MODULE_BASE_SCALE`, `SPACECRAFT_MIN_SCALE`, `SPACECRAFT_MAX_SCALE` from `./simulation/lunarMissionVisuals`

- [ ] **Step 3: Commit any remaining fixes**

If any build errors were found and fixed:
```bash
git add -A
git commit -m "fix(lunar): resolve integration issues from lunar mission improvements"
```

- [ ] **Step 4: Final commit summary**

Verify git log shows the expected commits:
```bash
git log --oneline -8
```

Expected commits (newest first):
1. `fix(lunar): resolve integration issues` (only if needed)
2. `feat(lunar): launch sub-phase annotations with visual rocket stage separation`
3. `feat(lunar): phase-adaptive camera auto-focus with smooth distance transitions`
4. `feat(lunar): add auto-speed mode with per-phase speed multipliers`
5. `feat(lunar): move launch button into timebar row`
6. `feat(lunar): improved spacecraft models with MeshStandardMaterial, bigger scale, separable parts`
7. `feat(lunar): increase trail buffer to 5000 points for smoother trajectory display`
8. `feat(lunar): smooth trajectory math — quintic easing, logarithmic LOI spiral, better orbital arcs`
