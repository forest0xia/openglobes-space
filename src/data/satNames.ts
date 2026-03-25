/**
 * Chinese names for well-known satellites.
 * Key: NORAD catalog ID or partial OBJECT_NAME match.
 * Falls back to the original English name if no match.
 */

// By NORAD ID
const BY_ID: Record<number, string> = {
  25544: '国际空间站 ISS',
  48274: '天和核心舱',
  54216: '问天实验舱',
  56805: '梦天实验舱',
};

// By name prefix → Chinese name pattern
// Format: [matchPrefix, chineseTemplate]
// Template can use $1 for capture groups
const BY_PREFIX: [string, string][] = [
  // BeiDou — use Chinese designations
  ['BEIDOU-3 M', '北斗三号 中圆轨道'],
  ['BEIDOU-3 G', '北斗三号 地球静止轨道'],
  ['BEIDOU-3 IGSO', '北斗三号 倾斜同步轨道'],
  ['BEIDOU-3S M', '北斗三号S 中圆轨道'],
  ['BEIDOU-3S IGSO', '北斗三号S 倾斜同步轨道'],
  ['BEIDOU-2 M', '北斗二号 中圆轨道'],
  ['BEIDOU-2 G', '北斗二号 地球静止轨道'],
  ['BEIDOU-2 IGSO', '北斗二号 倾斜同步轨道'],
  // Chinese Space Station components
  ['CSS (TIANHE)', '天和核心舱'],
  ['CSS (WENTIAN)', '问天实验舱'],
  ['CSS (MENGTIAN)', '梦天实验舱'],
  ['TIANZHOU', '天舟货运飞船'],
  ['SHENZHOU', '神舟载人飞船'],
  ['SZ-', '神舟'],
  // ISS
  ['ISS (ZARYA)', '国际空间站'],
  ['ISS (NAUKA)', '科学号实验舱'],
  // Others
  ['CREW DRAGON', '龙飞船'],
  ['PROGRESS-MS', '进步号货运飞船'],
  ['SOYUZ-MS', '联盟号飞船'],
  ['GPS ', 'GPS 导航卫星'],
];

/**
 * Get the best Chinese display name for a satellite.
 */
export function getSatDisplayName(name: string, noradId: number): string {
  // Check by NORAD ID first
  if (BY_ID[noradId]) return BY_ID[noradId];

  // Check by prefix match
  for (const [prefix, cnName] of BY_PREFIX) {
    if (name.startsWith(prefix)) {
      // Extract the designation part after the prefix (e.g. "C06" from "BEIDOU-2 IGSO-1 (C06)")
      const paren = name.match(/\(([^)]+)\)/);
      const suffix = paren ? ` (${paren[1]})` : '';
      return cnName + suffix;
    }
  }

  return name; // fallback to English name
}
