import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const BASE = import.meta.env.BASE_URL;
const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
loader.setDRACOLoader(dracoLoader);

const modelCache = new Map<string, THREE.Group>();
const loadPromises = new Map<string, Promise<THREE.Group>>();

// Model assignments per satellite group
const MODEL_MAP: Record<string, string> = {
  stations: 'iss.glb',
  beidou: 'ssl1300.glb',      // SSL-1300 commercial sat bus ≈ BeiDou nav sat
  gps: 'tdrs-a.glb',          // TDRS-A ≈ GPS (borrowed shape)
  weather: 'goes.glb',        // GOES weather satellite ✓
  resource: 'landsat8.glb',
  science: 'chandra.glb',     // Chandra X-ray Observatory (generic science)
  geodetic: 'icesat2.glb',    // ICESat-2 geodetic satellite ✓
  visual: 'terra.glb',        // Terra Earth observation (brightest sats vary)
  _default: 'satellite.glb',
};

/**
 * Load a GLB, normalize to ~1 unit, cache, return clone.
 */
function loadModel(filename: string): Promise<THREE.Group> {
  const url = `${BASE}models/${filename}`;
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
 */
export function createSatelliteModel(color: number, groupId?: string): THREE.Group {
  const container = new THREE.Group();
  const placeholder = createProceduralSatellite(color);
  container.add(placeholder);

  // Measure placeholder size BEFORE async swap
  const phBox = new THREE.Box3().setFromObject(placeholder);
  const phSize = new THREE.Vector3(); phBox.getSize(phSize);
  const phMax = Math.max(phSize.x, phSize.y, phSize.z, 0.001);

  const filename = MODEL_MAP[groupId || ''] || MODEL_MAP._default;
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
  const bodyGeometry = new THREE.BoxGeometry(0.006, 0.004, 0.004);
  const bodyMaterial = new THREE.MeshBasicMaterial({ color });
  satellite.add(new THREE.Mesh(bodyGeometry, bodyMaterial));
  const panelGeometry = new THREE.BoxGeometry(0.012, 0.0005, 0.006);
  const panelMaterial = new THREE.MeshBasicMaterial({ color: 0x2244aa });
  const leftPanel = new THREE.Mesh(panelGeometry, panelMaterial);
  leftPanel.position.set(-0.009, 0, 0);
  satellite.add(leftPanel);
  const rightPanel = new THREE.Mesh(panelGeometry, panelMaterial);
  rightPanel.position.set(0.009, 0, 0);
  satellite.add(rightPanel);
  const antennaGeometry = new THREE.ConeGeometry(0.002, 0.003, 8);
  const antennaMaterial = new THREE.MeshBasicMaterial({ color });
  const antenna = new THREE.Mesh(antennaGeometry, antennaMaterial);
  antenna.position.set(0, 0.002 + 0.003 / 2, 0);
  satellite.add(antenna);
  // Center visual at origin (antenna causes y-offset)
  const box = new THREE.Box3().setFromObject(satellite);
  const center = new THREE.Vector3(); box.getCenter(center);
  satellite.children.forEach(c => c.position.sub(center));
  return satellite;
}
