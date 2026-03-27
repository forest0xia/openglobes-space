/**
 * Satellite data loader + SGP4 position calculator.
 * Loads from pre-cached static file (updated daily by GitHub Actions).
 * Falls back to live CelesTrak API if cache is missing or stale (>48h).
 */
import {
  twoline2satrec,
  propagate,
  type SatRec,
  type EciVec3,
} from 'satellite.js';

const BASE = import.meta.env.BASE_URL;

export interface SatGroup {
  id: string;
  label: string;
  labelCn: string;
  color: string;
  url: string; // live API fallback
}

export const SAT_GROUPS: SatGroup[] = [
  { id: 'beidou', label: 'BeiDou', labelCn: '北斗', color: '#7EC8E3', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=beidou&FORMAT=json' },
  { id: 'stations', label: 'Stations', labelCn: '空间站', color: '#F59E0B', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json' },
  { id: 'gps', label: 'GPS', labelCn: 'GPS', color: '#3B82F6', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=json' },
  { id: 'starlink', label: 'Starlink', labelCn: 'Starlink', color: '#8B5CF6', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json' },
  { id: 'visual', label: 'Brightest', labelCn: '明亮卫星', color: '#10B981', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json' },
  { id: 'weather', label: 'Weather', labelCn: '气象卫星', color: '#06B6D4', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=json' },
  { id: 'resource', label: 'Earth Resources', labelCn: '地球资源', color: '#84CC16', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=resource&FORMAT=json' },
  { id: 'science', label: 'Science', labelCn: '科学卫星', color: '#E879F9', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=science&FORMAT=json' },
  { id: 'geodetic', label: 'Geodetic', labelCn: '大地测量', color: '#FB923C', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=geodetic&FORMAT=json' },
];

export interface SatRecord {
  name: string;
  groupId: string;
  color: string;
  satrec: SatRec;
  noradId: number;
}

// ═══════ TLE CONVERSION ═══════

function ommToTLE(omm: any): [string, string] | null {
  try {
    const norad = String(omm.NORAD_CAT_ID).padStart(5, '0');
    const cls = omm.CLASSIFICATION_TYPE || 'U';
    const intlDes = (omm.OBJECT_ID || '00000A').replace(/^(\d{4})-(\w+)$/, (_: string, y: string, p: string) => y.slice(2) + p.padEnd(3, ' '));
    const epoch = new Date(omm.EPOCH);
    const yr = epoch.getUTCFullYear() % 100;
    const jan1 = new Date(Date.UTC(epoch.getUTCFullYear(), 0, 1));
    const dayOfYear = (epoch.getTime() - jan1.getTime()) / 86400000 + 1;
    const epochStr = String(yr).padStart(2, '0') + dayOfYear.toFixed(8).padStart(12, '0');
    const mm1 = omm.MEAN_MOTION_DOT ?? 0;
    const mm2 = omm.MEAN_MOTION_DDOT ?? 0;
    const bstar = omm.BSTAR ?? 0;
    const etype = omm.EPHEMERIS_TYPE ?? 0;
    const elset = String(omm.ELEMENT_SET_NO ?? 999).padStart(4, ' ');

    function fmtExp(val: number): string {
      if (val === 0) return ' 00000-0';
      const sign = val < 0 ? '-' : ' ';
      const abs = Math.abs(val);
      const exp = Math.floor(Math.log10(abs));
      const man = abs / Math.pow(10, exp);
      const manStr = Math.round(man * 100000).toString().padStart(5, '0');
      const expSign = exp < 0 ? '-' : '+';
      return sign + manStr + expSign + Math.abs(exp);
    }

    const mm1Str = (mm1 >= 0 ? ' .' : '-.') + Math.abs(mm1).toFixed(8).split('.')[1];
    let line1 = `1 ${norad}${cls} ${intlDes.padEnd(8)} ${epochStr} ${mm1Str} ${fmtExp(mm2)} ${fmtExp(bstar)} ${etype} ${elset}`;
    line1 = line1.padEnd(68);
    line1 += checksum(line1);

    const inc = omm.INCLINATION.toFixed(4).padStart(8, ' ');
    const raan = omm.RA_OF_ASC_NODE.toFixed(4).padStart(8, ' ');
    const ecc = omm.ECCENTRICITY.toFixed(7).split('.')[1];
    const aop = omm.ARG_OF_PERICENTER.toFixed(4).padStart(8, ' ');
    const ma = omm.MEAN_ANOMALY.toFixed(4).padStart(8, ' ');
    const mm = omm.MEAN_MOTION.toFixed(8).padStart(11, ' ');
    const rev = String(omm.REV_AT_EPOCH ?? 0).padStart(5, ' ');
    let line2 = `2 ${norad} ${inc} ${raan} ${ecc} ${aop} ${ma} ${mm}${rev}`;
    line2 = line2.padEnd(68);
    line2 += checksum(line2);
    return [line1, line2];
  } catch { return null; }
}

function checksum(line: string): number {
  let sum = 0;
  for (let i = 0; i < 68; i++) {
    const c = line[i];
    if (c >= '0' && c <= '9') sum += +c;
    else if (c === '-') sum += 1;
  }
  return sum % 10;
}

// ═══════ PARSING + VALIDATION ═══════

const JUNK_PATTERNS = /^(ISS OBJECT|FREGAT DEB|CZ-\d|SL-\d|ATLAS \d|DELTA \d|H-2A|H-2B|ARIANE|BREEZE|COSMOS \d+ DEB|IRIDIUM \d+ DEB|VEGA|ELECTRON)/i;

function parseOMMArray(data: any[], groupId: string, color: string): SatRecord[] {
  const records: SatRecord[] = [];
  const now = new Date();
  for (const item of data) {
    try {
      if (JUNK_PATTERNS.test(item.OBJECT_NAME || '')) continue;
      let line1 = item.TLE_LINE1;
      let line2 = item.TLE_LINE2;
      if (!line1 || !line2) {
        const tle = ommToTLE(item);
        if (!tle) continue;
        [line1, line2] = tle;
      }
      const satrec = twoline2satrec(line1, line2);
      // Validate SGP4
      const pv = propagate(satrec, now);
      if (typeof pv.position === 'boolean' || !pv.position) continue;
      const p = pv.position as EciVec3<number>;
      const dist = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      if (dist < 100 || dist > 500000) continue;
      records.push({
        name: (item.OBJECT_NAME || '').trim(),
        groupId,
        color,
        satrec,
        noradId: item.NORAD_CAT_ID || 0,
      });
    } catch { /* skip */ }
  }
  return records;
}

// ═══════ LOADING: CACHE FIRST, API FALLBACK ═══════

interface CacheFile {
  timestamp: string;
  groups: Record<string, any[]>;
}

let cacheData: CacheFile | null = null;

async function loadCache(): Promise<CacheFile | null> {
  if (cacheData) return cacheData;
  try {
    const res = await fetch(BASE + 'data/satellites-cache.json');
    if (!res.ok) return null;
    cacheData = await res.json();
    return cacheData;
  } catch { return null; }
}

function isCacheFresh(cache: CacheFile): boolean {
  const age = Date.now() - new Date(cache.timestamp).getTime();
  return age < 48 * 60 * 60 * 1000; // 48 hours
}

async function fetchGroupLive(group: SatGroup): Promise<any[]> {
  const res = await fetch(group.url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Load all satellites except Starlink (loaded separately for performance).
 */
export async function fetchAllSatellites(): Promise<SatRecord[]> {
  const cache = await loadCache();
  const results: SatRecord[] = [];
  const seenNoradIds = new Set<number>(); // dedup across groups

  for (const group of SAT_GROUPS) {
    if (group.id === 'starlink') continue; // loaded separately
    let data: any[] | null = null;

    // Try cache first
    if (cache && isCacheFresh(cache) && cache.groups[group.id]) {
      data = cache.groups[group.id];
    }

    // Fallback to live API
    if (!data || data.length === 0) {
      try { data = await fetchGroupLive(group); } catch { data = []; }
    }

    const groupColor = group.color;
    const parsed = parseOMMArray(data, group.id, groupColor);
    for (const sat of parsed) {
      if (sat.noradId && seenNoradIds.has(sat.noradId)) continue; // skip duplicate
      if (sat.noradId) seenNoradIds.add(sat.noradId);
      results.push(sat);
    }
  }

  return results;
}

/**
 * Load Starlink satellites from cache or live API.
 */
export async function fetchStarlinkSatellites(): Promise<SatRecord[]> {
  const cache = await loadCache();
  const group = SAT_GROUPS.find(g => g.id === 'starlink')!;
  let data: any[] | null = null;

  if (cache && isCacheFresh(cache) && cache.groups.starlink) {
    data = cache.groups.starlink;
  }

  if (!data || data.length === 0) {
    try { data = await fetchGroupLive(group); } catch { data = []; }
  }

  // Filter Starlink: only active operational LEO satellites
  // Real Starlink orbit: 540-570km. Allow 300-800km for orbit raising/lowering.
  // Filter by altitude from SGP4 position (ECI distance - Earth radius)
  const records: SatRecord[] = [];
  const now = new Date();
  for (const item of data) {
    try {
      const tle = ommToTLE(item);
      if (!tle) continue;
      const satrec = twoline2satrec(tle[0], tle[1]);
      const pv = propagate(satrec, now);
      if (typeof pv.position === 'boolean' || !pv.position) continue;
      const p = pv.position as EciVec3<number>;
      const distKm = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      const altitudeKm = distKm - 6371;
      // Only keep satellites in LEO range (300-800km) — filters out deorbiting, GTO, debris
      if (altitudeKm < 300 || altitudeKm > 800) continue;
      records.push({
        name: (item.OBJECT_NAME || '').trim(),
        groupId: 'starlink',
        color: group.color,
        satrec,
        noradId: item.NORAD_CAT_ID || 0,
      });
    } catch { /* skip */ }
  }
  return records;
}

// Keep old export name for compatibility
export async function fetchSatelliteGroup(groupId: string): Promise<SatRecord[]> {
  if (groupId === 'starlink') return fetchStarlinkSatellites();
  const group = SAT_GROUPS.find(g => g.id === groupId);
  if (!group) return [];
  const cache = await loadCache();
  let data = cache?.groups[groupId] || null;
  if (!data) { try { data = await fetchGroupLive(group); } catch { return []; } }
  return parseOMMArray(data, groupId, group.color);
}

// ═══════ POSITION CALCULATION ═══════

export function getSatPositionECI(sat: SatRecord, date: Date): { x: number; y: number; z: number } | null {
  try {
    const posVel = propagate(sat.satrec, date);
    if (typeof posVel.position === 'boolean' || !posVel.position) return null;
    const p = posVel.position as EciVec3<number>;
    if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) return null;
    return { x: p.x, y: p.y, z: p.z };
  } catch { return null; }
}

export function eciToScene(
  eci: { x: number; y: number; z: number },
  earthPos: { x: number; y: number; z: number },
  earthSceneR: number,
  scaleFactor: number = 1
): { x: number; y: number; z: number } {
  const kmToScene = earthSceneR / 6371;
  return {
    x: earthPos.x + eci.x * kmToScene * scaleFactor,
    y: earthPos.y + eci.y * kmToScene * scaleFactor,
    z: earthPos.z + eci.z * kmToScene * scaleFactor,
  };
}
