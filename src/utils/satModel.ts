import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = import.meta.env.BASE_URL;
const loader = new GLTFLoader();

// Cache loaded models by URL
const modelCache = new Map<string, THREE.Group>();
const loadPromises = new Map<string, Promise<THREE.Group>>();

// Model assignments: which GLB to use for which satellite group/name
const MODEL_MAP: Record<string, string> = {
  stations: 'iss.glb',       // ISS, CSS, etc.
  beidou: 'satellite.glb',   // generic comm sat
  gps: 'tdrs-satellite.glb', // TDRS-style for GPS
  _default: 'satellite.glb',
};

/**
 * Load a GLB model, cache it, return a clone.
 */
function loadModel(filename: string): Promise<THREE.Group> {
  const url = `${BASE}models/${filename}`;
  if (modelCache.has(url)) {
    return Promise.resolve(modelCache.get(url)!.clone());
  }
  if (loadPromises.has(url)) {
    return loadPromises.get(url)!.then(g => g.clone());
  }
  const p = new Promise<THREE.Group>((resolve) => {
    loader.load(url, (gltf) => {
      const model = gltf.scene;
      // Normalize size: scale so bounding box fits in ~1 unit, then we'll rescale per-satellite
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0) model.scale.multiplyScalar(1 / maxDim);
      // Center
      const center = new THREE.Vector3();
      box.getCenter(center);
      model.position.sub(center.multiplyScalar(1 / maxDim));
      modelCache.set(url, model);
      resolve(model.clone());
    }, undefined, () => {
      // Failed to load — return procedural fallback
      const fallback = createProceduralSatellite(0xcccccc);
      resolve(fallback);
    });
  });
  loadPromises.set(url, p);
  return p;
}

/**
 * Create a satellite model for a given group. Returns immediately with a procedural
 * placeholder, then hot-swaps to the real GLB model when loaded.
 */
export function createSatelliteModel(color: number, groupId?: string): THREE.Group {
  const container = new THREE.Group();
  // Start with procedural placeholder
  const placeholder = createProceduralSatellite(color);
  container.add(placeholder);

  // Async load the real model
  const filename = MODEL_MAP[groupId || ''] || MODEL_MAP._default;
  loadModel(filename).then(model => {
    container.remove(placeholder);
    // Apply satellite color tint to the model
    model.traverse(child => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.isMeshStandardMaterial) {
          mat.emissive = new THREE.Color(color);
          mat.emissiveIntensity = 0.3;
        }
      }
    });
    container.add(model);
  });

  return container;
}

/**
 * Procedural fallback satellite (used while GLB loads or if load fails).
 */
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

  return satellite;
}
