/**
 * Lunar Mission Simulation Engine
 *
 * Computes spacecraft position in scene coordinates for each mission phase.
 * Uses patched-conic approximation:
 *   - Near Earth: Earth-centered coordinates
 *   - Transfer: interpolated path between Earth and Moon
 *   - Near Moon: Moon-centered coordinates
 *
 * Scene coordinate system matches App.tsx:
 *   - 1 scene unit = 1 Earth radius (visual, exaggerated)
 *   - Moon orbits at 60.3 scene units from Earth
 *   - Earth position comes from the planet mesh in the main animation loop
 */

import { MISSION_PHASES, type MissionPhase } from '../data/lunarMission';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface MissionState {
  active: boolean;
  phaseIndex: number;
  phaseProgress: number;       // 0..1 within current phase
  missionElapsed: number;      // total seconds since launch
  missionProgress: number;     // 0..1 overall
  position: { x: number; y: number; z: number };  // scene coords (absolute)
  heading: { x: number; y: number; z: number };    // velocity direction (unit vector)
  phase: MissionPhase;
  completed: boolean;
}

// ═══════════════════════════════════════════════════════════════
// SIMULATION
// ═══════════════════════════════════════════════════════════════

const totalMissionDuration = MISSION_PHASES.reduce((sum, p) => sum + p.durationSeconds, 0);

/**
 * Compute cumulative start times for each phase
 */
const phaseStartTimes: number[] = [];
{
  let cumulative = 0;
  for (const phase of MISSION_PHASES) {
    phaseStartTimes.push(cumulative);
    cumulative += phase.durationSeconds;
  }
}

/**
 * Get the current phase index and progress for a given mission elapsed time
 */
function getPhaseAt(elapsed: number): { index: number; progress: number } {
  for (let i = MISSION_PHASES.length - 1; i >= 0; i--) {
    if (elapsed >= phaseStartTimes[i]) {
      const phaseElapsed = elapsed - phaseStartTimes[i];
      const progress = Math.min(1, phaseElapsed / MISSION_PHASES[i].durationSeconds);
      return { index: i, progress };
    }
  }
  return { index: 0, progress: 0 };
}

/**
 * Smooth easing for natural-looking trajectory curves
 */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Quintic easing for more natural gravitational arc (longer acceleration/deceleration tails)
 */
function easeInOutQuint(t: number): number {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
}

/**
 * Compute spacecraft position in scene coordinates.
 *
 * @param elapsed     - Mission elapsed time in seconds
 * @param earthPos    - Current Earth position in scene coords {x, y, z}
 * @param moonPos     - Current Moon position in scene coords {x, y, z}
 * @param earthScale  - Current Earth mesh scale factor
 * @returns MissionState with position and phase info
 */
// Wenchang launch site: 19.6°N latitude
const WENCHANG_LAT = 19.6 * Math.PI / 180;

export function computeMissionState(
  elapsed: number,
  earthPos: { x: number; y: number; z: number },
  moonPos: { x: number; y: number; z: number },
  earthScale: number,
  earthRotY?: number,
  _noHeading?: boolean, // internal flag to prevent recursion
): MissionState {
  // Clamp to mission duration
  const clampedElapsed = Math.max(0, Math.min(elapsed, totalMissionDuration));
  const completed = elapsed >= totalMissionDuration;
  const { index, progress } = getPhaseAt(clampedElapsed);
  const phase = MISSION_PHASES[index];
  const missionProgress = clampedElapsed / totalMissionDuration;

  // Earth-Moon vector (normalized)
  const emDx = moonPos.x - earthPos.x;
  const emDy = moonPos.y - earthPos.y;
  const emDz = moonPos.z - earthPos.z;
  const emDist = Math.sqrt(emDx * emDx + emDy * emDy + emDz * emDz);
  const emNx = emDist > 0 ? emDx / emDist : 1;
  const emNz = emDist > 0 ? emDz / emDist : 0;

  // Perpendicular vector (for orbit curvature) — cross with Y-up
  const perpX = -emNz;
  const perpZ = emNx;

  // Launch direction: offset from Earth-Moon line toward Wenchang latitude
  // The launch site is on Earth's surface at ~20° latitude, offset ~60° from Moon direction
  const launchAngle = (earthRotY ?? 0) + Math.PI * 0.35; // Wenchang side of Earth
  const cosLat = Math.cos(WENCHANG_LAT);
  const sinLat = Math.sin(WENCHANG_LAT);
  const launchDirX = cosLat * Math.sin(launchAngle);
  const launchDirY = sinLat;
  const launchDirZ = cosLat * Math.cos(launchAngle);

  let x: number, y: number, z: number;
  const sc = earthScale; // scale factor for Earth-centric distances

  switch (phase.id) {
    case 'launch': {
      // Launch from Wenchang, Hainan (19.6°N)
      // Rocket rises from surface, gradually pitching toward orbital direction
      const alt = progress * (200 / 6371) * sc;
      const r = 1 * sc + alt;
      const tiltFrac = easeInOutCubic(progress); // smooth blend toward orbit
      // Blend from launch site direction to Earth-Moon orbital plane
      const dx = launchDirX * (1 - tiltFrac) + emNx * tiltFrac;
      const dy = launchDirY * (1 - tiltFrac) + 0 * tiltFrac;
      const dz = launchDirZ * (1 - tiltFrac) + emNz * tiltFrac;
      const dLen = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      x = earthPos.x + r * dx / dLen;
      y = earthPos.y + r * dy / dLen;
      z = earthPos.z + r * dz / dLen;
      break;
    }

    case 'parking': {
      // Circular orbit at 200km (~1.031 Earth radii)
      const orbitR = (1 + 200 / 6371) * sc;
      // Complete about 1/3 of an orbit in 30 minutes
      const angle = Math.PI * 0.3 + progress * Math.PI * 0.7;
      x = earthPos.x + orbitR * Math.cos(angle) * emNx + orbitR * Math.sin(angle) * perpX;
      y = earthPos.y;
      z = earthPos.z + orbitR * Math.cos(angle) * emNz + orbitR * Math.sin(angle) * perpZ;
      break;
    }

    case 'tli': {
      // TLI burn — accelerate along orbital velocity direction
      // Position moves slightly outward during the 6-minute burn
      const orbitR = (1 + 200 / 6371) * sc;
      const startAngle = Math.PI;
      const burnArc = progress * Math.PI * 0.1;
      const radialBoost = progress * 0.5 * sc;  // slight outward push
      const r = orbitR + radialBoost;
      const angle = startAngle + burnArc;
      x = earthPos.x + r * Math.cos(angle) * emNx + r * Math.sin(angle) * perpX;
      y = earthPos.y;
      z = earthPos.z + r * Math.cos(angle) * emNz + r * Math.sin(angle) * perpZ;
      break;
    }

    case 'transfer': {
      // Earth-Moon transfer: curved trajectory (not straight line)
      // Uses a simplified representation of the actual transfer orbit
      // The real trajectory curves due to Earth and Moon gravity
      const t = easeInOutQuint(progress);

      // Main progress along Earth-Moon line
      const mainDist = t * emDist;

      // Lateral deviation (the transfer orbit curves outward then back)
      // Max deviation ~0.15 of the total distance, at midpoint
      const lateralMax = emDist * 0.12;
      const lateral = Math.sin(t * Math.PI) * lateralMax;

      // Slight vertical variation
      const vertMax = emDist * 0.03;
      const vert = Math.sin(t * Math.PI * 2) * vertMax;

      x = earthPos.x + mainDist * emNx + lateral * perpX;
      y = earthPos.y + vert;
      z = earthPos.z + mainDist * emNz + lateral * perpZ;
      break;
    }

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

    case 'descent': {
      // Powered descent from 15km to surface
      const startR = (1 + 15 / 1737) * MOON_RADIUS_SCENE * sc;
      const surfaceR = MOON_RADIUS_SCENE * sc;
      const r = startR + (surfaceR - startR) * easeInOutCubic(progress);
      // Descend toward the landing site (specific direction on Moon surface)
      const angle = Math.PI * 0.3;  // landing site angle
      x = moonPos.x + r * Math.cos(angle) * emNx + r * Math.sin(angle) * perpX;
      y = moonPos.y;
      z = moonPos.z + r * Math.cos(angle) * emNz + r * Math.sin(angle) * perpZ;
      break;
    }

    case 'surface': {
      // Stationary on Moon surface
      const surfaceR = MOON_RADIUS_SCENE * sc;
      const angle = Math.PI * 0.3;
      x = moonPos.x + surfaceR * Math.cos(angle) * emNx + surfaceR * Math.sin(angle) * perpX;
      y = moonPos.y;
      z = moonPos.z + surfaceR * Math.cos(angle) * emNz + surfaceR * Math.sin(angle) * perpZ;
      break;
    }

    case 'ascent': {
      // Rise from Moon surface to orbit — smooth arc
      const surfaceR = MOON_RADIUS_SCENE * sc;
      const orbitR = (1 + 180 / 1737) * MOON_RADIUS_SCENE * sc;
      const r = surfaceR + (orbitR - surfaceR) * easeInOutCubic(progress);
      // Gentler arc
      const angle = Math.PI * 0.3 + progress * Math.PI * 0.4;
      x = moonPos.x + r * Math.cos(angle) * emNx + r * Math.sin(angle) * perpX;
      y = moonPos.y;
      z = moonPos.z + r * Math.cos(angle) * emNz + r * Math.sin(angle) * perpZ;
      break;
    }

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

    case 'tei': {
      // TEI burn — escaping Moon
      const orbitR = (1 + 200 / 1737) * MOON_RADIUS_SCENE * sc;
      const r = orbitR + progress * 2 * sc;
      const angle = Math.PI * 4.8 + progress * Math.PI * 0.3;
      // Point away from Moon toward Earth
      const escapeDir = -1;  // heading back to Earth
      x = moonPos.x + r * Math.cos(angle) * emNx * escapeDir + r * Math.sin(angle) * perpX;
      y = moonPos.y;
      z = moonPos.z + r * Math.cos(angle) * emNz * escapeDir + r * Math.sin(angle) * perpZ;
      break;
    }

    case 'return_transfer': {
      // Moon-Earth return trajectory (reverse of transfer, different curve)
      const t = easeInOutQuint(progress);
      const mainDist = (1 - t) * emDist;

      // Return trajectory curves the other way
      const lateralMax = emDist * 0.10;
      const lateral = -Math.sin(t * Math.PI) * lateralMax;

      const vertMax = emDist * 0.02;
      const vert = -Math.sin(t * Math.PI * 1.5) * vertMax;

      x = earthPos.x + mainDist * emNx + lateral * perpX;
      y = earthPos.y + vert;
      z = earthPos.z + mainDist * emNz + lateral * perpZ;
      break;
    }

    case 'reentry': {
      // Skip re-entry — spacecraft approaches Earth, bounces off atmosphere, re-enters
      const startR = (1 + 5000 / 6371) * sc;  // start at ~5000km altitude
      const entryR = (1 + 120 / 6371) * sc;   // atmospheric interface ~120km
      const bounceR = (1 + 200 / 6371) * sc;  // bounces back to ~200km briefly
      const surfaceR = 1 * sc;

      let r: number;
      if (progress < 0.3) {
        // Approach from 5000km to 120km
        r = startR + (entryR - startR) * (progress / 0.3);
      } else if (progress < 0.5) {
        // Skip: bounce from 120km back up to 200km
        const skipP = (progress - 0.3) / 0.2;
        r = entryR + (bounceR - entryR) * Math.sin(skipP * Math.PI);
      } else {
        // Final descent from atmosphere to surface
        r = entryR + (surfaceR - entryR) * ((progress - 0.5) / 0.5);
      }

      // Re-entry comes from Moon direction
      const angle = Math.PI * 0.15 + progress * Math.PI * 0.3;
      x = earthPos.x + r * Math.cos(angle) * emNx + r * Math.sin(angle) * perpX;
      y = earthPos.y;
      z = earthPos.z + r * Math.cos(angle) * emNz + r * Math.sin(angle) * perpZ;
      break;
    }

    default: {
      x = earthPos.x;
      y = earthPos.y;
      z = earthPos.z;
    }
  }

  // Compute heading by finite difference (sample a tiny bit ahead)
  let hx = 0, hy = 0, hz = 0;
  if (!completed && !_noHeading) {
    const dt = Math.min(totalMissionDuration * 0.0001, 10);
    const ahead = computeMissionState(
      Math.min(clampedElapsed + dt, totalMissionDuration),
      earthPos, moonPos, earthScale, earthRotY, true,
    );
    hx = ahead.position.x - x;
    hy = ahead.position.y - y;
    hz = ahead.position.z - z;
    const hLen = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
    hx /= hLen; hy /= hLen; hz /= hLen;
  }

  return {
    active: true,
    phaseIndex: index,
    phaseProgress: progress,
    missionElapsed: clampedElapsed,
    missionProgress,
    position: { x, y, z },
    heading: { x: hx, y: hy, z: hz },
    phase,
    completed,
  };
}

/**
 * Get total mission duration in seconds
 */
export function getTotalMissionDuration(): number {
  return totalMissionDuration;
}

/**
 * Get phase start time by index
 */
export function getPhaseStartTime(index: number): number {
  return phaseStartTimes[index] ?? 0;
}

/**
 * Pre-compute trajectory points for drawing the full mission path
 * Returns an array of {x,y,z} points in a normalized coordinate system
 * that must be transformed to scene coordinates each frame.
 *
 * @param steps - Number of points per phase
 */
export function computeTrajectoryPoints(
  earthPos: { x: number; y: number; z: number },
  moonPos: { x: number; y: number; z: number },
  earthScale: number,
  steps: number = 30,
): { x: number; y: number; z: number; phaseIndex: number }[] {
  const points: { x: number; y: number; z: number; phaseIndex: number }[] = [];

  for (let pi = 0; pi < MISSION_PHASES.length; pi++) {
    const phaseStart = phaseStartTimes[pi];
    const phaseDuration = MISSION_PHASES[pi].durationSeconds;

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const elapsed = phaseStart + t * phaseDuration;
      const state = computeMissionState(elapsed, earthPos, moonPos, earthScale);
      points.push({ ...state.position, phaseIndex: pi });
    }
  }

  return points;
}

// The MOON_RADIUS_SCENE constant for local use
const MOON_RADIUS_SCENE = 0.27;
