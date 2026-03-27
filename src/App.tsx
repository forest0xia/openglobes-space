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
// Darken a hex color by a factor (simulates opacity against black background, avoids Line2 transparency artifacts)
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

const SPEED_PRESETS = [
  { v: 1, label: '1秒' }, { v: 15, label: '15秒' }, { v: 30, label: '30秒' },
  { v: 60, label: '1分钟' }, { v: 300, label: '5分钟' }, { v: 900, label: '15分钟' },
  { v: 1800, label: '30分钟' }, { v: 3600, label: '1小时' }, { v: 7200, label: '2小时' },
  { v: 21600, label: '6小时' }, { v: 43200, label: '12小时' }, { v: 86400, label: '1天' },
  { v: 172800, label: '2天' }, { v: 259200, label: '3天' }, { v: 604800, label: '1周' },
  { v: 1209600, label: '2周' }, { v: 2592000, label: '1个月' }, { v: 7776000, label: '3个月' },
  { v: 15552000, label: '6个月' }, { v: 31557600, label: '1年' },
];

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

// Settings stepper — pure DOM, no React state, no continuous onChange
function CfgStepper({ label, min, max, step, cfgKey }: { label: string; min: number; max: number; step: number; cfgKey: string }) {
  const valRef = useRef<HTMLSpanElement>(null);
  const cfg = (window as any).__cfg;
  const update = (dir: number) => {
    if (!cfg) return;
    const v = Math.round(Math.max(min, Math.min(max, (cfg[cfgKey] ?? 0) + dir * step)) * 1000) / 1000;
    cfg[cfgKey] = v;
    if (valRef.current) valRef.current.textContent = String(v);
  };
  return (
    <div className="stepper-row">
      <span className="stepper-label">{label}</span>
      <div className="stepper-ctrl">
        <button className="stepper-btn" onClick={() => update(-1)}>−</button>
        <span className="stepper-val" ref={valRef}>{cfg?.[cfgKey] ?? 0}</span>
        <button className="stepper-btn" onClick={() => update(1)}>+</button>
      </div>
    </div>
  );
}

function VolStepper({ label, min, max, step, defaultValue, onChange }: { label: string; min: number; max: number; step: number; defaultValue: number; onChange: (v: number) => void }) {
  const valRef = useRef<HTMLSpanElement>(null);
  const curRef = useRef(defaultValue);
  const update = (dir: number) => {
    const v = Math.round(Math.max(min, Math.min(max, curRef.current + dir * step)) * 1000) / 1000;
    curRef.current = v;
    onChange(v);
    if (valRef.current) valRef.current.textContent = String(v);
  };
  return (
    <div className="stepper-row">
      <span className="stepper-label">{label}</span>
      <div className="stepper-ctrl">
        <button className="stepper-btn" onClick={() => update(-1)}>−</button>
        <span className="stepper-val" ref={valRef}>{defaultValue}</span>
        <button className="stepper-btn" onClick={() => update(1)}>+</button>
      </div>
    </div>
  );
}

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
  // Close all panels — only one panel at a time
  const closeAllPanels = (except?: string) => {
    if (except !== 'sat') setSatListOpen(false);
    if (except !== 'mobileNav') setMobileNavOpen(false);
    if (except !== 'mobileSettings') setMobileSettingsOpen(false);
    if (except !== 'info') infoRef.current?.classList.remove('open');
  };
  (window as any).__closeAllPanels = closeAllPanels;
  (window as any).__showInfoHint = () => { setInfoHint(true); };
  (window as any).__openInfo = () => { closeAllPanels('info'); infoRef.current?.classList.add('open'); setInfoHint(false); };
  const [toast, setToast] = useState<{ title: string; text: string } | null>(null);
  const [satTab, setSatTab] = useState('beidou');
  const [settingsTab, setSettingsTab] = useState('planets');
  const [infoHint, setInfoHint] = useState(false);
  const [showStatus, setShowStatus] = useState(typeof window !== 'undefined' && window.innerWidth > 768);
  const [starlinkLoading, setStarlinkLoading] = useState(false);
  const [starlinkProgress, setStarlinkProgress] = useState(0);
  const [starlinkTotal, setStarlinkTotal] = useState(0);
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
    // Tunable settings — exposed on window for UI sliders
    const cfg = (window as any).__cfg = {
      planetOrbitWidth: 1.5,   // px
      planetOrbitOpacity: 0.45, // planet orbit line opacity
      moonOrbitOpacity: 0.45,  // natural moon orbit line opacity (same as planet orbits)
      moonOrbitWidth: 1,       // natural moon orbit line width (px)
      satOrbitOpacity: 0.15,   // satellite orbit line opacity
      satTrailOpacity: 0.6,    // satellite trail opacity
      helperSize: 18,          // px
      bracketSize: 12,         // px
      labelHideFrac: 5000,     // labels hidden when object < innerHeight/this
      satLabelHideFrac: 20000,   // smaller = sat stuff disappears sooner
      moonLabelHideFrac: 2000, // larger = moons stay visible longer
      helperHideFrac: 5000,
      satBracketHideFrac: 100,
      planetOrbitHideDist: 5000,
      moonOrbitHideDist: 300,
      invertH: false,  // invert horizontal drag
      invertV: false,  // invert vertical drag
    };
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
    audio.muted = true; // default off

    (window as any).__toggleSound = () => {
      audio.muted = !audio.muted;
      if (!audio.muted && audio.paused) audio.play().catch(() => {});
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
    // Cache planet indices (avoid findIndex every frame)
    const EARTH_IDX: number = P.findIndex(p => p.id === 'earth');
    // (glow outlines removed)
    let earthCloudMesh: THREE.Mesh | null = null;
    let moonMesh: THREE.Mesh | null = null;
    let moonOrbitLine: THREE.Line | Line2 | null = null;
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
        addAtmosphere(m, { scale: 1.04, dayColor: [.3, .7, 1], twilightColor: [.74, .29, .04],
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
        const moonOrbitPts: number[] = [];
        for (let j = 0; j <= 128; j++) {
          const angle = (j / 128) * Math.PI * 2;
          moonOrbitPts.push(Math.cos(angle) * 60.3, 0, Math.sin(angle) * 60.3);
        }
        const moonOrbitLg = new LineGeometry();
        moonOrbitLg.setPositions(moonOrbitPts);
        moonOrbitLine = new Line2(moonOrbitLg, new LineMaterial({
          color: darkenHex(0x888888, cfg.moonOrbitOpacity),
          linewidth: cfg.moonOrbitWidth,
          resolution: new THREE.Vector2(innerWidth, innerHeight),
        })) as any;
        (moonOrbitLine as any).userData.baseColor = 0x888888;
        scene.add(moonOrbitLine!);
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
          color: darkenHex(p.col, cfg.planetOrbitOpacity),
          linewidth: cfg.planetOrbitWidth,
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
    const naturalMoonOrbits: (THREE.Line | Line2)[] = [];
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
        const nmOrbitPts: number[] = [];
        for (let a = 0; a <= 64; a++) {
          const ang = (a / 64) * Math.PI * 2;
          nmOrbitPts.push(Math.cos(ang) * orbitR2, 0, Math.sin(ang) * orbitR2);
        }
        const nmLg = new LineGeometry();
        nmLg.setPositions(nmOrbitPts);
        const nmCol = parseInt(nm.color.replace('#', ''), 16);
        const nmOrbitMat = new LineMaterial({
          color: darkenHex(nmCol, cfg.moonOrbitOpacity),
          linewidth: cfg.moonOrbitWidth,
          resolution: new THREE.Vector2(innerWidth, innerHeight),
        });
        const nmOrbitLine = new Line2(nmLg, nmOrbitMat);
        nmOrbitLine.userData = { parentIdx, isNaturalMoonOrbit: true, baseColor: nmCol };
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
      // Expose orbit updaters for settings panel
      (window as any).__updateOrbitWidth = (w: number) => {
        orbitLines.forEach(ol => {
          const m = (ol as any).material;
          if (m?.uniforms?.linewidth) m.uniforms.linewidth.value = w;
          if (m?.linewidth !== undefined) m.linewidth = w; // also set property for getter sync
        });
      };
      // Removed: sat orbit/trail opacity now synced from cfg every frame
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
      if (satCountRef.current) satCountRef.current.textContent = `${sats.length} 颗卫星追踪中`;

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
        setStarlinkTotal(newSats.length);

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
        const eIdxSL = EARTH_IDX;
        const epSL = meshes[eIdxSL].position;
        const scSL = baseScale(eIdxSL);
        for (let si = 0; si < slCount; si++) {
          const slEci = getSatPositionECI(newSats[si], initNow);
          if (slEci && isFinite(slEci.x) && isFinite(slEci.y) && isFinite(slEci.z)) {
            const slP = eciToScene(slEci, epSL, earthSceneR, scSL);
            slPositions[si * 3] = slP.x - epSL.x;
            slPositions[si * 3 + 1] = slP.y - epSL.y;
            slPositions[si * 3 + 2] = slP.z - epSL.z;
          }
          // else: stays at 0,0,0 (Float32Array default)
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
        if (satCountRef.current) satCountRef.current.textContent = `${satDataRef.current.sats.length + slCount} 颗卫星追踪中`;
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
      const eIdxZ = EARTH_IDX;
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
          // Angle lerps smoothly via cA += (tA - cA) * lf in anim loop
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
      (window as any).__showInfoHint();
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
      const earthIdxL = EARTH_IDX;
      const earthScreenL = earthIdxL >= 0 ? getScreenSize(meshes[earthIdxL], cam, baseScale(earthIdxL) * P[earthIdxL].r) : 999;

      allLabelTargets.forEach(({ mesh, type }, i) => {
        const el = labelEls[i];
        if (!mesh.visible) { el.style.display = 'none'; return; }
        // For satellites: hide when Earth < 1/100 screen
        // Hide satellite labels when Earth < 1/1000 screen (too zoomed out, labels overlap)
        if (type === 'sat' && earthScreenL < innerHeight / cfg.satLabelHideFrac) { el.style.display = 'none'; return; }
        // For natural moons: hide when their parent planet < 1/100 screen
        if (type === 'moon') {
          const pIdx = mesh.userData?.parentIdx ?? earthIdxL;
          const parentScreenSz = getScreenSize(meshes[pIdx], cam, baseScale(pIdx) * P[pIdx].r);
          if (parentScreenSz < innerHeight / cfg.moonLabelHideFrac) { el.style.display = 'none'; return; }
        }
        const objScreenSz = getScreenSize(mesh, cam, mesh.scale?.x || 1);
        const threshold = type === 'sat' ? innerHeight / cfg.satLabelHideFrac : innerHeight / cfg.labelHideFrac;
        if (objScreenSz < threshold) { el.style.display = 'none'; return; }
        labelVec.setFromMatrixPosition(mesh.matrixWorld);
        // Occluded by a planet? Hide label
        if (isOccludedByPlanet(labelVec)) { el.style.display = 'none'; return; }
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
    let pinchActive = false; // guard: suppress drag right after pinch ends

    ren.domElement.addEventListener('pointerdown', e => { drag = true; dragMoved = false; pM = { x: e.clientX, y: e.clientY }; document.body.style.cursor = 'grabbing'; });
    ren.domElement.addEventListener('pointermove', e => {
      if (drag && !pinchActive) {
        const dx = e.clientX - pM.x, dy = e.clientY - pM.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
        const hDir = cfg.invertH ? -1 : 1;
        const vDir = cfg.invertV ? 1 : -1;
        tA.t += hDir * dx * .004; tA.p = Math.max(.1, Math.min(Math.PI - .1, tA.p + vDir * dy * .004));
        pM = { x: e.clientX, y: e.clientY };
      }
      hoverFn(e);
    });
    ren.domElement.addEventListener('pointerup', () => { drag = false; document.body.style.cursor = 'grab'; });
    ren.domElement.addEventListener('pointerleave', () => { drag = false; });

    // Zoom helper — shared by wheel and pinch
    function applyZoom(delta: number) {
      const zoomPct = tD < 10 ? 0.0003 : tD < 800 ? 0.0004 : tD < 30000 ? 0.00015 : 0.00008;
      // When following satellite: minimum distance = near plane floor (prevents clipping through sat & Earth glow)
      const zoomMin = focSatIdx >= 0 ? 0.002 : 0.01;
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
        pinchActive = true;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDist = Math.sqrt(dx * dx + dy * dy);
      }
    }, { passive: false });
    ren.domElement.addEventListener('touchmove', e => {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinchActive = true;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (lastPinchDist > 0) {
          const pinchDelta = (lastPinchDist - dist) * 3;
          applyZoom(pinchDelta);
        }
        lastPinchDist = dist;
      }
    }, { passive: false });
    ren.domElement.addEventListener('touchend', () => {
      lastPinchDist = 0;
      if (pinchActive) {
        // Suppress drag for a moment after pinch ends (prevents spin from finger lift)
        setTimeout(() => { pinchActive = false; pM = { x: 0, y: 0 }; }, 200);
      }
    });
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

    // Compute camera distance so object fills screen nicely
    // Desktop: ~70% of height. Mobile: account for narrow width (fill 80% of min dimension)
    function fitDistance(visualRadius: number): number {
      const isMobile = innerWidth < 768;
      // On mobile portrait, width < height, so planet must fit within width
      // screenFraction = r / (dist * tan(fov/2)) → dist = r / (fraction * tan(fov/2))
      const fraction = isMobile ? 0.35 : 0.45; // fraction of half-screen (smaller = more zoom out)
      const tanHalf = Math.tan(25 * Math.PI / 180);
      const aspect = innerWidth / innerHeight;
      // Use the narrower dimension
      const effectiveFraction = isMobile ? fraction * Math.min(aspect, 1) : fraction;
      return Math.max(visualRadius / (effectiveFraction * tanHalf), visualRadius * 1.15);
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

      (window as any).__showInfoHint();
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
      (window as any).__showInfoHint();
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
      (window as any).__showInfoHint();
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
      (window as any).__showInfoHint();
    }

    // Expose for nav sidebar clicks
    (window as any).__focusNaturalMoon = (moonId: string) => {
      const nmIdx = naturalMoonMeshes.findIndex(m => m.userData.id === moonId);
      if (nmIdx >= 0) showNaturalMoonInfo(naturalMoonMeshes[nmIdx].userData);
    };

    (window as any).__closeInfo = () => {
      infoRef.current!.classList.remove('open');
      (window as any).__hideInfoHint?.();
      // Keep focIdx / focSatIdx — camera stays locked on the last selected object
      navRef.current!.querySelectorAll('.nav-planet').forEach(d => d.classList.remove('active'));
      document.querySelectorAll('.nav-moons').forEach(mc => (mc as HTMLElement).style.display = 'none');
    };
    (window as any).__hideInfoHint = () => { setInfoHint(false); };

    // ═══════ CONTROLS ═══════
    // Speed presets: each value = how many real seconds per animation second
    // 1 = real-time, 86400 = 1 day/s, 2592000 = 1 month/s, etc.
    // SPEED_PRESETS is defined at module level
    let spdIdx = 3; // default: 1分/秒 (index 3 after adding 15秒/30秒)
    let spd = SPEED_PRESETS[spdIdx].v;
    let paused = false;
    // Earth orbital rate: 2π / 31557600 rad/s at real-time
    const EARTH_RATE = 2 * Math.PI / 31557600;

    function updSpd() {
      if (spdTxtRef.current) spdTxtRef.current.textContent = SPEED_PRESETS[spdIdx].label + '/秒';
      const sliderPos = spdIdx / (SPEED_PRESETS.length - 1);
      const thumb = (window as any).__spdThumb as HTMLDivElement | undefined;
      if (thumb) thumb.style.left = `${sliderPos * 100}%`;
    }
    (window as any).__changeSpd = (dir: number) => {
      spdIdx = Math.max(0, Math.min(SPEED_PRESETS.length - 1, spdIdx + dir));
      spd = SPEED_PRESETS[spdIdx].v;
      updSpd();
    };
    (window as any).__togglePlay = () => {
      paused = !paused;
      playBtnRef.current!.innerHTML = paused
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5,3 19,12 5,21"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="4" x2="6" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/></svg>';
      playBtnRef.current!.classList.toggle('on', !paused);
    };
    (window as any).__spdSlider = (v: string) => {
      spdIdx = Math.round(parseFloat(v) * (SPEED_PRESETS.length - 1));
      spd = SPEED_PRESETS[spdIdx].v;
      updSpd();
    };
    updSpd();
    (window as any).__resetCam = () => {
      tA = { t: 0.3, p: Math.PI / 3 }; tD = 105; tT.set(0, 0, 0);
      focIdx = -1; focSatIdx = -1;
      // Reset speed to default (1分/秒 = index 3)
      spdIdx = 3; spd = SPEED_PRESETS[spdIdx].v; updSpd();
      paused = false;
      if (playBtnRef.current) playBtnRef.current.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="4" x2="6" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/></svg>';
      if (playBtnRef.current) playBtnRef.current.classList.add('on');
      (window as any).__closeInfo();
    };
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
      const eIdx4 = EARTH_IDX;
      const earthScreen = getScreenSize(meshes[eIdx4], camera, earthSceneR * earthScale);
      const showBrackets = earthScreen > innerHeight / cfg.satBracketHideFrac;

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
        if (isOccludedByPlanet(bracketVec)) { el.style.display = 'none'; continue; }
        bracketVec.project(camera);
        if (bracketVec.z > 1) { el.style.display = 'none'; continue; }

        const x = (bracketVec.x * .5 + .5) * innerWidth;
        const y = (bracketVec.y * -.5 + .5) * innerHeight;

        // Check if satellite is too small on screen to see
        // Brackets always shown when satellite is visible (no hide-on-zoom-in)

        el.style.display = 'block';
        const bs = cfg.bracketSize;
        el.style.width = bs + 'px'; el.style.height = bs + 'px';
        el.style.left = (x - bs / 2) + 'px';
        el.style.top = (y - bs / 2) + 'px';
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
    // Visibility thresholds from cfg

    // Check if a world-space point is occluded by any visible planet (zero-allocation)
    function isOccludedByPlanet(worldPos: THREE.Vector3): boolean {
      const cpx = cam.position.x, cpy = cam.position.y, cpz = cam.position.z;
      const wpx = worldPos.x - cpx, wpy = worldPos.y - cpy, wpz = worldPos.z - cpz;
      const pointDist = Math.sqrt(wpx * wpx + wpy * wpy + wpz * wpz);
      if (pointDist < 0.001) return false;
      for (let pi = 0; pi < meshes.length; pi++) {
        const pm = meshes[pi];
        if (!pm.visible) continue;
        const pr = baseScale(pi) * P[pi].r;
        if (pr < 0.001) continue;
        const ppx = pm.position.x - cpx, ppy = pm.position.y - cpy, ppz = pm.position.z - cpz;
        const planetDist = Math.sqrt(ppx * ppx + ppy * ppy + ppz * ppz);
        if (pointDist <= planetDist || planetDist < pr) continue;
        const dot = (ppx * wpx + ppy * wpy + ppz * wpz) / (planetDist * pointDist);
        if (dot > Math.cos(Math.asin(Math.min(pr / planetDist, 1)))) return true;
      }
      return false;
    }

    // ═══════ PLANET / MOON SELECTION HELPERS ═══════
    const helperContainer = helpersRef.current!;
    // Helper size reads from cfg each frame
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
        getWorldR: () => baseScale(EARTH_IDX) * 0.27,
        color: '#AAAAAA',
        onClick: () => showMoonInfo(),
        name: '月球', type: 'moon', parentIdx: EARTH_IDX,
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

      // Hide all planet/moon helpers when zoomed out past solar system scale
      // When camera distance > Neptune's orbit (601), orbits are visually tiny
      const allHelpersHidden = cD > 500;

      for (const h of helperEntries) {
        if (!showHelpers || allHelpersHidden) { h.el.style.display = 'none'; continue; }
        const mesh = h.getMesh();
        if (!mesh) { h.el.style.display = 'none'; continue; }

        // Moons: hide when parent planet is too small (same rule as labels)
        if (h.type === 'moon' && h.parentIdx !== undefined) {
          const parentScreenSz = getScreenSize(meshes[h.parentIdx], cam, baseScale(h.parentIdx) * P[h.parentIdx].r);
          if (parentScreenSz < innerHeight / cfg.moonLabelHideFrac) { h.el.style.display = 'none'; continue; }
        }

        // Only show helper when object is too small on screen (< 20px) but not sub-pixel
        const worldR = h.getWorldR();
        const screenSz = getScreenSize(mesh, cam, worldR);
        if (screenSz >= 20) { h.el.style.display = 'none'; continue; }
        // Hide when truly invisible (sub-pixel) — too zoomed out
        if (h.type === 'planet' && screenSz < innerHeight / cfg.helperHideFrac) { h.el.style.display = 'none'; continue; }
        // Don't show if behind camera
        helperVec.setFromMatrixPosition(mesh.matrixWorld);
        if (isOccludedByPlanet(helperVec)) { h.el.style.display = 'none'; continue; }
        helperVec.project(cam);
        if (helperVec.z > 1) { h.el.style.display = 'none'; continue; }

        const x = (helperVec.x * .5 + .5) * innerWidth;
        const y = (helperVec.y * -.5 + .5) * innerHeight;
        h.el.style.display = 'block';
        h.el.style.width = cfg.helperSize + 'px'; h.el.style.height = cfg.helperSize + 'px';
        h.el.style.left = (x - cfg.helperSize / 2) + 'px';
        h.el.style.top = (y - cfg.helperSize / 2) + 'px';
      }
    }

    // ═══════ ANIMATE ═══════
    // t = elapsed real seconds (accelerated by speed)
    // t = elapsed accelerated seconds. simStartMs = real timestamp at t=0.
    let t = 0; let lastTime = performance.now();
    const simStartMs = Date.now();
    let animId: number;
    let frameCount = 0;
    function anim() {
      animId = requestAnimationFrame(anim);
      const now2 = performance.now(); const dt = Math.min((now2 - lastTime) / 1000, 0.1); lastTime = now2; // clamp to avoid spikes
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
        if (orbitLines[i - 1]) {
          orbitLines[i - 1].visible = showOrbits && cD < cfg.planetOrbitHideDist;
          const olm = (orbitLines[i - 1] as any).material;
          if (olm?.linewidth !== undefined) olm.linewidth = cfg.planetOrbitWidth;
          // Use darkenHex to simulate opacity (avoids Line2 white dot artifact with transparent:true)
          if (olm?.color && olm._lastOpacity !== cfg.planetOrbitOpacity) { olm.color.setHex(darkenHex(p.col, cfg.planetOrbitOpacity)); olm._lastOpacity = cfg.planetOrbitOpacity; }
        }
      });

      // Cloud rotation: slight drift relative to Earth surface (wind)
      if (earthCloudMesh) {
        const earthRotRate = 2 * Math.PI / (0.99727 * 86400);
        earthCloudMesh.rotation.y = t * earthRotRate * 1.02; // 2% faster than surface
      }

      // Moon orbital motion
      if (moonMesh) {
        const earthIdx = EARTH_IDX;
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
        const moonTooSmall = moonScreenSz < innerHeight / cfg.moonLabelHideFrac;
        moonMesh.visible = !moonTooSmall;
        if (moonOrbitLine) {
          moonOrbitLine.position.copy(earthPos);
          moonOrbitLine.scale.setScalar(eScale);
          moonOrbitLine.visible = showOrbits && !moonTooSmall && cD < cfg.moonOrbitHideDist;
          const moOlm = (moonOrbitLine as any).material;
          if (moOlm) { moOlm.linewidth = cfg.moonOrbitWidth; if (moOlm._lastOp !== cfg.moonOrbitOpacity) { moOlm.color.setHex(darkenHex(0x888888, cfg.moonOrbitOpacity)); moOlm._lastOp = cfg.moonOrbitOpacity; } }
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
          naturalMoonOrbits[i].visible = showOrbits && nm.visible && cD < cfg.moonOrbitHideDist;
          const nmOlm = (naturalMoonOrbits[i] as any).material;
          if (nmOlm) {
            nmOlm.linewidth = cfg.moonOrbitWidth;
            const bc = naturalMoonOrbits[i].userData.baseColor;
            if (bc !== undefined && nmOlm._lastOp !== cfg.moonOrbitOpacity) { nmOlm.color.setHex(darkenHex(bc, cfg.moonOrbitOpacity)); nmOlm._lastOp = cfg.moonOrbitOpacity; }
          }
        }
        // Visibility: hide when screen size < innerHeight / cfg.helperHideFrac
        const nmScreenSz = getScreenSize(nm, cam, pScale * nm.userData.visualR);
        nm.visible = nmScreenSz >= innerHeight / cfg.moonLabelHideFrac;
      });

      const tAngle = t * EARTH_RATE; // normalized orbital angle progress
      // Hide all probes when Earth < 1/5000 screen
      const earthScreenForProbes = getScreenSize(meshes[EARTH_IDX], cam, baseScale(EARTH_IDX) * P[EARTH_IDX].r);
      PR.forEach((pr, i) => {
        const m = probeMeshes[i];
        if (!layers.probe || earthScreenForProbes < innerHeight / cfg.helperHideFrac) { m.visible = false; return; }
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
        const eIdx = EARTH_IDX;
        const ep = meshes[eIdx].position;
        const sc = baseScale(eIdx);
        // Satellite visual size — proportional to Earth, very small
        // Satellite visual size — very small relative to Earth
        // Real satellite is ~10m, Earth radius = 6371km = 1 scene unit
        // True scale: 10/6371000 ≈ 0.0000016. We exaggerate to 0.0002 for minimal visibility.
        const baseSatSize = sc * earthSceneR * 0.0002;

        // Hide all satellites + trails when Earth is too small on screen
        const earthScreenForSats = getScreenSize(meshes[eIdx], cam, earthSceneR * sc);
        const hideAllSats = earthScreenForSats < innerHeight / cfg.satBracketHideFrac;

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
          if (!eci || !isFinite(eci.x) || !isFinite(eci.y) || !isFinite(eci.z)) { sm.visible = false; if (satTrailLines[i]) satTrailLines[i].visible = false; continue; }
          const pos = eciToScene(eci, ep, earthSceneR, sc);
          // Sanity: if position is at origin or too far, hide
          const dxE = pos.x - ep.x, dyE = pos.y - ep.y, dzE = pos.z - ep.z;
          const distFromEarth = Math.sqrt(dxE * dxE + dyE * dyE + dzE * dzE);
          if (distFromEarth < 0.001 || distFromEarth > 200 * sc) { sm.visible = false; continue; }

          // Occlusion: hide satellite if it's behind Earth (zero-allocation)
          const earthR = earthSceneR * sc;
          const cex = ep.x - cam.position.x, cey = ep.y - cam.position.y, cez = ep.z - cam.position.z;
          const csx = pos.x - cam.position.x, csy = pos.y - cam.position.y, csz = pos.z - cam.position.z;
          const camEarthDist = Math.sqrt(cex * cex + cey * cey + cez * cez);
          if (camEarthDist > earthR * 1.5) {
            const camSatDist = Math.sqrt(csx * csx + csy * csy + csz * csz);
            const dot = (cex * csx + cey * csy + cez * csz) / (camEarthDist * camSatDist);
            if (dot > 0.98 && camSatDist > camEarthDist) { sm.visible = false; continue; }
          }
          sm.visible = true;

          // Per-satellite jitter values (used for both position and trail)
          const isStation = sat.groupId === 'stations';
          const seed = i * 7919;
          const jitAmount = earthSceneR * sc * (isStation ? 0.1 : 0.03);
          const radialJit = (Math.abs(Math.sin(seed)) * 0.8 + 0.2) * jitAmount;
          const tanJit = jitAmount * 0.3;

          // Jitter — spread satellites along radial direction (outward from Earth only)
          // Radial direction from Earth center
          const dxR = pos.x - ep.x, dyR = pos.y - ep.y, dzR = pos.z - ep.z;
          const distR = Math.sqrt(dxR * dxR + dyR * dyR + dzR * dzR);
          if (distR > 0.001) {
            const nx = dxR / distR, ny = dyR / distR, nz = dzR / distR;
            pos.x += nx * radialJit;
            pos.y += ny * radialJit;
            pos.z += nz * radialJit;
            pos.x += Math.cos(seed * 2.7) * tanJit * ny;
            pos.y += Math.sin(seed * 3.1) * tanJit * nz;
            pos.z += Math.cos(seed * 1.3) * tanJit * nx;
          }
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
                  // Relative to Earth + same radial jitter as satellite position
                  let rx = pp.x - ep.x, ry = pp.y - ep.y, rz = pp.z - ep.z;
                  const rd = Math.sqrt(rx * rx + ry * ry + rz * rz);
                  if (rd > 0.001) {
                    const rnx = rx / rd, rny = ry / rd, rnz = rz / rd;
                    rx += rnx * radialJit + Math.cos(seed * 2.7) * tanJit * rny;
                    ry += rny * radialJit + Math.sin(seed * 3.1) * tanJit * rnz;
                    rz += rnz * radialJit + Math.cos(seed * 1.3) * tanJit * rnx;
                  }
                  satTrails[i][s * 3] = rx;
                  satTrails[i][s * 3 + 1] = ry;
                  satTrails[i][s * 3 + 2] = rz;
                } else { allValid = false; }
              }
              // Snap last point to exact current position (relative to Earth)
              satTrails[i][lastIdx * 3] = pos.x - ep.x;
              satTrails[i][lastIdx * 3 + 1] = pos.y - ep.y;
              satTrails[i][lastIdx * 3 + 2] = pos.z - ep.z;
              if (allValid) satTrailReady[i] = true;
            } else {
              // Between recomputations, only update the last point (relative to Earth)
              satTrails[i][lastIdx * 3] = pos.x - ep.x;
              satTrails[i][lastIdx * 3 + 1] = pos.y - ep.y;
              satTrails[i][lastIdx * 3 + 2] = pos.z - ep.z;
            }
            const line = satTrailLines[i];
            if (line) {
              line.visible = satTrailReady[i] && spd <= 7200;
              // Position trail at Earth center (vertices are relative to Earth)
              line.position.copy(ep);
              line.geometry.attributes.position.needsUpdate = true;
              line.geometry.setDrawRange(0, TRAIL_LEN);
              const mat = line.material as THREE.ShaderMaterial;
              if (mat.uniforms?.activePoints) mat.uniforms.activePoints.value = TRAIL_LEN;
              if (mat.uniforms?.opacity) mat.uniforms.opacity.value = cfg.satTrailOpacity;
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
            if (slEci && isFinite(slEci.x) && isFinite(slEci.y) && isFinite(slEci.z)) {
              const slP = eciToScene(slEci, ep, earthSceneR, sc);
              slPos[si * 3] = slP.x - ep.x;
              slPos[si * 3 + 1] = slP.y - ep.y;
              slPos[si * 3 + 2] = slP.z - ep.z;
            } else {
              // Invalid SGP4 result — hide this point at origin
              slPos[si * 3] = 0; slPos[si * 3 + 1] = 0; slPos[si * 3 + 2] = 0;
            }
          }
          // Position Points at Earth center — all vertices move with Earth
          sd.starlinkPoints.position.copy(ep);
          sd.starlinkPoints.geometry.attributes.position.needsUpdate = true;
        }
      }

      // Satellite orbit lines follow Earth position
      if (sd.orbitLines.length > 0) {
        const eIdx3 = EARTH_IDX;
        const ep2 = meshes[eIdx3].position;
        const sc2 = baseScale(eIdx3);
        sd.orbitLines.forEach(ol => {
          if (ol.visible) { ol.position.copy(ep2); ol.scale.setScalar(sc2); }
          const olm = (ol as any).material;
          if (olm) olm.opacity = cfg.satOrbitOpacity;
        });
      }

      if (focIdx >= 0) tT.copy(meshes[focIdx].position);
      // Follow focused satellite — track position, angle, and enlarge for visibility
      if (focSatIdx >= 0) {
        const fsm = satDataRef.current.meshes[focSatIdx];
        if (fsm) {
          fsm.visible = true;
          tT.copy(fsm.position);
          // On first focus: compute a fixed enlarged scale for visibility at initial distance
          if (!fsm.userData.baseScale) {
            fsm.userData.baseScale = fsm.scale.x;
            fsm.userData.focInitDist = tD; // use target distance (already set by __focusSat)
            // Compute model radius at unit scale
            const savedScale = fsm.scale.x;
            fsm.scale.setScalar(1);
            const bbox = new THREE.Box3().setFromObject(fsm);
            const bsph = new THREE.Sphere();
            bbox.getBoundingSphere(bsph);
            fsm.userData.modelRadius = Math.max(bsph.radius, 0.015);
            fsm.scale.setScalar(savedScale);
            // Scale to be ~1/20 screen width at initial distance
            const targetWorldR = 0.05 * tD * Math.tan(25 * Math.PI / 180);
            fsm.userData.focScale = targetWorldR / fsm.userData.modelRadius;
          }
          // Blend: at initial distance or closer → use focScale (natural zoom makes it bigger/smaller)
          // Beyond 3x initial distance → lerp back to baseScale
          const initDist = fsm.userData.focInitDist || cD;
          const blendStart = initDist * 2;
          const blendEnd = initDist * 5;
          const t2 = Math.min(Math.max((cD - blendStart) / (blendEnd - blendStart), 0), 1);
          const currentScale = fsm.userData.focScale * (1 - t2) + fsm.userData.baseScale * t2;
          fsm.scale.setScalar(Math.max(currentScale, fsm.userData.baseScale));
        }
      } else {
        // Restore any previously focused satellite to its base scale
        satDataRef.current.meshes.forEach(sm => {
          if (sm && sm.userData.baseScale) {
            sm.scale.setScalar(sm.userData.baseScale);
            delete sm.userData.baseScale;
            delete sm.userData.focScale;
            delete sm.userData.focInitDist;
            delete sm.userData.modelRadius;
          }
        });
      }

      const lf = 1 - Math.pow(.008, dt);
      cA.t += (tA.t - cA.t) * lf; cA.p += (tA.p - cA.p) * lf;
      if (focSatIdx >= 0) {
        // Position: snap to satellite (must track real-time SGP4 position)
        cT.copy(tT);
        // Distance: smooth lerp for zoom-in animation
        cD += (tD - cD) * lf;
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

      // Update atmosphere uniforms + hide glow when camera is inside the glow sphere
      const glowSunPos = meshes[0].position;
      glowMeshes.forEach(gm => {
        const mat = gm.userData.glowMat as THREE.ShaderMaterial;
        mat.uniforms.sunPos.value.copy(glowSunPos);
        mat.uniforms.camPos.value.copy(cam.position);
        // Hide glow if camera is inside the glow sphere (prevents visual artifacts)
        const parent = gm.parent;
        if (parent) {
          const glowWorldR = gm.scale.x * (parent.scale?.x || 1);
          const distToParent = cam.position.distanceTo(parent.position);
          gm.visible = distToParent > glowWorldR;
        }
      });

      // Dynamic near/far plane
      // When following a satellite, near must still preserve depth precision for Earth
      // (surface + clouds + atmosphere layers need distinguishable depth values)
      cam.near = Math.max(cD * 0.01, 0.001);
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
      naturalMoonOrbits.forEach(ol => { if ((ol as any).material?.resolution) (ol as any).material.resolution.set(innerWidth, innerHeight); });
      if (moonOrbitLine && (moonOrbitLine as any).material?.resolution) (moonOrbitLine as any).material.resolution.set(innerWidth, innerHeight);
    };
    window.addEventListener('resize', onResize);
    setTimeout(() => introRef.current?.classList.add('gone'), 2200);
    // Preload Starlink count from cache and update status with full count
    fetch(BASE + 'data/satellites-cache.json').then(r => r.ok ? r.json() : null).then(c => {
      if (c?.groups?.starlink) {
        const slTotal = c.groups.starlink.length;
        setStarlinkTotal(slTotal);
        if (satCountRef.current) {
          const nonSl = satDataRef.current.sats.length || 142;
          satCountRef.current.textContent = `${nonSl + slTotal} 颗卫星追踪中`;
        }
      }
    }).catch(() => {});
    if (satCountRef.current) satCountRef.current.textContent = '— 颗卫星追踪中';
    // Default: focus on Earth after intro
    const earthStartIdx = EARTH_IDX;
    setTimeout(() => { if (earthStartIdx >= 0) focusObj(earthStartIdx); }, 2400);
    setTimeout(() => updSpd(), 100); // set initial dial position
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
          <button className="layer-btn mobile-only" onClick={() => { closeAllPanels('mobileNav'); setMobileNavOpen(v => !v); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>星体</button>
          <button className={`layer-btn ${satListOpen ? 'on' : ''}`} ref={lSatRef} onClick={() => { if (!satListOpen) closeAllPanels('sat'); setSatListOpen(v => !v); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>卫星</button>
          <button className="layer-btn" onClick={() => { if (!mobileSettingsOpen) closeAllPanels('mobileSettings'); setMobileSettingsOpen(v => !v); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>设置</button>
        </div>
      </div>

      <div className="nav" ref={navRef} />

      {/* Info hint icon — appears when an object is selected, click to open details */}
      {infoHint && (
        <button className="info-hint" onClick={() => (window as any).__openInfo()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        </button>
      )}

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
            ev.preventDefault();
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
        }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        <div ref={iNameRef} className="info-name" />
        <div ref={iSubRef} className="info-sub" />
        <div ref={iGridRef} className="info-grid" />
        <div className="info-line" />
        <div className="info-fact-tag">✦ 你知道吗</div>
        <div ref={iFactRef} className="info-fact" />
        <div ref={iExtrasRef} />
      </div>

      <div className="timebar">
        <button className="tb on" ref={playBtnRef} onClick={() => (window as any).__togglePlay()}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="4" x2="6" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/></svg></button>
        <div className="speed-dial" ref={tSliderRef} onPointerDown={e => {
          e.preventDefault();
          const el = e.currentTarget;
          const rect = el.getBoundingClientRect();
          const setFromX = (x: number) => {
            const frac = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
            (window as any).__spdSlider(String(frac));
          };
          setFromX(e.clientX);
          const onMove = (ev: PointerEvent) => { ev.preventDefault(); setFromX(ev.clientX); };
          const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        }}>
          <div className="speed-dial-track">
            {SPEED_PRESETS.map((_, i) => (
              <div key={i} className="speed-dial-tick" style={{ left: `${(i / (SPEED_PRESETS.length - 1)) * 100}%`, height: i % 3 === 0 ? 10 : 6 }} />
            ))}
          </div>
          <div className="speed-dial-thumb" ref={el => {
            if (el) (window as any).__spdThumb = el;
          }} />
        </div>
        <div className="tspeed" ref={spdTxtRef}>1分/秒</div>
        <button className="tb" onClick={() => (window as any).__resetCam()}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>
      </div>

      {showStatus && (
        <div className="status">
          <div className="status-line"><span className="status-dot" style={{ background: 'var(--glow)' }} /><span>{satellites.length + starlinkTotal} 颗卫星追踪中</span></div>
          <div className="status-line"><span className="status-dot" style={{ background: 'var(--warm)' }} /><span>{PROBES.length} 个深空探测器</span></div>
        </div>
      )}

      {/* Satellite List Panel */}
      {satListOpen && (
        <div className="sat-panel" id="__satPanel">
          <button className="info-close" style={{ position: 'absolute', top: 10, right: 10, zIndex: 10 }}
            onClick={() => setSatListOpen(false)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          <div className="sat-panel-drag" onPointerDown={(e) => {
            e.preventDefault();
            const el = document.getElementById('__satPanel')!;
            const rect = el.getBoundingClientRect();
            const ox = e.clientX - rect.left, oy = e.clientY - rect.top;
            el.style.transition = 'none';
            el.style.left = rect.left + 'px'; el.style.top = rect.top + 'px'; el.style.right = 'auto';
            const onMove = (ev: PointerEvent) => { ev.preventDefault(); el.style.left = (ev.clientX - ox) + 'px'; el.style.top = (ev.clientY - oy) + 'px'; };
            const onUp = () => { el.style.transition = ''; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
            window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
          }} />
          <div className="sat-layout">
            <div className="sat-sidebar">
              <div className="sat-col-title">分类</div>
              {['beidou', 'probes', 'stations', 'starlink', 'gps', 'visual'].map(tid => {
                if (tid === 'probes') return (
                  <button key="probes" className={`sat-tab ${satTab === 'probes' ? 'active' : ''}`} onClick={() => setSatTab('probes')}>
                    <span className="sat-tab-row"><span className={`sat-tab-dot ${probesVisible ? '' : 'off'}`} style={{ background: 'linear-gradient(135deg, #81C784, #CE93D8, #FFB74D)' }} />探测器</span>
                    <span className="sat-tab-count">数量：{PROBES.length}</span>
                  </button>
                );
                const g = SAT_GROUPS.find(gg => gg.id === tid);
                if (!g) return null;
                return (
                  <button key={g.id} className={`sat-tab ${satTab === g.id ? 'active' : ''}`} onClick={() => setSatTab(g.id)}>
                    <span className="sat-tab-row"><span className={`sat-tab-dot ${satGroups[g.id] ? '' : 'off'}`} style={{ background: g.color }} />{g.labelCn}</span>
                    <span className="sat-tab-count">数量：{g.id === 'starlink' ? (starlinkTotal || satellites.filter(s => s.groupId === g.id).length) : satellites.filter(s => s.groupId === g.id).length}</span>
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
                  starlink: `SpaceX星链互联网卫星，LEO约550km。CelesTrak收录约${starlinkTotal || '10,000'}颗，启用后自动过滤退役和调轨中的卫星，仅展示在300-800km轨道正常运行的卫星。`,
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
                    }) : (g.id === 'starlink' && !starlinkLoading ? <div className="sat-loading" style={{ fontSize: 10 }}>启用后加载全部正常运行的卫星</div> : <div className="sat-loading">加载中...</div>)}
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
        {PLANETS.map((p, i) => {
          const moons = NATURAL_MOONS.filter(nm => nm.parentId === p.id);
          const totalKnown = MOON_COUNTS[p.id] ?? 0;
          return (
            <div key={p.id}>
              <div className="mobile-toggle" onClick={() => { (window as any).__focusPlanetByIdx?.(i); setMobileNavOpen(false); }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                <span>{p.nameCn.split('—')[0].trim()}</span>
                {totalKnown > 0 && <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 'auto' }}>{totalKnown}天然卫星</span>}
              </div>
              {moons.length > 0 && (
                <div style={{ paddingLeft: 20, paddingBottom: 4 }}>
                  {p.id === 'earth' && (
                    <div className="mobile-toggle" style={{ padding: '4px 0', fontSize: 11 }} onClick={() => { (window as any).__focusNaturalMoon?.('moon'); setMobileNavOpen(false); }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#aaa', flexShrink: 0 }} />
                      <span>月球</span>
                    </div>
                  )}
                  {moons.filter(nm => nm.id !== 'moon').map(nm => (
                    <div key={nm.id} className="mobile-toggle" style={{ padding: '4px 0', fontSize: 11 }} onClick={() => { (window as any).__focusNaturalMoon?.(nm.id); setMobileNavOpen(false); }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: nm.color, flexShrink: 0 }} />
                      <span>{nm.nameCn}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className={`mobile-nav-backdrop ${mobileNavOpen ? 'open' : ''}`} onClick={() => setMobileNavOpen(false)} />

      {/* Settings panel — same style as satellite panel */}
      {mobileSettingsOpen && (
        <div className="sat-panel" id="__settingsPanel" style={{ left: 'auto', right: 70, top: 70 }}>
          <button className="info-close" style={{ position: 'absolute', top: 10, right: 10, zIndex: 10 }}
            onClick={() => setMobileSettingsOpen(false)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          <div className="sat-panel-drag" onPointerDown={(e) => {
            e.preventDefault();
            const el = document.getElementById('__settingsPanel')!;
            const rect = el.getBoundingClientRect();
            const ox = e.clientX - rect.left, oy = e.clientY - rect.top;
            el.style.transition = 'none';
            el.style.left = rect.left + 'px'; el.style.top = rect.top + 'px'; el.style.right = 'auto';
            const onMove = (ev: PointerEvent) => { ev.preventDefault(); el.style.left = (ev.clientX - ox) + 'px'; el.style.top = (ev.clientY - oy) + 'px'; };
            const onUp = () => { el.style.transition = ''; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
            window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
          }} />
          <div className="sat-layout">
            <div className="sat-sidebar">
              <div className="sat-col-title">设置</div>
              {[
                { id: 'planets', label: '行星系统' },
                { id: 'sats', label: '人造卫星' },
                { id: 'general', label: '通用' },
                { id: 'audio', label: '音效' },
              ].map(t => (
                <button key={t.id} className={`sat-tab ${settingsTab === t.id ? 'active' : ''}`} onClick={() => setSettingsTab(t.id)}>
                  <span className="sat-tab-row">{t.label}</span>
                </button>
              ))}
            </div>
            <div className="sat-content">
              <div className="sat-col-title">详情</div>

              {settingsTab === 'planets' && (<>
                <div className="sat-content-header">
                  <div className="sat-content-title">行星与天然卫星</div>
                  <div className="sat-content-sub">轨道线样式、辅助框、可见性</div>
                </div>
                <div className="sat-content-divider" />
                <div style={{ fontSize: 10, color: 'var(--glow)', marginBottom: 4 }}>行星轨道</div>
                <CfgStepper label="线宽" min={0.5} max={4} step={0.1} cfgKey="planetOrbitWidth" />
                <CfgStepper label="亮度" min={0} max={1} step={0.05} cfgKey="planetOrbitOpacity" />
                <CfgStepper label="消失距离" min={500} max={20000} step={100} cfgKey="planetOrbitHideDist" />
                <div className="sat-content-divider" />
                <div style={{ fontSize: 10, color: 'var(--glow)', marginBottom: 4 }}>天然卫星轨道</div>
                <CfgStepper label="线宽" min={0.5} max={3} step={0.1} cfgKey="moonOrbitWidth" />
                <CfgStepper label="亮度" min={0} max={1} step={0.05} cfgKey="moonOrbitOpacity" />
                <CfgStepper label="消失距离" min={50} max={500} step={10} cfgKey="moonOrbitHideDist" />
                <div className="sat-content-divider" />
                <div style={{ fontSize: 10, color: 'var(--glow)', marginBottom: 4 }}>辅助框与可见性</div>
                <CfgStepper label="行星辅助框大小" min={10} max={36} step={1} cfgKey="helperSize" />
                <CfgStepper label="行星名称可见性" min={500} max={20000} step={500} cfgKey="labelHideFrac" />
                <CfgStepper label="天然卫星可见性" min={500} max={5000} step={100} cfgKey="moonLabelHideFrac" />
                <CfgStepper label="辅助框可见性" min={500} max={20000} step={500} cfgKey="helperHideFrac" />
              </>)}

              {settingsTab === 'sats' && (<>
                <div className="sat-content-header">
                  <div className="sat-content-title">人造卫星</div>
                  <div className="sat-content-sub">轨道线、轨迹、标记样式与可见性</div>
                </div>
                <div className="sat-content-divider" />
                <div style={{ fontSize: 10, color: 'var(--glow)', marginBottom: 4 }}>轨道与轨迹</div>
                <CfgStepper label="轨道亮度" min={0} max={0.5} step={0.01} cfgKey="satOrbitOpacity" />
                <CfgStepper label="轨迹亮度" min={0} max={1} step={0.05} cfgKey="satTrailOpacity" />
                <div className="sat-content-divider" />
                <div style={{ fontSize: 10, color: 'var(--glow)', marginBottom: 4 }}>标记与可见性</div>
                <CfgStepper label="选择框大小" min={6} max={24} step={1} cfgKey="bracketSize" />
                <CfgStepper label="名称可见性" min={5000} max={20000} step={100} cfgKey="satLabelHideFrac" />
                <CfgStepper label="选择框可见性" min={100} max={1000} step={50} cfgKey="satBracketHideFrac" />
              </>)}

              {settingsTab === 'general' && (<>
                <div className="sat-content-header">
                  <div className="sat-content-title">通用设置</div>
                  <div className="sat-content-sub">全局显示开关</div>
                </div>
                <div className="sat-content-divider" />
                <label className="mobile-toggle"><input type="checkbox" defaultChecked onChange={() => (window as any).__toggleLabels()} /><span>名称标签</span></label>
                <label className="mobile-toggle"><input type="checkbox" defaultChecked onChange={() => (window as any).__toggleOrbits()} /><span>轨道线</span></label>
                <label className="mobile-toggle"><input type="checkbox" defaultChecked id="__helperBtn" onChange={() => (window as any).__toggleHelpers()} /><span>选择辅助框</span></label>
                <label className="mobile-toggle"><input type="checkbox" checked={showStatus} onChange={() => setShowStatus(v => !v)} /><span>状态信息栏</span></label>
                <div className="sat-content-divider" />
                <div style={{ fontSize: 10, color: 'var(--glow)', marginBottom: 4 }}>单指旋转控制</div>
                <label className="mobile-toggle"><input type="checkbox" onChange={e => { (window as any).__cfg.invertH = e.target.checked; }} /><span>反转左右旋转</span></label>
                <label className="mobile-toggle"><input type="checkbox" onChange={e => { (window as any).__cfg.invertV = e.target.checked; }} /><span>反转上下旋转</span></label>
              </>)}
              {settingsTab === 'audio' && (<>
                <div className="sat-content-header">
                  <div className="sat-content-title">音效设置</div>
                  <div className="sat-content-sub">控制背景音乐和音量</div>
                </div>
                <div className="sat-content-divider" />
                <label className="mobile-toggle"><input type="checkbox" onChange={() => (window as any).__toggleSound()} /><span>开启音效</span></label>
                <VolStepper label="音量" min={0} max={1} step={0.05} defaultValue={0.15} onChange={v => (window as any).__setVolume(v)} />
                <div className="sat-content-divider" />
                <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4 }}>曲目</div>
                {TRACKS_LIST.map((tr, i) => (
                  <div key={i} className="sat-item" style={{ cursor: 'pointer' }} onClick={() => (window as any).__setTrack(i)}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--glow)" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                    <span className="sat-name">{tr.name}</span>
                  </div>
                ))}
              </>)}
            </div>
          </div>
        </div>
      )}

      {/* Toast popup */}
      <div className={`toast ${toast ? 'show' : ''}`}>
        {toast && <>
          <button className="toast-close" onClick={() => setToast(null)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
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
