/**
 * Lunar Mission 3D Visualization
 *
 * Creates the spacecraft model (Long March 5 / Chang'e 5) and
 * trajectory line for rendering in the scene.
 */

import * as THREE from 'three';
import { MISSION_PHASES } from '../data/lunarMission';
import { computeTrajectoryPoints } from './lunarMission';

// ═══════════════════════════════════════════════════════════════
// SPACECRAFT MODEL — Long March 5 / Chang'e 5
// ═══════════════════════════════════════════════════════════════

/**
 * Create a procedural Long March 5 rocket model.
 * Simplified but recognizable: core stage + 4 boosters + payload fairing.
 */
function createLongMarch5(): THREE.Group {
  const group = new THREE.Group();

  const bodyColor = 0xE8E0D0;   // off-white body
  const boosterColor = 0xE8E0D0;
  const fairingColor = 0xDDDDDD;
  const nozzleColor = 0x444444;
  const stripeColor = 0xCC0000; // red stripe (Chinese flag color)

  // Core stage — tall cylinder
  const coreGeo = new THREE.CylinderGeometry(0.018, 0.02, 0.20, 12);
  const coreMat = new THREE.MeshBasicMaterial({ color: bodyColor });
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);

  // Red stripe on core
  const stripeGeo = new THREE.CylinderGeometry(0.0205, 0.0205, 0.015, 12);
  const stripeMat = new THREE.MeshBasicMaterial({ color: stripeColor });
  const stripe = new THREE.Mesh(stripeGeo, stripeMat);
  stripe.position.y = 0.02;
  group.add(stripe);

  // Payload fairing (top) — cone
  const fairingGeo = new THREE.ConeGeometry(0.022, 0.08, 12);
  const fairingMat = new THREE.MeshBasicMaterial({ color: fairingColor });
  const fairing = new THREE.Mesh(fairingGeo, fairingMat);
  fairing.position.y = 0.14;
  group.add(fairing);

  // 4 Boosters (strap-on) — smaller cylinders arranged around core
  const boosterGeo = new THREE.CylinderGeometry(0.010, 0.012, 0.15, 8);
  const boosterMat = new THREE.MeshBasicMaterial({ color: boosterColor });
  const boosterOffsets = [
    [0.032, 0], [-0.032, 0], [0, 0.032], [0, -0.032],
  ];
  for (const [ox, oz] of boosterOffsets) {
    const booster = new THREE.Mesh(boosterGeo, boosterMat);
    booster.position.set(ox, -0.025, oz);
    group.add(booster);

    // Booster nose cone
    const bnGeo = new THREE.ConeGeometry(0.010, 0.025, 8);
    const bn = new THREE.Mesh(bnGeo, boosterMat);
    bn.position.set(ox, 0.0625, oz);
    group.add(bn);

    // Booster nozzle
    const nzGeo = new THREE.CylinderGeometry(0.008, 0.011, 0.015, 8);
    const nzMat = new THREE.MeshBasicMaterial({ color: nozzleColor });
    const nz = new THREE.Mesh(nzGeo, nzMat);
    nz.position.set(ox, -0.1075, oz);
    group.add(nz);
  }

  // Core nozzle
  const coreNzGeo = new THREE.CylinderGeometry(0.012, 0.018, 0.02, 12);
  const coreNzMat = new THREE.MeshBasicMaterial({ color: nozzleColor });
  const coreNz = new THREE.Mesh(coreNzGeo, coreNzMat);
  coreNz.position.y = -0.11;
  group.add(coreNz);

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

  // Main body — octagonal approximation (cylinder with 8 sides)
  const bodyGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8);
  const bodyMat = new THREE.MeshBasicMaterial({ color: bodyColor });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.rotation.x = Math.PI / 2;
  group.add(body);

  // Gold foil thermal blanket
  const foilGeo = new THREE.CylinderGeometry(0.031, 0.031, 0.035, 8);
  const foilMat = new THREE.MeshBasicMaterial({ color: goldColor, transparent: true, opacity: 0.4 });
  const foil = new THREE.Mesh(foilGeo, foilMat);
  foil.rotation.x = Math.PI / 2;
  group.add(foil);

  // 2 Solar panels
  const panelGeo = new THREE.BoxGeometry(0.12, 0.002, 0.04);
  const panelMat = new THREE.MeshBasicMaterial({ color: panelColor });
  const leftPanel = new THREE.Mesh(panelGeo, panelMat);
  leftPanel.position.set(-0.09, 0, 0);
  group.add(leftPanel);

  const rightPanel = new THREE.Mesh(panelGeo, panelMat);
  rightPanel.position.set(0.09, 0, 0);
  group.add(rightPanel);

  // Antenna dish
  const dishGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.004, 14);
  const dishMat = new THREE.MeshBasicMaterial({ color: 0xCCCCCC });
  const dish = new THREE.Mesh(dishGeo, dishMat);
  dish.position.set(0, 0.03, -0.01);
  group.add(dish);

  // 4 Landing legs (for lander config)
  const legGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.06, 4);
  const legMat = new THREE.MeshBasicMaterial({ color: legColor });
  const legPos = [[0.035, 0.035], [-0.035, 0.035], [0.035, -0.035], [-0.035, -0.035]];
  for (const [lx, lz] of legPos) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(lx, -0.04, lz);
    leg.rotation.z = lx > 0 ? -0.3 : 0.3;
    leg.rotation.x = lz > 0 ? -0.3 : 0.3;
    group.add(leg);

    // Foot pad
    const footGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.002, 6);
    const foot = new THREE.Mesh(footGeo, legMat);
    foot.position.set(lx * 1.4, -0.065, lz * 1.4);
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
  const maxPoints = 2000;
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
 * Create a simple engine exhaust glow (cone of light).
 */
export function createExhaustEffect(): THREE.Mesh {
  const geo = new THREE.ConeGeometry(0.015, 0.08, 8);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xFF6600,
    transparent: true,
    opacity: 0.7,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI;  // point downward
  mesh.visible = false;
  return mesh;
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
