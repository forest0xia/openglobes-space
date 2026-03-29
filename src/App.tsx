import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PLANETS } from './data/planets';
import { NATURAL_MOONS, MOON_COUNTS } from './data/moons';
import { PROBES } from './data/probesMeta';
import { fetchAllSatellites, fetchStarlinkSatellites, getSatPositionECI, eciToScene, SAT_GROUPS, type SatRecord } from './services/celestrak';
import { createSatelliteModel } from './utils/satModel'; // only used for focused satellite detail model
import { createProbeModel } from './utils/probeModels';
import { createTrailMaterial, createTrailIndexAttribute } from './utils/trailShader';
import { getSatDisplayName } from './data/satNames';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { h2n, darkenHex, TRACKS_LIST, BASE, SPEED_PRESETS, TEX_FILES, procTex, P, PR } from './config/constants';
import { addAtmosphere, addSurfaceAtmo, PLANET_ATMO_CONFIGS } from './shaders/atmosphere';
import { CfgStepper, VolStepper, CfgToggle } from './components/Controls';
// ═══ Module-level constants (accessible in both useEffect and JSX) ═══
const GID_STARLINK = 'starlink';
const GID_STATIONS = 'stations';

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
  // tSliderRef removed — speed dial replaced with +/- buttons
  const satCountRef = useRef<HTMLSpanElement>(null);
  const lSatRef = useRef<HTMLButtonElement>(null);
  // (lProbeRef removed — probe toggle is now in satellite panel)
  // labelsRef removed — labels integrated into helper system
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
  const infoHintRef = useRef<HTMLButtonElement>(null);
  (window as any).__showInfoHint = () => { if (infoHintRef.current) infoHintRef.current.style.display = 'block'; };
  (window as any).__openInfo = () => { closeAllPanels('info'); infoRef.current?.classList.add('open'); if (infoHintRef.current) infoHintRef.current.style.display = 'none'; };
  const [toast, setToast] = useState<{ title: string; text: string } | null>(null);
  const [satTab, setSatTab] = useState('beidou');
  const [settingsTab, setSettingsTab] = useState('general');
  // infoHint is DOM-driven (not React state) to avoid full App re-renders on every planet click
  const [showStatus, setShowStatus] = useState(typeof window !== 'undefined' && window.innerWidth > 768);
  const [starlinkLoading, setStarlinkLoading] = useState(false);
  const [starlinkProgress, setStarlinkProgress] = useState(0);
  const [starlinkTotal, setStarlinkTotal] = useState(0);
  const [probesVisible, setProbesVisible] = useState(false);
  const [satellites, setSatellites] = useState<SatRecord[]>([]);
  const [satGroups, setSatGroups] = useState<Record<string, boolean>>({ beidou: true, weather: true, stations: false, starlink: false, gps: false, visual: false, resource: false, science: false, geodetic: false });

  // Store refs accessible from inside useEffect
  const satDataRef = useRef<{
    sats: SatRecord[]; meshes: (THREE.Mesh | null)[]; groups: Record<string, boolean>;
    orbitLines: THREE.Line[];
    starlinkMesh?: THREE.InstancedMesh; starlinkSats?: SatRecord[]; starlinkPositions?: Float32Array;
  }>({ sats: [], meshes: [], groups: { beidou: true, weather: true, stations: false, starlink: false, gps: false, visual: false, resource: false, science: false, geodetic: false }, orbitLines: [] });

  useEffect(() => {
    // ═══ SHARED CONSTANTS — single source of truth for thresholds ═══
    const PARENT_HIDE_PX = 3;          // hide child helpers/mesh when parent < this px
    const SAT_SIZE_FACTOR = 0.0002;    // satellite visual size relative to Earth
    const SAT_MIN_SIZE_FACTOR = 0.001; // minimum satellite size relative to Earth
    const STATION_SCALE = 3;           // stations are this × bigger than regular sats
    const STARLINK_DOT_FACTOR = 0.002; // Starlink instance size relative to Earth
    const STARLINK_LIST_PREVIEW = 25;  // how many Starlink shown in sidebar list
    const SPEED_HIDE_TRAILS = 1800;    // spd > this: hide trails, show orbit lines
    const SPEED_HIDE_UI = 1800;        // spd > this: hide sat labels/brackets
    const SPEED_SKIP_SATS = 86400;     // spd >= this: skip all satellite SGP4
    // SOLAR_SYSTEM_SCALE removed — use SUN_HIDE_PX for consistent galaxy-scale detection
    const KEPLER_ITERATIONS = 5;       // Newton's method iterations for Kepler eq
    const FOCUS_MODEL_SCALE = 0.002;   // focused satellite model size (fraction of screen)
    const SUN_HIDE_PX = 5;            // sun < this px: galaxy scale, hide solar system
    const TRAIL_LEN = 80;             // SGP4 sample points per trail
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
      satBracketHideFrac: 20,
      planetOrbitHideDist: 5000,
      moonOrbitHideDist: 300,
      invertH: false,
      invertV: false,
      showLabels: true,
      showOrbits: true,
      showHelpers: true,
      showTrails: true,
    };
    const scene = new THREE.Scene();
    const isMobile = innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent);
    const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .1, 2000);
    const ren = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    ren.setSize(innerWidth, innerHeight); ren.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
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
      new THREE.SphereGeometry(500000, 16, 16),
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
      const segs = (p.id === 'earth' || p.id === 'jupiter' || p.id === 'saturn') ? 64 : 48;
      const m = new THREE.Mesh(new THREE.SphereGeometry(p.r, segs, segs), mat);

      // Atmosphere glow — from extracted shaders/atmosphere.ts
      const atmoCfg = PLANET_ATMO_CONFIGS[p.id];
      if (atmoCfg) {
        const gm = addAtmosphere(m, atmoCfg.atmosphere, p.r);
        gm.userData.planetId = p.id;
        glowMeshes.push(gm);
        if (atmoCfg.surfaceAtmo) {
          const sm2 = addSurfaceAtmo(m, atmoCfg.surfaceAtmo.dayColor, atmoCfg.surfaceAtmo.twilightColor, atmoCfg.surfaceAtmo.strength, p.r);
          sm2.userData.planetId = p.id;
          glowMeshes.push(sm2);
        }
      }

      // Earth: atmosphere + clouds as CHILDREN — they inherit scale/position automatically.
      // depthWrite:false on both prevents them from occluding the Earth surface.
      if (p.id === 'earth') {
        earthCloudMesh = new THREE.Mesh(
          new THREE.SphereGeometry(p.r * 1.015, 32, 32),
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

    // ═══════ NATURAL MOONS (all except Earth's Moon) ═══════
    const naturalMoonMeshes: THREE.Mesh[] = [];
    const naturalMoonData: typeof NATURAL_MOONS = [];
    const naturalMoonOrbits: (THREE.Line | Line2)[] = [];
    // Pre-compute parent planet lookups (avoid PLANETS.find in animation loop)
    const naturalMoonParentPlanets: (typeof PLANETS[0] | null)[] = [];
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
      naturalMoonParentPlanets.push(parentPlanet);

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

    // ═══════ TRAILS TOGGLE ═══════
    let showTrails = true;
    (window as any).__toggleTrails = () => {
      showTrails = !showTrails;
      cfg.showTrails = showTrails;
    };

    // ═══════ HELPERS (selection circles for small planets/moons) ═══════
    let showHelpers = true;
    (window as any).__toggleHelpers = () => {
      showHelpers = !showHelpers;
      cfg.showHelpers = showHelpers;
    };

    // ═══════ ORBIT TOGGLES ═══════
    let showOrbits = true; // default on
    (window as any).__toggleOrbits = () => {
      showOrbits = !showOrbits;
      cfg.showOrbits = showOrbits;
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
      // Dispose old orbit lines first
      sd.orbitLines.forEach(ol => { scene.remove(ol); ol.geometry.dispose(); (ol.material as THREE.Material).dispose(); });
      sd.orbitLines = [];
      const visibleSats = sd.sats.filter(s => sd.groups[s.groupId]);
      // Use REAL time (not sim time) — SGP4 accuracy degrades far from TLE epoch
      const now = new Date();
      const lines: THREE.Line[] = [];
      const orbitSc = baseScale(EARTH_IDX);
      visibleSats.forEach(sat => {
        const sr = sat.satrec as any;
        const periodMin = sr.no ? (2 * Math.PI / sr.no) : 90;
        // More points for larger orbits (GEO/MEO need smoother curves)
        const nPts = periodMin > 300 ? 128 : periodMin > 120 ? 96 : 64;
        const pts: THREE.Vector3[] = [];
        for (let s = 0; s <= nPts; s++) {
          const d = new Date(now.getTime() + (s / nPts) * periodMin * 60000);
          const eci = getSatPositionECI(sat, d);
          if (!eci) continue;
          const pos = eciToScene(eci, { x: 0, y: 0, z: 0 }, earthSceneR, orbitSc);
          pts.push(new THREE.Vector3(pos.x, pos.y, pos.z));
        }
        if (pts.length > 2) {
          const geo = new THREE.BufferGeometry().setFromPoints(pts);
          const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: sat.color, transparent: true, opacity: .65 }));
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
    const satMeshes: (THREE.Mesh | null)[] = [];
    const earthP = P.find(p => p.id === 'earth')!;
    const earthSceneR = earthP.r;

    const satTrails: (Float32Array | null)[] = [];
    const satTrailLines: (THREE.Line | null)[] = [];
    const satTrailReady: boolean[] = [];
    // Satellite orbit deviation tracking
    const satExpectedAltKm: number[] = []; // expected altitude from TLE
    const satFrozen: boolean[] = [];       // true = orbit drifted, position frozen

    // ═══ Satellite resource lifecycle: create on demand, dispose when off ═══
    // Satellite names shown via bracket hover — no separate label system
    // Shared geometry + cached materials for all non-Starlink satellites
    // All satellites look identical at normal zoom (sub-pixel), no need for individual GLB models
    const _satSharedGeo = new THREE.BoxGeometry(1, 0.6, 0.6); // unit box, scaled per-satellite
    const _satMatCache = new Map<number, THREE.MeshBasicMaterial>();
    function getSatMaterial(color: number): THREE.MeshBasicMaterial {
      let mat = _satMatCache.get(color);
      if (!mat) { mat = new THREE.MeshBasicMaterial({ color }); _satMatCache.set(color, mat); }
      return mat;
    }

    function materializeSat(i: number) {
      const sat = satDataRef.current.sats[i];
      if (!sat || satMeshes[i]) return;
      const displayName = getSatDisplayName(sat.name, sat.noradId);
      const colNum = typeof sat.color === 'string' ? parseInt(sat.color.replace('#', ''), 16) : sat.color;
      // Shared geometry + cached material (1 geometry for ALL sats, 1 material per color)
      const sm = new THREE.Mesh(_satSharedGeo, getSatMaterial(colNum));
      sm.userData = { isSat: true, name: sat.name, displayName, groupId: sat.groupId, color: sat.color, satIdx: i };
      sm.visible = false;
      scene.add(sm);
      satMeshes[i] = sm;
      // Per-satellite trail line (THREE.Line + fading shader)
      const trailArr = new Float32Array(TRAIL_LEN * 3);
      satTrails[i] = trailArr;
      satTrailReady[i] = false;
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(trailArr, 3));
      trailGeo.setAttribute('trailIndex', createTrailIndexAttribute(TRAIL_LEN));
      trailGeo.setDrawRange(0, 0);
      const tMat = createTrailMaterial('#ffffff');
      const trailLine = new THREE.Line(trailGeo, tMat);
      trailLine.visible = false;
      trailLine.frustumCulled = false;
      scene.add(trailLine);
      satTrailLines[i] = trailLine;
    }

    function dematerializeSat(i: number) {
      const sm = satMeshes[i];
      if (sm) {
        scene.remove(sm);
        // Geometry and material are SHARED — don't dispose them
        satMeshes[i] = null;
      }
      const trail = satTrailLines[i];
      if (trail) { scene.remove(trail); trail.geometry.dispose(); (trail.material as THREE.Material).dispose(); satTrailLines[i] = null; }
      satTrails[i] = null;
      satTrailReady[i] = false;
    }

    // Load satellite data DURING intro (preload behind splash screen)
    let satDataLoaded = false;
    fetchAllSatellites().then(sats => {
      setSatellites(sats);
      satDataRef.current.sats = sats;
      if (satCountRef.current) satCountRef.current.textContent = `${sats.length} 颗卫星追踪中`;
      for (let i = 0; i < sats.length; i++) {
        satMeshes.push(null);
        satTrails.push(null);
        satTrailLines.push(null);
        satTrailReady.push(false);
        const sr = sats[i].satrec as any;
        const n = sr.no;
        const altKm = n > 0 ? Math.pow(398600.4418 / Math.pow(n / 60, 2), 1 / 3) - 6371 : 500;
        satExpectedAltKm.push(Math.max(altKm, 100));
        satFrozen.push(false);
      }
      sats.forEach((sat, i) => {
        if (satDataRef.current.groups[sat.groupId]) materializeSat(i);
      });
      satDataRef.current.meshes = satMeshes;

      // Pre-compute ALL initial satellite positions + scale during intro
      const initNow = new Date();
      const eIdx0 = EARTH_IDX;
      const ep0 = meshes[eIdx0].position;
      const sc0 = baseScale(eIdx0);
      const initBaseSatSize = sc0 * earthSceneR * SAT_SIZE_FACTOR;
      const initMinSatSize = earthSceneR * sc0 * SAT_MIN_SIZE_FACTOR;
      sats.forEach((sat, i) => {
        const sm = satMeshes[i];
        if (!sm) return;
        const eci = getSatPositionECI(sat, initNow);
        if (eci && isFinite(eci.x) && isFinite(eci.y) && isFinite(eci.z)) {
          const pos = eciToScene(eci, ep0, earthSceneR, sc0);
          sm.position.set(pos.x, pos.y, pos.z);
          // Set correct scale immediately (same logic as animation loop)
          const isStation = sat.groupId === GID_STATIONS;
          const thisSize = isStation ? initBaseSatSize * STATION_SCALE : initBaseSatSize;
          sm.scale.setScalar(Math.max(thisSize, isStation ? initMinSatSize * 2 : initMinSatSize));
          sm.visible = true;
        }
      });

      // Pre-compute initial trail positions for visible satellites
      sats.forEach((sat, i) => {
        if (!satTrails[i] || !satMeshes[i]?.visible) return;
        const sr2 = sat.satrec as any;
        const periodSec = sr2.no ? (2 * Math.PI / sr2.no) * 60 : 5400;
        const trailDur = periodSec * 0.5;
        const lastIdx = TRAIL_LEN - 1;
        let allValid = true;
        const nowMs = initNow.getTime();
        const trailDate = new Date(nowMs);
        for (let s = 0; s <= lastIdx; s++) {
          trailDate.setTime(nowMs - (lastIdx - s) / lastIdx * trailDur * 1000);
          const pastEci = getSatPositionECI(sat, trailDate);
          if (pastEci) {
            const pp = eciToScene(pastEci, ep0, earthSceneR, sc0);
            satTrails[i]![s * 3] = pp.x - ep0.x;
            satTrails[i]![s * 3 + 1] = pp.y - ep0.y;
            satTrails[i]![s * 3 + 2] = pp.z - ep0.z;
          } else { allValid = false; }
        }
        if (allValid) {
          satTrailReady[i] = true;
          const line = satTrailLines[i];
          if (line) {
            line.visible = true;
            line.position.copy(ep0);
            line.geometry.attributes.position.needsUpdate = true;
            line.geometry.setDrawRange(0, TRAIL_LEN);
            const mat = line.material as THREE.ShaderMaterial;
            if (mat.uniforms?.activePoints) mat.uniforms.activePoints.value = TRAIL_LEN;
          }
        }
      });

      satDataLoaded = true;
      const prog = document.getElementById('__introProgress');
      if (prog) prog.textContent = '就绪';
    }); // delay: intro (2.2s) + Earth zoom (1.5s) + buffer

    // Dispose Starlink InstancedMesh resources
    function disposeStarlink() {
      const sd = satDataRef.current;
      if (sd.starlinkMesh) {
        scene.remove(sd.starlinkMesh);
        sd.starlinkMesh.geometry.dispose();
        (sd.starlinkMesh.material as THREE.Material).dispose();
        sd.starlinkMesh.dispose();
        sd.starlinkMesh = undefined;
      }
      sd.starlinkSats = undefined;
      sd.starlinkPositions = undefined;
    }

    // Toggle satellite group visibility
    (window as any).__toggleSatGroup = async (gid: string) => {
      const g = satDataRef.current.groups;
      g[gid] = !g[gid];
      // Only re-render if satellite panel is open (avoids full App re-render when panel closed)
      if (document.getElementById('__satPanel')) setSatGroups({ ...g });

      // On-demand load for Starlink: InstancedMesh for 10,000+ satellites (single draw call, real 3D shapes)
      if (gid === GID_STARLINK && g[gid] && !satDataRef.current.starlinkMesh) {
        setStarlinkLoading(true);
        setStarlinkProgress(0);
        const newSats = await fetchStarlinkSatellites();
        setStarlinkProgress(70);
        setStarlinkTotal(newSats.length);

        // InstancedMesh: one geometry + material, N instance transforms (single draw call)
        const slCount = newSats.length;
        const slPositions = new Float32Array(slCount * 3);
        // Visible size: ~3px when Earth fills screen. Earth visual radius = sc * earthSceneR.
        // At fit distance, 1px ≈ earthVisR * 2 / screenH. So 3px ≈ earthVisR * 0.006.
        const earthVisR = baseScale(EARTH_IDX) * earthSceneR;
        const slDotR = earthVisR * STARLINK_DOT_FACTOR;
        const slGeo = new THREE.BoxGeometry(slDotR * 2, slDotR * 2, slDotR * 2); // 12 triangles, efficient
        const slMat = new THREE.MeshBasicMaterial({ color: 0x8B5CF6 });
        const slMesh = new THREE.InstancedMesh(slGeo, slMat, slCount);
        slMesh.frustumCulled = false;
        slMesh.visible = false;
        scene.add(slMesh);

        const tmpMat = new THREE.Matrix4();

        // Compute ALL initial positions — yield every 200 to keep UI responsive
        setStarlinkProgress(70);
        const initNow = new Date();
        const eIdxSL = EARTH_IDX;
        const epSL = meshes[eIdxSL].position;
        const scSL = baseScale(eIdxSL);
        for (let si = 0; si < slCount; si++) {
          const slEci = getSatPositionECI(newSats[si], initNow);
          if (slEci && isFinite(slEci.x) && isFinite(slEci.y) && isFinite(slEci.z)) {
            const slP = eciToScene(slEci, epSL, earthSceneR, scSL);
            const rx = slP.x - epSL.x, ry = slP.y - epSL.y, rz = slP.z - epSL.z;
            slPositions[si * 3] = rx;
            slPositions[si * 3 + 1] = ry;
            slPositions[si * 3 + 2] = rz;
            tmpMat.makeTranslation(rx, ry, rz);
          } else {
            tmpMat.makeTranslation(0, 0, 0);
          }
          slMesh.setMatrixAt(si, tmpMat);
          if (si % 200 === 0) {
            setStarlinkProgress(70 + Math.round((si / slCount) * 30));
            await new Promise(r => setTimeout(r, 0));
          }
        }
        slMesh.instanceMatrix.needsUpdate = true;
        slMesh.visible = true;

        satDataRef.current.starlinkMesh = slMesh;
        satDataRef.current.starlinkSats = newSats;
        satDataRef.current.starlinkPositions = slPositions;

        // Store first 25 for sidebar list preview + total count
        setSatellites(prev => {
          const withoutSl = prev.filter(s => s.groupId !== GID_STARLINK);
          return [...withoutSl, ...newSats.slice(0, STARLINK_LIST_PREVIEW).map(s => ({ ...s, groupId: 'starlink' }))];
        });
        if (satCountRef.current) satCountRef.current.textContent = `${satDataRef.current.sats.length + slCount} 颗卫星追踪中`;
        setStarlinkProgress(100);
        setStarlinkLoading(false);
        return;
      }

      // Starlink: dispose on off, show on on
      if (gid === GID_STARLINK) {
        if (!g[gid]) {
          disposeStarlink();
          setSatellites(prev => prev.filter(s => s.groupId !== GID_STARLINK));
        } else if (satDataRef.current.starlinkMesh) {
          satDataRef.current.starlinkMesh.visible = true;
        }
      }

      // Materialize or dematerialize satellite meshes for this group
      const sd = satDataRef.current;
      sd.sats.forEach((sat, i) => {
        if (sat.groupId !== gid) return;
        if (g[gid]) {
          materializeSat(i);
        } else {
          dematerializeSat(i);
        }
      });
      // Dispose orbit lines for disabled group
      sd.orbitLines = sd.orbitLines.filter(ol => {
        if (ol.userData.groupId === gid && !g[gid]) {
          scene.remove(ol);
          ol.geometry.dispose();
          (ol.material as THREE.Material).dispose();
          return false;
        }
        return true;
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

      // Restore previous focused satellite before switching
      if (focSatIdx >= 0 && focSatIdx !== idx) {
        const prev = satDataRef.current.meshes[focSatIdx];
        if (prev && prev.userData._focusActive) {
          const dg = prev.userData._detailGroup as THREE.Group | undefined;
          if (dg) scene.remove(dg);
          prev.visible = true;
          prev.scale.setScalar(prev.userData.baseScale);
          delete prev.userData._focusActive;
          delete prev.userData._detailGroup;
          delete prev.userData.baseScale;
          delete prev.userData.focScale;
          delete prev.userData.focInitDist;
          delete prev.userData.modelRadius;
        }
      }
      focIdx = -1; focMoonMesh = null;
      focSatIdx = idx;
      tT.copy(sm.position);
      // Zoom to show satellite near Earth — use Earth visual radius as reference
      const eIdxZ = EARTH_IDX;
      const earthVisR = baseScale(eIdxZ) * earthSceneR;
      tD = earthVisR * 0.5; // half Earth radius — close orbit view
      // Camera on the far side from Earth (behind satellite, looking down at Earth)
      // dir = satellite→Earth direction. Camera placed along this direction (above satellite)
      if (eIdxZ >= 0) {
        const dx = sm.position.x - meshes[eIdxZ].position.x;
        const dy = sm.position.y - meshes[eIdxZ].position.y;
        const dz = sm.position.z - meshes[eIdxZ].position.z;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len > 0.01) {
          const dir = { x: dx / len, y: dy / len, z: dz / len };
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
      const frozen = satFrozen[idx];
      const frozenWarning = frozen ? '\n⚠ 该卫星SGP4轨道传播已偏离预期高度1.5倍以上，位置数据不再准确，已暂停更新。点击重置按钮可恢复。' : '';
      iFactRef.current!.textContent = `${dn}（${sat.name}）是${groupLabel}卫星星座的一部分。NORAD编号 ${sat.noradId}。轨道倾角 ${incDeg}°，轨道周期约 ${periodH} 小时。${frozenWarning}`;
      iGridRef.current!.innerHTML = `
        <div><div class="info-stat-label">星座</div><div class="info-stat-val">${groupLabel}</div></div>
        <div><div class="info-stat-label">NORAD</div><div class="info-stat-val">${sat.noradId}</div></div>
        <div><div class="info-stat-label">轨道高度</div><div class="info-stat-val">~${altKm} km</div></div>
        <div><div class="info-stat-label">倾角</div><div class="info-stat-val">${incDeg}°</div></div>
        <div><div class="info-stat-label">周期</div><div class="info-stat-val">${periodH} h</div></div>
        <div><div class="info-stat-label">偏心率</div><div class="info-stat-val">${sr.ecco?.toFixed(4) ?? '?'}</div></div>
        ${frozen ? '<div style="grid-column:1/-1"><div class="info-stat-label" style="color:var(--warm)">状态</div><div class="info-stat-val" style="color:var(--warm)">轨道偏离 · 已暂停</div></div>' : '<div><div class="info-stat-label">状态</div><div class="info-stat-val" style="color:var(--glow)">正常追踪中</div></div>'}
      `;
      iExtrasRef.current!.innerHTML = '';
      (window as any).__showInfoHint();
    };

    // ═══════ LABELS — integrated into helper system ═══════
    // Planet/moon labels are shown via .obj-helper-name (inside helper divs).
    // No separate label system — one DOM element per object, one positioning calculation.
    let showLabels = true;
    (window as any).__toggleLabels = () => {
      showLabels = !showLabels;
      cfg.showLabels = showLabels;
    };
    // satLabelBaseIdx no longer needed — satellite labels handled by brackets

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

    const onWheel = (e: WheelEvent) => { e.preventDefault(); applyZoom(e.deltaY); };
    ren.domElement.addEventListener('wheel', onWheel, { passive: false });
    // Forward wheel from overlay elements (brackets/helpers) so zoom works everywhere
    satBracketsRef.current!.addEventListener('wheel', onWheel, { passive: false });
    helpersRef.current!.addEventListener('wheel', onWheel, { passive: false });

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

    // ═══════ HOVER (throttled) ═══════
    const rc2 = new THREE.Raycaster();
    const m2v = new THREE.Vector2();
    let lastHoverTime = 0;
    function hoverFn(e: PointerEvent) {
      const now2H = performance.now();
      if (now2H - lastHoverTime < 50) return; // throttle: max 20 hover checks/sec
      lastHoverTime = now2H;
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
    // Pre-computed per-planet constants (computed ONCE, used every frame)
    const SUN_SCENE_R = P[0].r;
    const REAL_KM_SUN = PLANETS.find(pp => pp.isSun)!.realRadiusKm;
    // baseScales[i] = visual scale factor for planet i (constant, never changes)
    const baseScales: number[] = P.map((p, i) => {
      if (p.sun) return 1;
      const realKm = PLANETS[i].realRadiusKm;
      return (realKm / REAL_KM_SUN) * SUN_SCENE_R / p.r;
    });
    // Per-planet orbital constants (avoid recomputing trig every frame)
    const planetSelfRotRates = P.map(p => 2 * Math.PI / (p.rotP * 86400));
    const planetEcc = P.map(p => p.eccentricity ?? 0);
    const planetIncl = P.map(p => (p.orbitalIncl ?? 0) * Math.PI / 180);
    const planetOmega = P.map(p => (p.argPerihelion ?? 0) * Math.PI / 180);
    const planetOmegaB = P.map(p => (p.longAscNode ?? 0) * Math.PI / 180);
    // Pre-computed cos/sin of orbital elements (used in position calculation)
    const cosIncl = planetIncl.map(Math.cos);
    const sinIncl = planetIncl.map(Math.sin);
    const cosOmegaB = planetOmegaB.map(Math.cos);
    const sinOmegaB = planetOmegaB.map(Math.sin);
    // Scaled visual radius for each planet
    const planetVisR: number[] = P.map((p, i) => baseScales[i] * p.r);

    function baseScale(i: number): number { return baseScales[i]; }
    function applyAllScales() {
      P.forEach((_, i) => { if (!P[i].sun) meshes[i].scale.setScalar(baseScales[i]); });
    }

    // (scale toggle removed — always real proportions)

    // ═══════ FOCUS / INFO ═══════
    let focIdx = -1;
    let focSatIdx = -1; // index into satDataRef.current.meshes for satellite follow
    let focMoonMesh: THREE.Mesh | null = null; // tracks focused natural moon / Earth moon

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
      focIdx = i; focSatIdx = -1; focMoonMesh = null; const p = P[i];
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
      const pr = PR[i]; focIdx = -1; focSatIdx = -1; focMoonMesh = null;
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
      focIdx = -1; focSatIdx = -1; focMoonMesh = moonMesh;
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
      focMoonMesh = mesh;
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
    (window as any).__hideInfoHint = () => { if (infoHintRef.current) infoHintRef.current.style.display = 'none'; };

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
    updSpd();
    (window as any).__resetCam = () => {
      tA = { t: 0.3, p: Math.PI / 3 }; tD = 105; tT.set(0, 0, 0);
      focIdx = -1; focSatIdx = -1; focMoonMesh = null;
      // Reset speed and simulated time to now
      spdIdx = 3; spd = SPEED_PRESETS[spdIdx].v; updSpd();
      t = 0; lastTime = performance.now(); // reset sim clock to real time
      paused = false;
      if (playBtnRef.current) playBtnRef.current.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="4" x2="6" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/></svg>';
      if (playBtnRef.current) playBtnRef.current.classList.add('on');
      // Reset all satellite positions (clear stale SGP4 data + frozen flags)
      const sd = satDataRef.current;
      if (sd.starlinkPositions) sd.starlinkPositions.fill(0);
      satTrailReady.fill(false);
      satFrozen.fill(false);
      satTrailReady.fill(false);
      satTrails.forEach(tr => { if (tr) tr.fill(0); });
      satTrailLines.forEach(tl => { if (tl) { tl.visible = false; tl.geometry.setDrawRange(0, 0); } });
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

      // Lazy-create bracket elements with name label
      while (bracketEls.length < sd.meshes.length) {
        const idx = bracketEls.length;
        const el = document.createElement('div');
        el.className = 'sat-bracket';
        el.onclick = () => (window as any).__focusSat(idx);
        const nameEl = document.createElement('div');
        nameEl.className = 'sat-bracket-name';
        const sat = sd.sats[idx];
        nameEl.textContent = sat ? getSatDisplayName(sat.name, sat.noradId) : '';
        el.appendChild(nameEl);
        bracketContainer.appendChild(el);
        bracketEls.push(el);
      }

      for (let i = 0; i < sd.meshes.length; i++) {
        const el = bracketEls[i];
        if (!el) continue;
        const sm = sd.meshes[i];
        if (!sm || !sm.visible || !showBrackets || !showHelpers || spd > SPEED_HIDE_UI) { el.style.display = 'none'; continue; }

        bracketVec.setFromMatrixPosition(sm.matrixWorld);
        if (isOccludedByPlanet(bracketVec)) { el.style.display = 'none'; continue; }
        bracketVec.project(camera);
        if (bracketVec.z > 1) { el.style.display = 'none'; continue; }

        const x = (bracketVec.x * .5 + .5) * innerWidth;
        const y = (bracketVec.y * -.5 + .5) * innerHeight;

        el.style.display = 'block';
        const bs = cfg.bracketSize;
        el.style.width = bs + 'px'; el.style.height = bs + 'px';
        (el.style as any).translate = `${x - bs / 2}px ${y - bs / 2}px`;
        el.style.color = sd.sats[i]?.color || '#fff';
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
      type: 'planet' | 'moon' | 'probe';
      parentIdx?: number; // planet index for moons/probes
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
          getWorldR: () => (nm.userData.visualR || 0.1) * nm.scale.x,
          color: col,
          onClick: () => showNaturalMoonInfo(d),
          name: d.cn || d.n, type: 'moon', parentIdx: nm.userData.parentIdx,
        });
      });
    }

    // Create helpers for probes
    PR.forEach((pr, i) => {
      const col = '#' + pr.col.toString(16).padStart(6, '0');
      const el = document.createElement('div');
      el.className = 'obj-helper';
      el.style.borderColor = col;
      const nameEl = document.createElement('div');
      nameEl.className = 'obj-helper-name';
      nameEl.textContent = pr.cn;
      nameEl.style.color = col;
      el.appendChild(nameEl);
      el.onclick = () => (window as any).__focusProbeByIdx(i);
      helperContainer.appendChild(el);
      // Parent: orbitPlanetId or fallback to Sun (index 0)
      const parentIdx = pr.orb !== undefined ? pr.orb : 0;
      helperEntries.push({
        el, nameEl,
        getMesh: () => probeMeshes[i],
        getWorldR: () => probeMeshes[i].scale.x,
        color: col,
        onClick: () => (window as any).__focusProbeByIdx(i),
        name: pr.cn, type: 'probe', parentIdx,
      });
    });

    const helperVec = new THREE.Vector3();
    function updateHelpers() {
      // Add any new natural moon helpers
      if (naturalMoonMeshes.length > 0) addNaturalMoonHelpers();

      // Hide all helpers when sun < SUN_HIDE_PX (galaxy scale, solar system invisible)
      const allHelpersHidden = getScreenSize(meshes[0], cam, planetVisR[0]) < SUN_HIDE_PX;

      for (const h of helperEntries) {
        if (!showHelpers || allHelpersHidden) { h.el.style.display = 'none'; continue; }
        const mesh = h.getMesh();
        if (!mesh || !mesh.visible) { h.el.style.display = 'none'; continue; }

        // Moons/probes: hide when parent planet < PARENT_HIDE_PX
        if ((h.type === 'moon' || h.type === 'probe') && h.parentIdx !== undefined) {
          const parentScreenSz = getScreenSize(meshes[h.parentIdx], cam, planetVisR[h.parentIdx]);
          if (parentScreenSz < PARENT_HIDE_PX) { h.el.style.display = 'none'; continue; }
        }

        // Show helper when object < helperSize on screen (needs help to click)
        // Hide when object is large enough to click directly (>= helperSize)
        const worldR = h.getWorldR();
        const screenSz = getScreenSize(mesh, cam, worldR);
        if (screenSz >= cfg.helperSize) { h.el.style.display = 'none'; continue; }
        // (planet galaxy-scale hide handled by allHelpersHidden above)
        // Don't show if behind camera
        helperVec.setFromMatrixPosition(mesh.matrixWorld);
        if (isOccludedByPlanet(helperVec)) { h.el.style.display = 'none'; continue; }
        helperVec.project(cam);
        if (helperVec.z > 1) { h.el.style.display = 'none'; continue; }

        const x = (helperVec.x * .5 + .5) * innerWidth;
        const y = (helperVec.y * -.5 + .5) * innerHeight;
        h.el.style.display = 'block';
        h.el.style.width = cfg.helperSize + 'px'; h.el.style.height = cfg.helperSize + 'px';
        (h.el.style as any).translate = `${x - cfg.helperSize / 2}px ${y - cfg.helperSize / 2}px`;
        // Show/hide name label based on showLabels toggle
        h.nameEl.style.opacity = showLabels ? '0.7' : '0';
      }
    }

    // ═══════ ANIMATE ═══════
    // Reusable temp matrix for InstancedMesh updates (avoid per-frame allocation)
    const _slTmpMat = new THREE.Matrix4();
    // t = elapsed accelerated seconds. simStartMs = real timestamp at t=0.
    let t = 0; let lastTime = performance.now();
    const simStartMs = Date.now();
    let animId: number;
    let frameCount = 0;
    // Progressive trail recovery: when speed drops below threshold,
    // restore trails one-by-one instead of all at once
    let trailRecoveryIdx = -1; // -1 = not recovering, >= 0 = next sat index to restore
    let trailsWereHidden = false; // track if trails were hidden by high speed
    function anim() {
      animId = requestAnimationFrame(anim);
      const now2 = performance.now(); const dt = Math.min((now2 - lastTime) / 1000, 0.1); lastTime = now2; // clamp to avoid spikes
      frameCount++;
      if (!paused) t += dt * spd; // t in accelerated real seconds

      P.forEach((p, i) => {
        meshes[i].rotation.y = t * planetSelfRotRates[i];
        if (p.sun) return;
        const meanAnomaly = initAngles[i] + t * EARTH_RATE * p.s;
        const ecc = planetEcc[i];
        const omega = planetOmega[i];
        // Solve Kepler's equation (Newton's method, 5 iterations)
        let E = meanAnomaly;
        for (let k = 0; k < KEPLER_ITERATIONS; k++) E = E - (E - ecc * Math.sin(E) - meanAnomaly) / (1 - ecc * Math.cos(E));
        const nu = 2 * Math.atan2(Math.sqrt(1 + ecc) * Math.sin(E / 2), Math.sqrt(1 - ecc) * Math.cos(E / 2));
        const r = p.d * (1 - ecc * ecc) / (1 + ecc * Math.cos(nu));
        const xOrb = r * Math.cos(nu + omega);
        const yOrb = r * Math.sin(nu + omega);
        // Pre-computed cos/sin of orbital elements — no trig per frame
        meshes[i].position.x = xOrb * cosOmegaB[i] - yOrb * cosIncl[i] * sinOmegaB[i];
        meshes[i].position.y = yOrb * sinIncl[i];
        meshes[i].position.z = xOrb * sinOmegaB[i] + yOrb * cosIncl[i] * cosOmegaB[i];

        // Hide planet + its orbit if too small on screen
        if (orbitLines[i - 1]) {
          orbitLines[i - 1].visible = showOrbits && cD < cfg.planetOrbitHideDist;
          const olm = (orbitLines[i - 1] as any).material;
          if (olm?.linewidth !== undefined) olm.linewidth = cfg.planetOrbitWidth;
          // Use darkenHex to simulate opacity (avoids Line2 white dot artifact with transparent:true)
          if (olm?.color && olm._lastOpacity !== cfg.planetOrbitOpacity) { olm.color.setHex(darkenHex(p.col, cfg.planetOrbitOpacity)); olm._lastOpacity = cfg.planetOrbitOpacity; }
        }
      });

      // ═══ PER-PLANET LOD: Earth always FULL, other planets SHELL when small ═══
      for (let pi = 0; pi < meshes.length; pi++) {
        if (pi === EARTH_IDX) continue; // Earth: always keep atmosphere + clouds
        const pm = meshes[pi];
        if (!pm.visible) continue;
        const pScreenPx = getScreenSize(pm, cam, planetVisR[pi]);
        const isShell = pScreenPx < innerHeight / 20;
        pm.children.forEach(child => {
          if ((child as any).userData?.isGlow) (child as THREE.Mesh).visible = !isShell;
        });
      }

      // Cloud rotation: slight drift relative to Earth surface (wind)
      if (earthCloudMesh) {
        const earthRotRate = 2 * Math.PI / (0.99727 * 86400);
        earthCloudMesh.rotation.y = t * earthRotRate * 1.002; // 0.2% faster — subtle atmospheric drift
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
        // Hide moon when Earth (parent) < 10px — same rule as all other moons
        const earthScreenForMoon = getScreenSize(meshes[EARTH_IDX], cam, planetVisR[EARTH_IDX]);
        moonMesh.visible = earthScreenForMoon >= PARENT_HIDE_PX;
        if (moonOrbitLine) {
          moonOrbitLine.position.copy(earthPos);
          moonOrbitLine.scale.setScalar(eScale);
          moonOrbitLine.visible = showOrbits && moonMesh.visible && cD < cfg.moonOrbitHideDist;
          const moOlm = (moonOrbitLine as any).material;
          if (moOlm) { moOlm.linewidth = cfg.moonOrbitWidth; if (moOlm._lastOp !== cfg.moonOrbitOpacity) { moOlm.color.setHex(darkenHex(0x888888, cfg.moonOrbitOpacity)); moOlm._lastOp = cfg.moonOrbitOpacity; } }
        }
      }

      // Natural moons orbital motion (all except Earth's Moon)
      naturalMoonMeshes.forEach((nm, i) => {
        const parentIdx = nm.userData.parentIdx as number;
        // Hide when parent planet < 10px (same threshold as helper system)
        const parentScreenSz = getScreenSize(meshes[parentIdx], cam, planetVisR[parentIdx]);
        if (parentScreenSz < PARENT_HIDE_PX) { nm.visible = false; if (naturalMoonOrbits[i]) naturalMoonOrbits[i].visible = false; return; }
        const nmData = naturalMoonData[i];
        const parentPos = meshes[parentIdx].position;
        const pScale = baseScale(parentIdx);
        const parentP = P[parentIdx];
        const parentPlanet = naturalMoonParentPlanets[i]!;
        const orbAngle = t * EARTH_RATE * (365.25 / nmData.orbitalPeriodDays) + i * 1.7;
        const distInParentRadii = nmData.distanceKm / parentPlanet.realRadiusKm;
        const orbitDist = distInParentRadii * parentP.r * pScale;
        nm.position.set(
          parentPos.x + Math.cos(orbAngle) * orbitDist,
          parentPos.y,
          parentPos.z + Math.sin(orbAngle) * orbitDist
        );
        nm.scale.setScalar(pScale);
        nm.rotation.y = orbAngle + Math.PI;
        nm.visible = true; // visibility controlled by helper system, not here
        if (naturalMoonOrbits[i]) {
          naturalMoonOrbits[i].position.copy(parentPos);
          naturalMoonOrbits[i].scale.setScalar(pScale);
          naturalMoonOrbits[i].visible = showOrbits && cD < cfg.moonOrbitHideDist;
          const nmOlm = (naturalMoonOrbits[i] as any).material;
          if (nmOlm) {
            nmOlm.linewidth = cfg.moonOrbitWidth;
            const bc = naturalMoonOrbits[i].userData.baseColor;
            if (bc !== undefined && nmOlm._lastOp !== cfg.moonOrbitOpacity) { nmOlm.color.setHex(darkenHex(bc, cfg.moonOrbitOpacity)); nmOlm._lastOp = cfg.moonOrbitOpacity; }
          }
        }
      });

      const tAngle = t * EARTH_RATE;
      // Probes: only visible when probe layer is on AND speed ≤ 30min/s AND not zoomed too far
      const earthScreenForProbes = getScreenSize(meshes[EARTH_IDX], cam, planetVisR[EARTH_IDX]);
      PR.forEach((pr, i) => {
        const m = probeMeshes[i];
        if (!layers.probe || spd > SPEED_HIDE_UI || earthScreenForProbes < innerHeight / cfg.helperHideFrac) { m.visible = false; return; }
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
      const sd = satDataRef.current;
      const satSkip = spd >= SPEED_SKIP_SATS;
      const satInterval = spd < 300 ? 1 : spd < 3600 ? 3 : 10;
      const satThisFrame = !satSkip && (frameCount % satInterval === 0);

      if (sd.meshes.length > 0) {
        const now = new Date(simStartMs + t * 1000);
        const eIdx = EARTH_IDX;
        const ep = meshes[eIdx].position;
        const sc = baseScale(eIdx);
        const baseSatSize = sc * earthSceneR * SAT_SIZE_FACTOR;

        // Hide all satellites + trails when Earth is too small on screen or speed too high
        const earthScreenForSats = getScreenSize(meshes[eIdx], cam, earthSceneR * sc);
        const hideAllSats = satSkip || earthScreenForSats < innerHeight / cfg.satBracketHideFrac;

        for (let i = 0; i < sd.sats.length; i++) {
          const sm = sd.meshes[i];
          if (!sm) continue;
          const sat = sd.sats[i];
          const groupOn = sd.groups[sat?.groupId] ?? false;
          if (!groupOn || hideAllSats) {
            sm.visible = false;
            if (satTrailLines[i]) satTrailLines[i]!.visible = false;
            // Only zero trail data when GROUP is off (not when just zoomed out)
            if (!groupOn && satTrails[i]) { satTrails[i]!.fill(0); satTrailReady[i] = false; }
            continue;
          }

          // Frozen satellite: hidden (orbit drifted, position unreliable)
          if (satFrozen[i]) {
            sm.visible = false;
            if (satTrailLines[i]) satTrailLines[i]!.visible = false;
            continue;
          }

          // Throttled frame: keep last position, skip SGP4
          if (!satThisFrame) continue;

          // Compute position at current simulated time
          const eci = getSatPositionECI(sat, now);
          if (!eci || !isFinite(eci.x) || !isFinite(eci.y) || !isFinite(eci.z)) { sm.visible = false; continue; }

          // Check altitude deviation — freeze and hide if >1.5x expected
          const eciDistKm = Math.sqrt(eci.x * eci.x + eci.y * eci.y + eci.z * eci.z);
          const actualAltKm = eciDistKm - 6371;
          const expectedAlt = satExpectedAltKm[i];
          if (actualAltKm > expectedAlt * 1.5 || actualAltKm < expectedAlt / 1.5) {
            satFrozen[i] = true;
            sm.visible = false; // hide — position may be wrong
            if (satTrailLines[i]) satTrailLines[i]!.visible = false;
            continue;
          }

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
          sm.position.set(pos.x, pos.y, pos.z);

          const isStation = sat.groupId === GID_STATIONS;
          // Stations 3x bigger than regular sats
          // Minimum size scales with Earth: 0.1% of Earth's scene radius (≈6km equiv, ~3px when Earth fills screen)
          const minSatSize = earthSceneR * sc * SAT_MIN_SIZE_FACTOR;
          const thisSize = isStation ? baseSatSize * STATION_SCALE : baseSatSize;
          sm.scale.setScalar(Math.max(thisSize, isStation ? minSatSize * 2 : minSatSize));

          // Visibility is governed by hideAllSats (Earth screen size < 1/100)
          // No per-satellite screen-size check — satellites are always tiny but shown when Earth is visible

          // Trail: SGP4 past positions, 50% orbit (spd ≤ 30min/s)
          // Recompute frequency scales with speed: fast = more often (keeps trail smooth)
          // Trail: staggered SGP4 update
          if (satTrails[i] && showTrails && spd <= SPEED_HIDE_TRAILS && !trailsWereHidden) {
            const trailStagger = spd < 60 ? 60 : spd < 300 ? 20 : 8;
            const lastIdx = TRAIL_LEN - 1;
            if (frameCount % trailStagger === (i % trailStagger)) {
              const sr2 = sat.satrec as any;
              const periodSec = sr2.no ? (2 * Math.PI / sr2.no) * 60 : 5400;
              const trailDuration = periodSec * 0.5;
              let allValid = true;
              const nowMs = now.getTime();
              const trailDate = new Date(nowMs);
              for (let s = 0; s <= lastIdx; s++) {
                trailDate.setTime(nowMs - (lastIdx - s) / lastIdx * trailDuration * 1000);
                const pastEci = getSatPositionECI(sat, trailDate);
                if (pastEci) {
                  const pp = eciToScene(pastEci, ep, earthSceneR, sc);
                  satTrails[i]![s * 3] = pp.x - ep.x;
                  satTrails[i]![s * 3 + 1] = pp.y - ep.y;
                  satTrails[i]![s * 3 + 2] = pp.z - ep.z;
                } else { allValid = false; }
              }
              satTrails[i]![lastIdx * 3] = pos.x - ep.x;
              satTrails[i]![lastIdx * 3 + 1] = pos.y - ep.y;
              satTrails[i]![lastIdx * 3 + 2] = pos.z - ep.z;
              if (allValid) satTrailReady[i] = true;
              else { satTrails[i]!.fill(0); satTrailReady[i] = false; }
            } else {
              satTrails[i]![(TRAIL_LEN - 1) * 3] = pos.x - ep.x;
              satTrails[i]![(TRAIL_LEN - 1) * 3 + 1] = pos.y - ep.y;
              satTrails[i]![(TRAIL_LEN - 1) * 3 + 2] = pos.z - ep.z;
            }
            const line = satTrailLines[i]!;
            line.visible = satTrailReady[i];
            line.position.copy(ep);
            line.geometry.attributes.position.needsUpdate = true;
            line.geometry.setDrawRange(0, TRAIL_LEN);
          } else if (satTrailLines[i] && spd > SPEED_HIDE_TRAILS) {
            satTrailLines[i]!.visible = false;
          }
        }

        // ═══ Progressive trail recovery ═══
        // When speed drops below threshold: restore trails ONE per frame (not all at once)
        // When speed rises above threshold: abort recovery immediately
        if (spd > SPEED_HIDE_TRAILS) {
          // High speed: mark trails as needing recovery, abort any in-progress recovery
          trailsWereHidden = true;
          trailRecoveryIdx = -1;
        } else if (trailsWereHidden && showTrails) {
          // Speed just dropped: start progressive recovery from index 0
          if (trailRecoveryIdx < 0) trailRecoveryIdx = 0;
          // Recover ONE satellite's trail per frame
          if (trailRecoveryIdx < sd.sats.length) {
            const ri = trailRecoveryIdx;
            const rSat = sd.sats[ri];
            const rMesh = sd.meshes[ri];
            if (rSat && rMesh?.visible && satTrails[ri] && satTrailLines[ri] && (sd.groups[rSat.groupId] ?? false)) {
              const lastIdx = TRAIL_LEN - 1;
              const sr2 = rSat.satrec as any;
              const periodSec = sr2.no ? (2 * Math.PI / sr2.no) * 60 : 5400;
              const trailDuration = periodSec * 0.5;
              let allValid = true;
              // Use REAL time for recovery (sim time may be years off after high speed)
              const recoveryNowMs = Date.now();
              const trailDate = new Date(recoveryNowMs);
              for (let s = 0; s <= lastIdx; s++) {
                trailDate.setTime(recoveryNowMs - (lastIdx - s) / lastIdx * trailDuration * 1000);
                const pastEci = getSatPositionECI(rSat, trailDate);
                if (pastEci) {
                  const pp = eciToScene(pastEci, ep, earthSceneR, sc);
                  satTrails[ri]![s * 3] = pp.x - ep.x;
                  satTrails[ri]![s * 3 + 1] = pp.y - ep.y;
                  satTrails[ri]![s * 3 + 2] = pp.z - ep.z;
                } else { allValid = false; }
              }
              if (allValid) {
                satTrailReady[ri] = true;
                const line = satTrailLines[ri]!;
                line.visible = true;
                line.position.copy(ep);
                line.geometry.attributes.position.needsUpdate = true;
                line.geometry.setDrawRange(0, TRAIL_LEN);
              }
            }
            trailRecoveryIdx++;
          } else {
            // Recovery complete
            trailsWereHidden = false;
            trailRecoveryIdx = -1;
          }
        }

        // Bracket markers — screen-space click helpers
        updateSatBrackets(sd, cam, sc);

        // ═══ Starlink InstancedMesh positions (single draw call, batched) ═══
        if (sd.starlinkMesh) {
          const slGroupOn = sd.groups[GID_STARLINK] ?? false;
          sd.starlinkMesh.visible = slGroupOn && !hideAllSats;
        }
        if (sd.starlinkMesh?.visible && satThisFrame && sd.starlinkSats && sd.starlinkPositions) {
          const slSats = sd.starlinkSats;
          const slPos = sd.starlinkPositions;
          const slMesh = sd.starlinkMesh;
          // Batch size scales down at higher speeds (less SGP4 per frame)
          const slBatch = spd < 300 ? 500 : spd < 3600 ? 200 : 100;
          const slStart = (frameCount * slBatch) % slSats.length;
          const slEnd = Math.min(slStart + slBatch, slSats.length);
          for (let si = slStart; si < slEnd; si++) {
            const slEci = getSatPositionECI(slSats[si], now);
            if (slEci && isFinite(slEci.x)) {
              const slP = eciToScene(slEci, ep, earthSceneR, sc);
              const rx = slP.x - ep.x, ry = slP.y - ep.y, rz = slP.z - ep.z;
              slPos[si * 3] = rx; slPos[si * 3 + 1] = ry; slPos[si * 3 + 2] = rz;
              _slTmpMat.makeTranslation(rx, ry, rz);
            } else {
              _slTmpMat.makeTranslation(slPos[si * 3], slPos[si * 3 + 1], slPos[si * 3 + 2]); // keep last
            }
            slMesh.setMatrixAt(si, _slTmpMat);
          }
          // Position InstancedMesh at Earth center — all instances are relative offsets
          slMesh.position.copy(ep);
          slMesh.instanceMatrix.needsUpdate = true;
        }
      }

      // Satellite orbit lines: auto-show at high speed, auto-hide at low speed
      const showSatOrbitsAuto = spd > SPEED_HIDE_UI && !satSkip;
      if (showSatOrbitsAuto && sd.orbitLines.length === 0 && sd.sats.length > 0) {
        computeSatOrbits();
      }
      if (sd.orbitLines.length > 0) {
        const ep2 = meshes[EARTH_IDX].position;
        sd.orbitLines.forEach(ol => {
          // Satellite orbits: only at high speed (auto). Hide at low speed.
          ol.visible = showSatOrbitsAuto;
          // Position at Earth center. NO scale — positions already scaled in computeSatOrbits
          if (ol.visible) ol.position.copy(ep2);
          const olm = (ol as any).material;
          if (olm) olm.opacity = cfg.satOrbitOpacity;
        });
      }

      if (focIdx >= 0) tT.copy(meshes[focIdx].position);
      // Follow focused moon — track its orbiting position
      if (focMoonMesh && focIdx < 0 && focSatIdx < 0) tT.copy(focMoonMesh.position);
      // Follow focused satellite — swap to detailed model on focus, track position
      if (focSatIdx >= 0) {
        (window as any).__lastFocSat = focSatIdx;
        const fsm = satDataRef.current.meshes[focSatIdx];
        if (fsm) {
          tT.copy(fsm.position);
          // First frame of focus: hide simple box, add detail Group at same position
          if (!fsm.userData._focusActive) {
            fsm.userData._focusActive = true;
            fsm.userData.baseScale = fsm.scale.x;
            fsm.userData.focInitDist = tD;
            fsm.visible = false; // hide the simple box
            // Create detailed model Group (body + panels + antenna, async GLB swap)
            const colNum = typeof fsm.userData.color === 'string' ? parseInt(fsm.userData.color.replace('#', ''), 16) : fsm.userData.color;
            const detailGroup = createSatelliteModel(colNum, fsm.userData.groupId);
            detailGroup.position.copy(fsm.position);
            detailGroup.scale.copy(fsm.scale);
            scene.add(detailGroup);
            fsm.userData._detailGroup = detailGroup;
            // Compute scale from detail model bounding sphere
            const bbox = new THREE.Box3().setFromObject(detailGroup);
            const bsph = new THREE.Sphere();
            bbox.getBoundingSphere(bsph);
            fsm.userData.modelRadius = Math.max(bsph.radius, 0.015);
            const targetWorldR = FOCUS_MODEL_SCALE * tD * Math.tan(25 * Math.PI / 180); // ~1/500 screen width
            fsm.userData.focScale = targetWorldR / fsm.userData.modelRadius;
          }
          // Update detail group position + scale each frame
          const dg = fsm.userData._detailGroup as THREE.Group | undefined;
          if (dg) {
            dg.position.copy(fsm.position);
            const initDist = fsm.userData.focInitDist || cD;
            const blendStart = initDist * 2;
            const blendEnd = initDist * 5;
            const t2 = Math.min(Math.max((cD - blendStart) / (blendEnd - blendStart), 0), 1);
            const currentScale = fsm.userData.focScale * (1 - t2) + fsm.userData.baseScale * t2;
            dg.scale.setScalar(Math.max(currentScale, fsm.userData.baseScale));
          }
        }
      } else if ((window as any).__lastFocSat !== undefined) {
        // Restore ONLY the previously focused satellite (not iterate all)
        const prevIdx = (window as any).__lastFocSat;
        const sm = satDataRef.current.meshes[prevIdx];
        if (sm && sm.userData._focusActive) {
          const dg = sm.userData._detailGroup as THREE.Group | undefined;
          if (dg) scene.remove(dg);
          sm.visible = true;
          sm.scale.setScalar(sm.userData.baseScale);
          delete sm.userData._focusActive;
          delete sm.userData._detailGroup;
          delete sm.userData.baseScale;
          delete sm.userData.focScale;
          delete sm.userData.focInitDist;
          delete sm.userData.modelRadius;
        }
        delete (window as any).__lastFocSat;
      }

      const lf = 1 - Math.pow(.008, dt);     // smooth (for zoom/position transitions)
      const lfRot = 1 - Math.pow(.0001, dt); // snappy (for rotation — near-instant response)
      cA.t += (tA.t - cA.t) * lfRot; cA.p += (tA.p - cA.p) * lfRot;
      cD += (tD - cD) * lf;
      if (focIdx >= 0 || focSatIdx >= 0 || focMoonMesh) {
        // Focused on something: snap position (no lerp lag at any speed)
        cT.copy(tT);
      } else {
        cT.lerp(tT, lf);
      }
      // Prevent camera from entering any planet's interior (zero-allocation)
      {
        const cpx = cam.position.x, cpy = cam.position.y, cpz = cam.position.z;
        meshes.forEach((m, idx) => {
          if (!m.visible) return;
          if (focSatIdx >= 0 && P[idx].id === 'earth') return;
          const dx = cpx - m.position.x, dy = cpy - m.position.y, dz = cpz - m.position.z;
          const camToObj = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const r = baseScale(idx) * P[idx].r * 1.1;
          if (camToObj < r && r > 0.001) {
            const inv = r / Math.max(camToObj, 0.0001);
            cam.position.set(m.position.x + dx * inv, m.position.y + dy * inv, m.position.z + dz * inv);
            cD = Math.max(cD, r);
            tD = Math.max(tD, r);
          }
        });
      }
      cam.position.set(cT.x + cD * Math.sin(cA.p) * Math.cos(cA.t), cT.y + cD * Math.cos(cA.p), cT.z + cD * Math.sin(cA.p) * Math.sin(cA.t));
      cam.lookAt(cT);

      // Update atmosphere uniforms — only for VISIBLE glow meshes (LOD already hid far ones)
      const glowSunPos = meshes[0].position;
      glowMeshes.forEach(gm => {
        if (!gm.visible) return; // LOD already set visibility, skip hidden ones entirely
        const parent = gm.parent;
        if (!parent || !parent.visible) { gm.visible = false; return; }
        const mat = gm.userData.glowMat as THREE.ShaderMaterial;
        mat.uniforms.sunPos.value.copy(glowSunPos);
        mat.uniforms.camPos.value.copy(cam.position);
        // Hide if camera is inside the glow sphere
        const glowWorldR = gm.scale.x * (parent.scale?.x || 1);
        const distToParent = cam.position.distanceTo(parent.position);
        if (distToParent <= glowWorldR) gm.visible = false;
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
      if (sunScreen < SUN_HIDE_PX) {
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
      updateHelpers();
    }

    const onResize = () => {
      cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); ren.setSize(innerWidth, innerHeight);
      orbitLines.forEach(ol => { if ((ol as any).material?.resolution) (ol as any).material.resolution.set(innerWidth, innerHeight); });
      naturalMoonOrbits.forEach(ol => { if ((ol as any).material?.resolution) (ol as any).material.resolution.set(innerWidth, innerHeight); });
      if (moonOrbitLine && (moonOrbitLine as any).material?.resolution) (moonOrbitLine as any).material.resolution.set(innerWidth, innerHeight);
    };
    window.addEventListener('resize', onResize);
    // Preload Starlink count from cache
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

    // Wait for BOTH min intro time AND satellite data before dismissing splash
    const introMinTime = 2200;
    const introStart = performance.now();
    const earthStartIdx = EARTH_IDX;
    function tryDismissIntro() {
      const elapsed = performance.now() - introStart;
      if (elapsed >= introMinTime && satDataLoaded) {
        introRef.current?.classList.add('gone');
        setTimeout(() => { if (earthStartIdx >= 0) focusObj(earthStartIdx); }, 200);
      } else {
        // Update progress text
        const prog = document.getElementById('__introProgress');
        if (prog && !satDataLoaded) prog.textContent = '加载卫星数据';
        requestAnimationFrame(tryDismissIntro);
      }
    }
    requestAnimationFrame(tryDismissIntro);
    setTimeout(() => updSpd(), 100);
    anim();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      // Dispose all satellite resources
      for (let i = 0; i < satMeshes.length; i++) dematerializeSat(i);
      disposeStarlink();
      // Dispose satellite orbit lines
      satDataRef.current.orbitLines.forEach(ol => { scene.remove(ol); ol.geometry.dispose(); (ol.material as THREE.Material).dispose(); });
      // Dispose planet meshes, materials, textures
      meshes.forEach(m => {
        m.traverse(child => {
          if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
          const mat = (child as THREE.Mesh).material;
          if (mat) {
            const mats = Array.isArray(mat) ? mat : [mat];
            mats.forEach(mm => { if ((mm as any).map) (mm as any).map.dispose(); mm.dispose(); });
          }
        });
        scene.remove(m);
      });
      // Dispose orbit lines, moon orbits, natural moon orbits
      orbitLines.forEach(ol => { scene.remove(ol); ol.geometry.dispose(); (ol.material as THREE.Material).dispose(); });
      if (moonOrbitLine) { scene.remove(moonOrbitLine); moonOrbitLine.geometry.dispose(); (moonOrbitLine.material as THREE.Material).dispose(); }
      naturalMoonOrbits.forEach(ol => { scene.remove(ol); ol.geometry.dispose(); (ol.material as THREE.Material).dispose(); });
      naturalMoonMeshes.forEach(m => { scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); });
      if (moonMesh) { scene.remove(moonMesh); moonMesh.geometry.dispose(); (moonMesh.material as THREE.Material).dispose(); }
      // Dispose probe meshes
      probeMeshes.forEach(m => { m.traverse(child => { if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose(); }); scene.remove(m); });
      // Dispose glow meshes
      glowMeshes.forEach(gm => { gm.geometry.dispose(); (gm.material as THREE.Material).dispose(); });
      // Dispose stars, milky way, deep space
      starLayers.forEach(pts => { scene.remove(pts); pts.geometry.dispose(); (pts.material as THREE.Material).dispose(); });
      scene.remove(milkyWayPlane); milkyWayPlane.geometry.dispose(); (milkyWayPlane.material as THREE.Material).dispose();
      scene.remove(deepSpaceSphere); deepSpaceSphere.geometry.dispose(); (deepSpaceSphere.material as THREE.Material).dispose();
      scene.remove(solarMarker); solarMarker.geometry.dispose(); (solarMarker.material as THREE.Material).dispose();
      ren.dispose();
      canvasRef.current?.removeChild(ren.domElement);
      audio.pause(); audio.src = '';
    };
  }, []);

  return (
    <>
      <div className="intro" ref={introRef}>
        <div className="intro-line"><span className="intro-word intro-title w1">Open Globes</span></div>
        <div className="intro-line"><span className="intro-word w2">此 刻 太 空</span></div>
        <div className="intro-pulse" style={{ marginTop: 24 }}></div>
        <div id="__introProgress" style={{ marginTop: 16, fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-cn)', opacity: 0.6, letterSpacing: 1 }}>加载中...</div>
      </div>

      <div ref={canvasRef} />

      <div className="chrome-top">
        <div className="brand">
          <div className="brand-en">Open Globes</div>
          <div className="brand-cn">此刻太空</div>
        </div>
        <div className="layers">
          <button className="layer-btn mobile-only" onClick={() => { closeAllPanels('mobileNav'); setMobileNavOpen(v => !v); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>星体</button>
          <button className={`layer-btn ${satListOpen ? 'on' : ''}`} ref={lSatRef} onClick={() => { if (!satListOpen) closeAllPanels('sat'); setSatListOpen(v => !v); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>卫星</button>
          <button className="layer-btn" onClick={() => { if (!mobileSettingsOpen) closeAllPanels('mobileSettings'); setMobileSettingsOpen(v => !v); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>设置</button>
        </div>
      </div>

      <div className="nav" ref={navRef} />

      {/* Info hint icon — DOM-driven visibility (avoids React re-render on every planet click) */}
      <button className="info-hint" ref={infoHintRef} style={{ display: 'none' }} onClick={() => (window as any).__openInfo()}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      </button>

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
        <button className="tb" onClick={() => (window as any).__changeSpd(-1)}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
        <div className="tspeed" ref={spdTxtRef} style={{ minWidth: 60, textAlign: 'center' }}>1分/秒</div>
        <button className="tb" onClick={() => (window as any).__changeSpd(1)}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
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
              {['beidou', 'weather', 'stations', 'starlink', 'gps', 'probes', 'science', 'resource', 'geodetic', 'visual'].map(tid => {
                if (tid === 'probes') return (
                  <button key="probes" className={`sat-tab ${satTab === 'probes' ? 'active' : ''}`} onClick={() => setSatTab('probes')}>
                    <span className="sat-tab-row"><span className={`sat-tab-dot ${probesVisible ? '' : 'off'}`} style={{ background: 'linear-gradient(135deg, #81C784, #CE93D8, #FFB74D)' }} />探测器</span>
                    <span className="sat-tab-count">{PROBES.length} 颗</span>
                  </button>
                );
                const g = SAT_GROUPS.find(gg => gg.id === tid);
                if (!g) return null;
                return (
                  <button key={g.id} className={`sat-tab ${satTab === g.id ? 'active' : ''}`} onClick={() => setSatTab(g.id)}>
                    <span className="sat-tab-row"><span className={`sat-tab-dot ${satGroups[g.id] ? '' : 'off'}`} style={{ background: g.color }} />{g.labelCn}</span>
                    <span className="sat-tab-count">{g.id === GID_STARLINK ? (starlinkTotal || satellites.filter(s => s.groupId === g.id).length) : satellites.filter(s => s.groupId === g.id).length} 颗</span>
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
                  weather: '全球气象观测卫星。分布在LEO极轨和GEO静止轨道，包括风云、NOAA、GOES等系列。',
                  resource: '地球资源与对地观测卫星。包括Landsat、Sentinel、高分等系列，多在LEO太阳同步轨道。',
                  science: '科学研究卫星。包括哈勃、费米伽马射线等空间望远镜和科学实验平台。',
                  geodetic: '大地测量卫星。用于精密定位、地球重力场测量和地壳运动监测。',
                };
                const refs: Record<string, string> = {
                  beidou: '数据来源：CelesTrak · celestrak.org',
                  stations: '数据来源：CelesTrak · 实时TLE轨道数据',
                  gps: '数据来源：CelesTrak · GPS Operational',
                  starlink: '数据来源：CelesTrak · Starlink Group',
                  visual: '数据来源：CelesTrak · 100 Brightest',
                  weather: '数据来源：CelesTrak · Weather',
                  resource: '数据来源：CelesTrak · Earth Resources',
                  science: '数据来源：CelesTrak · Science',
                  geodetic: '数据来源：CelesTrak · Geodetic',
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
                  {g.id === GID_STARLINK && starlinkLoading && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>加载 Starlink 卫星数据... {starlinkProgress}%</div>
                      <div style={{ width: '100%', height: 3, background: 'rgba(94,234,212,0.1)', borderRadius: 2 }}>
                        <div style={{ width: `${starlinkProgress}%`, height: '100%', background: '#8B5CF6', borderRadius: 2, transition: 'width .3s' }} />
                      </div>
                    </div>
                  )}
                  <div className="sat-content-divider" />
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4 }}>
                    {g.id === GID_STARLINK && starlinkTotal > 0
                      ? `预览 · 共 ${starlinkTotal} 颗通过 InstancedMesh 渲染`
                      : `列表 · ${groupSats.length} 颗`}
                  </div>
                  <div className="sat-list">
                    {groupSats.length > 0 ? groupSats.map((s, li) => {
                      const isStarlink = g.id === GID_STARLINK;
                      const realIdx = isStarlink ? -1 : satellites.indexOf(s);
                      return (
                        <div key={li} className="sat-item" title="" onClick={() => { if (realIdx >= 0) (window as any).__focusSat(realIdx); }}>
                          <span className="sat-dot" style={{ background: s.color }} />
                          <span className="sat-name" title="">{getSatDisplayName(s.name, s.noradId)}</span>
                        </div>
                      );
                    }) : (g.id === GID_STARLINK && !starlinkLoading ? <div className="sat-loading" style={{ fontSize: 10 }}>启用后加载全部正常运行的卫星</div> : <div className="sat-loading">加载中...</div>)}
                  </div>
                </>);
              })()}
            </div>
          </div>
        </div>
      )}

      <div className="tip" ref={tipRef} />
      {/* Labels integrated into helper system — no separate labels div */}
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
                { id: 'general', label: '通用' },
                { id: 'planets', label: '行星系统' },
                { id: 'sats', label: '人造卫星' },
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
                <CfgToggle label="名称标签" cfgKey="showLabels" onToggle={() => (window as any).__toggleLabels()} />
                <CfgToggle label="轨道线" cfgKey="showOrbits" onToggle={() => (window as any).__toggleOrbits()} />
                <CfgToggle label="选择辅助框" cfgKey="showHelpers" onToggle={() => (window as any).__toggleHelpers()} />
                <CfgToggle label="人造卫星轨迹线" cfgKey="showTrails" onToggle={() => (window as any).__toggleTrails()} />
                <label className="mobile-toggle"><input type="checkbox" checked={showStatus} onChange={() => setShowStatus(v => !v)} /><span>状态信息栏</span></label>
                <div className="sat-content-divider" />
                <div style={{ fontSize: 10, color: 'var(--glow)', marginBottom: 4 }}>单指旋转控制</div>
                <CfgToggle label="反转左右旋转" cfgKey="invertH" />
                <CfgToggle label="反转上下旋转" cfgKey="invertV" />
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
