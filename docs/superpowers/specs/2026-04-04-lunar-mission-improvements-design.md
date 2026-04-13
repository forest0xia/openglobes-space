# Lunar Mission Simulation Improvements

**Date:** 2026-04-04
**Status:** Approved

## Overview

Six improvements to the Chang'e 5 lunar landing simulation to enhance realism, usability, and narrative quality.

## 1. UI Layout — Launch Button in Timebar

Move the standalone "登月" launch button into the `.timebar` row, placed after the reset button. Style it as a timebar pill with gold accent color (`#FFD54F`) to match the lunar mission theme. When the mission is active, this button is hidden (the mission panel takes over).

**Files:** `src/App.tsx` (JSX), `src/index.css` (remove `.lunar-launch-btn` standalone styles)

## 2. Camera — Phase-Adaptive Auto-Focus

On mission start (`__startLunarMission`), automatically invoke `__focusLunarMission()` to lock camera on the spacecraft.

Camera distance (`tD`) adjusts automatically based on current phase:

| Phase | tD | Rationale |
|-------|-----|-----------|
| launch | 2-3 | Close-up for stage separations |
| parking | 4 | See orbit arc |
| tli | 3 | See the burn |
| transfer | 30-40 | See Earth-Moon path |
| loi | 5 | See approach spiral |
| lunar_orbit | 4 | See orbit around Moon |
| descent | 2 | Landing detail |
| surface | 2 | Lander on surface |
| ascent | 3 | Liftoff |
| rendezvous | 4 | Docking orbit |
| tei | 5 | Escape burn |
| return_transfer | 30-40 | Moon-Earth path |
| reentry | 3 | Skip re-entry |

Camera distance transitions smoothly (lerp) over ~1 second when phase changes. User can drag to unlock; tracking button re-locks.

**Implementation:** Add a `PHASE_CAMERA_DISTANCE` map in `src/simulation/lunarMission.ts`. In the animation loop, when `focusLunar` is active, smoothly lerp `tD` toward the target distance for the current phase.

**Files:** `src/simulation/lunarMission.ts` (distance map), `src/App.tsx` (auto-focus on start, adaptive tD in loop)

## 3. Trajectory Math Fixes

### Root cause
At high speed multipliers, `progress` jumps between frames cause angular leaps in orbital phases (e.g., `angle = progress * PI * 8` in lunar_orbit). Phase transitions also create position discontinuities.

### Fixes
- **Trail density:** Increase emission rate from every 0.5% to every 0.1% of mission progress (change `totalDur * 0.002` to `totalDur * 0.0005`)
- **Orbital angular resolution:** For orbital phases (parking, lunar_orbit, rendezvous), compute multiple sub-steps per frame and emit trail points for each sub-step when speed is high
- **Phase continuity:** Ensure end position of each phase matches start position of next phase by computing boundary positions once and caching
- **Transfer easing:** Replace `easeInOutCubic` with `easeInOutQuint` for transfer phases to produce more natural gravitational arcs with longer acceleration/deceleration tails
- **LOI spiral:** Use logarithmic spiral (`r = a * e^(b*theta)`) instead of linear radius reduction for a more natural orbital insertion
- **Increase max trail points:** From 2000 to 5000 to accommodate denser emission

**Files:** `src/simulation/lunarMission.ts` (trajectory math), `src/simulation/lunarMissionVisuals.ts` (trail buffer size, emission logic)

## 4. Improved Procedural Spacecraft Models

### Long March 5 (launch/parking/tli phases)

- **Scale:** Base scale 0.04 → 0.15 (nearly 4x larger)
- **Material:** Switch from `MeshBasicMaterial` to `MeshStandardMaterial` with `emissive` property for self-illumination in dark space
- **Detail:**
  - Distinct red stripe band (Chinese flag motif) more prominent
  - 4 boosters with slightly different shade and visible gap from core
  - Payload fairing cone with transition ring at base
  - Core nozzle cluster at bottom
  - Stage separation rings visible as darker bands
- **Booster separation:** At launch sub-phase T+174s, hide the 4 booster meshes to visually show separation
- **Exhaust:** Scaled up proportionally, multi-cone for rocket cluster

### Chang'e 5 Module (transfer onwards)

- **Scale:** Base scale 0.04 → 0.12 (~3x larger)
- **Material:** `MeshStandardMaterial` with emissive
- **Detail:**
  - Larger dark-blue solar panels with subtle grid lines (BoxGeometry subdivisions)
  - Gold thermal blanket with emissive warm glow
  - Landing legs more prominent with angled struts
  - Antenna dish more visible with feed horn

### Dynamic scaling
Keep distance-based scaling but raise minimum from 0.02 to 0.05 so spacecraft never becomes invisible. Maximum also raised proportionally.

**Files:** `src/simulation/lunarMissionVisuals.ts` (both model functions, scale constants)

## 5. Launch Sub-Phases with Annotations

New data structure `LAUNCH_SUB_PHASES` in `src/data/lunarMission.ts`:

```typescript
export interface LaunchSubPhase {
  timeSeconds: number;    // seconds after launch
  nameCn: string;         // Chinese name
  descriptionCn: string;  // Chinese description
  visualAction?: 'drop_boosters' | 'drop_fairing' | 'stage_separate';
}

export const LAUNCH_SUB_PHASES: LaunchSubPhase[] = [
  { timeSeconds: 0,   nameCn: '点火起飞',     descriptionCn: '长征五号一级发动机及4个助推器同时点火' },
  { timeSeconds: 12,  nameCn: '程序转弯',     descriptionCn: '火箭开始俯仰程序转弯，偏离垂直方向' },
  { timeSeconds: 174, nameCn: '助推器分离',   descriptionCn: '4个3.35米助推器耗尽推进剂，分离脱落', visualAction: 'drop_boosters' },
  { timeSeconds: 185, nameCn: '整流罩抛罩',   descriptionCn: '有效载荷整流罩分离，暴露嫦娥五号探测器', visualAction: 'drop_fairing' },
  { timeSeconds: 460, nameCn: '一二级分离',   descriptionCn: '芯一级发动机关机，一二级火工品分离', visualAction: 'stage_separate' },
  { timeSeconds: 480, nameCn: '二级发动机点火', descriptionCn: '芯二级氢氧发动机启动，继续加速' },
  { timeSeconds: 500, nameCn: '入轨',         descriptionCn: '进入200公里近地停泊轨道' },
];
```

**Display:** A toast-style overlay appears for each sub-phase event during auto-play. The overlay shows the sub-phase name and description, fading out after ~3 seconds or when the next sub-phase triggers.

**Visual actions:** The rocket model responds to `visualAction` triggers:
- `drop_boosters`: Hide the 4 booster mesh children
- `drop_fairing`: Hide the fairing cone mesh
- `stage_separate`: Hide core stage, show only upper stage (smaller cylinder)

**Files:** `src/data/lunarMission.ts` (sub-phase data), `src/App.tsx` (overlay UI, visual action dispatch), `src/simulation/lunarMissionVisuals.ts` (separable model parts with named references)

## 6. Auto-Speed Mode

Add an "Auto" option as the first entry in the speed selector dropdown. When selected, `lm.speed` is computed per-frame from a `PHASE_AUTO_SPEED` map:

| Phase ID | Speed | Real Duration | Playback Duration |
|----------|-------|---------------|-------------------|
| launch | 50x | 500s | ~10s |
| parking | 200x | 1800s | ~9s |
| tli | 50x | 360s | ~7s |
| transfer | 30000x | 403200s | ~13s |
| loi | 100x | 1020s | ~10s |
| lunar_orbit | 20000x | 259200s | ~13s |
| descent | 50x | 720s | ~14s |
| surface | 5000x | 68400s | ~14s |
| ascent | 50x | 360s | ~7s |
| rendezvous | 2000x | 21600s | ~11s |
| tei | 30x | 180s | ~6s |
| return_transfer | 30000x | 388800s | ~13s |
| reentry | 50x | 600s | ~12s |

**Total auto-play: ~2.5 minutes.**

Speed indicator shows current multiplier: "Auto · 50x" format in the speed selector display area.

When user switches from Auto to a manual speed, it locks at the current auto speed value. Default on mission start is Auto.

**Smooth speed transitions:** When phase changes, speed lerps over 0.5 seconds to avoid jarring jumps (e.g., 50x → 30000x eases in).

**Files:** `src/data/lunarMission.ts` (speed map), `src/App.tsx` (auto-speed logic in animation loop, UI dropdown)

## Architecture Notes

- All new constants go in `src/data/lunarMission.ts` — no magic numbers in App.tsx
- Visual model changes stay in `src/simulation/lunarMissionVisuals.ts`
- Trajectory computation stays in `src/simulation/lunarMission.ts`
- UI/animation loop changes in `src/App.tsx`
- No new files needed — all changes fit existing file structure
