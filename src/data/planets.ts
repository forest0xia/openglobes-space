export interface PlanetData {
  id: string;
  name: string;
  nameCn: string;
  color: string;
  emissive: string;
  radius: number;      // visual radius in scene units (exaggerated for visibility)
  realRadiusKm: number; // actual radius in km (for real-scale mode)
  distance: number;     // semi-major axis in scene units (1 AU = 20)
  speed: number;        // orbital speed multiplier (relative to Earth = 1.0)
  tilt: number;         // axial tilt in degrees
  rotationPeriod: number; // sidereal rotation period in days (positive = prograde in body frame)
  isSun?: boolean;
  hasRing?: boolean;
  stats: Record<string, string>;
  fact: string;
  textureType: 'sun' | 'gas' | 'rock';
  eccentricity?: number;
  orbitalIncl?: number;
  longAscNode?: number;
  argPerihelion?: number;
}

// ═══════════════════════════════════════════════════════════════
// SCALE REFERENCE (1 AU = 20 scene units, Earth visual radius = 1)
//
// Real distances (AU → scene units):
//   Mercury  0.387 AU →  7.74    Venus  0.723 AU → 14.46
//   Earth    1.000 AU → 20.00    Mars   1.524 AU → 30.48
//   Jupiter  5.203 AU → 104.1    Saturn 9.537 AU → 190.7
//   Uranus  19.19  AU → 383.8    Neptune 30.07 AU → 601.4
//
// Real radii (km) — used for "真实比例" mode:
//   Sun 696,340  Mercury 2,440  Venus 6,052  Earth 6,371
//   Mars 3,390   Jupiter 69,911  Saturn 58,232
//   Uranus 25,362  Neptune 24,622
//
// Visual radii are exaggerated so planets are visible at solar system scale.
// In "真实比例" mode, radii are scaled proportionally to the Sun's visual size.
//
// Satellite distances (from Earth center, in Earth radii):
//   LEO (ISS): ~1.07 Er     MEO (GPS/BeiDou): ~4.2 Er
//   GEO: ~6.6 Er            Moon: ~60.3 Er
// ═══════════════════════════════════════════════════════════════

export const PLANETS: PlanetData[] = [
  {
    id: 'sun', name: 'Sun', nameCn: '太阳 — 恒星',
    color: '#FDB813', emissive: '#FDB813',
    radius: 5, realRadiusKm: 696340,
    distance: 0, speed: 0, tilt: 0, rotationPeriod: 25.38, isSun: true, textureType: 'sun',
    stats: { '直径': '1,392,700 km', '表面温度': '5,500°C', '类型': '黄矮星 G2V', '年龄': '45.7 亿年' },
    fact: '太阳每秒将约400万吨物质转化为能量。光从核心到表面需约17万年，但从表面到地球只需8分20秒。',
  },
  {
    id: 'mercury', name: 'Mercury', nameCn: '水星 — 最近的行星',
    color: '#9B9B9B', emissive: '#2A2A2A',
    radius: 0.4, realRadiusKm: 2440,
    distance: 7.74, speed: 4.15, tilt: 0.03, rotationPeriod: 58.646, textureType: 'rock',
    eccentricity: 0.2056, orbitalIncl: 7.00, longAscNode: 48.33, argPerihelion: 77.46,
    stats: { '直径': '4,879 km', '公转周期': '88 天', '温度': '-180~430°C', '卫星': '0' },
    fact: '水星是温差最大的行星：白天430°C，夜晚-180°C。它并非最热——金星因温室效应更热。',
  },
  {
    id: 'venus', name: 'Venus', nameCn: '金星 — 地球姐妹星',
    color: '#E8CDA0', emissive: '#3D3020',
    radius: 0.9, realRadiusKm: 6052,
    distance: 14.46, speed: 1.62, tilt: 177.4, rotationPeriod: 243.023, textureType: 'rock',
    eccentricity: 0.0068, orbitalIncl: 3.39, longAscNode: 76.68, argPerihelion: 131.53,
    stats: { '直径': '12,104 km', '公转周期': '225 天', '表面温度': '462°C', '大气压': '92 倍' },
    fact: '金星"倒转"自转，太阳从西边升起。一天（243地球日）比一年（225地球日）还长。',
  },
  {
    id: 'earth', name: 'Earth', nameCn: '地球 — 我们的家',
    color: '#4A90D9', emissive: '#112244',
    radius: 1, realRadiusKm: 6371,
    distance: 20, speed: 1.0, tilt: 23.44, rotationPeriod: 0.99727, textureType: 'rock',
    eccentricity: 0.0167, orbitalIncl: 0.00, longAscNode: 0, argPerihelion: 102.94,
    stats: { '直径': '12,756 km', '公转周期': '365.25 天', '平均温度': '15°C', '卫星': '1' },
    fact: '地球71%被水覆盖，但所有水收集成球直径仅约1,385km——比月球小。每天100吨太空尘埃落入大气。',
  },
  {
    id: 'mars', name: 'Mars', nameCn: '火星 — 红色星球',
    color: '#C1440E', emissive: '#331100',
    radius: 0.6, realRadiusKm: 3390,
    distance: 30.48, speed: 0.53, tilt: 25.19, rotationPeriod: 1.026, textureType: 'rock',
    eccentricity: 0.0934, orbitalIncl: 1.85, longAscNode: 49.56, argPerihelion: 336.04,
    stats: { '直径': '6,792 km', '公转周期': '687 天', '表面温度': '-65°C', '卫星': '2' },
    fact: '火星有太阳系最高的山——奥林帕斯山21.9km。火星日落是蓝色的。',
  },
  {
    id: 'jupiter', name: 'Jupiter', nameCn: '木星 — 巨人之王',
    color: '#C88B3A', emissive: '#2D1F0A',
    radius: 3, realRadiusKm: 69911,
    distance: 104.1, speed: 0.084, tilt: 3.13, rotationPeriod: 0.4135, textureType: 'gas',
    eccentricity: 0.0489, orbitalIncl: 1.30, longAscNode: 100.46, argPerihelion: 14.33,
    stats: { '直径': '142,984 km', '公转周期': '11.86 年', '温度': '-110°C', '已知卫星': '95' },
    fact: '大红斑风暴持续400+年，能容纳整个地球。木星的引力是太阳系"保镖"，偏转了无数危险小行星。',
  },
  {
    id: 'saturn', name: 'Saturn', nameCn: '土星 — 环中之王',
    color: '#E4D191', emissive: '#332D15',
    radius: 2.5, realRadiusKm: 58232,
    distance: 190.7, speed: 0.034, tilt: 26.73, rotationPeriod: 0.444, hasRing: true, textureType: 'gas',
    eccentricity: 0.0565, orbitalIncl: 2.49, longAscNode: 113.66, argPerihelion: 92.43,
    stats: { '直径': '120,536 km', '公转周期': '29.46 年', '温度': '-140°C', '已知卫星': '146' },
    fact: '土星密度比水低——理论上它会浮在水面。它的环宽28万公里，厚度仅约10米。',
  },
  {
    id: 'uranus', name: 'Uranus', nameCn: '天王星 — 冰巨人',
    color: '#9FC4C7', emissive: '#1A2D2E',
    radius: 1.6, realRadiusKm: 25362,
    distance: 383.8, speed: 0.012, tilt: 97.77, rotationPeriod: 0.718, textureType: 'gas',
    eccentricity: 0.0457, orbitalIncl: 0.77, longAscNode: 74.01, argPerihelion: 170.96,
    stats: { '直径': '51,118 km', '公转周期': '84 年', '温度': '-195°C', '已知卫星': '28' },
    fact: '天王星倾斜98°"躺着"公转，每个极点交替经历42年白天和42年黑夜。',
  },
  {
    id: 'neptune', name: 'Neptune', nameCn: '海王星 — 风暴之星',
    color: '#3E54E8', emissive: '#0A0F33',
    radius: 1.5, realRadiusKm: 24622,
    distance: 601.4, speed: 0.006, tilt: 28.32, rotationPeriod: 0.671, textureType: 'gas',
    eccentricity: 0.0113, orbitalIncl: 1.77, longAscNode: 131.78, argPerihelion: 44.97,
    stats: { '直径': '49,528 km', '公转周期': '164.8 年', '温度': '-200°C', '已知卫星': '16' },
    fact: '海王星风速达2,100km/h（1.6倍音速）。它是唯一通过数学预测发现的行星（1846年）。',
  },
  // ═══════ DWARF PLANETS ═══════
  {
    id: 'ceres', name: 'Ceres', nameCn: '谷神星 — 小行星带最大天体',
    color: '#8C8C7A', emissive: '#1A1A15',
    radius: 0.25, realRadiusKm: 473,
    distance: 55.38, speed: 0.218, tilt: 4, rotationPeriod: 0.378, textureType: 'rock',
    eccentricity: 0.0758, orbitalIncl: 10.59, longAscNode: 80.33, argPerihelion: 73.60,
    stats: { '直径': '946 km', '公转周期': '4.6 年', '表面温度': '-106°C', '分类': '矮行星' },
    fact: '谷神星是小行星带中最大的天体，也是最小的矮行星。2015年黎明号探测器发现其表面有神秘的明亮盐沉积物。',
  },
  {
    id: 'pluto', name: 'Pluto', nameCn: '冥王星 — 曾经的第九行星',
    color: '#C4A882', emissive: '#2A2218',
    radius: 0.3, realRadiusKm: 1188,
    distance: 790, speed: 0.00403, tilt: 122.53, rotationPeriod: 6.387, textureType: 'rock',
    eccentricity: 0.2488, orbitalIncl: 17.16, longAscNode: 110.30, argPerihelion: 113.76,
    stats: { '直径': '2,377 km', '公转周期': '248 年', '表面温度': '-230°C', '卫星': '5' },
    fact: '2006年被"降级"为矮行星。新视野号2015年飞掠时发现其表面有一个巨大心形冰原（汤博区）。它的轨道与海王星交叉。',
  },
  {
    id: 'haumea', name: 'Haumea', nameCn: '妊神星 — 旋转最快的矮行星',
    color: '#D4C4B0', emissive: '#2A2620',
    radius: 0.25, realRadiusKm: 816,
    distance: 860, speed: 0.00353, tilt: 126, rotationPeriod: 0.163, textureType: 'rock',
    eccentricity: 0.1912, orbitalIncl: 28.22, longAscNode: 122.17, argPerihelion: 239.18,
    stats: { '直径': '~1,632 km', '公转周期': '283 年', '形状': '椭球形', '卫星': '2' },
    fact: '妊神星自转周期仅3.9小时，是太阳系大天体中最快的。高速旋转使其呈橄榄球形。已知矮行星中唯一有环的。',
  },
  {
    id: 'makemake', name: 'Makemake', nameCn: '鸟神星 — 柯伊伯带的红色世界',
    color: '#B5886A', emissive: '#231A12',
    radius: 0.25, realRadiusKm: 715,
    distance: 916, speed: 0.00322, tilt: 29, rotationPeriod: 0.952, textureType: 'rock',
    eccentricity: 0.1559, orbitalIncl: 28.96, longAscNode: 79.38, argPerihelion: 297.24,
    stats: { '直径': '~1,430 km', '公转周期': '306 年', '表面温度': '-240°C', '卫星': '1' },
    fact: '以复活节岛神话中造物神命名。其表面覆盖甲烷和乙烷冰，呈现独特的红棕色。',
  },
  {
    id: 'eris', name: 'Eris', nameCn: '阋神星 — 最远的矮行星',
    color: '#E0D8D0', emissive: '#2A2826',
    radius: 0.3, realRadiusKm: 1163,
    distance: 1360, speed: 0.00179, tilt: 78, rotationPeriod: 1.08, textureType: 'rock',
    eccentricity: 0.4407, orbitalIncl: 44.04, longAscNode: 35.87, argPerihelion: 151.43,
    stats: { '直径': '2,326 km', '公转周期': '559 年', '表面温度': '-243°C', '卫星': '1' },
    fact: '阋神星的发现直接导致冥王星被重新分类为矮行星。它比冥王星更重，表面是太阳系最亮的之一（反照率96%）。',
  },
];

// ═══════ CONSTANTS ═══════
export const AU_SCENE = 20;           // 1 AU in scene units
export const EARTH_RADIUS_KM = 6371;  // Earth radius in km
export const EARTH_RADIUS_SCENE = 1;  // Earth visual radius in scene units
export const KM_TO_SCENE = EARTH_RADIUS_SCENE / EARTH_RADIUS_KM; // km → scene units
export const MOON_DISTANCE_ER = 60.3; // Moon distance in Earth radii
