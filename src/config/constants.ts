import * as THREE from 'three';
import { PLANETS } from '../data/planets';
import { PROBES } from '../data/probesMeta';

export const h2n = (h: string) => parseInt(h.replace('#', ''), 16);

// Darken a hex color by a factor (simulates opacity against black background, avoids Line2 transparency artifacts)
export const darkenHex = (hex: number, f: number) => {
  const r = ((hex >> 16) & 0xff) * f;
  const g = ((hex >> 8) & 0xff) * f;
  const b = (hex & 0xff) * f;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
};

export const TRACKS_LIST = [
  { file: 'space-ambient.mp3', name: '深空漂流' },
  { file: 'cosmic-drift.mp3', name: '星际穿越' },
  { file: 'stellar-pulse.mp3', name: '脉冲星' },
  { file: 'solar-wind.mp3', name: '太阳风' },
  { file: 'deep-nebula.mp3', name: '星云深处' },
];

export const BASE = import.meta.env.BASE_URL;

export const SPEED_PRESETS = [
  { v: 1, label: '1秒' }, { v: 15, label: '15秒' }, { v: 30, label: '30秒' },
  { v: 60, label: '1分钟' }, { v: 300, label: '5分钟' }, { v: 900, label: '15分钟' },
  { v: 1800, label: '30分钟' }, { v: 3600, label: '1小时' }, { v: 7200, label: '2小时' },
  { v: 21600, label: '6小时' }, { v: 43200, label: '12小时' }, { v: 86400, label: '1天' },
  { v: 172800, label: '2天' }, { v: 259200, label: '3天' }, { v: 604800, label: '1周' },
  { v: 1209600, label: '2周' }, { v: 2592000, label: '1个月' }, { v: 7776000, label: '3个月' },
  { v: 15552000, label: '6个月' }, { v: 31557600, label: '1年' },
];

// Texture file map — loaded from public/textures/
export const TEX_FILES: Record<string, string> = {
  sun: 'sun.jpg', mercury: 'mercury.jpg', venus: 'venus.jpg',
  earth: 'earth_day.jpg', mars: 'mars.jpg', jupiter: 'jupiter.jpg',
  saturn: 'saturn.jpg', uranus: 'uranus.jpg', neptune: 'neptune.jpg',
  moon: 'moon.jpg',
};

// Procedural fallback texture
export function procTex(color: number, type: 'sun' | 'gas' | 'rock') {
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

export const P = PLANETS.map(p => ({
  id: p.id, n: p.name, cn: p.nameCn.split('—')[0].trim(), cnFull: p.nameCn, col: h2n(p.color),
  r: p.radius, d: p.distance, s: p.speed, tilt: p.tilt, rotP: p.rotationPeriod,
  sun: p.isSun ? 1 : 0, gas: p.textureType === 'gas' ? 1 : 0, ring: p.hasRing ? 1 : 0,
  stats: p.stats, fact: p.fact, texType: p.textureType,
  eccentricity: p.eccentricity ?? 0, orbitalIncl: p.orbitalIncl ?? 0,
  argPerihelion: p.argPerihelion ?? 0, longAscNode: p.longAscNode ?? 0,
}));

export const PR = PROBES.map((p, idx) => {
  const fb = p.fallbackPosition;
  if ('orbitPlanetId' in fb) {
    const pi = PLANETS.findIndex(pp => pp.id === fb.orbitPlanetId);
    return { n: p.name, cn: p.nameCn, col: h2n(p.color), orb: pi, od: fb.orbitDist, desc: p.desc, launched: p.launched, dist: 0, ang: 0, y: 0, emoji: p.emoji };
  }
  return { n: p.name, cn: p.nameCn, col: h2n(p.color), dist: fb.distance, ang: fb.angle, y: (idx % 3 - 1) * 6, desc: p.desc, launched: p.launched, orb: undefined as number | undefined, od: 0, emoji: p.emoji };
});
