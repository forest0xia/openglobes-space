import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PLANETS } from './data/planets';
import { NATURAL_MOONS, MOON_COUNTS } from './data/moons';
import { PROBES } from './data/probesMeta';
import { fetchAllSatellites, fetchStarlinkSatellites, getSatPositionECI, eciToScene, SAT_GROUPS, type SatRecord } from './services/celestrak';
import { createSatelliteModel } from './utils/satModel';
import { createProbeModel } from './utils/probeModels';
import { createTrailMaterial, createTrailIndexAttribute } from './utils/trailShader';
import { getSatDisplayName } from './data/satNames';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';

const h2n = (h: string) => parseInt(h.replace('#', ''), 16);
// Darken a hex color by a factor (simulates opacity against black background)
const darkenHex = (hex: number, f: number) => {
  const r = ((hex >> 16) & 0xff) * f;
  const g = ((hex >> 8) & 0xff) * f;
  const b = (hex & 0xff) * f;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
};

const TRACKS_LIST = [
  { file: 'space-ambient.mp3', name: '深空漂流' },
  { file: 'cosmic-drift.mp3', name: '星际穿越' },
  { file: 'stellar-pulse.mp3', name: '脉冲星' },
  { file: 'solar-wind.mp3', name: '太阳风' },
  { file: 'deep-nebula.mp3', name: '星云深处' },
];
const BASE = import.meta.env.BASE_URL;

// Texture file map — loaded from public/textures/
const TEX_FILES: Record<string, string> = {
  sun: 'sun.jpg', mercury: 'mercury.jpg', venus: 'venus.jpg',
  earth: 'earth_day.jpg', mars: 'mars.jpg', jupiter: 'jupiter.jpg',
  saturn: 'saturn.jpg', uranus: 'uranus.jpg', neptune: 'neptune.jpg',
  moon: 'moon.jpg',
};

// Procedural fallback texture
function procTex(color: number, type: 'sun' | 'gas' | 'rock') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d')!;
  const R = (color >> 16) & 0xFF, G = (color >> 8) & 0xFF, B = color & 0xFF;
  if (type === 'sun') {
    const gr = x.createRadialGradient(128, 64, 8, 128, 64, 128);
    gr.addColorStop(0, `rgb(${Math.min(255, R + 80)},${Math.min(255, G + 50)},${B})`);
    gr.addColorStop(.4, `rgb(${R},${G},${B})`);
    gr.addColorStop(1, `rgb(${Math.max(0, R - 50)},${Math.max(0, G - 40)},0)`);
    x.fillStyle = gr; x.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 35; i++) { x.beginPath(); x.arc(Math.random() * 256, Math.random() * 128, Math.random() * 16 + 3, 0, Math.PI * 2); x.fillStyle = `rgba(255,${180 + Math.random() * 75 | 0},0,${Math.random() * .25})`; x.fill(); }
  } else if (type === 'gas') {
    x.fillStyle = `rgb(${R},${G},${B})`; x.fillRect(0, 0, 256, 128);
    for (let y = 0; y < 128; y += 2) { const v = Math.sin(y * .12 + Math.random()) * 22; x.fillStyle = `rgba(${Math.max(0, Math.min(255, R + v))},${Math.max(0, Math.min(255, G + v * .6))},${Math.max(0, Math.min(255, B + v * .4))},.35)`; x.fillRect(0, y, 256, 2); }
  } else {
    x.fillStyle = `rgb(${R},${G},${B})`; x.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 70; i++) { x.beginPath(); x.arc(Math.random() * 256, Math.random() * 128, Math.random() * 6 + 1, 0, Math.PI * 2); x.fillStyle = `rgba(${Math.max(0, R - 35)},${Math.max(0, G - 35)},${Math.max(0, B - 35)},${Math.random() * .3})`; x.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}

const P = PLANETS.map(p => ({
  id: p.id, n: p.name, cn: p.nameCn.split('—')[0].trim(), cnFull: p.nameCn, col: h2n(p.color),
  r: p.radius, d: p.distance, s: p.speed, tilt: p.tilt, rotP: p.rotationPeriod,
  sun: p.isSun ? 1 : 0, gas: p.textureType === 'gas' ? 1 : 0, ring: p.hasRing ? 1 : 0,
  stats: p.stats, fact: p.fact, texType: p.textureType,
  eccentricity: p.eccentricity ?? 0, orbitalIncl: p.orbitalIncl ?? 0,
  argPerihelion: p.argPerihelion ?? 0, longAscNode: p.longAscNode ?? 0,
}));

const PR = PROBES.map((p, idx) => {
  const fb = p.fallbackPosition;
  if ('orbitPlanetId' in fb) {
    const pi = PLANETS.findIndex(pp => pp.id === fb.orbitPlanetId);
    return { n: p.name, cn: p.nameCn, col: h2n(p.color), orb: pi, od: fb.orbitDist, desc: p.desc, launched: p.launched, dist: 0, ang: 0, y: 0, emoji: p.emoji };
  }
  return { n: p.name, cn: p.nameCn, col: h2n(p.color), dist: fb.distance, ang: fb.angle, y: (idx % 3 - 1) * 6, desc: p.desc, launched: p.launched, orb: undefined as number | undefined, od: 0, emoji: p.emoji };
});

export default function App() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const iNameRef = useRef<HTMLDivElement>(null);
  const iSubRef = useRef<HTMLDivElement>(null);
  const iGridRef = useRef<HTMLDivElement>(null);
  const iFactRef = useRef<HTMLDivElement>(null);
  const iExtrasRef = useRef<HTMLDivElement>(null);
  const playBtnRef = useRef<HTMLButtonElement>(null);
  const spdTxtRef = useRef<HTMLDivElement>(null);
  const tSliderRef = useRef<HTMLInputElement>(null);
  const satCountRef = useRef<HTMLSpanElement>(null);
  const lSatRef = useRef<HTMLButtonElement>(null);
  // (lProbeRef removed — probe toggle is now in satellite panel)
  const labelsRef = useRef<HTMLDivElement>(null);
  const satBracketsRef = useRef<HTMLDivElement>(null);
  const helpersRef = useRef<HTMLDivElement>(null);
  const [satListOpen, setSatListOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [toast, setToast] = useState<{ title: string; text: string } | null>(null);
  const [satTab, setSatTab] = useState('beidou');
  const [starlinkLoading, setStarlinkLoading] = useState(false);
  const [starlinkProgress, setStarlinkProgress] = useState(0);
  const [probesVisible, setProbesVisible] = useState(false);
  const [satellites, setSatellites] = useState<SatRecord[]>([]);
  const [satGroups, setSatGroups] = useState<Record<string, boolean>>({ beidou: true, stations: true, gps: false, starlink: false, visual: false });

  // Store refs accessible from inside useEffect
  const satDataRef = useRef<{
    sats: SatRecord[]; meshes: THREE.Mesh[]; groups: Record<string, boolean>;
    orbitLines: THREE.Line[]; trailLines: THREE.Line[];
    starlinkPoints?: THREE.Points; starlinkSats?: SatRecord[]; starlinkPositions?: Float32Array;
  }>({ sats: [], meshes: [], groups: { beidou: true, stations: true, gps: false, starlink: false, visual: false }, orbitLines: [], trailLines: [] });

  useEffect(() => {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .1, 2000);
    const ren = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    ren.setSize(innerWidth, innerHeight); ren.setPixelRatio(Math.min(devicePixelRatio, 2));
    ren.toneMapping = THREE.ACESFilmicToneMapping; ren.toneMappingExposure = 1.4;
    canvasRef.current!.appendChild(ren.domElement);
    ren.domElement.style.touchAction = 'none'; // prevent browser gestures on canvas
    cam.position.set(0, 55, 75); cam.lookAt(0, 0, 0);
    // Ambient — lights the night/shadow side so it's visible but darker
    scene.add(new THREE.AmbientLight(0x405060, .6));
    // Sun point light — no decay, so ALL planets get full daylight on the sun-facing side
    const sunL = new THREE.PointLight(0xFFF5E0, 4.0, 0, 0); scene.add(sunL);
    // Camera fill light — lights planet from all angles when zoomed in, fades when zoomed out
    const camLight = new THREE.PointLight(0xFFFFFF, 0, 0, 0);
    cam.add(camLight);
    scene.add(cam);

    // Multi-track space ambient audio
    const TRACKS = [
      { file: 'space-ambient.mp3', name: '深空漂流' },
      { file: 'cosmic-drift.mp3', name: '星际穿越' },
      { file: 'stellar-pulse.mp3', name: '脉冲星' },
      { file: 'solar-wind.mp3', name: '太阳风' },
      { file: 'deep-nebula.mp3', name: '星云深处' },
    ];
    let currentTrack = 0;
    const audio = new Audio(BASE + 'audio/' + TRACKS[0].file);
    audio.loop = true;
    audio.volume = 0.15;
    const startAudio = () => { audio.play().catch(() => {}); document.removeEventListener('click', startAudio); };
    document.addEventListener('click', startAudio);

    (window as any).__toggleSound = () => {
      audio.muted = !audio.muted;
      const btn = document.getElementById('__soundBtn');
      if (btn) { btn.textContent = audio.muted ? '静音' : '音效'; btn.classList.toggle('on', !audio.muted); }
    };
    (window as any).__setTrack = (idx: number) => {
      currentTrack = idx;
      const wasPlaying = !audio.paused;
      audio.src = BASE + 'audio/' + TRACKS[idx].file;
      audio.loop = true;
      if (wasPlaying) audio.play().catch(() => {});
    };
    (window as any).__setVolume = (v: number) => { audio.volume = v; };
    (window as any).__getTracks = () => TRACKS;
    (window as any).__getCurrentTrack = () => currentTrack;

    const loader = new THREE.TextureLoader();

    // Stars — fade out when zoomed to galactic scale
    const starLayers: THREE.Points[] = [];
    const starBaseOpacities: number[] = [];
    function makeStars(count: number, size: number, op: number, minR: number, maxR: number) {
      const g = new THREE.BufferGeometry(), pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const r = minR + Math.random() * (maxR - minR), th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th); pos[i * 3 + 2] = r * Math.cos(ph);
      }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ color: 0xFFFFFF, size, sizeAttenuation: true, transparent: true, opacity: op });
      const pts = new THREE.Points(g, mat);
      scene.add(pts);
      starLayers.push(pts);
      starBaseOpacities.push(op);
    }
    makeStars(4000, .8, .7, 800, 3000);
    makeStars(2000, 1.5, .35, 3000, 8000);
    makeStars(1500, 2.5, .2, 8000, 30000); // distant stars — fill gap before MW appears

    // ═══════ MILKY WAY + DEEP SPACE ═══════
    // Scale calculation:
    //   Neptune orbit radius = 74 scene units ≈ 30 AU
    //   1 light-year = 63,241 AU → 1 ly ≈ 74 * 63241/30 ≈ 155,860 scene units
    //   Milky Way diameter ≈ 100,000 ly → 100,000 * 155,860 = too large
    //   We use 200,000 scene units for the MW plane (compressed but still enormous)
    //   Solar system becomes invisible (sun < 1px) at cD ≈ 50,000
    //   MW plane fills screen at cD ≈ 100,000-200,000
    //
    //   Sun position in NASA milky_way.png: approximately 62% from left, 48% from top
    // Sun at pixel (675, 310) on 1024x1024 image, center at (508, 509)
    // Offset from center: dx = (675-508)/1024 = +0.163, dy = (310-509)/1024 = -0.194
    // Plane rotated -90° on X: local X→world X, local Y→world -Z
    // So plane center must be shifted so origin lands on the sun position:
    //   world X = -dx * MW_SIZE, world Z = +dy * MW_SIZE

    const MW_SIZE = 200000;
    const milkyWayPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(MW_SIZE, MW_SIZE),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
    );
    milkyWayPlane.rotation.x = -Math.PI / 2;
    milkyWayPlane.position.set(-0.163 * MW_SIZE, 0, 0.194 * MW_SIZE);
    milkyWayPlane.visible = false;
    scene.add(milkyWayPlane);
    loader.load(`${BASE}textures/milkyway.png`, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      (milkyWayPlane.material as THREE.MeshBasicMaterial).map = tex;
      (milkyWayPlane.material as THREE.MeshBasicMaterial).needsUpdate = true;
    });

    // Solar system marker — tiny glowing dot, visible when sun is sub-pixel
    // Simple gold pixel dot — visible when sun is sub-pixel at galaxy scale
    const solarMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xFFD700 })
    );
    solarMarker.visible = false;
    scene.add(solarMarker);

    // Deep space background
    const deepSpaceSphere = new THREE.Mesh(
      new THREE.SphereGeometry(500000, 32, 32),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false })
    );
    deepSpaceSphere.visible = false;
    scene.add(deepSpaceSphere);
    loader.load(`${BASE}textures/deepspace.jpg`, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      (deepSpaceSphere.material as THREE.MeshBasicMaterial).map = tex;
      (deepSpaceSphere.material as THREE.MeshBasicMaterial).needsUpdate = true;
    });

    // ═══════ LOAD TEXTURE WITH FALLBACK ═══════
    function loadTex(id: string, col: number, type: 'sun' | 'gas' | 'rock'): THREE.Texture {
      const fallback = procTex(col, type);
      const file = TEX_FILES[id];
      if (!file) return fallback;
      // Start async load; texture will hot-swap when ready
      loader.load(`${BASE}textures/${file}`, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        // Swap into the material
        const mesh = meshes[P.findIndex(p => p.id === id)];
        if (mesh) {
          const mat = mesh.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
          mat.map = t; mat.needsUpdate = true;
        }
      }, undefined, () => { /* file not found, keep fallback */ });
      return fallback;
    }

    // ═══════ PLANETS ═══════
    const meshes: THREE.Mesh[] = [];
    const glowMeshes: THREE.Mesh[] = [];
    const orbitLines: (THREE.Line | Line2)[] = [];
    // (glow outlines removed)
    let earthCloudMesh: THREE.Mesh | null = null;
    let moonMesh: THREE.Mesh | null = null;
    let moonOrbitLine: THREE.Line | null = null;
    // earthAtmoMesh removed — cloud layer is sufficient

    P.forEach((p, i) => {
      const t = loadTex(p.id, p.col, p.texType);
      // Per-type material tuning: rocky planets get lower roughness for specular highlight (clear day/night),
      // gas giants stay rough (diffuse glow). Earth gets special treatment for the "blue marble" look.
      // Fully diffuse — no specular glare. Sun light creates clean half-sphere illumination.
      // Neutral dark emissive so textures show without blue/color tint from the old procedural base.
      const mat = p.sun
        ? new THREE.MeshBasicMaterial({ map: t })
        : new THREE.MeshStandardMaterial({
            map: t,
            roughness: 1.0,   // matte — no glass marble reflection
            metalness: 0,     // non-metallic
            emissive: 0x222222,
            emissiveIntensity: .12, // baseline glow so planets never disappear completely
          });
      const m = new THREE.Mesh(new THREE.SphereGeometry(p.r, 64, 64), mat);

      // Atmosphere glow — based on Three.js official Earth example (webgpu_tsl_earth)
      // Ported from TSL to GLSL: BackSide sphere, fresnel remap, sun-aware color blend
      const ATMO_VERT = `
        varying vec3 vNormalW;
        varying vec3 vPosW;
        void main() {
          vNormalW = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          vPosW = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `;
      const ATMO_FRAG = `
        uniform vec3 dayColor;
        uniform vec3 twilightColor;
        uniform vec3 sunPos;
        uniform vec3 camPos;
        uniform float fresnelLow;   // remap lower edge (default 0.73)
        uniform float fresnelPow;   // pow exponent (default 3.0)
        uniform float sunFadeMin;   // smoothstep min (default -0.5)
        uniform float sunFadeMax;   // smoothstep max (default 1.0)
        uniform float isSun;
        varying vec3 vNormalW;
        varying vec3 vPosW;
        void main() {
          vec3 viewDir = normalize(vPosW - camPos);
          vec3 n = normalize(vNormalW);
          float fresnel = 1.0 - abs(dot(viewDir, n));

          if (isSun > 0.5) {
            // Sun: simple radial glow, no sun-awareness
            float alpha = pow(max(1.0 - (fresnel - fresnelLow) / (1.0 - fresnelLow), 0.0), fresnelPow);
            gl_FragColor = vec4(dayColor, alpha);
            return;
          }

          vec3 sunDir = normalize(sunPos - vPosW);
          float sunOrientation = dot(n, sunDir);

          // Color: blend twilight → day based on sun angle
          vec3 atmosphereColor = mix(twilightColor, dayColor, smoothstep(-0.25, 0.75, sunOrientation));

          // Alpha: remap fresnel — visible at rim, transparent at very edge
          float remapped = 1.0 - (fresnel - fresnelLow) / (1.0 - fresnelLow);
          float alpha = pow(max(remapped, 0.0), fresnelPow);

          // Sun modulation: fade out on shadow side
          alpha *= smoothstep(sunFadeMin, sunFadeMax, sunOrientation);

          gl_FragColor = vec4(atmosphereColor, alpha);
        }
      `;

      interface AtmoCfg {
        scale: number;
        dayColor: [number, number, number];
        twilightColor: [number, number, number];
        fresnelLow: number;
        fresnelPow: number;
        sunFadeMin: number;
        sunFadeMax: number;
        isSun?: boolean;
      }
      function addAtmosphere(parent: THREE.Mesh, cfg: AtmoCfg) {
        const mat = new THREE.ShaderMaterial({
          uniforms: {
            dayColor: { value: new THREE.Vector3(...cfg.dayColor) },
            twilightColor: { value: new THREE.Vector3(...cfg.twilightColor) },
            sunPos: { value: new THREE.Vector3() },
            camPos: { value: new THREE.Vector3() },
            fresnelLow: { value: cfg.fresnelLow },
            fresnelPow: { value: cfg.fresnelPow },
            sunFadeMin: { value: cfg.sunFadeMin },
            sunFadeMax: { value: cfg.sunFadeMax },
            isSun: { value: cfg.isSun ? 1.0 : 0.0 },
          },
          vertexShader: ATMO_VERT,
          fragmentShader: ATMO_FRAG,
          side: THREE.BackSide,
          transparent: true,
          depthWrite: false,
        });
        const gm = new THREE.Mesh(new THREE.SphereGeometry(p.r * cfg.scale, 48, 48), mat);
        gm.userData.isGlow = true;
        gm.userData.glowMat = mat;
        gm.userData.planetId = p.id;
        parent.add(gm);
        glowMeshes.push(gm);
      }

      // Surface atmosphere haze — FrontSide, covers sunlit hemisphere
      // Matches Three.js example: atmosphereMix = fresnel^2 * smoothstep(-0.5, 1, sunOrientation)
      const SURFACE_ATMO_FRAG = `
        uniform vec3 dayColor;
        uniform vec3 twilightColor;
        uniform vec3 sunPos;
        uniform vec3 camPos;
        uniform float strength;
        varying vec3 vNormalW;
        varying vec3 vPosW;
        void main() {
          vec3 viewDir = normalize(vPosW - camPos);
          vec3 n = normalize(vNormalW);
          vec3 sunDir = normalize(sunPos - vPosW);
          float fresnel = 1.0 - abs(dot(viewDir, n));
          float sunOrientation = dot(n, sunDir);
          vec3 atmoColor = mix(twilightColor, dayColor, smoothstep(-0.25, 0.75, sunOrientation));
          float atmosphereMix = fresnel * fresnel * smoothstep(-0.5, 1.0, sunOrientation) * strength;
          gl_FragColor = vec4(atmoColor, atmosphereMix);
        }
      `;
      function addSurfaceAtmo(parent: THREE.Mesh, dayCol: [number,number,number], twiCol: [number,number,number], strength: number) {
        const mat = new THREE.ShaderMaterial({
          uniforms: {
            dayColor: { value: new THREE.Vector3(...dayCol) },
            twilightColor: { value: new THREE.Vector3(...twiCol) },
            sunPos: { value: new THREE.Vector3() },
            camPos: { value: new THREE.Vector3() },
            strength: { value: strength },
          },
          vertexShader: ATMO_VERT,
          fragmentShader: SURFACE_ATMO_FRAG,
          side: THREE.FrontSide,
          transparent: true,
          depthWrite: false,
        });
        const gm = new THREE.Mesh(new THREE.SphereGeometry(p.r * 1.01, 48, 48), mat);
        gm.renderOrder = 999;
        gm.userData.isGlow = true;
        gm.userData.glowMat = mat;
        gm.userData.planetId = p.id;
        parent.add(gm);
        glowMeshes.push(gm);
      }

      // Parameters from Three.js official example + tuned per planet
      if (p.sun) {
        addAtmosphere(m, { scale: 1.15, dayColor: [1, .85, .3], twilightColor: [1, .4, .1],
          fresnelLow: 0.5, fresnelPow: 2.0, sunFadeMin: -1, sunFadeMax: 1, isSun: true });
      } else if (p.id === 'earth') {
        addAtmosphere(m, { scale: 1.03, dayColor: [.3, .7, 1], twilightColor: [.74, .29, .04],
          fresnelLow: 0.73, fresnelPow: 3.0, sunFadeMin: -0.5, sunFadeMax: 1.0 });
        addSurfaceAtmo(m, [.3, .7, 1], [.74, .29, .04], 0.7);
      } else if (p.id === 'venus') {
        addAtmosphere(m, { scale: 1.06, dayColor: [.9, .75, .4], twilightColor: [.8, .4, .1],
          fresnelLow: 0.65, fresnelPow: 2.5, sunFadeMin: -0.5, sunFadeMax: 1.0 });
        addSurfaceAtmo(m, [.9, .75, .4], [.8, .4, .1], 0.6);
      } else if (p.id === 'mars') {
        addAtmosphere(m, { scale: 1.03, dayColor: [.8, .5, .3], twilightColor: [.6, .2, .05],
          fresnelLow: 0.75, fresnelPow: 3.5, sunFadeMin: -0.5, sunFadeMax: 1.0 });
        addSurfaceAtmo(m, [.8, .5, .3], [.6, .2, .05], 0.3);
      } else if (p.id === 'jupiter') {
        addAtmosphere(m, { scale: 1.05, dayColor: [.8, .65, .35], twilightColor: [.6, .3, .1],
          fresnelLow: 0.7, fresnelPow: 3.0, sunFadeMin: -0.5, sunFadeMax: 1.0 });
        addSurfaceAtmo(m, [.8, .65, .35], [.6, .3, .1], 0.5);
      } else if (p.id === 'saturn') {
        addAtmosphere(m, { scale: 1.05, dayColor: [.9, .8, .5], twilightColor: [.7, .4, .1],
          fresnelLow: 0.7, fresnelPow: 3.0, sunFadeMin: -0.5, sunFadeMax: 1.0 });
        addSurfaceAtmo(m, [.9, .8, .5], [.7, .4, .1], 0.5);
      } else if (p.id === 'uranus') {
        addAtmosphere(m, { scale: 1.04, dayColor: [.4, .75, .85], twilightColor: [.2, .4, .5],
          fresnelLow: 0.72, fresnelPow: 3.0, sunFadeMin: -0.5, sunFadeMax: 1.0 });
        addSurfaceAtmo(m, [.4, .75, .85], [.2, .4, .5], 0.5);
      } else if (p.id === 'neptune') {
        addAtmosphere(m, { scale: 1.04, dayColor: [.25, .4, .9], twilightColor: [.15, .1, .5],
          fresnelLow: 0.72, fresnelPow: 3.0, sunFadeMin: -0.5, sunFadeMax: 1.0 });
        addSurfaceAtmo(m, [.25, .4, .9], [.15, .1, .5], 0.5);
      }

      // Earth: atmosphere + clouds as CHILDREN — they inherit scale/position automatically.
      // depthWrite:false on both prevents them from occluding the Earth surface.
      if (p.id === 'earth') {
        earthCloudMesh = new THREE.Mesh(
          new THREE.SphereGeometry(p.r * 1.015, 48, 48),
          new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5, depthWrite: false, color: 0xffffff, roughness: 1, metalness: 0 })
        );
        earthCloudMesh.renderOrder = 998;
        m.add(earthCloudMesh);
        loader.load(`${BASE}textures/earth_clouds.jpg`, (ct) => {
          ct.colorSpace = THREE.SRGBColorSpace;
          (earthCloudMesh!.material as THREE.MeshStandardMaterial).map = ct;
          (earthCloudMesh!.material as THREE.MeshStandardMaterial).needsUpdate = true;
        }, undefined, () => {});

        // Moon — orbits Earth
        const moonMat = new THREE.MeshStandardMaterial({
          roughness: 1,
          metalness: 0,
          emissive: 0x111111,
          emissiveIntensity: 0.08,
        });
        moonMesh = new THREE.Mesh(new THREE.SphereGeometry(0.27, 32, 32), moonMat);
        moonMesh.userData = {
          id: 'moon', n: 'Moon', cn: '月球', cnFull: '月球 — 地球的天然卫星',
          isMoon: true, isPlanet: false,
          stats: { '直径': '3,474 km', '距地球': '384,400 km', '公转周期': '27.3 天', '质量': '7.35 × 10²² kg' },
          fact: '月球是地球唯一的天然卫星，也是夜空中最亮的天体。月球的自转周期与公转周期相同，所以我们始终只能看到月球的同一面。',
        };
        scene.add(moonMesh);
        loader.load(`${BASE}textures/${TEX_FILES.moon}`, (mt) => {
          mt.colorSpace = THREE.SRGBColorSpace;
          moonMat.map = mt; moonMat.needsUpdate = true;
        }, undefined, () => {});

        // Moon orbit line (circle around Earth, updated in animation loop)
        const moonOrbitGeo = new THREE.BufferGeometry();
        const moonOrbitPts: number[] = [];
        for (let j = 0; j <= 128; j++) {
          const angle = (j / 128) * Math.PI * 2;
          moonOrbitPts.push(Math.cos(angle) * 60.3, 0, Math.sin(angle) * 60.3);
        }
        moonOrbitGeo.setAttribute('position', new THREE.Float32BufferAttribute(moonOrbitPts, 3));
        moonOrbitLine = new THREE.Line(moonOrbitGeo, new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.25 }));
        scene.add(moonOrbitLine);
      }

      if (p.ring) {
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xD4C090, side: THREE.DoubleSide, transparent: true, opacity: .4 });
        // Try loading ring texture
        loader.load(`${BASE}textures/saturn_ring.png`, (rt) => {
          rt.colorSpace = THREE.SRGBColorSpace; ringMat.map = rt; ringMat.needsUpdate = true;
        }, undefined, () => {});
        const rg = new THREE.Mesh(new THREE.RingGeometry(p.r * 1.4, p.r * 2.3, 80), ringMat);
        rg.rotation.x = Math.PI / 2; m.add(rg);
      }

      m.rotation.z = (p.tilt || 0) * Math.PI / 180;
      m.userData = { ...p, idx: i, isPlanet: true };
      scene.add(m); meshes.push(m);

      if (!p.sun) {
        const op: number[] = [];
        const ecc = p.eccentricity ?? 0;
        const incl = (p.orbitalIncl ?? 0) * Math.PI / 180;
        const omega = (p.argPerihelion ?? 0) * Math.PI / 180;
        const Omega = (p.longAscNode ?? 0) * Math.PI / 180;
        for (let j = 0; j <= 200; j++) {
          const nu = (j / 200) * Math.PI * 2;
          const r = p.d * (1 - ecc * ecc) / (1 + ecc * Math.cos(nu));
          const xO = r * Math.cos(nu + omega), yO = r * Math.sin(nu + omega);
          op.push(
            xO * Math.cos(Omega) - yO * Math.cos(incl) * Math.sin(Omega),
            yO * Math.sin(incl),
            xO * Math.sin(Omega) + yO * Math.cos(incl) * Math.cos(Omega)
          );
        }
        const lg = new LineGeometry();
        lg.setPositions(op);
        const lm = new LineMaterial({
          color: darkenHex(p.col, 0.45),
          linewidth: 1.5,
          resolution: new THREE.Vector2(innerWidth, innerHeight),
        });
        const ol = new Line2(lg, lm);
        scene.add(ol); orbitLines.push(ol);
      }
    });

    // ═══ GLOW TUNING GUI ═══
    const glowPanel = document.createElement('div');
    glowPanel.id = 'glow-panel';
    glowPanel.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:9999;background:rgba(0,0,0,.85);color:#ddd;padding:10px 14px;border-radius:8px;font:11px monospace;max-height:90vh;overflow-y:auto;display:none;min-width:320px';
    const glowTitle = document.createElement('div');
    glowTitle.style.cssText = 'font-size:13px;font-weight:bold;margin-bottom:8px;color:#5EEAD4;cursor:pointer';
    glowTitle.textContent = '🔆 Glow Tuner (click planet name to focus)';
    glowPanel.appendChild(glowTitle);

    // Group by planet
    const planetIds = [...new Set(glowMeshes.map(gm => gm.userData.planetId))];
    planetIds.forEach(pid => {
      const meshesForPlanet = glowMeshes.filter(gm => gm.userData.planetId === pid);
      meshesForPlanet.forEach((gm) => {
        const mat = gm.userData.glowMat as THREE.ShaderMaterial;
        const u = mat.uniforms;
        const row = document.createElement('div');
        row.style.cssText = 'margin:6px 0;border-bottom:1px solid #333;padding-bottom:6px';
        const layerType = mat.side === THREE.BackSide ? 'rim' : 'surface';
        const label = document.createElement('div');
        label.style.cssText = 'color:#5EEAD4;cursor:pointer;margin-bottom:4px';
        label.textContent = `${pid} [${layerType}]`;
        label.onclick = () => {
          const idx = P.findIndex(pp => pp.id === pid);
          if (idx >= 0) focusObj(idx);
        };
        row.appendChild(label);

        function addSlider(name: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void) {
          const wrap = document.createElement('div');
          wrap.style.cssText = 'display:flex;align-items:center;gap:4px;margin:2px 0';
          const lbl = document.createElement('span');
          lbl.style.cssText = 'width:40px;text-align:right;color:#888';
          lbl.textContent = name;
          const sl = document.createElement('input');
          sl.type = 'range'; sl.min = String(min); sl.max = String(max); sl.step = String(step);
          sl.value = String(get());
          sl.style.cssText = 'flex:1;height:14px';
          const val = document.createElement('span');
          val.style.cssText = 'width:40px;font-size:10px';
          val.textContent = get().toFixed(2);
          sl.oninput = () => { set(parseFloat(sl.value)); val.textContent = parseFloat(sl.value).toFixed(2); };
          wrap.append(lbl, sl, val);
          row.appendChild(wrap);
        }

        if (u.fresnelLow) addSlider('fLow', 0, 1, 0.01, () => u.fresnelLow.value, v => u.fresnelLow.value = v);
        if (u.fresnelPow) addSlider('fPow', 0.5, 8, 0.1, () => u.fresnelPow.value, v => u.fresnelPow.value = v);
        addSlider('scale', 1.0, 1.5, 0.01, () => gm.scale.x, v => gm.scale.setScalar(v));
        if (u.sunFadeMin) addSlider('sFdMn', -1, 1, 0.05, () => u.sunFadeMin.value, v => u.sunFadeMin.value = v);
        if (u.sunFadeMax) addSlider('sFdMx', -1, 1, 0.05, () => u.sunFadeMax.value, v => u.sunFadeMax.value = v);
        if (u.strength) addSlider('str', 0, 2, 0.05, () => u.strength.value, v => u.strength.value = v);
        addSlider('dayR', 0, 1, 0.01, () => u.dayColor.value.x, v => u.dayColor.value.x = v);
        addSlider('dayG', 0, 1, 0.01, () => u.dayColor.value.y, v => u.dayColor.value.y = v);
        addSlider('dayB', 0, 1, 0.01, () => u.dayColor.value.z, v => u.dayColor.value.z = v);
        if (u.twilightColor) {
          addSlider('twiR', 0, 1, 0.01, () => u.twilightColor.value.x, v => u.twilightColor.value.x = v);
          addSlider('twiG', 0, 1, 0.01, () => u.twilightColor.value.y, v => u.twilightColor.value.y = v);
          addSlider('twiB', 0, 1, 0.01, () => u.twilightColor.value.z, v => u.twilightColor.value.z = v);
        }
        glowPanel.appendChild(row);
      });
    });

    // Export button
    const exportBtn = document.createElement('button');
    exportBtn.textContent = '📋 Export values';
    exportBtn.style.cssText = 'margin-top:8px;padding:4px 10px;background:#333;color:#5EEAD4;border:1px solid #555;border-radius:4px;cursor:pointer;font:11px monospace';
    exportBtn.onclick = () => {
      const out: Record<string, any[]> = {};
      glowMeshes.forEach(gm => {
        const mat = gm.userData.glowMat as THREE.ShaderMaterial;
        const u = mat.uniforms;
        const pid = gm.userData.planetId;
        if (!out[pid]) out[pid] = [];
        const entry: any = { type: mat.side === THREE.BackSide ? 'rim' : 'surface', scale: +gm.scale.x.toFixed(3) };
        if (u.fresnelLow) entry.fresnelLow = +u.fresnelLow.value.toFixed(2);
        if (u.fresnelPow) entry.fresnelPow = +u.fresnelPow.value.toFixed(1);
        if (u.sunFadeMin) entry.sunFadeMin = +u.sunFadeMin.value.toFixed(2);
        if (u.sunFadeMax) entry.sunFadeMax = +u.sunFadeMax.value.toFixed(2);
        if (u.strength) entry.strength = +u.strength.value.toFixed(2);
        entry.dayColor = [+u.dayColor.value.x.toFixed(2), +u.dayColor.value.y.toFixed(2), +u.dayColor.value.z.toFixed(2)];
        if (u.twilightColor) entry.twilightColor = [+u.twilightColor.value.x.toFixed(2), +u.twilightColor.value.y.toFixed(2), +u.twilightColor.value.z.toFixed(2)];
        out[pid].push(entry);
      });
      console.log('GLOW CONFIG:', JSON.stringify(out, null, 2));
      navigator.clipboard?.writeText(JSON.stringify(out, null, 2));
    };
    glowPanel.appendChild(exportBtn);
    document.body.appendChild(glowPanel);

    // Toggle with G key
    window.addEventListener('keydown', e => { if (e.key === 'g' || e.key === 'G') glowPanel.style.display = glowPanel.style.display === 'none' ? 'block' : 'none'; });

    // ═══════ NATURAL MOONS (all except Earth's Moon) ═══════
    const naturalMoonMeshes: THREE.Mesh[] = [];
    const naturalMoonData: typeof NATURAL_MOONS = [];
    const naturalMoonOrbits: THREE.Line[] = [];
    NATURAL_MOONS.forEach(nm => {
      if (nm.id === 'moon') return; // Earth's Moon is already created with special handling
      const parentIdx = P.findIndex(p => p.id === nm.parentId);
      if (parentIdx < 0) return;
      const parentP = P[parentIdx];
      const parentPlanet = PLANETS.find(p => p.id === nm.parentId);
      if (!parentPlanet) return;
      // Moon visual radius = parentVisualRadius * (moonRadiusKm / parentRealRadiusKm) * 5
      const visualR = Math.max(0.05, parentP.r * (nm.radiusKm / parentPlanet.realRadiusKm) * 5);
      const mat = new THREE.MeshStandardMaterial({
        color: h2n(nm.color),
        roughness: 1,
        metalness: 0,
        emissive: 0x111111,
        emissiveIntensity: 0.08,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(visualR, 24, 24), mat);
      mesh.userData = {
        id: nm.id, n: nm.name, cn: nm.nameCn, cnFull: `${nm.nameCn} — ${nm.name}`,
        isNaturalMoon: true, isPlanet: false, parentIdx,
        fact: nm.fact,
        stats: {
          '半径': `${nm.radiusKm.toLocaleString()} km`,
          '距母星': `${nm.distanceKm.toLocaleString()} km`,
          '公转周期': `${nm.orbitalPeriodDays} 天`,
        },
        visualR,
      };
      scene.add(mesh);
      naturalMoonMeshes.push(mesh);
      naturalMoonData.push(nm);

      // Orbit line for this natural moon (reuse parentPlanet from above)
      if (parentPlanet) {
        const distR2 = nm.distanceKm / parentPlanet.realRadiusKm;
        const orbitR2 = distR2 * parentP.r;
        const nmOrbitGeo = new THREE.BufferGeometry();
        const nmOrbitPts: number[] = [];
        for (let a = 0; a <= 64; a++) {
          const ang = (a / 64) * Math.PI * 2;
          nmOrbitPts.push(Math.cos(ang) * orbitR2, 0, Math.sin(ang) * orbitR2);
        }
        nmOrbitGeo.setAttribute('position', new THREE.Float32BufferAttribute(nmOrbitPts, 3));
        const nmOrbitLine = new THREE.Line(nmOrbitGeo, new THREE.LineBasicMaterial({
          color: parseInt(nm.color.replace('#', ''), 16), transparent: true, opacity: 0.2
        }));
        nmOrbitLine.userData = { parentIdx, isNaturalMoonOrbit: true };
        scene.add(nmOrbitLine);
        naturalMoonOrbits.push(nmOrbitLine);
      }
    });

    // ═══════ HELPERS (selection circles for small planets/moons) ═══════
    let showHelpers = true;
    (window as any).__toggleHelpers = () => {
      showHelpers = !showHelpers;
      document.getElementById('__helperBtn')?.classList.toggle('on', showHelpers);
    };

    // ═══════ ORBIT TOGGLES ═══════
    let showOrbits = true; // default on
    (window as any).__toggleOrbits = () => {
      showOrbits = !showOrbits;
      document.getElementById('__orbitBtn')?.classList.toggle('on', showOrbits);
      // Planet orbits
      orbitLines.forEach(ol => { ol.visible = showOrbits; });
      // Natural moon orbits
      naturalMoonOrbits.forEach(ol => { ol.visible = showOrbits; });
      // Moon orbit line
      if (moonOrbitLine) moonOrbitLine.visible = showOrbits;
      // Satellite orbits — compute on first toggle, lazy-loaded
      if (showOrbits && satDataRef.current.orbitLines.length === 0 && satDataRef.current.sats.length > 0) {
        computeSatOrbits();
      }
      satDataRef.current.orbitLines.forEach(ol => {
        const gid = ol.userData.groupId;
        ol.visible = showOrbits && (satDataRef.current.groups[gid] ?? false);
      });
    };

    function computeSatOrbits() {
      const sd = satDataRef.current;
      const visibleSats = sd.sats.filter(s => sd.groups[s.groupId]);
      const now = new Date(simStartMs + t * 1000);
      const lines: THREE.Line[] = [];
      visibleSats.forEach(sat => {
        const sr = sat.satrec as any;
        const periodMin = sr.no ? (2 * Math.PI / sr.no) : 90;
        const pts: THREE.Vector3[] = [];
        for (let s = 0; s <= 48; s++) {
          const d = new Date(now.getTime() + (s / 48) * periodMin * 60000);
          const eci = getSatPositionECI(sat, d);
          if (!eci) continue;
          const pos = eciToScene(eci, { x: 0, y: 0, z: 0 }, earthSceneR, 1);
          pts.push(new THREE.Vector3(pos.x, pos.y, pos.z));
        }
        if (pts.length > 2) {
          const geo = new THREE.BufferGeometry().setFromPoints(pts);
          const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: sat.color, transparent: true, opacity: .15 }));
          line.userData = { isSatOrbit: true, groupId: sat.groupId };
          scene.add(line);
          lines.push(line);
        }
      });
      sd.orbitLines = lines;
    }

    // ═══════ PROBES ═══════
    const probeMeshes: THREE.Mesh[] = [];
    // Map PR index to probe ID from PROBES data
    const probeIds = PROBES.map(p => p.id);
    PR.forEach((pr, i) => {
      const probeId = probeIds[i] || 'default';
      const pm = createProbeModel(probeId, pr.col) as any as THREE.Mesh;
      // Scale probes to be visible but much smaller than planets
      // Real probes are ~10-20m, Earth radius = 6371km = 1 scene unit
      // We exaggerate to ~0.05 scene units (~318km) for visibility
      // Real probes are ~10-20m. Earth radius = 1 scene unit = 6371km.
      // Visible scale: 0.02 = ~127km — still hugely exaggerated but much better than 0.15
      pm.scale.setScalar(0.02);
      pm.userData = { ...pr, isProbe: true, probeIdx: i };
      scene.add(pm); probeMeshes.push(pm);
    });

    // ═══════ SATELLITES ═══════
    const satMeshes: THREE.Mesh[] = [];
    const earthP = P.find(p => p.id === 'earth')!;
    const earthSceneR = earthP.r;

    const TRAIL_LEN = 30; // number of trail positions to keep
    const satTrails: Float32Array[] = []; // flat xyz arrays per satellite
    const satTrailLines: THREE.Line[] = [];
    const satTrailIdx: number[] = [];
    const satTrailReady: boolean[] = []; // true after first full trail computation

    fetchAllSatellites().then(sats => {
      setSatellites(sats);
      satDataRef.current.sats = sats;
      satCountRef.current!.textContent = `${sats.length} 颗卫星追踪中`;

      sats.forEach(sat => {
        const displayName = getSatDisplayName(sat.name, sat.noradId);
        const colNum = typeof sat.color === 'string' ? parseInt(sat.color.replace('#', ''), 16) : sat.color;
        const sm = createSatelliteModel(colNum, sat.groupId) as any as THREE.Mesh;
        sm.userData = { isSat: true, name: sat.name, displayName, groupId: sat.groupId, color: sat.color, satIdx: satMeshes.length };
        sm.visible = false; // invisible until first valid SGP4 position
        scene.add(sm);
        satMeshes.push(sm);

        // Trail with fading shader
        const trailArr = new Float32Array(TRAIL_LEN * 3);
        satTrails.push(trailArr);
        satTrailIdx.push(0);
        satTrailReady.push(false);
        const trailGeo = new THREE.BufferGeometry();
        trailGeo.setAttribute('position', new THREE.BufferAttribute(trailArr, 3));
        trailGeo.setAttribute('trailIndex', createTrailIndexAttribute(TRAIL_LEN));
        trailGeo.setDrawRange(0, 0);
        const trailMat = createTrailMaterial('#ffffff'); // white contrail
        const trailLine = new THREE.Line(trailGeo, trailMat);
        trailLine.visible = false; // shown when satellite gets first valid position
        trailLine.frustumCulled = false;
        scene.add(trailLine);
        satTrailLines.push(trailLine);
      });
      satDataRef.current.meshes = satMeshes;
      satDataRef.current.trailLines = satTrailLines;

      // Add satellite labels to the label system
      sats.forEach((sat, i) => {
        const dn = getSatDisplayName(sat.name, sat.noradId);
        allLabelTargets.push({ mesh: satMeshes[i], text: dn, type: 'sat' });
        const el = document.createElement('div');
        el.className = 'scene-label sat-label';
        el.textContent = dn;
        el.style.display = 'none';
        labelsRef.current!.appendChild(el);
        labelEls.push(el);
      });
    });

    // Toggle satellite group visibility
    (window as any).__toggleSatGroup = async (gid: string) => {
      const g = satDataRef.current.groups;
      g[gid] = !g[gid];
      setSatGroups({ ...g });

      // On-demand load for Starlink: use THREE.Points for 10,000+ satellites (single draw call)
      if (gid === 'starlink' && g[gid] && !satDataRef.current.starlinkPoints) {
        setStarlinkLoading(true);
        setStarlinkProgress(0);
        const newSats = await fetchStarlinkSatellites();
        setStarlinkProgress(70);

        // Create Points geometry — each satellite is one vertex
        const slCount = newSats.length;
        const slPositions = new Float32Array(slCount * 3); // all start at 0,0,0
        const slGeo = new THREE.BufferGeometry();
        slGeo.setAttribute('position', new THREE.BufferAttribute(slPositions, 3));
        const slPoints = new THREE.Points(slGeo, new THREE.PointsMaterial({
          color: 0x8B5CF6, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.9
        }));
        slPoints.frustumCulled = false;
        slPoints.visible = false; // hidden until all positions computed
        scene.add(slPoints);

        // Compute ALL initial positions before showing (prevents blinking)
        setStarlinkProgress(70);
        const initNow = new Date();
        const eIdxSL = P.findIndex(pp => pp.id === 'earth');
        const epSL = meshes[eIdxSL].position;
        const scSL = baseScale(eIdxSL);
        for (let si = 0; si < slCount; si++) {
          const slEci = getSatPositionECI(newSats[si], initNow);
          if (slEci) {
            const slP = eciToScene(slEci, epSL, earthSceneR, scSL);
            slPositions[si * 3] = slP.x;
            slPositions[si * 3 + 1] = slP.y;
            slPositions[si * 3 + 2] = slP.z;
          }
          if (si % 1000 === 0) {
            setStarlinkProgress(70 + Math.round((si / slCount) * 30));
            await new Promise(r => setTimeout(r, 0)); // yield to UI
          }
        }
        slPoints.visible = true; // now show — all positions are valid

        satDataRef.current.starlinkPoints = slPoints;
        satDataRef.current.starlinkSats = newSats;
        satDataRef.current.starlinkPositions = slPositions;

        const listSats = newSats.slice(0, 20);
        setSatellites(prev => [...prev, ...listSats.map(s => ({ ...s, groupId: 'starlink' }))]);
        satCountRef.current!.textContent = `${satDataRef.current.sats.length + slCount} 颗卫星追踪中`;
        setStarlinkProgress(100);
        setStarlinkLoading(false);
        return;
      }

      // Toggle Starlink Points visibility
      if (gid === 'starlink' && satDataRef.current.starlinkPoints) {
        satDataRef.current.starlinkPoints.visible = g[gid];
      }

      satDataRef.current.meshes.forEach((sm, i) => {
        const sat = satDataRef.current.sats[i];
        if (sat && sat.groupId === gid) {
          sm.visible = g[gid];
          if (satDataRef.current.trailLines[i]) satDataRef.current.trailLines[i].visible = g[gid];
        }
      });
    };

    // Focus on a specific satellite
    (window as any).__focusSat = (idx: number) => {
      const sm = satDataRef.current.meshes[idx];
      const sat = satDataRef.current.sats[idx];
      if (!sm || !sat) return;

      // If satellite group is disabled, enable it first
      const gid = sat.groupId;
      if (!satDataRef.current.groups[gid]) {
        (window as any).__toggleSatGroup(gid);
      }

      // Check if satellite has a valid position (not at origin = Sun)
      const distFromOrigin = sm.position.length();
      if (distFromOrigin < 0.01) {
        // Satellite hasn't been positioned yet — show toast
        setToast({ title: sat.name, text: '该卫星位置尚未计算完成，请稍等后重试。' });
        return;
      }
      // Ensure satellite is visible when focused
      sm.visible = true;

      focIdx = -1;
      focSatIdx = idx;
      tT.copy(sm.position);
      // Zoom to show satellite near Earth — use Earth visual radius as reference
      const eIdxZ = P.findIndex(pp => pp.id === 'earth');
      const earthVisR = baseScale(eIdxZ) * earthSceneR;
      tD = earthVisR * 0.5; // half Earth radius — close orbit view
      // Camera on the far side from Earth (behind satellite, looking down at Earth)
      // dir = satellite→Earth direction. Camera placed along this direction (above satellite)
      if (eIdxZ >= 0) {
        const earthToSat = new THREE.Vector3().subVectors(sm.position, meshes[eIdxZ].position);
        if (earthToSat.length() > 0.01) {
          const dir = earthToSat.normalize();
          tA.t = Math.atan2(dir.x, dir.z);
          tA.p = Math.acos(Math.max(-0.99, Math.min(0.99, dir.y)));
        }
      }
      const dn = getSatDisplayName(sat.name, sat.noradId);
      iNameRef.current!.textContent = dn;
      iNameRef.current!.style.color = sat.color;
      const groupLabel = SAT_GROUPS.find(g => g.id === sat.groupId)?.labelCn || sat.groupId;
      iSubRef.current!.textContent = `${groupLabel} · ${sat.name}`;
      const sr = sat.satrec as any;
      const periodMin = sr.no ? (2 * Math.PI / sr.no) : 0;
      const periodH = (periodMin / 60).toFixed(1);
      const incDeg = sr.inclo ? (sr.inclo * 180 / Math.PI).toFixed(1) : '?';
      const altKm = sr.no ? (Math.pow(398600.4418 / Math.pow(sr.no * 2 * Math.PI / 86400, 2), 1/3) - 6371).toFixed(0) : '?';
      iFactRef.current!.textContent = `${dn}（${sat.name}）是${groupLabel}卫星星座的一部分。NORAD编号 ${sat.noradId}。轨道倾角 ${incDeg}°，轨道周期约 ${periodH} 小时。`;
      iGridRef.current!.innerHTML = `
        <div><div class="info-stat-label">星座</div><div class="info-stat-val">${groupLabel}</div></div>
        <div><div class="info-stat-label">NORAD</div><div class="info-stat-val">${sat.noradId}</div></div>
        <div><div class="info-stat-label">轨道高度</div><div class="info-stat-val">~${altKm} km</div></div>
        <div><div class="info-stat-label">倾角</div><div class="info-stat-val">${incDeg}°</div></div>
        <div><div class="info-stat-label">周期</div><div class="info-stat-val">${periodH} h</div></div>
        <div><div class="info-stat-label">偏心率</div><div class="info-stat-val">${sr.ecco?.toFixed(4) ?? '?'}</div></div>
      `;
      iExtrasRef.current!.innerHTML = '';
      infoRef.current!.classList.add('open');
    };

    // ═══════ LABELS ═══════
    labelsRef.current!.innerHTML = ''; // clear on re-mount
    let showLabels = true; // default on
    const labelEls: HTMLDivElement[] = [];
    const allLabelTargets: { mesh: THREE.Mesh; text: string; type: 'planet' | 'moon' | 'probe' | 'sat' }[] = [];
    P.forEach((p, i) => {
      allLabelTargets.push({ mesh: meshes[i], text: p.cn, type: 'planet' });
    });
    if (moonMesh) {
      allLabelTargets.push({ mesh: moonMesh, text: '月球', type: 'moon' });
    }
    PR.forEach((pr, i) => {
      allLabelTargets.push({ mesh: probeMeshes[i], text: pr.cn, type: 'probe' });
    });
    naturalMoonMeshes.forEach((nm, i) => {
      allLabelTargets.push({ mesh: nm, text: naturalMoonData[i].nameCn, type: 'moon' });
    });
    allLabelTargets.forEach(({ text }) => {
      const el = document.createElement('div');
      el.className = 'scene-label';
      el.textContent = text;
      el.style.display = 'none';
      labelsRef.current!.appendChild(el);
      labelEls.push(el);
    });
    (window as any).__toggleLabels = () => {
      showLabels = !showLabels;
      document.getElementById('__labelBtn')?.classList.toggle('on', showLabels);
    };
    const labelVec = new THREE.Vector3();
    function updateLabels() {
      if (!showLabels) { labelEls.forEach(el => el.style.display = 'none'); return; }
      // Pre-compute Earth screen size for satellite/moon label hiding
      const earthIdxL = P.findIndex(p => p.id === 'earth');
      const earthScreenL = earthIdxL >= 0 ? getScreenSize(meshes[earthIdxL], cam, baseScale(earthIdxL) * P[earthIdxL].r) : 999;

      allLabelTargets.forEach(({ mesh, type }, i) => {
        const el = labelEls[i];
        if (!mesh.visible) { el.style.display = 'none'; return; }
        // For satellites: hide when Earth < 1/100 screen
        // Hide satellite labels when Earth < 1/1000 screen (too zoomed out, labels overlap)
        if (type === 'sat' && earthScreenL < innerHeight / 1000) { el.style.display = 'none'; return; }
        // For natural moons: hide when their parent planet < 1/100 screen
        if (type === 'moon') {
          const pIdx = mesh.userData?.parentIdx ?? earthIdxL;
          const parentScreenSz = getScreenSize(meshes[pIdx], cam, baseScale(pIdx) * P[pIdx].r);
          if (parentScreenSz < innerHeight / 100) { el.style.display = 'none'; return; }
        }
        const objScreenSz = getScreenSize(mesh, cam, mesh.scale?.x || 1);
        const threshold = type === 'sat' ? innerHeight / 2000 : innerHeight * MIN_SCREEN_FRAC;
        if (objScreenSz < threshold) { el.style.display = 'none'; return; }
        labelVec.setFromMatrixPosition(mesh.matrixWorld);
        // Occluded by a planet? Hide label
        if (isOccludedByPlanet(labelVec.clone())) { el.style.display = 'none'; return; }
        labelVec.project(cam);
        if (labelVec.z > 1) { el.style.display = 'none'; return; } // behind camera
        const x = (labelVec.x * .5 + .5) * innerWidth;
        const y = (labelVec.y * -.5 + .5) * innerHeight;
        el.style.display = 'block';
        const screenR = objScreenSz / 2;
        if (type === 'sat') {
          // Satellites: label directly on top of the satellite dot
          el.style.left = x + 'px';
          el.style.top = (y - 30) + 'px'; // 30px above the satellite
          el.style.transform = 'translateX(-50%)';
          el.style.textAlign = 'center';
          el.style.fontSize = '8px';
        } else {
          // Planets/moons/probes: label to upper-right
          // Moons: cap offset so label stays close when moon is tiny
          const maxOff = type === 'moon' ? 12 : 999;
          const offset = Math.min(Math.max(screenR + 4, 6), maxOff);
          el.style.left = (x + offset) + 'px';
          el.style.top = (y - Math.min(Math.max(screenR * 0.3, 4), maxOff)) + 'px';
          el.style.transform = '';
          el.style.textAlign = 'left';
          el.style.fontSize = type === 'planet' ? '14px' : type === 'moon' ? '10px' : '9px';
        }
      });
    }

    // ═══════ NAV ═══════
    navRef.current!.innerHTML = '';
    P.forEach((p, i) => {
      const d = document.createElement('div'); d.className = 'nav-planet'; d.dataset.idx = String(i);
      d.onclick = () => focusObj(i);
      const hex = '#' + p.col.toString(16).padStart(6, '0');
      d.innerHTML = `<div class="nav-pip" style="background:${hex}"></div><span class="nav-label">${p.cn}</span>`;
      navRef.current!.appendChild(d);

      // Moon container for every planet that has moons
      const planetMoons = NATURAL_MOONS.filter(nm => nm.parentId === p.id);
      const totalKnown = MOON_COUNTS[p.id] ?? 0;
      if (planetMoons.length > 0 || totalKnown > 0) {
        const mc = document.createElement('div'); mc.className = 'nav-moons'; mc.id = `nav-moons-${p.id}`; mc.style.display = 'none';
        // Show up to 5 moons inline, then "..." for the rest
        const moonsToShow = planetMoons.slice(0, 5);
        moonsToShow.forEach(nm => {
          const md = document.createElement('div'); md.className = 'nav-moon-dot'; md.title = `${nm.nameCn} (${nm.name})`;
          md.style.background = nm.color;
          md.onclick = (e) => {
            e.stopPropagation();
            if (nm.id === 'moon') { showMoonInfo(); }
            else { (window as any).__focusNaturalMoon(nm.id); }
          };
          mc.appendChild(md);
        });
        // If there are more moons than shown, add "..." indicator
        if (totalKnown > moonsToShow.length) {
          const more = document.createElement('div'); more.className = 'nav-moon-more';
          more.textContent = `+${totalKnown - moonsToShow.length}`;
          more.title = `${p.cn}共有${totalKnown}颗已知卫星`;
          mc.appendChild(more);
        }
        navRef.current!.appendChild(mc);
      }
    });

    // ═══════ CAMERA ═══════
    let drag = false, dragMoved = false, pM = { x: 0, y: 0 };
    // Default: near top-down view so all planets are visible
    // Start with equatorial view (p = PI/2 = horizontal), camera will fly to Earth on load
    let cA = { t: 0.3, p: Math.PI / 3 }, cD = 105, cT = new THREE.Vector3();
    let tA = { t: 0.3, p: Math.PI / 3 }, tD = 105, tT = new THREE.Vector3();

    let isTouch = false;
    ren.domElement.addEventListener('pointerdown', e => { drag = true; dragMoved = false; isTouch = e.pointerType === 'touch'; pM = { x: e.clientX, y: e.clientY }; document.body.style.cursor = 'grabbing'; });
    ren.domElement.addEventListener('pointermove', e => {
      if (drag) {
        const dx = e.clientX - pM.x, dy = e.clientY - pM.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
        // Mobile touch: reverse horizontal to feel like globe dragging
        const hDir = isTouch ? 1 : -1;
        tA.t += hDir * dx * .004; tA.p = Math.max(.1, Math.min(Math.PI - .1, tA.p - dy * .004));
        pM = { x: e.clientX, y: e.clientY };
      }
      hoverFn(e);
    });
    ren.domElement.addEventListener('pointerup', () => { drag = false; document.body.style.cursor = 'grab'; });
    ren.domElement.addEventListener('pointerleave', () => { drag = false; });

    // Zoom helper — shared by wheel and pinch
    function applyZoom(delta: number) {
      const zoomPct = tD < 10 ? 0.0003 : tD < 800 ? 0.0004 : tD < 30000 ? 0.00015 : 0.00008;
      const zoomMin = focSatIdx >= 0 ? 0.0001 : 0.01;
      tD = Math.max(zoomMin, Math.min(500000, tD * (1 + delta * zoomPct)));
    }

    ren.domElement.addEventListener('wheel', e => {
      e.preventDefault();
      applyZoom(e.deltaY);
    }, { passive: false });

    // Touch: pinch-to-zoom + prevent browser zoom
    let lastPinchDist = 0;
    ren.domElement.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDist = Math.sqrt(dx * dx + dy * dy);
      }
    }, { passive: false });
    ren.domElement.addEventListener('touchmove', e => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (lastPinchDist > 0) {
          const pinchDelta = (lastPinchDist - dist) * 3; // positive = zoom out
          applyZoom(pinchDelta);
        }
        lastPinchDist = dist;
      }
    }, { passive: false });
    ren.domElement.addEventListener('touchend', () => { lastPinchDist = 0; });
    // Prevent browser zoom on the whole document (iOS Safari double-tap, pinch)
    document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false } as any);
    document.addEventListener('gesturechange', e => e.preventDefault(), { passive: false } as any);

    // Click — only if not dragged
    ren.domElement.addEventListener('click', e => {
      if (dragMoved) return;
      const m2 = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      const rc = new THREE.Raycaster(); rc.setFromCamera(m2, cam);
      // Include ALL clickable objects: planets, probes, moons, AND satellites
      const clickTargets = [...meshes, ...probeMeshes, ...naturalMoonMeshes];
      if (moonMesh) clickTargets.push(moonMesh);
      // Add visible satellite meshes
      satDataRef.current.meshes.forEach(sm => { if (sm?.visible) clickTargets.push(sm); });
      // Increase picking threshold for small objects
      rc.params.Line = { threshold: 0.5 };
      (rc.params as any).Points = { threshold: 0.5 };
      const hits = rc.intersectObjects(clickTargets, true);
      if (hits.length) {
        // Walk up to find userData (might be on parent Group)
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData?.isPlanet && !obj.userData?.isProbe && !obj.userData?.isMoon && !obj.userData?.isNaturalMoon && !obj.userData?.isSat) {
          obj = obj.parent;
        }
        if (!obj) return;
        const d = obj.userData;
        if (d.isSat) (window as any).__focusSat(d.satIdx);
        else if (d.isMoon) showMoonInfo();
        else if (d.isNaturalMoon) showNaturalMoonInfo(d);
        else if (d.isProbe) showProbeInfo(d.probeIdx);
        else if (d.isPlanet) focusObj(d.idx);
      }
    });

    // ═══════ HOVER ═══════
    const rc2 = new THREE.Raycaster();
    const m2v = new THREE.Vector2();
    function hoverFn(e: PointerEvent) {
      // Only change cursor — no tooltip
      m2v.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      rc2.setFromCamera(m2v, cam);
      const hoverTargets = [...meshes, ...probeMeshes, ...naturalMoonMeshes];
      if (moonMesh) hoverTargets.push(moonMesh);
      satDataRef.current.meshes.forEach(sm => { if (sm?.visible) hoverTargets.push(sm); });
      const hits = rc2.intersectObjects(hoverTargets, true);
      if (hits.length) {
        if (!drag) document.body.style.cursor = 'pointer';
      } else {
        if (!drag) document.body.style.cursor = 'grab';
      }
    }

    // ═══════ SCALE TOGGLE ═══════
    // Real radii in km. Sun stays at current size, everything else scales relative to it.
    // Use realRadiusKm from planet data
    const REAL_KM: Record<string, number> = {};
    PLANETS.forEach(p => { REAL_KM[p.id] = p.realRadiusKm; });
    const SUN_SCENE_R = P[0].r; // current sun radius in scene = 4.8
    const realScale = true; // always real proportions
    const origRadii = P.map(p => p.r);
    // Base scale for each planet — 1.0 normally, tiny ratio in real-scale mode
    function baseScale(i: number): number {
      const p = P[i];
      if (p.sun) return 1;
      return realScale ? (REAL_KM[p.id] ?? 6371) / REAL_KM.sun * SUN_SCENE_R / origRadii[i] : 1;
    }
    function applyAllScales() {
      P.forEach((p, i) => {
        if (p.sun) return;
        const s = baseScale(i);
        meshes[i].scale.setScalar(s);
      });
    }

    // (scale toggle removed — always real proportions)

    // ═══════ FOCUS / INFO ═══════
    let focIdx = -1;
    let focSatIdx = -1; // index into satDataRef.current.meshes for satellite follow

    // Apply initial real scale (must be after focIdx is declared)
    applyAllScales();
    // (cloud layer always visible — no toggle)

    // Unified: compute camera distance so object fills ~70% of screen
    // fov=50°, 70% of fov = 35° half-angle = 17.5°. dist = r / tan(17.5°) ≈ r * 3.17
    // Minimum: surface + 15% to prevent entering the object
    function fitDistance(visualRadius: number): number {
      return Math.max(visualRadius * 3.2, visualRadius * 1.15);
    }

    function focusObj(i: number) {
      focIdx = i; focSatIdx = -1; const p = P[i];
      tT.copy(meshes[i].position);
      const visR = baseScale(i) * p.r;
      tD = fitDistance(visR);
      navRef.current!.querySelectorAll('.nav-planet').forEach(d => d.classList.toggle('active', (d as HTMLElement).dataset.idx === String(i)));
      // Show/hide moon sub-items
      document.querySelectorAll('.nav-moons').forEach(mc => (mc as HTMLElement).style.display = 'none');
      const moonContainer = document.getElementById(`nav-moons-${P[i].id}`);
      if (moonContainer) moonContainer.style.display = 'flex';

      iNameRef.current!.textContent = p.n.toUpperCase();
      iNameRef.current!.style.color = '#' + p.col.toString(16).padStart(6, '0');
      iSubRef.current!.textContent = p.cnFull;
      iFactRef.current!.textContent = p.fact;

      const g = iGridRef.current!; g.innerHTML = '';
      Object.entries(p.stats).forEach(([k, v]) => {
        g.innerHTML += `<div><div class="info-stat-label">${k}</div><div class="info-stat-val">${v}</div></div>`;
      });

      iExtrasRef.current!.innerHTML = '';

      infoRef.current!.classList.add('open');
    }

    function showProbeInfo(i: number) {
      const pr = PR[i]; focIdx = -1; focSatIdx = -1;
      tT.copy(probeMeshes[i].position); tD = fitDistance(0.05); // probes scaled to ~0.05

      iNameRef.current!.textContent = pr.n.toUpperCase();
      iNameRef.current!.style.color = '#' + pr.col.toString(16).padStart(6, '0');
      iSubRef.current!.textContent = `${pr.cn} — 深空探测器`;
      iFactRef.current!.textContent = pr.desc;

      const g = iGridRef.current!;
      g.innerHTML = `
        <div><div class="info-stat-label">发射年份</div><div class="info-stat-val">${pr.launched}</div></div>
        <div><div class="info-stat-label">距离</div><div class="info-stat-val">${pr.dist ? pr.dist + ' AU' : '轨道中'}</div></div>
      `;
      iExtrasRef.current!.innerHTML = '';
      infoRef.current!.classList.add('open');
    }

    (window as any).__focusProbeByIdx = (i: number) => {
      // Enable probes if hidden
      if (!layers.probe) { layers.probe = true; probeMeshes.forEach(m => m.visible = true); }
      showProbeInfo(i);
    };
    (window as any).__focusPlanetByIdx = (i: number) => focusObj(i);

    function showMoonInfo() {
      if (!moonMesh) return;
      focIdx = -1; focSatIdx = -1;
      tT.copy(moonMesh.position);
      tD = fitDistance(moonMesh.scale.x * 0.27);
      const md = moonMesh.userData;
      iNameRef.current!.textContent = 'MOON';
      iNameRef.current!.style.color = '#AAAAAA';
      iSubRef.current!.textContent = md.cnFull;
      iFactRef.current!.textContent = md.fact;
      const g = iGridRef.current!; g.innerHTML = '';
      Object.entries(md.stats as Record<string, string>).forEach(([k, v]) => {
        g.innerHTML += `<div><div class="info-stat-label">${k}</div><div class="info-stat-val">${v}</div></div>`;
      });
      iExtrasRef.current!.innerHTML = '';
      infoRef.current!.classList.add('open');
    }

    function showNaturalMoonInfo(d: any) {
      focIdx = -1; focSatIdx = -1;
      const nmIdx = naturalMoonMeshes.findIndex(m => m.userData.id === d.id);
      if (nmIdx < 0) return;
      const mesh = naturalMoonMeshes[nmIdx];
      tT.copy(mesh.position);
      tD = fitDistance(mesh.userData.visualR || 0.1);
      iNameRef.current!.textContent = d.n.toUpperCase();
      iNameRef.current!.style.color = naturalMoonData[nmIdx] ? naturalMoonData[nmIdx].color : '#AAAAAA';
      iSubRef.current!.textContent = d.cnFull;
      iFactRef.current!.textContent = d.fact;
      const g = iGridRef.current!; g.innerHTML = '';
      Object.entries(d.stats as Record<string, string>).forEach(([k, v]) => {
        g.innerHTML += `<div><div class="info-stat-label">${k}</div><div class="info-stat-val">${v}</div></div>`;
      });
      iExtrasRef.current!.innerHTML = '';
      infoRef.current!.classList.add('open');
    }

    // Expose for nav sidebar clicks
    (window as any).__focusNaturalMoon = (moonId: string) => {
      const nmIdx = naturalMoonMeshes.findIndex(m => m.userData.id === moonId);
      if (nmIdx >= 0) showNaturalMoonInfo(naturalMoonMeshes[nmIdx].userData);
    };

    (window as any).__closeInfo = () => {
      infoRef.current!.classList.remove('open');
      // Keep focIdx / focSatIdx — camera stays locked on the last selected object
      navRef.current!.querySelectorAll('.nav-planet').forEach(d => d.classList.remove('active'));
      document.querySelectorAll('.nav-moons').forEach(mc => (mc as HTMLElement).style.display = 'none');
    };

    // ═══════ CONTROLS ═══════
    // Speed presets: each value = how many real seconds per animation second
    // 1 = real-time, 86400 = 1 day/s, 2592000 = 1 month/s, etc.
    const SPEED_PRESETS = [
      { v: 1, label: '1秒' },
      { v: 15, label: '15秒' },
      { v: 30, label: '30秒' },
      { v: 60, label: '1分' },
      { v: 300, label: '5分' },
      { v: 900, label: '15分' },
      { v: 1800, label: '30分' },
      { v: 3600, label: '1时' },
      { v: 7200, label: '2时' },
      { v: 21600, label: '6时' },
      { v: 43200, label: '12时' },
      { v: 86400, label: '1天' },
      { v: 172800, label: '2天' },
      { v: 259200, label: '3天' },
      { v: 604800, label: '1周' },
      { v: 1209600, label: '2周' },
      { v: 2592000, label: '1月' },
      { v: 7776000, label: '3月' },
      { v: 15552000, label: '6月' },
      { v: 31557600, label: '1年' },
    ];
    let spdIdx = 1; // default: 1分/秒
    let spd = SPEED_PRESETS[spdIdx].v;
    let paused = false;
    // Earth orbital rate: 2π / 31557600 rad/s at real-time
    const EARTH_RATE = 2 * Math.PI / 31557600;

    function updSpd() {
      spdTxtRef.current!.textContent = SPEED_PRESETS[spdIdx].label + '/秒';
      const sliderPos = spdIdx / (SPEED_PRESETS.length - 1);
      tSliderRef.current!.value = String(sliderPos);
    }
    (window as any).__changeSpd = (dir: number) => {
      spdIdx = Math.max(0, Math.min(SPEED_PRESETS.length - 1, spdIdx + dir));
      spd = SPEED_PRESETS[spdIdx].v;
      updSpd();
    };
    (window as any).__togglePlay = () => { paused = !paused; playBtnRef.current!.textContent = paused ? '▶' : '⏸'; playBtnRef.current!.classList.toggle('on', !paused); };
    (window as any).__spdSlider = (v: string) => {
      spdIdx = Math.round(parseFloat(v) * (SPEED_PRESETS.length - 1));
      spd = SPEED_PRESETS[spdIdx].v;
      updSpd();
    };
    updSpd();
    (window as any).__resetCam = () => { tA = { t: 0.3, p: Math.PI / 3 }; tD = 105; tT.set(0, 0, 0); (window as any).__closeInfo(); };
    const layers = { sat: true, probe: false }; // probes hidden by default
    probeMeshes.forEach(m => m.visible = false);
    (window as any).__toggleL = (k: string) => {
      (layers as any)[k] = !(layers as any)[k];
      if (k === 'probe') { probeMeshes.forEach(m => m.visible = layers.probe); setProbesVisible(layers.probe); }
    };

    // ═══════ REAL INITIAL POSITIONS ═══════
    // Mean longitude at J2000 (deg) and rate (deg/century) for each planet
    const ORBITS: Record<string, [number, number]> = {
      mercury: [252.251, 149472.674], venus: [181.980, 58517.816],
      earth: [100.464, 35999.372], mars: [355.453, 19140.300],
      jupiter: [34.351, 3034.906], saturn: [50.077, 1222.114],
      uranus: [314.055, 428.467], neptune: [304.349, 218.486],
    };
    // Julian centuries since J2000 (2000-01-01 12:00 TT)
    const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
    const T = (Date.now() - J2000) / (36525 * 86400000);
    // Compute initial angle offset for each planet so t=0 matches current real position
    const initAngles: number[] = P.map(p => {
      if (p.sun || !ORBITS[p.id]) return 0;
      const [L0, rate] = ORBITS[p.id];
      const deg = (L0 + rate * T) % 360;
      return deg * Math.PI / 180; // radians
    });

    // ═══════ SATELLITE BRACKET MARKERS ═══════
    const bracketContainer = satBracketsRef.current!;
    bracketContainer.innerHTML = '';
    const bracketEls: HTMLDivElement[] = [];
    const bracketVec = new THREE.Vector3();

    function updateSatBrackets(sd: typeof satDataRef.current, camera: THREE.Camera, earthScale: number) {
      // Show brackets when Earth > 1/1000 screen, hide when smaller
      const eIdx4 = P.findIndex(p => p.id === 'earth');
      const earthScreen = getScreenSize(meshes[eIdx4], camera, earthSceneR * earthScale);
      const showBrackets = earthScreen > innerHeight / 1000;

      // Lazy-create bracket elements
      while (bracketEls.length < sd.meshes.length) {
        const el = document.createElement('div');
        el.className = 'sat-bracket';
        el.onclick = () => (window as any).__focusSat(bracketEls.indexOf(el));
        bracketContainer.appendChild(el);
        bracketEls.push(el);
      }

      for (let i = 0; i < sd.meshes.length; i++) {
        const el = bracketEls[i];
        if (!el) continue;
        const sm = sd.meshes[i];
        if (!sm || !sm.visible || !showBrackets || !showHelpers) { el.style.display = 'none'; continue; }

        bracketVec.setFromMatrixPosition(sm.matrixWorld);
        if (isOccludedByPlanet(bracketVec.clone())) { el.style.display = 'none'; continue; }
        bracketVec.project(camera);
        if (bracketVec.z > 1) { el.style.display = 'none'; continue; }

        const x = (bracketVec.x * .5 + .5) * innerWidth;
        const y = (bracketVec.y * -.5 + .5) * innerHeight;

        // Check if satellite is too small on screen to see
        // Brackets always shown when satellite is visible (no hide-on-zoom-in)

        el.style.display = 'block';
        el.style.left = (x - 6) + 'px';
        el.style.top = (y - 6) + 'px';
        el.style.borderColor = sd.sats[i]?.color || '#fff';
      }
    }

    function getScreenSize(mesh: THREE.Object3D, camera: THREE.Camera, worldRadius: number): number {
      const dist = camera.position.distanceTo(mesh.position);
      if (dist < 0.001) return 9999;
      const fov = (camera as THREE.PerspectiveCamera).fov * Math.PI / 180;
      return (worldRadius / (dist * Math.tan(fov / 2))) * innerHeight;
    }

    // (satSize removed — brackets always shown)
    const MIN_SCREEN_FRAC = 1 / 5000; // hide objects + labels + orbits when smaller than 1/5000 of screen

    // Check if a world-space point is occluded by any visible planet (behind it from camera's view)
    function isOccludedByPlanet(worldPos: THREE.Vector3): boolean {
      const cp = cam.position;
      for (let pi = 0; pi < meshes.length; pi++) {
        const pm = meshes[pi];
        if (!pm.visible) continue;
        const pr = baseScale(pi) * P[pi].r;
        if (pr < 0.001) continue;
        // Vector from camera to planet and camera to point
        const camToPlanet = pm.position.clone().sub(cp);
        const camToPoint = worldPos.clone().sub(cp);
        const planetDist = camToPlanet.length();
        const pointDist = camToPoint.length();
        // Point must be farther than planet
        if (pointDist <= planetDist) continue;
        // Check angular separation — if point is within the planet's angular radius, it's occluded
        const dot = camToPlanet.dot(camToPoint) / (planetDist * pointDist);
        const angularR = Math.asin(Math.min(pr / planetDist, 1));
        const angularSep = Math.acos(Math.min(Math.max(dot, -1), 1));
        if (angularSep < angularR) return true;
      }
      return false;
    }

    // ═══════ PLANET / MOON SELECTION HELPERS ═══════
    const helperContainer = helpersRef.current!;
    const HELPER_SIZE = 18; // circle diameter in px
    // Colors matching orbit tones for each planet
    const planetHelperColors: string[] = P.map(p => '#' + p.col.toString(16).padStart(6, '0'));

    interface HelperEntry {
      el: HTMLDivElement;
      nameEl: HTMLDivElement;
      getMesh: () => THREE.Object3D;
      getWorldR: () => number;
      color: string;
      onClick: () => void;
      name: string;
      type: 'planet' | 'moon';
      parentIdx?: number; // planet index for moons
    }
    const helperEntries: HelperEntry[] = [];

    // Create helpers for planets (skip Sun)
    P.forEach((p, i) => {
      if (p.sun) return;
      const el = document.createElement('div');
      el.className = 'obj-helper';
      el.style.borderColor = planetHelperColors[i];
      const nameEl = document.createElement('div');
      nameEl.className = 'obj-helper-name';
      nameEl.textContent = p.cn;
      nameEl.style.color = planetHelperColors[i];
      el.appendChild(nameEl);
      el.onclick = () => focusObj(i);
      helperContainer.appendChild(el);
      helperEntries.push({
        el, nameEl,
        getMesh: () => meshes[i],
        getWorldR: () => baseScale(i) * p.r,
        color: planetHelperColors[i],
        onClick: () => focusObj(i),
        name: p.cn, type: 'planet',
      });
    });

    // Create helpers for Earth's Moon
    if (moonMesh) {
      const el = document.createElement('div');
      el.className = 'obj-helper';
      el.style.borderColor = '#AAAAAA';
      const nameEl = document.createElement('div');
      nameEl.className = 'obj-helper-name';
      nameEl.textContent = '月球';
      nameEl.style.color = '#AAAAAA';
      el.appendChild(nameEl);
      el.onclick = () => showMoonInfo();
      helperContainer.appendChild(el);
      helperEntries.push({
        el, nameEl,
        getMesh: () => moonMesh!,
        getWorldR: () => baseScale(P.findIndex(pp => pp.id === 'earth')) * 0.27,
        color: '#AAAAAA',
        onClick: () => showMoonInfo(),
        name: '月球', type: 'moon', parentIdx: P.findIndex(pp => pp.id === 'earth'),
      });
    }

    // Helpers for natural moons will be added after they load (deferred)
    function addNaturalMoonHelpers() {
      naturalMoonMeshes.forEach((nm, i) => {
        if (nm.userData._helperAdded) return;
        nm.userData._helperAdded = true;
        const d = nm.userData;
        const col = naturalMoonData[i]?.color || '#888';
        const el = document.createElement('div');
        el.className = 'obj-helper';
        el.style.borderColor = col;
        const nameEl = document.createElement('div');
        nameEl.className = 'obj-helper-name';
        nameEl.textContent = d.cn || d.n;
        nameEl.style.color = col;
        el.appendChild(nameEl);
        el.onclick = () => showNaturalMoonInfo(d);
        helperContainer.appendChild(el);
        helperEntries.push({
          el, nameEl,
          getMesh: () => nm,
          getWorldR: () => nm.userData.visualR || 0.1,
          color: col,
          onClick: () => showNaturalMoonInfo(d),
          name: d.cn || d.n, type: 'moon', parentIdx: nm.userData.parentIdx,
        });
      });
    }

    const helperVec = new THREE.Vector3();
    function updateHelpers() {
      // Add any new natural moon helpers
      if (naturalMoonMeshes.length > 0) addNaturalMoonHelpers();

      for (const h of helperEntries) {
        if (!showHelpers) { h.el.style.display = 'none'; continue; }
        const mesh = h.getMesh();
        if (!mesh) { h.el.style.display = 'none'; continue; }

        // Moons: hide when parent planet is too small (same rule as labels)
        if (h.type === 'moon' && h.parentIdx !== undefined) {
          const parentScreenSz = getScreenSize(meshes[h.parentIdx], cam, baseScale(h.parentIdx) * P[h.parentIdx].r);
          if (parentScreenSz < innerHeight / 100) { h.el.style.display = 'none'; continue; }
        }

        // Only show helper when object is too small on screen (< 20px) but not sub-pixel
        const worldR = h.getWorldR();
        const screenSz = getScreenSize(mesh, cam, worldR);
        if (screenSz >= 20) { h.el.style.display = 'none'; continue; }
        // Hide when truly invisible (sub-pixel) — too zoomed out
        if (h.type === 'planet' && screenSz < innerHeight / 5000) { h.el.style.display = 'none'; continue; }
        // Don't show if behind camera
        helperVec.setFromMatrixPosition(mesh.matrixWorld);
        if (isOccludedByPlanet(helperVec.clone())) { h.el.style.display = 'none'; continue; }
        helperVec.project(cam);
        if (helperVec.z > 1) { h.el.style.display = 'none'; continue; }

        const x = (helperVec.x * .5 + .5) * innerWidth;
        const y = (helperVec.y * -.5 + .5) * innerHeight;
        h.el.style.display = 'block';
        h.el.style.left = (x - HELPER_SIZE / 2) + 'px';
        h.el.style.top = (y - HELPER_SIZE / 2) + 'px';
      }
    }

    // ═══════ ANIMATE ═══════
    // t = elapsed real seconds (accelerated by speed)
    // t = elapsed accelerated seconds. simStartMs = real timestamp at t=0.
    let t = 0; const clock = new THREE.Clock();
    const simStartMs = Date.now();
    let animId: number;
    let frameCount = 0;
    function anim() {
      animId = requestAnimationFrame(anim);
      const dt = clock.getDelta();
      frameCount++;
      if (!paused) t += dt * spd; // t in accelerated real seconds

      P.forEach((p, i) => {
        // Self-rotation: 2π / (rotationPeriod_days * 86400) rad/s, scaled by t (speed-adjusted time)
        const selfRotRate = 2 * Math.PI / (p.rotP * 86400);
        if (p.sun) {
          meshes[i].rotation.y = t * selfRotRate;
          return;
        }
        const meanAnomaly = initAngles[i] + t * EARTH_RATE * p.s;
        const ecc = p.eccentricity ?? 0;
        const incl = (p.orbitalIncl ?? 0) * Math.PI / 180;
        const omega = (p.argPerihelion ?? 0) * Math.PI / 180;
        const Omega = (p.longAscNode ?? 0) * Math.PI / 180;
        // Solve Kepler's equation: E - e*sin(E) = M (Newton's method, 5 iterations)
        let E = meanAnomaly;
        for (let k = 0; k < 5; k++) E = E - (E - ecc * Math.sin(E) - meanAnomaly) / (1 - ecc * Math.cos(E));
        // True anomaly
        const nu = 2 * Math.atan2(Math.sqrt(1 + ecc) * Math.sin(E / 2), Math.sqrt(1 - ecc) * Math.cos(E / 2));
        // Distance (elliptical)
        const r = p.d * (1 - ecc * ecc) / (1 + ecc * Math.cos(nu));
        // Position in orbital plane
        const xOrb = r * Math.cos(nu + omega);
        const yOrb = r * Math.sin(nu + omega);
        // Rotate by inclination and ascending node
        meshes[i].position.x = xOrb * Math.cos(Omega) - yOrb * Math.cos(incl) * Math.sin(Omega);
        meshes[i].position.y = yOrb * Math.sin(incl);
        meshes[i].position.z = xOrb * Math.sin(Omega) + yOrb * Math.cos(incl) * Math.cos(Omega);
        meshes[i].rotation.y = t * selfRotRate;

        // Hide planet + its orbit if too small on screen
        if (orbitLines[i - 1]) orbitLines[i - 1].visible = showOrbits;
      });

      // Cloud rotation: slight drift relative to Earth surface (wind)
      if (earthCloudMesh) {
        const earthRotRate = 2 * Math.PI / (0.99727 * 86400);
        earthCloudMesh.rotation.y = t * earthRotRate * 1.02; // 2% faster than surface
      }

      // Moon orbital motion
      if (moonMesh) {
        const earthIdx = P.findIndex(pp => pp.id === 'earth');
        const moonAngle = t * EARTH_RATE * 13.37; // Moon orbits ~13.37x per Earth year
        const earthPos = meshes[earthIdx].position;
        const eScale = baseScale(earthIdx);
        moonMesh.position.set(
          earthPos.x + Math.cos(moonAngle) * 60.3 * eScale,
          earthPos.y,
          earthPos.z + Math.sin(moonAngle) * 60.3 * eScale
        );
        // Tidal lock: same face always faces Earth. Moon's -Z points toward Earth.
        // lookAt would work but is expensive per frame. Since orbit is in XZ plane:
        moonMesh.rotation.y = moonAngle + Math.PI;
        moonMesh.scale.setScalar(eScale);
        // Hide moon based on its own screen size
        const moonScreenSz = getScreenSize(moonMesh, cam, eScale * 0.27);
        const moonTooSmall = moonScreenSz < innerHeight / 5000;
        moonMesh.visible = !moonTooSmall;
        if (moonOrbitLine) {
          moonOrbitLine.position.copy(earthPos);
          moonOrbitLine.scale.setScalar(eScale);
          moonOrbitLine.visible = showOrbits && !moonTooSmall;
        }
      }

      // Natural moons orbital motion (all except Earth's Moon)
      naturalMoonMeshes.forEach((nm, i) => {
        const nmData = naturalMoonData[i];
        const parentIdx = nm.userData.parentIdx as number;
        const parentPos = meshes[parentIdx].position;
        const pScale = baseScale(parentIdx);
        const parentP = P[parentIdx];
        const parentPlanet = PLANETS.find(pp => pp.id === nmData.parentId)!;
        // Orbital angle: use orbital period relative to Earth year
        const orbAngle = t * EARTH_RATE * (365.25 / nmData.orbitalPeriodDays) + i * 1.7;
        // Real proportional orbital distance: distanceKm / parentRadiusKm * parentVisualRadius
        // This gives the correct ratio between different moons of the same planet
        const distInParentRadii = nmData.distanceKm / parentPlanet.realRadiusKm;
        const orbitDist = distInParentRadii * parentP.r * pScale;
        nm.position.set(
          parentPos.x + Math.cos(orbAngle) * orbitDist,
          parentPos.y,
          parentPos.z + Math.sin(orbAngle) * orbitDist
        );
        nm.scale.setScalar(pScale);
        // Tidally locked: rotation period = orbital period, face parent
        nm.rotation.y = orbAngle + Math.PI;
        // Update orbit line position and scale to follow parent
        if (naturalMoonOrbits[i]) {
          naturalMoonOrbits[i].position.copy(parentPos);
          naturalMoonOrbits[i].scale.setScalar(pScale);
          naturalMoonOrbits[i].visible = showOrbits && nm.visible;
        }
        // Visibility: hide when screen size < innerHeight / 5000
        const nmScreenSz = getScreenSize(nm, cam, pScale * nm.userData.visualR);
        nm.visible = nmScreenSz >= innerHeight / 5000;
      });

      const tAngle = t * EARTH_RATE; // normalized orbital angle progress
      // Hide all probes when Earth < 1/5000 screen
      const earthScreenForProbes = getScreenSize(meshes[P.findIndex(pp => pp.id === 'earth')], cam, baseScale(P.findIndex(pp => pp.id === 'earth')) * P.find(pp => pp.id === 'earth')!.r);
      PR.forEach((pr, i) => {
        const m = probeMeshes[i];
        if (!layers.probe || earthScreenForProbes < innerHeight / 5000) { m.visible = false; return; }
        m.visible = true;
        if (pr.orb !== undefined) {
          const pp = meshes[pr.orb].position;
          const a = tAngle * 0.5 + i * 2.3;
          m.position.set(pp.x + Math.cos(a) * (pr.od || 3), pp.y, pp.z + Math.sin(a) * (pr.od || 3));
        } else {
          const da = pr.ang + tAngle * 0.001;
          m.position.set(Math.cos(da) * pr.dist, 0, Math.sin(da) * pr.dist);
        }
        m.rotation.y = t * (2 * Math.PI / 86400); // slow spin, ~1 rev/day at real time
      });

      // ═══ Update satellite positions + trails ═══
      // Use simulated date so satellites stay synchronized with planet positions
      const sd = satDataRef.current;
      if (sd.meshes.length > 0) {
        const now = new Date(simStartMs + t * 1000);
        const eIdx = P.findIndex(p => p.id === 'earth');
        const ep = meshes[eIdx].position;
        const sc = baseScale(eIdx);
        // Satellite visual size — proportional to Earth, very small
        // Satellite visual size — very small relative to Earth
        // Real satellite is ~10m, Earth radius = 6371km = 1 scene unit
        // True scale: 10/6371000 ≈ 0.0000016. We exaggerate to 0.0002 for minimal visibility.
        const baseSatSize = sc * earthSceneR * 0.0002;

        // Hide all satellites + trails when Earth is too small on screen
        const earthScreenForSats = getScreenSize(meshes[eIdx], cam, earthSceneR * sc);
        const hideAllSats = earthScreenForSats < innerHeight / 100;

        for (let i = 0; i < sd.sats.length; i++) {
          const sm = sd.meshes[i];
          if (!sm) continue;
          const sat = sd.sats[i];
          const groupOn = sd.groups[sat?.groupId] ?? false;
          if (!groupOn || hideAllSats) {
            sm.visible = false;
            if (satTrailLines[i]) { satTrailLines[i].visible = false; satTrailLines[i].geometry.setDrawRange(0, 0); }
            if (satTrails[i]) { satTrails[i].fill(0); satTrailReady[i] = false; }
            continue;
          }

          // Compute position at current simulated time
          const eci = getSatPositionECI(sat, now);
          if (!eci) { sm.visible = false; if (satTrailLines[i]) satTrailLines[i].visible = false; continue; }
          const pos = eciToScene(eci, ep, earthSceneR, sc);
          // Sanity: if position is at origin or too far, hide
          const dxE = pos.x - ep.x, dyE = pos.y - ep.y, dzE = pos.z - ep.z;
          const distFromEarth = Math.sqrt(dxE * dxE + dyE * dyE + dzE * dzE);
          if (distFromEarth < 0.001 || distFromEarth > 200 * sc) { sm.visible = false; continue; }

          // Occlusion: hide satellite if it's behind Earth relative to camera
          const earthR = earthSceneR * sc;
          const cp = cam.position;
          const camToEarth = new THREE.Vector3(ep.x - cp.x, ep.y - cp.y, ep.z - cp.z);
          const camToSat = new THREE.Vector3(pos.x - cp.x, pos.y - cp.y, pos.z - cp.z);
          const camEarthDist = camToEarth.length();
          if (camEarthDist > earthR * 1.5) { // only check when not too close to Earth
            const dot = camToEarth.dot(camToSat) / (camEarthDist * camToSat.length());
            if (dot > 0.98 && camToSat.length() > camEarthDist) {
              // Satellite is roughly behind Earth from camera's perspective
              sm.visible = false; continue;
            }
          }
          sm.visible = true;

          // Jitter — larger for stations (LEO objects cluster), smaller for MEO/GEO
          const isStation = sat.groupId === 'stations';
          const jit = earthSceneR * sc * (isStation ? 0.12 : 0.03);
          const seed = i * 7919;
          pos.x += Math.sin(seed) * jit;
          pos.y += Math.cos(seed * 1.3) * jit;
          pos.z += Math.sin(seed * 2.7) * jit;
          sm.position.set(pos.x, pos.y, pos.z);

          // Stations 3x bigger than regular sats
          // Minimum size scales with Earth: 0.1% of Earth's scene radius (≈6km equiv, ~3px when Earth fills screen)
          const minSatSize = earthSceneR * sc * 0.001;
          const thisSize = isStation ? baseSatSize * 3 : baseSatSize;
          sm.scale.setScalar(Math.max(thisSize, isStation ? minSatSize * 2 : minSatSize));

          // Visibility is governed by hideAllSats (Earth screen size < 1/100)
          // No per-satellite screen-size check — satellites are always tiny but shown when Earth is visible

          // Trail: hide and clear at high speeds (> 2hr/s = 7200)
          if (satTrails[i] && spd > 7200) {
            if (satTrailLines[i]) { satTrailLines[i].visible = false; satTrailLines[i].geometry.setDrawRange(0, 0); }
            satTrails[i].fill(0); satTrailReady[i] = false;
          }
          // Trail: compute at normal speeds
          if (satTrails[i] && spd <= 7200) {
            const lastIdx = TRAIL_LEN - 1;
            // Compute full trail (staggered across frames, or on first frame for this satellite)
            if (!satTrailReady[i] || frameCount % 60 === (i % 60)) {
              const sr = sat.satrec as any;
              const periodSec = sr.no ? (2 * Math.PI / sr.no) * 60 : 5400;
              const trailDuration = periodSec * 0.4;
              let allValid = true;
              for (let s = 0; s <= lastIdx; s++) {
                const pastTime = new Date(now.getTime() - (lastIdx - s) / lastIdx * trailDuration * 1000);
                const pastEci = getSatPositionECI(sat, pastTime);
                if (pastEci) {
                  const pp = eciToScene(pastEci, ep, earthSceneR, sc);
                  satTrails[i][s * 3] = pp.x + Math.sin(seed) * jit;
                  satTrails[i][s * 3 + 1] = pp.y + Math.cos(seed * 1.3) * jit;
                  satTrails[i][s * 3 + 2] = pp.z + Math.sin(seed * 2.7) * jit;
                } else { allValid = false; }
              }
              // Snap last point to exact current position
              satTrails[i][lastIdx * 3] = pos.x;
              satTrails[i][lastIdx * 3 + 1] = pos.y;
              satTrails[i][lastIdx * 3 + 2] = pos.z;
              if (allValid) satTrailReady[i] = true;
            } else {
              // Between recomputations, only update the last point (smooth head tracking)
              satTrails[i][lastIdx * 3] = pos.x;
              satTrails[i][lastIdx * 3 + 1] = pos.y;
              satTrails[i][lastIdx * 3 + 2] = pos.z;
            }
            const line = satTrailLines[i];
            if (line) {
              // Only show trail after first full valid computation
              // Hide trails at high time speed (> 1hr/s) — orbits are too fast for meaningful trails
              line.visible = satTrailReady[i] && spd <= 7200;
              line.geometry.attributes.position.needsUpdate = true;
              line.geometry.setDrawRange(0, TRAIL_LEN);
              const mat = line.material as THREE.ShaderMaterial;
              if (mat.uniforms?.activePoints) mat.uniforms.activePoints.value = TRAIL_LEN;
            }
          }
        }

        // Bracket markers — screen-space click helpers
        updateSatBrackets(sd, cam, sc);

        // ═══ Starlink Points positions (single draw call, batched) ═══
        // Hide Starlink when Earth is too small on screen (reuse hideAllSats from above)
        if (sd.starlinkPoints) {
          const slGroupOn = sd.groups['starlink'] ?? false;
          sd.starlinkPoints.visible = slGroupOn && !hideAllSats;
        }
        if (sd.starlinkPoints?.visible && sd.starlinkSats && sd.starlinkPositions) {
          const slSats = sd.starlinkSats;
          const slPos = sd.starlinkPositions;
          const slBatch = 500; // update 500 per frame
          const slStart = (frameCount * slBatch) % slSats.length;
          const slEnd = Math.min(slStart + slBatch, slSats.length);
          for (let si = slStart; si < slEnd; si++) {
            const slEci = getSatPositionECI(slSats[si], now);
            if (slEci) {
              const slP = eciToScene(slEci, ep, earthSceneR, sc);
              slPos[si * 3] = slP.x;
              slPos[si * 3 + 1] = slP.y;
              slPos[si * 3 + 2] = slP.z;
            }
          }
          sd.starlinkPoints.geometry.attributes.position.needsUpdate = true;
        }
      }

      // Satellite orbit lines follow Earth position
      if (sd.orbitLines.length > 0) {
        const eIdx3 = P.findIndex(p => p.id === 'earth');
        const ep2 = meshes[eIdx3].position;
        const sc2 = baseScale(eIdx3);
        sd.orbitLines.forEach(ol => { if (ol.visible) { ol.position.copy(ep2); ol.scale.setScalar(sc2); } });
      }

      if (focIdx >= 0) tT.copy(meshes[focIdx].position);
      // Follow focused satellite — track its position
      if (focSatIdx >= 0) {
        const fsm = satDataRef.current.meshes[focSatIdx];
        if (fsm && fsm.visible) tT.copy(fsm.position);
      }

      const lf = 1 - Math.pow(.008, dt);
      cA.t += (tA.t - cA.t) * lf; cA.p += (tA.p - cA.p) * lf;
      if (focSatIdx >= 0) {
        // Locked on satellite: snap everything instantly — zero delay
        cD = tD;
        cT.copy(tT);
      } else {
        cD += (tD - cD) * lf;
        cT.lerp(tT, lf);
      }
      // Prevent camera from entering any planet's interior
      {
        const camPos = cam.position;
        meshes.forEach((m, idx) => {
          if (!m.visible) return;
          // Skip Earth collision when following a satellite (camera needs to be near surface)
          if (focSatIdx >= 0 && P[idx].id === 'earth') return;
          const camToObj = camPos.distanceTo(m.position);
          const r = baseScale(idx) * P[idx].r * 1.1;
          if (camToObj < r && r > 0.001) {
            const pushDir = camPos.clone().sub(m.position).normalize();
            cam.position.copy(m.position).add(pushDir.multiplyScalar(r));
            cD = Math.max(cD, r);
            tD = Math.max(tD, r);
          }
        });
      }
      cam.position.set(cT.x + cD * Math.sin(cA.p) * Math.cos(cA.t), cT.y + cD * Math.cos(cA.p), cT.z + cD * Math.sin(cA.p) * Math.sin(cA.t));
      cam.lookAt(cT);

      // Update atmosphere uniforms
      const glowSunPos = meshes[0].position;
      glowMeshes.forEach(gm => {
        const mat = gm.userData.glowMat as THREE.ShaderMaterial;
        mat.uniforms.sunPos.value.copy(glowSunPos);
        mat.uniforms.camPos.value.copy(cam.position);
      });

      // Dynamic near/far plane — prevents clipping when zoomed very close
      cam.near = Math.max(cD * 0.001, focSatIdx >= 0 ? 0.00001 : 0.0001);
      cam.far = Math.max(cD * 100, 2000);
      cam.updateProjectionMatrix();

      // Camera fill light: PointLight at camera position lights planet from all angles.
      // Full (2.0) when zoomed in close (<15), fades to 0 at distance 60+.
      const fillTarget = cD < 60 ? Math.max(0, 2.0 * (1 - cD / 60)) : 0;
      camLight.intensity += (fillTarget - camLight.intensity) * .08;

      // ═══ Multi-scale universe layers ═══
      const mwMat = milkyWayPlane.material as THREE.MeshBasicMaterial;
      const dsMat = deepSpaceSphere.material as THREE.MeshBasicMaterial;

      // ═══ Multi-scale visibility ═══
      // Fade out local star field when zooming beyond solar system
      starLayers.forEach((pts, si) => {
        const fade = cD < 5000 ? 1 : cD < 25000 ? 1 - (cD - 5000) / 20000 : 0;
        (pts.material as THREE.PointsMaterial).opacity = starBaseOpacities[si] * Math.max(0, fade);
        pts.visible = fade > 0;
      });

      const sunScreen = getScreenSize(meshes[0], cam, P[0].r);

      // Solar marker — appears when sun is < 3px, grows to stay visible
      if (sunScreen < 3) {
        solarMarker.visible = true;
        solarMarker.scale.setScalar(Math.max(cD * 0.002, 0.5));
        // Hide all planets and orbits at galaxy scale
        meshes.forEach(m => m.visible = false);
        orbitLines.forEach(ol => ol.visible = false);
      } else {
        solarMarker.visible = false;
        meshes.forEach(m => m.visible = true);
        orbitLines.forEach(ol => ol.visible = showOrbits);
      }

      // Milky Way — only when solar system is completely invisible
      // Sun < 1px happens at cD ≈ 50,000+. MW fades in from 30,000-80,000.
      if (cD > 30000) {
        milkyWayPlane.visible = true;
        mwMat.opacity = Math.min(1, (cD - 30000) / 50000);
      } else {
        milkyWayPlane.visible = false;
        mwMat.opacity = 0;
      }

      // Deep space — beyond the Milky Way
      if (cD > 150000) {
        deepSpaceSphere.visible = true;
        dsMat.opacity = Math.min(1, (cD - 150000) / 100000) * 0.5;
      } else {
        deepSpaceSphere.visible = false;
        dsMat.opacity = 0;
      }

      ren.render(scene, cam);
      updateLabels();
      updateHelpers();
    }

    const onResize = () => {
      cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); ren.setSize(innerWidth, innerHeight);
      orbitLines.forEach(ol => { if ((ol as any).material?.resolution) (ol as any).material.resolution.set(innerWidth, innerHeight); });
    };
    window.addEventListener('resize', onResize);
    setTimeout(() => introRef.current?.classList.add('gone'), 2200);
    satCountRef.current!.textContent = '142 颗卫星追踪中';
    // Default: focus on Earth after intro
    const earthStartIdx = P.findIndex(p => p.id === 'earth');
    setTimeout(() => { if (earthStartIdx >= 0) focusObj(earthStartIdx); }, 2400);
    anim();

    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', onResize); ren.dispose(); canvasRef.current?.removeChild(ren.domElement); audio.pause(); audio.src = ''; };
  }, []);

  return (
    <>
      <div className="intro" ref={introRef}>
        <div className="intro-line"><span className="intro-word intro-title w1">OPENGLOBES</span></div>
        <div className="intro-line"><span className="intro-word w2">此 刻 太 空</span></div>
        <div className="intro-pulse" style={{ marginTop: 24 }}></div>
      </div>

      <div ref={canvasRef} />

      <div className="chrome-top">
        <div className="brand">
          <div className="brand-en">OpenGlobes</div>
          <div className="brand-cn">此刻太空</div>
        </div>
        <div className="layers">
          <button className={`layer-btn ${satListOpen ? 'on' : ''}`} ref={lSatRef} onClick={() => setSatListOpen(v => !v)}><span className="layer-dot" />卫星</button>
          <button className="layer-btn" onClick={() => setMobileSettingsOpen(v => !v)}>设置</button>
        </div>
      </div>

      <div className="nav" ref={navRef} />

      <div className="info" ref={infoRef}>
        <div className="info-drag" onPointerDown={(e) => {
          e.preventDefault();
          const el = infoRef.current!;
          const rect = el.getBoundingClientRect();
          const offsetX = e.clientX - rect.left;
          const offsetY = e.clientY - rect.top;
          el.classList.add('dragging');
          // Snap to current visual position immediately (remove CSS transform)
          el.style.left = rect.left + 'px';
          el.style.top = rect.top + 'px';
          el.style.right = 'auto';
          el.style.transform = 'none';
          const onMove = (ev: PointerEvent) => {
            el.style.left = (ev.clientX - offsetX) + 'px';
            el.style.top = (ev.clientY - offsetY) + 'px';
          };
          const onUp = () => {
            el.classList.remove('dragging');
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        }} />
        <button className="info-close" onClick={() => {
          // Reset position on close
          const el = infoRef.current!;
          el.style.left = ''; el.style.top = ''; el.style.right = ''; el.style.transform = '';
          (window as any).__closeInfo();
        }}>✕</button>
        <div ref={iNameRef} className="info-name" />
        <div ref={iSubRef} className="info-sub" />
        <div ref={iGridRef} className="info-grid" />
        <div className="info-line" />
        <div className="info-fact-tag">✦ 你知道吗</div>
        <div ref={iFactRef} className="info-fact" />
        <div ref={iExtrasRef} />
      </div>

      <div className="timebar">
        <button className="tb" onClick={() => (window as any).__changeSpd(-1)}>⏪</button>
        <button className="tb on" ref={playBtnRef} onClick={() => (window as any).__togglePlay()}>⏸</button>
        <button className="tb" onClick={() => (window as any).__changeSpd(1)}>⏩</button>
        <input type="range" className="tslider" ref={tSliderRef} min="0" max="1" step="0.01" defaultValue="0.06" onInput={e => (window as any).__spdSlider((e.target as HTMLInputElement).value)} />
        <div className="tspeed" ref={spdTxtRef}>1×</div>
        <button className="tb" onClick={() => (window as any).__resetCam()}>⟳</button>
      </div>

      <div className="status">
        <div className="status-line"><span className="status-dot" style={{ background: 'var(--glow)' }} /><span ref={satCountRef}>— 颗卫星追踪中</span></div>
        <div className="status-line"><span className="status-dot" style={{ background: 'var(--warm)' }} /><span>{PROBES.length} 个深空探测器</span></div>
      </div>

      {/* Satellite List Panel */}
      {satListOpen && (
        <div className="sat-panel" id="__satPanel">
          <button className="info-close" style={{ position: 'absolute', top: 10, right: 10, zIndex: 10 }}
            onClick={() => setSatListOpen(false)}>✕</button>
          <div className="sat-panel-drag" onPointerDown={(e) => {
            e.preventDefault();
            const el = document.getElementById('__satPanel')!;
            const rect = el.getBoundingClientRect();
            const ox = e.clientX - rect.left, oy = e.clientY - rect.top;
            el.style.transition = 'none';
            el.style.left = rect.left + 'px'; el.style.top = rect.top + 'px'; el.style.right = 'auto';
            const onMove = (ev: PointerEvent) => { el.style.left = (ev.clientX - ox) + 'px'; el.style.top = (ev.clientY - oy) + 'px'; };
            const onUp = () => { el.style.transition = ''; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
            window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
          }} />
          <div className="sat-layout">
            <div className="sat-sidebar">
              <div className="sat-col-title">分类</div>
              {['beidou', 'probes', 'stations', 'starlink', 'gps', 'visual'].map(tid => {
                if (tid === 'probes') return (
                  <button key="probes" className={`sat-tab ${satTab === 'probes' ? 'active' : ''}`} onClick={() => setSatTab('probes')}>
                    <span className="sat-tab-row"><span className="sat-tab-dot" style={{ background: 'linear-gradient(135deg, #81C784, #CE93D8, #FFB74D)' }} />探测器</span>
                    <span className="sat-tab-count">数量：{PROBES.length}</span>
                  </button>
                );
                const g = SAT_GROUPS.find(gg => gg.id === tid);
                if (!g) return null;
                return (
                  <button key={g.id} className={`sat-tab ${satTab === g.id ? 'active' : ''}`} onClick={() => setSatTab(g.id)}>
                    <span className="sat-tab-row"><span className="sat-tab-dot" style={{ background: g.color }} />{g.labelCn}</span>
                    <span className="sat-tab-count">数量：{satellites.filter(s => s.groupId === g.id).length}</span>
                  </button>
                );
              })}
            </div>
            <div className="sat-content">
              <div className="sat-col-title">详情</div>
              {satTab === 'probes' ? (<>
                <div className="sat-content-header">
                  <div className="sat-content-title">深空探测器</div>
                  <div className="sat-content-sub">太阳系深空探测器，包括旅行者号、韦伯望远镜等</div>
                </div>
                <div className="sat-content-divider" />
                <div className="sat-desc">位置基于JPL轨道数据。</div>
                <label className="info-toggle" style={{ fontSize: 12, padding: '6px 0' }}>
                  <input type="checkbox" checked={probesVisible} onChange={() => (window as any).__toggleL('probe')} />
                  <span>显示</span>
                </label>
                <div className="sat-content-divider" />
                <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4 }}>列表</div>
                <div className="sat-list">
                  {PROBES.map((pr, i) => (
                    <div key={pr.id} className="sat-item" onClick={() => (window as any).__focusProbeByIdx?.(i)}>
                      <span className="sat-dot" style={{ background: pr.color }} />
                      <span className="sat-name">{pr.nameCn}</span>
                    </div>
                  ))}
                </div>
              </>) : (() => {
                const g = SAT_GROUPS.find(gg => gg.id === satTab);
                if (!g) return null;
                const descs: Record<string, string> = {
                  beidou: '中国北斗导航系统。MEO/GEO轨道，高度21,500-35,786km。',
                  stations: 'ISS、中国空间站等载人航天器。LEO约400km。',
                  gps: '美国GPS导航系统。MEO约20,200km，31颗在轨。',
                  starlink: 'SpaceX星链互联网卫星。LEO约550km，在轨6000+颗。首次启用时加载全部数据。',
                  visual: '地面肉眼可见的明亮卫星。多在LEO 200-2000km。',
                };
                const refs: Record<string, string> = {
                  beidou: '数据来源：CelesTrak · celestrak.org',
                  stations: '数据来源：CelesTrak · 实时TLE轨道数据',
                  gps: '数据来源：CelesTrak · GPS Operational',
                  starlink: '数据来源：CelesTrak · Starlink Group',
                  visual: '数据来源：CelesTrak · 100 Brightest',
                };
                const groupSats = satellites.filter(s => s.groupId === g.id);
                return (<>
                  <div className="sat-content-header">
                    <div className="sat-content-title">{g.labelCn}</div>
                    <div className="sat-content-sub">{descs[g.id]}</div>
                  </div>
                  <div className="sat-content-divider" />
                  <div className="sat-ref">{refs[g.id]}</div>
                  <label className="info-toggle" style={{ fontSize: 12, padding: '6px 0' }}>
                    <input type="checkbox" checked={satGroups[g.id] ?? false} onChange={() => (window as any).__toggleSatGroup(g.id)} />
                    <span>显示</span>
                  </label>
                  {/* Starlink progress bar */}
                  {g.id === 'starlink' && starlinkLoading && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>加载 Starlink 卫星数据... {starlinkProgress}%</div>
                      <div style={{ width: '100%', height: 3, background: 'rgba(94,234,212,0.1)', borderRadius: 2 }}>
                        <div style={{ width: `${starlinkProgress}%`, height: '100%', background: '#8B5CF6', borderRadius: 2, transition: 'width .3s' }} />
                      </div>
                    </div>
                  )}
                  <div className="sat-content-divider" />
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4 }}>列表 · {groupSats.length} 颗</div>
                  <div className="sat-list">
                    {groupSats.length > 0 ? groupSats.map((s) => {
                      const realIdx = satellites.indexOf(s);
                      return (
                        <div key={realIdx} className="sat-item" title="" onClick={() => (window as any).__focusSat(realIdx)}>
                          <span className="sat-dot" style={{ background: s.color }} />
                          <span className="sat-name" title="">{getSatDisplayName(s.name, s.noradId)}</span>
                        </div>
                      );
                    }) : (g.id === 'starlink' && !starlinkLoading ? <div className="sat-loading" style={{ fontSize: 10 }}>启用后加载6000+颗卫星</div> : <div className="sat-loading">加载中...</div>)}
                  </div>
                </>);
              })()}
            </div>
          </div>
        </div>
      )}

      <div className="tip" ref={tipRef} />
      <div ref={labelsRef} />
      <div ref={satBracketsRef} />
      <div ref={helpersRef} />

      {/* Mobile nav panel — slide from left */}
      <div className={`mobile-nav-panel ${mobileNavOpen ? 'open' : ''}`}>
        <div className="mobile-section-title">太阳系</div>
        {PLANETS.map((p, i) => (
          <div key={p.id} className="mobile-toggle" onClick={() => { (window as any).__focusPlanetByIdx?.(i); setMobileNavOpen(false); }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
            <span>{p.nameCn.split('—')[0].trim()}</span>
          </div>
        ))}
      </div>
      <div className={`mobile-nav-backdrop ${mobileNavOpen ? 'open' : ''}`} onClick={() => setMobileNavOpen(false)} />

      {/* Mobile settings panel — slide from right */}
      <div className={`mobile-settings ${mobileSettingsOpen ? 'open' : ''}`}>
        <div className="mobile-section-title">显示设置</div>
        <label className="mobile-toggle"><input type="checkbox" defaultChecked onChange={() => (window as any).__toggleLabels()} /><span>名称标签</span></label>
        <label className="mobile-toggle"><input type="checkbox" defaultChecked onChange={() => (window as any).__toggleOrbits()} /><span>轨道线</span></label>
        <label className="mobile-toggle"><input type="checkbox" defaultChecked id="__helperBtn" onChange={() => (window as any).__toggleHelpers()} /><span>选择辅助框</span></label>
        <div className="mobile-section-title">音效</div>
        <label className="mobile-toggle"><input type="checkbox" defaultChecked onChange={() => (window as any).__toggleSound()} /><span>开启音效</span></label>
        <div style={{ padding: '4px 0', fontSize: 11, color: '#5B6478' }}>
          音量: <input type="range" min="0" max="1" step="0.05" defaultValue="0.15" onChange={e => (window as any).__setVolume(parseFloat(e.target.value))} style={{ width: 100, verticalAlign: 'middle' }} />
        </div>
        {TRACKS_LIST.map((tr, i) => (
          <div key={i} className="mobile-toggle" style={{ cursor: 'pointer', fontSize: 12 }} onClick={() => (window as any).__setTrack(i)}>
            <span style={{ color: '#5EEAD4', fontSize: 10 }}>♪</span>
            <span>{tr.name}</span>
          </div>
        ))}
        <div className="mobile-section-title">卫星</div>
      </div>
      <div className={`mobile-nav-backdrop ${mobileSettingsOpen ? 'open' : ''}`} onClick={() => setMobileSettingsOpen(false)} />

      {/* Toast popup */}
      <div className={`toast ${toast ? 'show' : ''}`}>
        {toast && <>
          <button className="toast-close" onClick={() => setToast(null)}>✕</button>
          <div className="toast-title">{toast.title}</div>
          <div>{toast.text}</div>
        </>}
      </div>

      {/* Starlink loading HUD */}
      {starlinkLoading && (
        <div className="starlink-hud">
          <div className="starlink-hud-text">
            加载 Starlink 卫星数据 ({starlinkProgress}%)
          </div>
          <div className="starlink-hud-bar">
            <div className="starlink-hud-fill" style={{ width: `${starlinkProgress}%` }} />
          </div>
          <div className="starlink-hud-sub">正在查询 CelesTrak 并计算 SGP4 轨道位置...</div>
        </div>
      )}
    </>
  );
}
