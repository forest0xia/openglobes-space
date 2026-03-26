/**
 * CelesTrak satellite data fetcher + SGP4 position calculator.
 * Fetches OMM JSON data, constructs TLE lines, uses satellite.js SGP4.
 */
import {
  twoline2satrec,
  propagate,
  type SatRec,
  type EciVec3,
} from 'satellite.js';

export interface SatGroup {
  id: string;
  label: string;
  labelCn: string;
  color: string;
  url: string;
  maxCount?: number; // limit number of satellites loaded from this group
}

export const SAT_GROUPS: SatGroup[] = [
  { id: 'beidou', label: 'BeiDou', labelCn: '北斗', color: '#7EC8E3', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=beidou&FORMAT=json' },
  { id: 'stations', label: 'Stations', labelCn: '空间站', color: '#F59E0B', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json' },
  { id: 'gps', label: 'GPS', labelCn: 'GPS', color: '#3B82F6', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=json' },
  { id: 'starlink', label: 'Starlink', labelCn: 'Starlink', color: '#8B5CF6', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json' },
  { id: 'visual', label: 'Brightest', labelCn: '明亮卫星', color: '#10B981', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json' },
];

export interface SatRecord {
  name: string;
  groupId: string;
  color: string;
  satrec: SatRec;
  noradId: number;
}

const CACHE_TTL = 2 * 60 * 60 * 1000;

// Convert OMM JSON to TLE line format for satellite.js
function ommToTLE(omm: any): [string, string] | null {
  try {
    const norad = String(omm.NORAD_CAT_ID).padStart(5, '0');
    const cls = omm.CLASSIFICATION_TYPE || 'U';
    const intlDes = (omm.OBJECT_ID || '00000A').replace(/^(\d{4})-(\w+)$/, (_: string, y: string, p: string) => {
      return y.slice(2) + p.padEnd(3, ' ');
    });

    // Epoch: convert ISO to TLE epoch (YY + day-of-year.fraction)
    const epoch = new Date(omm.EPOCH);
    const yr = epoch.getUTCFullYear() % 100;
    const jan1 = new Date(Date.UTC(epoch.getUTCFullYear(), 0, 1));
    const dayOfYear = (epoch.getTime() - jan1.getTime()) / 86400000 + 1;
    const epochStr = String(yr).padStart(2, '0') + dayOfYear.toFixed(8).padStart(12, '0');

    const mm1 = (omm.MEAN_MOTION_DOT ?? 0);
    const mm2 = (omm.MEAN_MOTION_DDOT ?? 0);
    const bstar = (omm.BSTAR ?? 0);
    const etype = omm.EPHEMERIS_TYPE ?? 0;
    const elset = String(omm.ELEMENT_SET_NO ?? 999).padStart(4, ' ');

    // Format exponential notation for TLE
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
    // Pad to 68 chars, add checksum
    line1 = line1.padEnd(68);
    line1 += checksum(line1);

    const inc = omm.INCLINATION.toFixed(4).padStart(8, ' ');
    const raan = omm.RA_OF_ASC_NODE.toFixed(4).padStart(8, ' ');
    const ecc = omm.ECCENTRICITY.toFixed(7).split('.')[1]; // no leading 0.
    const aop = omm.ARG_OF_PERICENTER.toFixed(4).padStart(8, ' ');
    const ma = omm.MEAN_ANOMALY.toFixed(4).padStart(8, ' ');
    const mm = omm.MEAN_MOTION.toFixed(8).padStart(11, ' ');
    const rev = String(omm.REV_AT_EPOCH ?? 0).padStart(5, ' ');

    let line2 = `2 ${norad} ${inc} ${raan} ${ecc} ${aop} ${ma} ${mm}${rev}`;
    line2 = line2.padEnd(68);
    line2 += checksum(line2);

    return [line1, line2];
  } catch {
    return null;
  }
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

function parseOMMJson(data: any[], group: SatGroup): SatRecord[] {
  const records: SatRecord[] = [];
  for (const item of data) {
    try {
      // Try TLE_LINE1/TLE_LINE2 first (some endpoints provide these)
      let line1 = item.TLE_LINE1;
      let line2 = item.TLE_LINE2;

      if (!line1 || !line2) {
        // Construct from OMM fields
        const tle = ommToTLE(item);
        if (!tle) continue;
        [line1, line2] = tle;
      }

      const satrec = twoline2satrec(line1, line2);
      records.push({
        name: (item.OBJECT_NAME || '').trim(),
        groupId: group.id,
        color: group.color,
        satrec,
        noradId: item.NORAD_CAT_ID || 0,
      });
    } catch { /* skip bad entry */ }
  }
  // Filter: validate SGP4 propagation and exclude debris/junk
  const validated: SatRecord[] = [];
  const now = new Date();
  // Filter out debris and rocket bodies — keep space station modules and crew vehicles
  const JUNK_PATTERNS = /^(ISS OBJECT|FREGAT DEB|CZ-\d|SL-\d|ATLAS \d|DELTA \d|H-2A|H-2B|ARIANE|BREEZE|COSMOS \d+ DEB|IRIDIUM \d+ DEB|VEGA|ELECTRON)/i;
  for (const rec of records) {
    // Skip debris and rocket bodies
    if (JUNK_PATTERNS.test(rec.name)) continue;
    // Validate: must produce a valid position now
    try {
      const pv = propagate(rec.satrec, now);
      if (typeof pv.position === 'boolean' || !pv.position) continue;
      const p = pv.position as EciVec3<number>;
      // Sanity: position should be within ~100,000 km of Earth center
      const dist = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      if (dist < 100 || dist > 500000) continue; // too close (decayed) or too far
      validated.push(rec);
    } catch { continue; }
  }
  return validated;
}

async function fetchGroup(group: SatGroup): Promise<SatRecord[]> {
  const cacheKey = `sat_cache_${group.id}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) return parseOMMJson(data, group);
    } catch { /* refetch */ }
  }

  try {
    const res = await fetch(group.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let data = await res.json();
    // Limit heavy groups (e.g. Starlink 6000+)
    if (group.maxCount && data.length > group.maxCount) data = data.slice(0, group.maxCount);
    localStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() }));
    return parseOMMJson(data, group);
  } catch (err) {
    console.warn(`Failed to fetch ${group.id}:`, err);
    return [];
  }
}

export async function fetchAllSatellites(skipGroups: string[] = ['starlink']): Promise<SatRecord[]> {
  const groups = SAT_GROUPS.filter(g => !skipGroups.includes(g.id));
  const results = await Promise.all(groups.map(fetchGroup));
  return results.flat();
}

export async function fetchSatelliteGroup(groupId: string): Promise<SatRecord[]> {
  const group = SAT_GROUPS.find(g => g.id === groupId);
  if (!group) return [];
  return fetchGroup(group);
}

export function getSatPositionECI(sat: SatRecord, date: Date): { x: number; y: number; z: number } | null {
  try {
    const posVel = propagate(sat.satrec, date);
    if (typeof posVel.position === 'boolean' || !posVel.position) return null;
    const p = posVel.position as EciVec3<number>;
    return { x: p.x, y: p.y, z: p.z };
  } catch {
    return null;
  }
}

export function eciToScene(
  eci: { x: number; y: number; z: number },
  earthPos: { x: number; y: number; z: number },
  earthSceneR: number,
  scaleFactor: number = 1
): { x: number; y: number; z: number } {
  // No exaggeration — real proportional distances
  // ECI is in km from Earth center. Convert to scene units.
  const kmToScene = earthSceneR / 6371;
  return {
    x: earthPos.x + eci.x * kmToScene * scaleFactor,
    y: earthPos.y + eci.y * kmToScene * scaleFactor,
    z: earthPos.z + eci.z * kmToScene * scaleFactor,
  };
}
