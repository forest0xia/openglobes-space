import * as THREE from 'three';

// Shared materials
const PANEL_COLOR = 0x1a3366;
const DISH_COLOR = 0xcccccc;

function panelMat(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: PANEL_COLOR });
}

function dishMat(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: DISH_COLOR });
}

function bodyMat(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color });
}

// ---------------------------------------------------------------------------
// Voyager 1 / 2
// Large dish, boom arm, RTG box, magnetometer boom
// ---------------------------------------------------------------------------
function createVoyager(color: number): THREE.Group {
  const group = new THREE.Group();

  // Main dish antenna — flat disc
  const dishGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.008, 24);
  const dish = new THREE.Mesh(dishGeo, dishMat());
  dish.rotation.x = Math.PI / 2;
  group.add(dish);

  // Boom arm from dish center toward RTG
  const boomGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.18, 6);
  const boom = new THREE.Mesh(boomGeo, bodyMat(color));
  boom.position.set(0, 0, -0.09);
  boom.rotation.x = Math.PI / 2;
  group.add(boom);

  // RTG power source — small box at end of boom
  const rtgGeo = new THREE.BoxGeometry(0.025, 0.015, 0.06);
  const rtg = new THREE.Mesh(rtgGeo, bodyMat(color));
  rtg.position.set(0, 0, -0.18);
  group.add(rtg);

  // Magnetometer boom — thin long cylinder extending opposite side
  const magGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.15, 4);
  const mag = new THREE.Mesh(magGeo, bodyMat(color));
  mag.position.set(0.09, 0, -0.06);
  mag.rotation.z = Math.PI / 4;
  group.add(mag);

  return group;
}

// ---------------------------------------------------------------------------
// New Horizons
// Triangular / wedge body, small dish on top
// ---------------------------------------------------------------------------
function createNewHorizons(color: number): THREE.Group {
  const group = new THREE.Group();

  // Wedge body — flat box tapered by using scale trick
  const bodyGeo = new THREE.BoxGeometry(0.14, 0.03, 0.10);
  const body = new THREE.Mesh(bodyGeo, bodyMat(color));
  group.add(body);

  // Secondary body element to give a wedge feel
  const wedgeGeo = new THREE.BoxGeometry(0.10, 0.025, 0.06);
  const wedge = new THREE.Mesh(wedgeGeo, bodyMat(color));
  wedge.position.set(0.03, 0.02, 0);
  group.add(wedge);

  // Small dish on top
  const dishGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.006, 16);
  const dish = new THREE.Mesh(dishGeo, dishMat());
  dish.position.set(-0.02, 0.03, 0);
  group.add(dish);

  return group;
}

// ---------------------------------------------------------------------------
// Juno
// 3 large solar panel wings (120 deg apart), small cylindrical body center
// ---------------------------------------------------------------------------
function createJuno(color: number): THREE.Group {
  const group = new THREE.Group();

  // Central cylindrical body
  const bodyGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.06, 12);
  const body = new THREE.Mesh(bodyGeo, bodyMat(color));
  body.rotation.x = Math.PI / 2;
  group.add(body);

  // 3 solar panels at 120 deg apart
  const panelGeo = new THREE.BoxGeometry(0.12, 0.002, 0.04);
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const panel = new THREE.Mesh(panelGeo, panelMat());
    const dist = 0.085;
    panel.position.set(Math.cos(angle) * dist, Math.sin(angle) * dist, 0);
    panel.rotation.z = angle;
    group.add(panel);
  }

  return group;
}

// ---------------------------------------------------------------------------
// Parker Solar Probe
// Heat shield (flat disc), small body behind it, 4 small solar panels
// ---------------------------------------------------------------------------
function createParker(color: number): THREE.Group {
  const group = new THREE.Group();

  // Heat shield — flat disc facing "forward"
  const shieldGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.008, 20);
  const shieldMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee });
  const shield = new THREE.Mesh(shieldGeo, shieldMat);
  shield.rotation.x = Math.PI / 2;
  shield.position.set(0, 0, 0.04);
  group.add(shield);

  // Small body behind shield
  const bodyGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.08, 10);
  const body = new THREE.Mesh(bodyGeo, bodyMat(color));
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0, -0.02);
  group.add(body);

  // 4 small solar panels
  const spGeo = new THREE.BoxGeometry(0.04, 0.002, 0.02);
  const offsets = [
    [0.05, 0],
    [-0.05, 0],
    [0, 0.05],
    [0, -0.05],
  ] as const;
  for (const [ox, oy] of offsets) {
    const sp = new THREE.Mesh(spGeo, panelMat());
    sp.position.set(ox, oy, -0.04);
    group.add(sp);
  }

  return group;
}

// ---------------------------------------------------------------------------
// Perseverance
// Rectangular body, 6 wheels, mast/camera arm
// ---------------------------------------------------------------------------
function createPerseverance(color: number): THREE.Group {
  const group = new THREE.Group();

  // Rectangular body
  const bodyGeo = new THREE.BoxGeometry(0.12, 0.04, 0.08);
  const body = new THREE.Mesh(bodyGeo, bodyMat(color));
  body.position.set(0, 0.03, 0);
  group.add(body);

  // 6 wheels — small cylinders, 3 per side
  const wheelGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.01, 8);
  const wheelMaterial = new THREE.MeshBasicMaterial({ color: 0x555555 });
  const wheelPositions = [
    [-0.05, 0, 0.04],
    [0, 0, 0.04],
    [0.05, 0, 0.04],
    [-0.05, 0, -0.04],
    [0, 0, -0.04],
    [0.05, 0, -0.04],
  ] as const;
  for (const [wx, wy, wz] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMaterial);
    wheel.position.set(wx, wy, wz);
    wheel.rotation.x = Math.PI / 2;
    group.add(wheel);
  }

  // Mast / camera arm
  const mastGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.06, 6);
  const mast = new THREE.Mesh(mastGeo, bodyMat(color));
  mast.position.set(0.04, 0.08, 0);
  group.add(mast);

  // Camera head
  const headGeo = new THREE.BoxGeometry(0.02, 0.01, 0.015);
  const head = new THREE.Mesh(headGeo, bodyMat(color));
  head.position.set(0.04, 0.115, 0);
  group.add(head);

  return group;
}

// ---------------------------------------------------------------------------
// JWST (James Webb Space Telescope)
// Hexagonal sunshield approximation (flat box), secondary mirror support struts
// ---------------------------------------------------------------------------
function createJWST(color: number): THREE.Group {
  const group = new THREE.Group();

  // Sunshield — large flat box approximation of hexagonal shape
  const shieldGeo = new THREE.BoxGeometry(0.22, 0.002, 0.14);
  const shieldMat = new THREE.MeshBasicMaterial({ color: 0xddcc88 });
  const shield = new THREE.Mesh(shieldGeo, shieldMat);
  shield.position.set(0, -0.02, 0);
  group.add(shield);

  // Primary mirror — hexagonal approximation (flat cylinder with 6 sides)
  const mirrorGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.005, 6);
  const mirrorMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
  const mirror = new THREE.Mesh(mirrorGeo, mirrorMat);
  mirror.position.set(0, 0.02, 0);
  group.add(mirror);

  // Secondary mirror support struts — 3 thin cylinders
  const strutGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.10, 4);
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const strut = new THREE.Mesh(strutGeo, bodyMat(color));
    strut.position.set(
      Math.cos(angle) * 0.035,
      0.07,
      Math.sin(angle) * 0.035,
    );
    strut.rotation.z = Math.cos(angle) * 0.4;
    strut.rotation.x = Math.sin(angle) * 0.4;
    group.add(strut);
  }

  // Secondary mirror — tiny sphere
  const secGeo = new THREE.SphereGeometry(0.008, 8, 6);
  const sec = new THREE.Mesh(secGeo, mirrorMat);
  sec.position.set(0, 0.10, 0);
  group.add(sec);

  return group;
}

// ---------------------------------------------------------------------------
// Europa Clipper / JUICE
// Large solar arrays (2 long rectangular panels), cylindrical body
// ---------------------------------------------------------------------------
function createClipperJuice(color: number): THREE.Group {
  const group = new THREE.Group();

  // Cylindrical body
  const bodyGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.07, 12);
  const body = new THREE.Mesh(bodyGeo, bodyMat(color));
  body.rotation.x = Math.PI / 2;
  group.add(body);

  // Two large solar arrays
  const panelGeo = new THREE.BoxGeometry(0.14, 0.002, 0.04);
  const leftPanel = new THREE.Mesh(panelGeo, panelMat());
  leftPanel.position.set(-0.095, 0, 0);
  group.add(leftPanel);

  const rightPanel = new THREE.Mesh(panelGeo, panelMat());
  rightPanel.position.set(0.095, 0, 0);
  group.add(rightPanel);

  // Antenna dish on top
  const dishGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.005, 14);
  const dish = new THREE.Mesh(dishGeo, dishMat());
  dish.position.set(0, 0.03, 0);
  group.add(dish);

  return group;
}

// ---------------------------------------------------------------------------
// BepiColombo / Solar Orbiter
// Compact orbiter: cylindrical body, 2 solar panels, antenna dish
// ---------------------------------------------------------------------------
function createCompactOrbiter(color: number): THREE.Group {
  const group = new THREE.Group();

  // Cylindrical body
  const bodyGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.06, 10);
  const body = new THREE.Mesh(bodyGeo, bodyMat(color));
  body.rotation.x = Math.PI / 2;
  group.add(body);

  // 2 solar panels
  const panelGeo = new THREE.BoxGeometry(0.08, 0.002, 0.04);
  const leftPanel = new THREE.Mesh(panelGeo, panelMat());
  leftPanel.position.set(-0.065, 0, 0);
  group.add(leftPanel);

  const rightPanel = new THREE.Mesh(panelGeo, panelMat());
  rightPanel.position.set(0.065, 0, 0);
  group.add(rightPanel);

  // Antenna dish
  const dishGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.004, 12);
  const dish = new THREE.Mesh(dishGeo, dishMat());
  dish.position.set(0, 0.03, 0);
  group.add(dish);

  return group;
}

// ---------------------------------------------------------------------------
// Lucy / Psyche / OSIRIS-APEX
// Generic deep space: cylindrical body, 2 solar panels, instrument boom
// ---------------------------------------------------------------------------
function createGenericDeepSpace(color: number): THREE.Group {
  const group = new THREE.Group();

  // Cylindrical body
  const bodyGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.055, 10);
  const body = new THREE.Mesh(bodyGeo, bodyMat(color));
  body.rotation.x = Math.PI / 2;
  group.add(body);

  // 2 solar panels
  const panelGeo = new THREE.BoxGeometry(0.10, 0.002, 0.035);
  const leftPanel = new THREE.Mesh(panelGeo, panelMat());
  leftPanel.position.set(-0.075, 0, 0);
  group.add(leftPanel);

  const rightPanel = new THREE.Mesh(panelGeo, panelMat());
  rightPanel.position.set(0.075, 0, 0);
  group.add(rightPanel);

  // Instrument boom
  const boomGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.10, 4);
  const boom = new THREE.Mesh(boomGeo, bodyMat(color));
  boom.position.set(0, 0.05, 0);
  group.add(boom);

  // Instrument tip
  const tipGeo = new THREE.SphereGeometry(0.008, 6, 5);
  const tip = new THREE.Mesh(tipGeo, bodyMat(color));
  tip.position.set(0, 0.10, 0);
  group.add(tip);

  return group;
}

// ---------------------------------------------------------------------------
// Default generic satellite
// Body + 2 panels + dish
// ---------------------------------------------------------------------------
function createDefaultSatellite(color: number): THREE.Group {
  const group = new THREE.Group();

  // Box body
  const bodyGeo = new THREE.BoxGeometry(0.04, 0.03, 0.03);
  const body = new THREE.Mesh(bodyGeo, bodyMat(color));
  group.add(body);

  // 2 solar panels
  const panelGeo = new THREE.BoxGeometry(0.08, 0.002, 0.04);
  const leftPanel = new THREE.Mesh(panelGeo, panelMat());
  leftPanel.position.set(-0.06, 0, 0);
  group.add(leftPanel);

  const rightPanel = new THREE.Mesh(panelGeo, panelMat());
  rightPanel.position.set(0.06, 0, 0);
  group.add(rightPanel);

  // Dish
  const dishGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.004, 10);
  const dish = new THREE.Mesh(dishGeo, dishMat());
  dish.position.set(0, 0.025, 0);
  group.add(dish);

  return group;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a procedural 3D model for a deep space probe.
 * Each probe ID maps to a visually distinct shape built from THREE.js primitives.
 * Models are approximately 0.3 scene units in total size.
 *
 * @param probeId  - The probe identifier (e.g. 'voyager1', 'jwst', 'parker')
 * @param color    - Emissive tint color for the probe body (hex number)
 * @returns A THREE.Group containing the probe model
 */
export function createProbeModel(probeId: string, color: number): THREE.Group {
  let model: THREE.Group;

  switch (probeId) {
    case 'voyager1':
    case 'voyager2':
      model = createVoyager(color);
      break;
    case 'newhorizons':
      model = createNewHorizons(color);
      break;
    case 'juno':
      model = createJuno(color);
      break;
    case 'parker':
      model = createParker(color);
      break;
    case 'perseverance':
      model = createPerseverance(color);
      break;
    case 'jwst':
      model = createJWST(color);
      break;
    case 'clipper':
    case 'juice':
      model = createClipperJuice(color);
      break;
    case 'bepi':
    case 'solarorbiter':
      model = createCompactOrbiter(color);
      break;
    case 'lucy':
    case 'psyche':
    case 'osirisapex':
      model = createGenericDeepSpace(color);
      break;
    default:
      model = createDefaultSatellite(color);
      break;
  }

  return model;
}
