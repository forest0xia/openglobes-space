/**
 * Lunar Mission 3D Visualization
 *
 * Creates the spacecraft model (Long March 5 / Chang'e 5) and
 * trajectory line for rendering in the scene.
 */

import * as THREE from 'three';
import { MISSION_PHASES } from '../data/lunarMission';

// Spacecraft scale constants
export const ROCKET_BASE_SCALE = 0.15;
export const MODULE_BASE_SCALE = 0.12;
export const SPACECRAFT_MIN_SCALE = 0.05;
export const SPACECRAFT_MAX_SCALE = 0.25;

// ═══════════════════════════════════════════════════════════════
// SPACECRAFT MODEL — Long March 5 / Chang'e 5
// ═══════════════════════════════════════════════════════════════

/**
 * Create a procedural Long March 5 rocket model.
 * Simplified but recognizable: core stage + 4 boosters + payload fairing.
 */
function createLongMarch5(): THREE.Group {
  const group = new THREE.Group();

  const bodyColor = 0xE8E0D0;
  const boosterColor = 0xD8D0C0;
  const fairingColor = 0xDDDDDD;
  const nozzleColor = 0x333333;
  const stripeColor = 0xCC0000;
  const ringColor = 0x666666;
  const emissiveIntensity = 0.15;

  const mat = (color: number, emissive?: number) => new THREE.MeshStandardMaterial({
    color,
    emissive: emissive ?? color,
    emissiveIntensity,
    roughness: 0.6,
    metalness: 0.2,
  });

  // Core stage
  const coreGeo = new THREE.CylinderGeometry(0.024, 0.028, 0.28, 16);
  const core = new THREE.Mesh(coreGeo, mat(bodyColor));
  core.name = 'core';
  group.add(core);

  // Red stripe band
  const stripeGeo = new THREE.CylinderGeometry(0.029, 0.029, 0.025, 16);
  const stripe = new THREE.Mesh(stripeGeo, mat(stripeColor, stripeColor));
  stripe.position.y = 0.04;
  stripe.name = 'stripe';
  group.add(stripe);

  // Stage separation ring
  const sepRingGeo = new THREE.CylinderGeometry(0.030, 0.030, 0.008, 16);
  const sepRing = new THREE.Mesh(sepRingGeo, mat(ringColor));
  sepRing.position.y = -0.02;
  sepRing.name = 'sep_ring';
  group.add(sepRing);

  // Payload fairing
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

  // 4 Boosters
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

  // Core nozzle cluster
  const coreNzGeo = new THREE.CylinderGeometry(0.016, 0.024, 0.025, 12);
  const coreNz = new THREE.Mesh(coreNzGeo, mat(nozzleColor, 0x111111));
  coreNz.position.y = -0.155;
  coreNz.name = 'core_nozzle';
  group.add(coreNz);

  // Upper stage nozzle (hidden until stage separation)
  const upperNzGeo = new THREE.CylinderGeometry(0.010, 0.016, 0.018, 10);
  const upperNz = new THREE.Mesh(upperNzGeo, mat(nozzleColor, 0x111111));
  upperNz.position.y = -0.005;
  upperNz.visible = false;
  upperNz.name = 'upper_nozzle';
  group.add(upperNz);

  return group;
}

/**
 * Create a Chang'e 5 orbiter/lander module.
 * Simplified: box body + 2 solar panels + antenna + lander legs.
 */
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

  // Main body — octagonal, larger
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

  // 2 Solar panels — larger, with grid subdivisions
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

  // Panel arms
  const armGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.06, 4);
  const armMat = mat(legColor);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(side * 0.075, 0, 0);
    group.add(arm);
  }

  // Antenna dish — larger with feed horn
  const dishGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.005, 16);
  const dish = new THREE.Mesh(dishGeo, mat(dishColor));
  dish.position.set(0, 0.04, -0.01);
  group.add(dish);

  const hornGeo = new THREE.ConeGeometry(0.006, 0.015, 8);
  const horn = new THREE.Mesh(hornGeo, mat(legColor));
  horn.position.set(0, 0.05, -0.01);
  group.add(horn);

  // 4 Landing legs — more prominent with struts
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

    const strut = new THREE.Mesh(strutGeo, mat(legColor));
    strut.position.set(lx * 0.7, -0.04, lz * 0.7);
    strut.rotation.z = lx > 0 ? -0.5 : 0.5;
    strut.rotation.x = lz > 0 ? -0.5 : 0.5;
    group.add(strut);

    const foot = new THREE.Mesh(footGeo, mat(legColor));
    foot.position.set(lx * 1.5, -0.09, lz * 1.5);
    group.add(foot);
  }

  return group;
}

/**
 * Get the appropriate spacecraft model for the current mission phase.
 * - launch, parking, tli: Long March 5 rocket
 * - all other phases: Chang'e 5 module
 */
export function createSpacecraftModel(phaseId: string): THREE.Group {
  if (phaseId === 'launch' || phaseId === 'parking' || phaseId === 'tli') {
    return createLongMarch5();
  }
  return createChangE5Module();
}

// ═══════════════════════════════════════════════════════════════
// TRAJECTORY LINE
// ═══════════════════════════════════════════════════════════════

/**
 * Create trajectory trail line that follows the spacecraft.
 * Uses a simple Line with per-vertex color from phase colors.
 */
export function createTrajectoryLine(): {
  line: THREE.Line;
  positions: Float32Array;
  colors: Float32Array;
  maxPoints: number;
} {
  const maxPoints = 5000;
  const positions = new Float32Array(maxPoints * 3);
  const colors = new Float32Array(maxPoints * 3);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setDrawRange(0, 0);

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    linewidth: 1,
  });

  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;

  return { line, positions, colors, maxPoints };
}

/**
 * Update trail with a new point.
 * Appends to the trail buffer, cycling when full.
 */
export function appendTrailPoint(
  trail: { positions: Float32Array; colors: Float32Array; maxPoints: number; line: THREE.Line },
  pointCount: number,
  x: number, y: number, z: number,
  r: number, g: number, b: number,
): number {
  const idx = pointCount % trail.maxPoints;
  const i3 = idx * 3;
  trail.positions[i3] = x;
  trail.positions[i3 + 1] = y;
  trail.positions[i3 + 2] = z;
  trail.colors[i3] = r;
  trail.colors[i3 + 1] = g;
  trail.colors[i3 + 2] = b;

  const newCount = pointCount + 1;
  const drawCount = Math.min(newCount, trail.maxPoints);
  trail.line.geometry.setDrawRange(0, drawCount);
  trail.line.geometry.attributes.position.needsUpdate = true;
  trail.line.geometry.attributes.color.needsUpdate = true;

  return newCount;
}

// ═══════════════════════════════════════════════════════════════
// ENGINE EXHAUST EFFECT
// ═══════════════════════════════════════════════════════════════

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

/**
 * Check if current phase has active engine burn.
 */
export function isEngineBurning(phaseId: string): boolean {
  return ['launch', 'tli', 'loi', 'descent', 'ascent', 'tei'].includes(phaseId);
}

// ═══════════════════════════════════════════════════════════════
// PHASE COLOR LOOKUP
// ═══════════════════════════════════════════════════════════════

const phaseColorCache = new Map<string, THREE.Color>();

export function getPhaseColor(phaseId: string): THREE.Color {
  if (!phaseColorCache.has(phaseId)) {
    const phase = MISSION_PHASES.find(p => p.id === phaseId);
    phaseColorCache.set(phaseId, new THREE.Color(phase?.color ?? '#FFFFFF'));
  }
  return phaseColorCache.get(phaseId)!;
}
