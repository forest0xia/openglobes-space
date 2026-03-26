import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PLANETS } from './data/planets';
import { NATURAL_MOONS, MOON_COUNTS } from './data/moons';
import { PROBES } from './data/probesMeta';
import { fetchAllSatellites, fetchSatelliteGroup, getSatPositionECI, eciToScene, SAT_GROUPS, type SatRecord } from './services/celestrak';
import { createSatelliteModel } from './utils/satModel';
import { createProbeModel } from './utils/probeModels';
import { createTrailMaterial, createTrailIndexAttribute } from './utils/trailShader';
import { getSatDisplayName } from './data/satNames';

const h2n = (h: string) => parseInt(h.replace('#', ''), 16);

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
  r: p.radius, d: p.distance, s: p.speed, tilt: p.tilt,
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
  const [satListOpen, setSatListOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [toast, setToast] = useState<{ title: string; text: string } | null>(null);
  const [satTab, setSatTab] = useState('beidou');
  const [starlinkLoading, setStarlinkLoading] = useState(false);
  const [starlinkProgress, setStarlinkProgress] = useState(0);
  const [satellites, setSatellites] = useState<SatRecord[]>([]);
  const [satGroups, setSatGroups] = useState<Record<string, boolean>>({ beidou: true, stations: true, gps: false, starlink: false, visual: false });

  // Store refs accessible from inside useEffect
  const satDataRef = useRef<{ sats: SatRecord[]; meshes: THREE.Mesh[]; groups: Record<string, boolean>; orbitLines: THREE.Line[]; trailLines: THREE.Line[] }>({ sats: [], meshes: [], groups: { beidou: true, stations: true, gps: false, starlink: false, visual: false }, orbitLines: [], trailLines: [] });

  useEffect(() => {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .1, 2000);
    const ren = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    ren.setSize(innerWidth, innerHeight); ren.setPixelRatio(Math.min(devicePixelRatio, 2));
    ren.toneMapping = THREE.ACESFilmicToneMapping; ren.toneMappingExposure = 1.4;
    canvasRef.current!.appendChild(ren.domElement);
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
    const orbitLines: THREE.Line[] = [];
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

      if (p.sun) {
        // Light pulse rings — expand outward simulating light propagation
        // Light travel time Sun→Earth: 499 seconds. In scene units: Earth at d=20, so speed = 20/499 = ~0.04 units/s
        // Radial corona glow — a gradient shell that fades outward
        // Uses a custom shader for radial transparency falloff
        const coronaMat = new THREE.ShaderMaterial({
          uniforms: {
            glowColor: { value: new THREE.Vector3(1.0, 0.85, 0.4) },
            innerR: { value: p.r * 0.98 },
            outerR: { value: p.r * 1.8 },
          },
          vertexShader: `
            varying vec3 vWorldPos;
            varying vec3 vCenter;
            void main() {
              vec4 wp = modelMatrix * vec4(position, 1.0);
              vWorldPos = wp.xyz;
              vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
              gl_Position = projectionMatrix * viewMatrix * wp;
            }
          `,
          fragmentShader: `
            uniform vec3 glowColor;
            uniform float innerR;
            uniform float outerR;
            varying vec3 vWorldPos;
            varying vec3 vCenter;
            void main() {
              float dist = length(vWorldPos - vCenter);
              // Bright near surface (innerR), rapid falloff to transparent at outerR
              float t = clamp((dist - innerR) / (outerR - innerR), 0.0, 1.0);
              float glow = (1.0 - t) * (1.0 - t) * 0.7; // quadratic falloff
              gl_FragColor = vec4(glowColor, glow);
            }
          `,
          transparent: true,
          depthWrite: false,
          side: THREE.FrontSide,
          blending: THREE.AdditiveBlending,
        });
        const corona = new THREE.Mesh(new THREE.SphereGeometry(p.r * 1.8, 48, 48), coronaMat);
        m.add(corona);
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
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(op, 3));
        const ol = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: p.col, transparent: true, opacity: 0.35 }));
        scene.add(ol); orbitLines.push(ol);
      }
    });

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

      // On-demand load for Starlink: fetch all 6000+ when first enabled
      if (gid === 'starlink' && g[gid] && satDataRef.current.sats.filter(s => s.groupId === 'starlink').length === 0) {
        setStarlinkLoading(true);
        setStarlinkProgress(0);
        const newSats = await fetchSatelliteGroup('starlink');
        setStarlinkProgress(50);
        // Create simple purple spheres for each Starlink sat
        const sd = satDataRef.current;
        const batchSize = 200;
        for (let b = 0; b < newSats.length; b += batchSize) {
          const batch = newSats.slice(b, b + batchSize);
          batch.forEach(sat => {
            const sm = new THREE.Mesh(
              new THREE.SphereGeometry(0.003, 4, 4),
              new THREE.MeshBasicMaterial({ color: 0x8B5CF6 })
            ) as any as THREE.Mesh;
            const dn = sat.name;
            sm.userData = { isSat: true, name: sat.name, displayName: dn, groupId: 'starlink', color: '#8B5CF6', satIdx: sd.meshes.length };
            sm.visible = false; // invisible until first valid position
            scene.add(sm);
            sd.meshes.push(sm);
            sd.sats.push(sat);
            // No trail for Starlink (too many)
            satTrails.push(new Float32Array(TRAIL_LEN * 3));
            satTrailIdx.push(0);
            satTrailReady.push(false);
            satTrailLines.push(null as any);
          });
          setStarlinkProgress(50 + Math.round((b / newSats.length) * 50));
          // Yield to UI
          await new Promise(r => setTimeout(r, 0));
        }
        setSatellites(prev => [...prev, ...newSats]);
        satCountRef.current!.textContent = `${sd.sats.length} 颗卫星追踪中`;
        setStarlinkLoading(false);
        return;
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
      if (distFromOrigin < 1 || !sm.visible) {
        // Satellite hasn't been positioned yet — show toast
        setToast({ title: sat.name, text: '该卫星位置尚未计算完成，请稍等后重试。' });
        return;
      }

      focIdx = -1;
      tT.copy(sm.position);
      tD = fitDistance(Math.max(sm.scale?.x || 0.01, 0.01));
      // For LEO/MEO satellites: set camera angle to look from behind satellite toward Earth
      // This prevents the camera from being between the satellite and Earth (inside Earth)
      const eIdx2 = P.findIndex(pp => pp.id === 'earth');
      if (eIdx2 >= 0) {
        const satToEarth = new THREE.Vector3().subVectors(meshes[eIdx2].position, sm.position);
        if (satToEarth.length() > 0.01) {
          // Camera angle: point away from Earth (behind the satellite)
          const dir = satToEarth.normalize();
          tA.t = Math.atan2(dir.x, dir.z) + Math.PI; // opposite direction
          tA.p = Math.acos(Math.max(-0.99, Math.min(0.99, dir.y))) * 0.7 + 0.3;
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
        if (type === 'sat' && earthScreenL < innerHeight / 100) { el.style.display = 'none'; return; }
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
        labelVec.project(cam);
        if (labelVec.z > 1) { el.style.display = 'none'; return; } // behind camera
        const x = (labelVec.x * .5 + .5) * innerWidth;
        const y = (labelVec.y * -.5 + .5) * innerHeight;
        el.style.display = 'block';
        // Offset based on object screen size so label never overlaps
        const screenR = Math.max(objScreenSz / 2, 8);
        el.style.left = (x + screenR + 6) + 'px';
        el.style.top = (y - screenR * 0.5) + 'px';
        // Planet labels larger than satellite labels
        el.style.fontSize = type === 'planet' ? '14px' : type === 'moon' ? '10px' : '9px';
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

    ren.domElement.addEventListener('pointerdown', e => { drag = true; dragMoved = false; pM = { x: e.clientX, y: e.clientY }; document.body.style.cursor = 'grabbing'; });
    ren.domElement.addEventListener('pointermove', e => {
      if (drag) {
        const dx = e.clientX - pM.x, dy = e.clientY - pM.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
        tA.t -= dx * .004; tA.p = Math.max(.1, Math.min(Math.PI - .1, tA.p - dy * .004));
        pM = { x: e.clientX, y: e.clientY };
      }
      hoverFn(e);
    });
    ren.domElement.addEventListener('pointerup', () => { drag = false; document.body.style.cursor = 'grab'; });
    ren.domElement.addEventListener('pointerleave', () => { drag = false; });
    ren.domElement.addEventListener('wheel', e => {
      e.preventDefault();
      // Zoom speed: proportional to distance, very gentle
      // e.deltaY is ~100 per scroll notch. We want ~5% distance change per notch.
      // Zoom tiers: close planets → solar system → galaxy transition → deep space
      const zoomPct = tD < 10 ? 0.0003 : tD < 800 ? 0.0004 : tD < 30000 ? 0.00015 : 0.00008;
      tD = Math.max(0.01, Math.min(500000, tD * (1 + e.deltaY * zoomPct)));
    }, { passive: false });

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
      focIdx = i; const p = P[i];
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
      const pr = PR[i]; focIdx = -1;
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
      focIdx = -1;
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
      focIdx = -1;
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
      focIdx = -1;
      // (no scale change needed — planets stay at base scale)
      navRef.current!.querySelectorAll('.nav-planet').forEach(d => d.classList.remove('active'));
      document.querySelectorAll('.nav-moons').forEach(mc => (mc as HTMLElement).style.display = 'none');
    };

    // ═══════ CONTROLS ═══════
    // Speed presets: each value = how many real seconds per animation second
    // 1 = real-time, 86400 = 1 day/s, 2592000 = 1 month/s, etc.
    const SPEED_PRESETS = [
      { v: 1, label: '1秒' },
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
      if (k === 'probe') probeMeshes.forEach(m => m.visible = layers.probe);
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
      // Only show brackets when Earth is visible at reasonable size (not too zoomed out)
      const eIdx4 = P.findIndex(p => p.id === 'earth');
      const earthScreen = getScreenSize(meshes[eIdx4], camera, earthSceneR * earthScale);
      const showBrackets = earthScreen > innerHeight * 0.01; // Earth > 1% of screen

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
        if (!sm || !sm.visible || !showBrackets) { el.style.display = 'none'; continue; }

        bracketVec.setFromMatrixPosition(sm.matrixWorld);
        bracketVec.project(camera);
        if (bracketVec.z > 1) { el.style.display = 'none'; continue; }

        const x = (bracketVec.x * .5 + .5) * innerWidth;
        const y = (bracketVec.y * -.5 + .5) * innerHeight;

        // Check if satellite is too small on screen to see
        const satScreenSize = getScreenSize(sm, camera, satSize || 0.003);
        if (satScreenSize > 4) { el.style.display = 'none'; continue; } // visible enough, no bracket needed

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

    let satSize = 0.003;
    const MIN_SCREEN_FRAC = 1 / 5000; // hide objects + labels + orbits when smaller than 1/5000 of screen

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
        if (p.sun) {
          meshes[i].rotation.y = t * EARTH_RATE * .5;
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
        if (!paused) meshes[i].rotation.y += dt * .25;

        // Hide planet + its orbit if too small on screen
        if (orbitLines[i - 1]) orbitLines[i - 1].visible = showOrbits;
      });

      // Cloud rotation (children inherit position, just rotate relative to parent)
      if (earthCloudMesh && !paused) earthCloudMesh.rotation.y += dt * .02; // slight drift vs Earth surface

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
        if (!paused) nm.rotation.y += dt * 0.2;
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
        m.rotation.y += dt * .08;
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
          // Sanity: if position is at origin (inside Sun) or too far, hide
          const distFromEarth = Math.sqrt((pos.x - ep.x) ** 2 + (pos.y - ep.y) ** 2 + (pos.z - ep.z) ** 2);
          if (distFromEarth < 0.001 || distFromEarth > 200 * sc) { sm.visible = false; continue; }
          sm.visible = true;

          // Jitter — larger for stations (LEO objects cluster), smaller for MEO/GEO
          const isStation = sat.groupId === 'stations';
          const jit = earthSceneR * sc * (isStation ? 0.12 : 0.03);
          const seed = i * 7919;
          pos.x += Math.sin(seed) * jit;
          pos.y += Math.cos(seed * 1.3) * jit;
          pos.z += Math.sin(seed * 2.7) * jit;
          sm.position.set(pos.x, pos.y, pos.z);

          // Stations 5x bigger than regular sats
          const thisSize = isStation ? baseSatSize * 3 : baseSatSize;
          sm.scale.setScalar(Math.max(thisSize, isStation ? 0.02 : 0.005));

          // Hide satellite if its own screen size is too small
          const satScreenSz = getScreenSize(sm, cam, Math.max(thisSize, 0.005));
          if (satScreenSz < innerHeight / 5000) {
            sm.visible = false;
            if (satTrailLines[i]) { satTrailLines[i].visible = false; satTrailLines[i].geometry.setDrawRange(0, 0); }
            if (satTrails[i]) { satTrails[i].fill(0); satTrailReady[i] = false; }
            continue;
          }

          // Trail: skip entirely at high speeds (orbits too fast for meaningful trails)
          if (satTrails[i] && spd <= 3600) {
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
              line.visible = satTrailReady[i] && spd <= 3600;
              line.geometry.attributes.position.needsUpdate = true;
              line.geometry.setDrawRange(0, TRAIL_LEN);
              const mat = line.material as THREE.ShaderMaterial;
              if (mat.uniforms?.activePoints) mat.uniforms.activePoints.value = TRAIL_LEN;
            }
          }
        }

        // Bracket markers — screen-space click helpers
        updateSatBrackets(sd, cam, sc);
      }

      // Satellite orbit lines follow Earth position
      if (sd.orbitLines.length > 0) {
        const eIdx3 = P.findIndex(p => p.id === 'earth');
        const ep2 = meshes[eIdx3].position;
        const sc2 = baseScale(eIdx3);
        sd.orbitLines.forEach(ol => { if (ol.visible) { ol.position.copy(ep2); ol.scale.setScalar(sc2); } });
      }

      if (focIdx >= 0) tT.copy(meshes[focIdx].position);

      const lf = 1 - Math.pow(.008, dt);
      cA.t += (tA.t - cA.t) * lf; cA.p += (tA.p - cA.p) * lf;
      cD += (tD - cD) * lf; cT.lerp(tT, lf);
      // Prevent camera from entering any planet's interior
      // After computing cam position, check against all visible planets and push out if inside
      const camPos = cam.position;
      meshes.forEach((m, idx) => {
        if (!m.visible || P[idx].sun) return;
        const camToObj = camPos.distanceTo(m.position);
        const r = baseScale(idx) * P[idx].r * 1.1;
        if (camToObj < r && r > 0.001) {
          // Camera is inside this planet — push camera outward along the camera-to-planet direction
          const pushDir = camPos.clone().sub(m.position).normalize();
          cam.position.copy(m.position).add(pushDir.multiplyScalar(r));
          cD = Math.max(cD, r);
          tD = Math.max(tD, r);
        }
      });
      cam.position.set(cT.x + cD * Math.sin(cA.p) * Math.cos(cA.t), cT.y + cD * Math.cos(cA.p), cT.z + cD * Math.sin(cA.p) * Math.sin(cA.t));
      cam.lookAt(cT);
      // Dynamic near/far plane — prevents clipping when zoomed very close
      cam.near = Math.max(cD * 0.001, 0.0001);
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
    }

    const onResize = () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); ren.setSize(innerWidth, innerHeight); };
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
          {/* Vertical sidebar tabs + content */}
          <div className="sat-layout">
            <div className="sat-sidebar">
              {/* Custom order: 北斗, 探测器, 空间站, Starlink, GPS, 明亮卫星 */}
              {['beidou', 'probes', 'stations', 'starlink', 'gps', 'visual'].map(tid => {
                if (tid === 'probes') return (
                  <button key="probes" className={`sat-tab ${satTab === 'probes' ? 'active' : ''}`} onClick={() => setSatTab('probes')}>
                    <span className="sat-tab-row"><span className="sat-tab-dot" style={{ background: 'linear-gradient(135deg, #81C784, #CE93D8, #FFB74D)' }} />探测器</span>
                    <span className="sat-tab-count">{PROBES.length}</span>
                  </button>
                );
                const g = SAT_GROUPS.find(gg => gg.id === tid);
                if (!g) return null;
                return (
                  <button key={g.id} className={`sat-tab ${satTab === g.id ? 'active' : ''}`} onClick={() => setSatTab(g.id)}>
                    <span className="sat-tab-row"><span className="sat-tab-dot" style={{ background: g.color }} />{g.labelCn}</span>
                    <span className="sat-tab-count">{satellites.filter(s => s.groupId === g.id).length}</span>
                  </button>
                );
              })}
            </div>
            <div className="sat-content">
              {satTab === 'probes' ? (<>
                <div className="sat-desc">太阳系深空探测器，包括旅行者号、韦伯望远镜等。位置基于JPL轨道数据。</div>
                <label className="info-toggle" style={{ fontSize: 12, padding: '6px 0' }}>
                  <input type="checkbox" defaultChecked onChange={() => (window as any).__toggleL('probe')} />
                  <span>显示</span>
                </label>
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
                  <div className="sat-desc">{descs[g.id]}</div>
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
                  <div className="sat-list">
                    {groupSats.length > 0 ? groupSats.map((s) => {
                      const realIdx = satellites.indexOf(s);
                      return (
                        <div key={realIdx} className="sat-item" onClick={() => (window as any).__focusSat(realIdx)}>
                          <span className="sat-dot" style={{ background: s.color }} />
                          <span className="sat-name">{getSatDisplayName(s.name, s.noradId)}</span>
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
    </>
  );
}
