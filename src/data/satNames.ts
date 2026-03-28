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

// By name prefix → Chinese name
// Format: [matchPrefix, chineseName]
// Longer/more specific prefixes first — first match wins
const BY_PREFIX: [string, string][] = [
  // ═══ Chinese Space Program ═══
  ['CSS (TIANHE)', '天和核心舱'],
  ['CSS (WENTIAN)', '问天实验舱'],
  ['CSS (MENGTIAN)', '梦天实验舱'],
  ['TIANZHOU', '天舟货运飞船'],
  ['SHENZHOU', '神舟载人飞船'],
  ['SZ-', '神舟'],
  ['TIANGONG', '天宫'],
  ['TIANMU', '天目'],
  ['TIANPING', '天平'],
  ['TIANQI', '天启'],
  ['TIANHUI', '天绘'],
  ['TIANLIAN', '天链中继卫星'],
  ['TIANWEN', '天问'],
  ['YAOGAN', '遥感'],
  ['GAOFEN', '高分'],
  ['ZIYUAN', '资源'],
  ['HAIYANG', '海洋'],
  ['FENGYUN', '风云'],
  ['YUNHAI', '云海'],
  ['JILIN', '吉林一号'],
  ['LUOJIA', '珞珈'],
  ['SHIYAN', '试验'],
  ['SHIJIAN', '实践'],
  ['ZHONGXING', '中星'],
  ['APSTAR', '亚太'],
  ['CHANG ZHENG', '长征残骸'],
  ['CZ-', '长征残骸'],
  ['CHUANGXIN', '创新'],
  ['HUANJING', '环境'],
  ['BEIDOU-3S IGSO', '北斗三号S 倾斜同步轨道'],
  ['BEIDOU-3S M', '北斗三号S 中圆轨道'],
  ['BEIDOU-3 M', '北斗三号 中圆轨道'],
  ['BEIDOU-3 G', '北斗三号 地球静止轨道'],
  ['BEIDOU-3 IGSO', '北斗三号 倾斜同步轨道'],
  ['BEIDOU-2 M', '北斗二号 中圆轨道'],
  ['BEIDOU-2 G', '北斗二号 地球静止轨道'],
  ['BEIDOU-2 IGSO', '北斗二号 倾斜同步轨道'],
  ['BEIDOU', '北斗'],

  // ═══ Space Stations ═══
  ['ISS (ZARYA)', '国际空间站'],
  ['ISS (NAUKA)', '科学号实验舱'],
  ['CREW DRAGON', '龙飞船'],
  ['PROGRESS-MS', '进步号货运飞船'],
  ['SOYUZ-MS', '联盟号飞船'],
  ['STARLINER', '星际客机'],
  ['CYGNUS', '天鹅座货运飞船'],
  ['DRAGON', '龙飞船'],

  // ═══ Navigation ═══
  ['GPS ', 'GPS 导航卫星'],
  ['GLONASS', '格洛纳斯导航卫星'],
  ['GALILEO', '伽利略导航卫星'],
  ['NAVSTAR', 'GPS 导航卫星'],
  ['IRNSS', '印度导航卫星'],
  ['QZSS', '准天顶卫星'],

  // ═══ Weather ═══
  ['NOAA ', 'NOAA 气象卫星'],
  ['METEOSAT', '气象卫星'],
  ['GOES ', 'GOES 气象卫星'],
  ['METOP', 'MetOp 气象卫星'],
  ['SUOMI NPP', 'Suomi NPP 气象卫星'],
  ['JPSS', 'JPSS 气象卫星'],
  ['HIMAWARI', '向日葵 气象卫星'],
  ['ELEKTRO', '电子 气象卫星'],
  ['INSAT', 'INSAT 气象卫星'],

  // ═══ Earth Observation ═══
  ['LANDSAT', 'Landsat 地球观测'],
  ['SENTINEL', '哨兵 地球观测'],
  ['WORLDVIEW', 'WorldView 地球观测'],
  ['TERRA', 'Terra 地球观测'],
  ['AQUA', 'Aqua 海洋观测'],
  ['AURA', 'Aura 大气观测'],
  ['CALIPSO', 'CALIPSO 云气溶胶'],
  ['CLOUDSAT', 'CloudSat 云观测'],
  ['ICESAT', 'ICESat 冰层测量'],
  ['GRACE', 'GRACE 重力场'],
  ['SWARM', 'Swarm 磁场观测'],
  ['CRYOSAT', 'CryoSat 冰层监测'],
  ['PLEIADES', '昴宿星 地球观测'],

  // ═══ Science ═══
  ['HUBBLE', '哈勃太空望远镜'],
  ['HST', '哈勃太空望远镜'],
  ['CHANDRA', '钱德拉X射线望远镜'],
  ['FERMI', '费米伽马射线望远镜'],
  ['SWIFT', 'Swift 伽马射线暴'],
  ['NUSTAR', 'NuSTAR X射线望远镜'],
  ['TESS', 'TESS 系外行星巡天'],
  ['CLUSTER', 'CLUSTER 磁层探测'],
  ['XMM-NEWTON', 'XMM-牛顿 X射线'],
  ['INTEGRAL', 'INTEGRAL 伽马射线'],
  ['EINSTEIN PROBE', '爱因斯坦探针'],
  ['EP-WXT', '爱因斯坦探针'],
  ['DAMPE', '悟空号暗物质探测'],
  ['HXMT', '慧眼硬X射线望远镜'],
  ['QUESS', '墨子号量子卫星'],
  ['CSES', '张衡一号 地震电磁'],

  // ═══ Geodetic ═══
  ['LAGEOS', 'LAGEOS 激光测距'],
  ['STARLETTE', 'Starlette 大地测量'],
  ['STELLA', 'Stella 大地测量'],
  ['AJISAI', '彩星 大地测量'],
  ['LARES', 'LARES 广义相对论'],
  ['BLITS', 'BLITS 激光反射'],

  // ═══ Communications ═══
  ['STARLINK', 'Starlink 星链'],
  ['ONEWEB', 'OneWeb 卫星互联网'],
  ['IRIDIUM', '铱星通信'],
  ['GLOBALSTAR', 'Globalstar 通信'],
  ['ORBCOMM', 'ORBCOMM 通信'],
  ['INTELSAT', 'Intelsat 通信'],
  ['SES', 'SES 通信'],
  ['TELESAT', 'Telesat 通信'],
  ['EUTELSAT', 'Eutelsat 通信'],
  ['ASTRA', 'Astra 通信'],
  ['VIASAT', 'ViaSat 通信'],
  ['TDRS', 'TDRS 中继卫星'],
  ['COSMO-SKYMED', 'COSMO-SkyMed 雷达'],
];

/**
 * Get the best Chinese display name for a satellite.
 */
export function getSatDisplayName(name: string, noradId: number): string {
  // Check by NORAD ID first
  if (BY_ID[noradId]) return BY_ID[noradId];

  // Check by prefix match (first match wins — longer prefixes listed first)
  const upper = name.toUpperCase();
  for (const [prefix, cnName] of BY_PREFIX) {
    if (upper.startsWith(prefix.toUpperCase())) {
      // Extract designation in parentheses if any, e.g. "(C06)"
      const paren = name.match(/\(([^)]+)\)/);
      const suffix = paren ? ` (${paren[1]})` : '';
      // Extract trailing number if any, e.g. "FENGYUN 4B" → "4B"
      const rest = name.slice(prefix.length).trim();
      const num = rest && !rest.startsWith('(') ? ' ' + rest.split('(')[0].trim() : '';
      return cnName + num + suffix;
    }
  }

  return name; // fallback to English
}
