import * as THREE from 'three';

// ─── Shared types ────────────────────────────────────────────────────

/** Compact planet record (mirrors the P[] shape built in App.tsx). */
export interface PlanetRec {
  id: string;
  n: string;
  cn: string;
  cnFull: string;
  col: number;
  r: number;
  d: number;
  s: number;
  tilt: number;
  rotP: number;
  sun: number;
  gas: number;
  ring: number;
  stats: Record<string, string>;
  fact: string;
  texType: string;
  eccentricity: number;
  orbitalIncl: number;
  argPerihelion: number;
  longAscNode: number;
}

/** Runtime config object (the `cfg` bag exposed on `window.__cfg`). */
export interface Cfg {
  planetOrbitWidth: number;
  planetOrbitOpacity: number;
  moonOrbitOpacity: number;
  moonOrbitWidth: number;
  satOrbitOpacity: number;
  satTrailOpacity: number;
  helperSize: number;
  bracketSize: number;
  labelHideFrac: number;
  satLabelHideFrac: number;
  moonLabelHideFrac: number;
  helperHideFrac: number;
  satBracketHideFrac: number;
  planetOrbitHideDist: number;
  moonOrbitHideDist: number;
  invertH: boolean;
  invertV: boolean;
  showLabels: boolean;
  showOrbits: boolean;
  showHelpers: boolean;
  showTrails: boolean;
}

/** Label target entry produced by the label-setup loop in App.tsx. */
export interface LabelTarget {
  mesh: THREE.Mesh | null;
  text: string;
  type: 'planet' | 'moon' | 'probe' | 'sat';
}

/** Helper entry for planet/moon selection overlays. */
export interface HelperEntry {
  el: HTMLDivElement;
  nameEl: HTMLDivElement;
  getMesh: () => THREE.Object3D;
  getWorldR: () => number;
  color: string;
  onClick: () => void;
  name: string;
  type: 'planet' | 'moon';
  parentIdx?: number;
}

/** Satellite data bucket (mirrors satDataRef.current in App.tsx). */
export interface SatData {
  sats: { color?: string; name: string; noradId: number; groupId: string; satrec: unknown }[];
  meshes: (THREE.Mesh | null)[];
  groups: Record<string, boolean>;
  orbitLines: THREE.Line[];
  trailLines: (THREE.Line | null)[];
  starlinkMesh?: THREE.InstancedMesh;
  starlinkSats?: unknown[];
  starlinkPositions?: Float32Array;
}

// ─── Shared context bundle ───────────────────────────────────────────

/**
 * Bundles the shared closure state that the overlay functions need.
 * Build once per animation-loop setup and pass into each updater.
 */
export interface OverlayContext {
  /** Camera used for projection. */
  cam: THREE.PerspectiveCamera;
  /** Planet meshes array (index-aligned with P). */
  meshes: THREE.Mesh[];
  /** Planet records array. */
  P: PlanetRec[];
  /** Returns the current visual scale factor for planet at index i. */
  baseScaleFn: (i: number) => number;
  /** Runtime configuration bag. */
  cfg: Cfg;
  /** Viewport width in CSS pixels. */
  innerWidth: number;
  /** Viewport height in CSS pixels. */
  innerHeight: number;
}

// ─── Pure helpers ────────────────────────────────────────────────────

/**
 * Compute the screen-space pixel size of a sphere with the given world
 * radius, as seen through a perspective camera.
 */
export function getScreenSize(
  mesh: THREE.Object3D,
  camera: THREE.Camera,
  worldRadius: number,
  viewportHeight: number,
): number {
  const dist = camera.position.distanceTo(mesh.position);
  if (dist < 0.001) return 9999;
  const fov = (camera as THREE.PerspectiveCamera).fov * Math.PI / 180;
  return (worldRadius / (dist * Math.tan(fov / 2))) * viewportHeight;
}

/**
 * Zero-allocation occlusion test.
 *
 * Returns `true` when `worldPos` is hidden behind any visible planet
 * sphere as seen from `camPosition`.
 */
export function isOccludedByPlanet(
  worldPos: THREE.Vector3,
  camPosition: THREE.Vector3,
  meshes: THREE.Mesh[],
  P: PlanetRec[],
  baseScaleFn: (i: number) => number,
): boolean {
  const cpx = camPosition.x, cpy = camPosition.y, cpz = camPosition.z;
  const wpx = worldPos.x - cpx, wpy = worldPos.y - cpy, wpz = worldPos.z - cpz;
  const pointDist = Math.sqrt(wpx * wpx + wpy * wpy + wpz * wpz);
  if (pointDist < 0.001) return false;
  for (let pi = 0; pi < meshes.length; pi++) {
    const pm = meshes[pi];
    if (!pm.visible) continue;
    const pr = baseScaleFn(pi) * P[pi].r;
    if (pr < 0.001) continue;
    const ppx = pm.position.x - cpx, ppy = pm.position.y - cpy, ppz = pm.position.z - cpz;
    const planetDist = Math.sqrt(ppx * ppx + ppy * ppy + ppz * ppz);
    if (pointDist <= planetDist || planetDist < pr) continue;
    const dot = (ppx * wpx + ppy * wpy + ppz * wpz) / (planetDist * pointDist);
    if (dot > Math.cos(Math.asin(Math.min(pr / planetDist, 1)))) return true;
  }
  return false;
}

// ─── updateLabels ────────────────────────────────────────────────────

export interface UpdateLabelsParams {
  showLabels: boolean;
  allLabelTargets: LabelTarget[];
  labelEls: HTMLDivElement[];
  /** Reusable Vector3 — avoids per-frame allocation. */
  labelVec: THREE.Vector3;
  cam: THREE.PerspectiveCamera;
  meshes: THREE.Mesh[];
  P: PlanetRec[];
  baseScaleFn: (i: number) => number;
  cfg: Cfg;
  getScreenSizeFn: typeof getScreenSize;
  isOccludedFn: typeof isOccludedByPlanet;
  EARTH_IDX: number;
  innerWidth: number;
  innerHeight: number;
  /** Pre-computed Earth screen size (pixels). Pass -1 to let the function compute it. */
  earthScreenL?: number;
}

export function updateLabels(params: UpdateLabelsParams): void {
  const {
    showLabels, allLabelTargets, labelEls, labelVec,
    cam, meshes, P, baseScaleFn, cfg,
    getScreenSizeFn, isOccludedFn,
    EARTH_IDX, innerWidth, innerHeight,
  } = params;

  if (!showLabels) {
    labelEls.forEach(el => el.style.display = 'none');
    return;
  }

  // Pre-compute Earth screen size for satellite/moon label hiding
  const earthIdxL = EARTH_IDX;
  const earthScreenL = params.earthScreenL != null && params.earthScreenL >= 0
    ? params.earthScreenL
    : (earthIdxL >= 0
      ? getScreenSizeFn(meshes[earthIdxL], cam, baseScaleFn(earthIdxL) * P[earthIdxL].r, innerHeight)
      : 999);

  allLabelTargets.forEach(({ mesh, type }, i) => {
    const el = labelEls[i];
    if (!mesh || !mesh.visible) { el.style.display = 'none'; return; }

    // For satellites: hide when Earth < 1/N screen
    if (type === 'sat' && earthScreenL < innerHeight / cfg.satLabelHideFrac) {
      el.style.display = 'none'; return;
    }

    // For natural moons: hide when their parent planet < 1/N screen
    if (type === 'moon') {
      const pIdx = mesh.userData?.parentIdx ?? earthIdxL;
      const parentScreenSz = getScreenSizeFn(meshes[pIdx], cam, baseScaleFn(pIdx) * P[pIdx].r, innerHeight);
      if (parentScreenSz < innerHeight / cfg.moonLabelHideFrac) { el.style.display = 'none'; return; }
    }

    const objScreenSz = getScreenSizeFn(mesh, cam, mesh.scale?.x || 1, innerHeight);
    const threshold = type === 'sat' ? innerHeight / cfg.satLabelHideFrac : innerHeight / cfg.labelHideFrac;
    if (objScreenSz < threshold) { el.style.display = 'none'; return; }

    labelVec.setFromMatrixPosition(mesh.matrixWorld);

    // Occluded by a planet? Hide label
    if (isOccludedFn(labelVec, cam.position, meshes, P, baseScaleFn)) {
      el.style.display = 'none'; return;
    }

    labelVec.project(cam);
    if (labelVec.z > 1) { el.style.display = 'none'; return; } // behind camera

    const x = (labelVec.x * .5 + .5) * innerWidth;
    const y = (labelVec.y * -.5 + .5) * innerHeight;

    // For satellites: hide label if screen position falls within Earth's projected disk
    if (type === 'sat' && earthIdxL >= 0) {
      const ePos = meshes[earthIdxL].position.clone().project(cam);
      const ex = (ePos.x * .5 + .5) * innerWidth;
      const ey = (ePos.y * -.5 + .5) * innerHeight;
      const eDiskR = earthScreenL / 2;
      const dx = x - ex, dy = y - ey;
      if (dx * dx + dy * dy < eDiskR * eDiskR * 0.85) { el.style.display = 'none'; return; }
    }

    el.style.display = 'block';
    const screenR = objScreenSz / 2;

    if (type === 'sat') {
      // Satellites: label directly on top, centered
      el.style.transform = `translate(${x}px, ${y - 30}px) translateX(-50%)`;
      el.style.textAlign = 'center';
      el.style.fontSize = '8px';
    } else {
      // Planets / moons / probes: label to upper-right
      const maxOff = type === 'moon' ? 12 : 999;
      const offset = Math.min(Math.max(screenR + 4, 6), maxOff);
      el.style.transform = `translate(${x + offset}px, ${y - Math.min(Math.max(screenR * 0.3, 4), maxOff)}px)`;
      el.style.textAlign = 'left';
      el.style.fontSize = type === 'planet' ? '14px' : type === 'moon' ? '10px' : '9px';
    }
  });
}

// ─── updateSatBrackets ───────────────────────────────────────────────

export interface UpdateSatBracketsParams {
  sd: SatData;
  camera: THREE.Camera;
  earthScale: number;
  bracketContainer: HTMLDivElement;
  bracketEls: HTMLDivElement[];
  meshes: THREE.Mesh[];
  EARTH_IDX: number;
  earthSceneR: number;
  cfg: Cfg;
  showHelpers: boolean;
  getScreenSizeFn: typeof getScreenSize;
  isOccludedFn: typeof isOccludedByPlanet;
  P: PlanetRec[];
  baseScaleFn: (i: number) => number;
  innerWidth: number;
  innerHeight: number;
}

export function updateSatBrackets(params: UpdateSatBracketsParams): void {
  const {
    sd, camera, earthScale, bracketContainer, bracketEls,
    meshes, EARTH_IDX, earthSceneR, cfg, showHelpers,
    getScreenSizeFn, isOccludedFn, P, baseScaleFn,
    innerWidth, innerHeight,
  } = params;

  const eIdx4 = EARTH_IDX;
  const earthScreen = getScreenSizeFn(meshes[eIdx4], camera, earthSceneR * earthScale, innerHeight);
  const showBrackets = earthScreen > innerHeight / cfg.satBracketHideFrac;

  // Lazy-create bracket elements
  while (bracketEls.length < sd.meshes.length) {
    const el = document.createElement('div');
    el.className = 'sat-bracket';
    el.onclick = () => (window as any).__focusSat(bracketEls.indexOf(el));
    bracketContainer.appendChild(el);
    bracketEls.push(el);
  }

  // Reusable Vector3 for projection (allocated once on first call)
  if (!(updateSatBrackets as any)._vec) {
    (updateSatBrackets as any)._vec = new THREE.Vector3();
  }
  const bracketVec: THREE.Vector3 = (updateSatBrackets as any)._vec;

  for (let i = 0; i < sd.meshes.length; i++) {
    const el = bracketEls[i];
    if (!el) continue;
    const sm = sd.meshes[i];
    if (!sm || !sm.visible || !showBrackets || !showHelpers) { el.style.display = 'none'; continue; }

    bracketVec.setFromMatrixPosition(sm.matrixWorld);
    if (isOccludedFn(bracketVec, camera.position, meshes, P, baseScaleFn)) {
      el.style.display = 'none'; continue;
    }
    bracketVec.project(camera);
    if (bracketVec.z > 1) { el.style.display = 'none'; continue; }

    const x = (bracketVec.x * .5 + .5) * innerWidth;
    const y = (bracketVec.y * -.5 + .5) * innerHeight;

    el.style.display = 'block';
    const bs = cfg.bracketSize;
    el.style.width = bs + 'px'; el.style.height = bs + 'px';
    (el.style as any).translate = `${x - bs / 2}px ${y - bs / 2}px`;
    el.style.borderColor = sd.sats[i]?.color || '#fff';
  }
}

// ─── updateHelpers ───────────────────────────────────────────────────

export interface UpdateHelpersParams {
  helperEntries: HelperEntry[];
  showHelpers: boolean;
  /** Current camera distance (cD in App.tsx). */
  cD: number;
  cam: THREE.PerspectiveCamera;
  meshes: THREE.Mesh[];
  P: PlanetRec[];
  baseScaleFn: (i: number) => number;
  cfg: Cfg;
  getScreenSizeFn: typeof getScreenSize;
  isOccludedFn: typeof isOccludedByPlanet;
  naturalMoonMeshes: THREE.Mesh[];
  addNaturalMoonHelpersFn: () => void;
  innerWidth: number;
  innerHeight: number;
}

export function updateHelpers(params: UpdateHelpersParams): void {
  const {
    helperEntries, showHelpers, cD, cam, meshes, P, baseScaleFn, cfg,
    getScreenSizeFn, isOccludedFn, naturalMoonMeshes, addNaturalMoonHelpersFn,
    innerWidth, innerHeight,
  } = params;

  // Add any new natural moon helpers
  if (naturalMoonMeshes.length > 0) addNaturalMoonHelpersFn();

  // Hide all planet/moon helpers when zoomed out past solar system scale
  const allHelpersHidden = cD > 500;

  // Reusable Vector3 for projection (allocated once on first call)
  if (!(updateHelpers as any)._vec) {
    (updateHelpers as any)._vec = new THREE.Vector3();
  }
  const helperVec: THREE.Vector3 = (updateHelpers as any)._vec;

  for (const h of helperEntries) {
    if (!showHelpers || allHelpersHidden) { h.el.style.display = 'none'; continue; }
    const mesh = h.getMesh();
    if (!mesh) { h.el.style.display = 'none'; continue; }

    // Moons: hide when parent planet is too small (same rule as labels)
    if (h.type === 'moon' && h.parentIdx !== undefined) {
      const parentScreenSz = getScreenSizeFn(meshes[h.parentIdx], cam, baseScaleFn(h.parentIdx) * P[h.parentIdx].r, innerHeight);
      if (parentScreenSz < innerHeight / cfg.moonLabelHideFrac) { h.el.style.display = 'none'; continue; }
    }

    // Only show helper when object is too small on screen (< 20px) but not sub-pixel
    const worldR = h.getWorldR();
    const screenSz = getScreenSizeFn(mesh, cam, worldR, innerHeight);
    if (screenSz >= 20) { h.el.style.display = 'none'; continue; }

    // Hide when truly invisible (sub-pixel) — too zoomed out
    if (h.type === 'planet' && screenSz < innerHeight / cfg.helperHideFrac) { h.el.style.display = 'none'; continue; }

    // Don't show if behind camera
    helperVec.setFromMatrixPosition(mesh.matrixWorld);
    if (isOccludedFn(helperVec, cam.position, meshes, P, baseScaleFn)) { h.el.style.display = 'none'; continue; }
    helperVec.project(cam);
    if (helperVec.z > 1) { h.el.style.display = 'none'; continue; }

    const x = (helperVec.x * .5 + .5) * innerWidth;
    const y = (helperVec.y * -.5 + .5) * innerHeight;
    h.el.style.display = 'block';
    h.el.style.width = cfg.helperSize + 'px'; h.el.style.height = cfg.helperSize + 'px';
    (h.el.style as any).translate = `${x - cfg.helperSize / 2}px ${y - cfg.helperSize / 2}px`;
  }
}
