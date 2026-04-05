import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const LOCAL_BASE = import.meta.env.BASE_URL;
const CDN_BASE = 'https://esymcblyhmeuiudpmdff.supabase.co/storage/v1/object/public/og-space-3dmodels/';
const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
loader.setDRACOLoader(dracoLoader);

const modelCache = new Map<string, THREE.Group>();
const loadPromises = new Map<string, Promise<THREE.Group>>();

// Models >1MB hosted on Supabase CDN (GitHub Pages can't serve LFS files)
const CDN_MODELS = new Set([
  'chandra.glb', 'fermi.glb', 'icesat2.glb', 'tdrs-satellite.glb',
  'terra.glb', 'suomi-npp.glb', 'gpm.glb', 'jwst.glb',
  'perseverance.glb', 'juno.glb', 'hubble.glb',
]);

// Model assignments per satellite group
// Groups with '_procedural:xxx' use built-in procedural models (no GLB needed)
const MODEL_MAP: Record<string, string> = {
  stations: 'iss.glb',
  beidou: 'ssl1300.glb',      // SSL-1300 commercial sat bus ≈ BeiDou nav sat
  gps: 'tdrs-a.glb',          // TDRS-A ≈ GPS (borrowed shape)
  weather: 'goes.glb',        // GOES weather satellite ✓
  resource: 'landsat8.glb',
  science: 'chandra.glb',     // Chandra X-ray Observatory (generic science)
  geodetic: 'icesat2.glb',    // ICESat-2 geodetic satellite ✓
  visual: 'terra.glb',        // Terra Earth observation (brightest sats vary)
  starlink: '_procedural:starlink',
  debris: '_procedural:debris',
  _default: 'satellite.glb',
};

/**
 * Load a GLB, normalize to ~1 unit, cache, return clone.
 */
function loadModel(filename: string): Promise<THREE.Group> {
  const url = CDN_MODELS.has(filename) ? `${CDN_BASE}${filename}` : `${LOCAL_BASE}models/${filename}`;
  if (modelCache.has(url)) return Promise.resolve(modelCache.get(url)!.clone());
  if (loadPromises.has(url)) return loadPromises.get(url)!.then(g => g.clone());
  const p = new Promise<THREE.Group>((resolve) => {
    loader.load(url, (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3(); box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0) model.scale.multiplyScalar(1 / maxDim);
      const center = new THREE.Vector3(); box.getCenter(center);
      model.position.sub(center.multiplyScalar(1 / maxDim));
      modelCache.set(url, model);
      resolve(model.clone());
    }, undefined, (err) => {
      console.warn(`[satModel] Failed to load ${url}:`, err);
      resolve(createProceduralSatellite(0xcccccc));
    });
  });
  loadPromises.set(url, p);
  return p;
}

/**
 * Create satellite model. Shows procedural placeholder immediately,
 * then hot-swaps to real GLB when loaded — MATCHED to placeholder size.
 * For starlink/debris groups, uses detailed procedural models directly.
 */
export function createSatelliteModel(color: number, groupId?: string): THREE.Group {
  const container = new THREE.Group();
  const filename = MODEL_MAP[groupId || ''] || MODEL_MAP._default;

  // Procedural models: use detailed built-in geometry (no GLB loading)
  if (filename.startsWith('_procedural:')) {
    const type = filename.split(':')[1];
    const detail = type === 'starlink' ? createProceduralStarlink(color) :
                   type === 'debris' ? createProceduralDebris(color) :
                   createProceduralSatellite(color);
    container.add(detail);
    return container;
  }

  const placeholder = createProceduralSatellite(color);
  container.add(placeholder);

  // Measure placeholder size BEFORE async swap
  const phBox = new THREE.Box3().setFromObject(placeholder);
  const phSize = new THREE.Vector3(); phBox.getSize(phSize);
  const phMax = Math.max(phSize.x, phSize.y, phSize.z, 0.001);

  loadModel(filename).then(model => {
    // loadModel normalized to ~1 unit (scale=1/maxDim, position=centering offset)
    // Multiply by phMax so model matches placeholder size
    model.scale.multiplyScalar(phMax);
    // Re-center: loadModel's centering was for scale=1/maxDim, now scale changed
    const reBox = new THREE.Box3().setFromObject(model);
    const reCenter = new THREE.Vector3(); reBox.getCenter(reCenter);
    model.position.sub(reCenter);

    container.remove(placeholder);
    // Emissive: set COLOR (grey) + intensity so model visible in Earth's shadow
    model.traverse(child => {
      if ((child as THREE.Mesh).isMesh) {
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (mat.isMeshStandardMaterial) {
          if (!mat.emissive || mat.emissive.getHex() === 0x000000) {
            mat.emissive = new THREE.Color(0x444444);
          }
          mat.emissiveIntensity = 0.4;
        }
      }
    });
    container.add(model);
  });

  return container;
}

function createProceduralSatellite(color: number): THREE.Group {
  const satellite = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.4, emissive: new THREE.Color(color).multiplyScalar(0.15) });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x1a3377, metalness: 0.8, roughness: 0.2, emissive: new THREE.Color(0x112255), emissiveIntensity: 0.3 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.004, 0.004), bodyMat);
  satellite.add(body);
  const panelGeo = new THREE.BoxGeometry(0.012, 0.0005, 0.006);
  const leftPanel = new THREE.Mesh(panelGeo, panelMat);
  leftPanel.position.set(-0.009, 0, 0);
  satellite.add(leftPanel);
  const rightPanel = new THREE.Mesh(panelGeo, panelMat);
  rightPanel.position.set(0.009, 0, 0);
  satellite.add(rightPanel);
  const antenna = new THREE.Mesh(new THREE.ConeGeometry(0.002, 0.003, 8), bodyMat);
  antenna.position.set(0, 0.002 + 0.003 / 2, 0);
  satellite.add(antenna);
  centerGroup(satellite);
  return satellite;
}

/**
 * Starlink satellite: flat-panel body with large single solar array.
 * Resembles the real Starlink v2 Mini (flat rectangular chassis + one large panel).
 */
function createProceduralStarlink(color: number): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.7, roughness: 0.3, emissive: new THREE.Color(0x333333), emissiveIntensity: 0.3 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x1a2d5a, metalness: 0.85, roughness: 0.15, emissive: new THREE.Color(0x0d1a3d), emissiveIntensity: 0.4 });
  const kaAntenMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5, roughness: 0.5, emissive: new THREE.Color(0x222222), emissiveIntensity: 0.2 });

  // Flat chassis body (Starlink is very flat)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.002, 0.008), bodyMat);
  group.add(body);

  // Single large solar panel extending from one side
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.0004, 0.014), panelMat);
  panel.position.set(0, 0, -0.011);
  group.add(panel);

  // Panel grid lines (subtle visual detail)
  const gridMat = new THREE.MeshStandardMaterial({ color: 0x0a1833, metalness: 0.9, roughness: 0.1 });
  for (let gi = -2; gi <= 2; gi++) {
    const gridLine = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.0006, 0.0003), gridMat);
    gridLine.position.set(0, 0, -0.011 + gi * 0.003);
    group.add(gridLine);
  }

  // Ka-band phased array antennas (two flat discs on top)
  const discGeo = new THREE.CylinderGeometry(0.0025, 0.0025, 0.001, 12);
  const disc1 = new THREE.Mesh(discGeo, kaAntenMat);
  disc1.position.set(-0.004, 0.0015, 0.001);
  group.add(disc1);
  const disc2 = new THREE.Mesh(discGeo, kaAntenMat);
  disc2.position.set(0.004, 0.0015, 0.001);
  group.add(disc2);

  // Inter-satellite laser link (small cylinder)
  const laserGeo = new THREE.CylinderGeometry(0.0008, 0.0008, 0.003, 6);
  const laser = new THREE.Mesh(laserGeo, kaAntenMat);
  laser.position.set(0.007, 0.002, 0);
  group.add(laser);

  centerGroup(group);
  return group;
}

/**
 * Space debris: irregular fragment with torn panel and bent metal.
 * Looks like a broken satellite piece tumbling in orbit.
 */
function createProceduralDebris(color: number): THREE.Group {
  const group = new THREE.Group();
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.8, roughness: 0.5, emissive: new THREE.Color(0x222222), emissiveIntensity: 0.3 });
  const damagedMat = new THREE.MeshStandardMaterial({ color: 0x665544, metalness: 0.4, roughness: 0.8, emissive: new THREE.Color(0x221100), emissiveIntensity: 0.2 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x1a2244, metalness: 0.7, roughness: 0.3, emissive: new THREE.Color(0x0a1122), emissiveIntensity: 0.3 });

  // Main body fragment (irregular — stretched box)
  const bodyGeo = new THREE.BoxGeometry(0.008, 0.003, 0.005);
  // Distort vertices for irregular shape
  const pos = bodyGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) + (Math.sin(i * 7.3) * 0.001));
    pos.setY(i, pos.getY(i) + (Math.cos(i * 5.1) * 0.0008));
    pos.setZ(i, pos.getZ(i) + (Math.sin(i * 3.7) * 0.0006));
  }
  pos.needsUpdate = true;
  bodyGeo.computeVertexNormals();
  const body = new THREE.Mesh(bodyGeo, metalMat);
  group.add(body);

  // Torn solar panel fragment (tilted, broken edge)
  const panelGeo = new THREE.BoxGeometry(0.010, 0.0004, 0.006);
  const ppos = panelGeo.attributes.position;
  // Tear one edge by displacing vertices
  for (let i = 0; i < ppos.count; i++) {
    if (ppos.getX(i) > 0.003) {
      ppos.setY(i, ppos.getY(i) + Math.sin(i * 2.1) * 0.001);
      ppos.setZ(i, ppos.getZ(i) + Math.cos(i * 3.3) * 0.0008);
    }
  }
  ppos.needsUpdate = true;
  panelGeo.computeVertexNormals();
  const panel = new THREE.Mesh(panelGeo, panelMat);
  panel.position.set(-0.003, 0.001, 0.004);
  panel.rotation.set(0.3, 0, -0.15); // tilted — detached
  group.add(panel);

  // Bent strut / boom fragment
  const strutGeo = new THREE.CylinderGeometry(0.0006, 0.0006, 0.008, 6);
  const strut = new THREE.Mesh(strutGeo, damagedMat);
  strut.position.set(0.004, -0.001, -0.002);
  strut.rotation.set(0.5, 0.3, 0.8); // bent at angle
  group.add(strut);

  // Small debris chunk
  const chunkGeo = new THREE.TetrahedronGeometry(0.0015);
  const chunk = new THREE.Mesh(chunkGeo, damagedMat);
  chunk.position.set(-0.005, -0.001, -0.003);
  chunk.rotation.set(0.7, 1.2, 0.4);
  group.add(chunk);

  // Dangling wire
  const wireGeo = new THREE.CylinderGeometry(0.0002, 0.0002, 0.006, 4);
  const wire = new THREE.Mesh(wireGeo, new THREE.MeshStandardMaterial({ color: 0xcc8844, metalness: 0.9, roughness: 0.3, emissive: new THREE.Color(0x442200), emissiveIntensity: 0.2 }));
  wire.position.set(0.002, 0.002, 0.001);
  wire.rotation.set(0.4, 0, -0.6);
  group.add(wire);

  // Random rotation for tumbling appearance
  group.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  centerGroup(group);
  return group;
}

/** Center a group's children at origin based on bounding box */
function centerGroup(group: THREE.Group) {
  const box = new THREE.Box3().setFromObject(group);
  const center = new THREE.Vector3(); box.getCenter(center);
  group.children.forEach(c => c.position.sub(center));
}
