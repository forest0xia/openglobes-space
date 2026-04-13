/**
 * 嫦娥五号 (Chang'e 5) Lunar Sample-Return Mission Data
 *
 * Based on publicly available mission profile data:
 * - Launch: 2020-11-24 04:30 UTC, Wenchang, Hainan (Long March 5)
 * - Lunar orbit insertion: 2020-11-28
 * - Landing: 2020-12-01, Mons Rümker, Oceanus Procellarum (43.06°N, 51.92°W)
 * - Sample collection: 1,731g of lunar regolith
 * - Ascent: 2020-12-03
 * - Earth return: 2020-12-17
 *
 * Orbital mechanics use patched-conic approximation with real delta-V values.
 *
 * References:
 *   - CNSA mission profile press releases
 *   - "Chang'e-5 mission profile" (China Academy of Space Technology)
 *   - JPL Horizons ephemeris for Earth-Moon geometry
 */

// ═══════════════════════════════════════════════════════════════
// MISSION PHASES
// ═══════════════════════════════════════════════════════════════

export interface MissionPhase {
  id: string;
  name: string;
  nameCn: string;
  description: string;
  descriptionCn: string;
  durationSeconds: number;     // real duration of this phase
  altitudeStartKm: number;     // altitude at phase start (from relevant body)
  altitudeEndKm: number;       // altitude at phase end
  velocityKms: number;         // characteristic velocity (km/s)
  deltaVMs?: number;           // delta-V for this maneuver (m/s)
  body: 'earth' | 'transfer' | 'moon';  // which body is the reference
  color: string;               // trajectory color for this phase
}

export const MISSION_PHASES: MissionPhase[] = [
  {
    id: 'launch',
    name: 'Launch & Ascent',
    nameCn: '发射升空',
    description: 'Long March 5 (CZ-5) launches from Wenchang Space Launch Center, Hainan Island. The rocket accelerates through the atmosphere, shedding 4 boosters and 2 stages.',
    descriptionCn: '长征五号遥五运载火箭从海南文昌航天发射场点火升空。火箭穿越大气层，依次分离4个助推器和两级火箭。',
    durationSeconds: 500,       // ~8.3 minutes to reach parking orbit
    altitudeStartKm: 0,
    altitudeEndKm: 200,
    velocityKms: 7.8,
    deltaVMs: 9400,             // total delta-V to orbit (including gravity/drag losses)
    body: 'earth',
    color: '#FF6B35',
  },
  {
    id: 'parking',
    name: 'Parking Orbit',
    nameCn: '停泊轨道',
    description: '200km circular Low Earth Orbit. The spacecraft orbits Earth while ground control verifies all systems before the Trans-Lunar Injection burn.',
    descriptionCn: '进入200公里近地圆轨道。航天器绕地球飞行，地面控制中心检查各系统状态，为地月转移变轨做准备。',
    durationSeconds: 1800,      // ~30 min in parking orbit (about 1/3 of an orbit)
    altitudeStartKm: 200,
    altitudeEndKm: 200,
    velocityKms: 7.78,
    body: 'earth',
    color: '#4FC3F7',
  },
  {
    id: 'tli',
    name: 'Trans-Lunar Injection',
    nameCn: '地月转移变轨',
    description: 'The upper stage ignites for ~6 minutes, accelerating the spacecraft from 7.78 km/s to 10.93 km/s, placing it on a trajectory toward the Moon.',
    descriptionCn: '上面级发动机点火约6分钟，将航天器从7.78 km/s加速到10.93 km/s，进入地月转移轨道。',
    durationSeconds: 360,       // ~6 minute burn
    altitudeStartKm: 200,
    altitudeEndKm: 200,         // burn happens at parking orbit altitude
    velocityKms: 10.93,
    deltaVMs: 3150,             // TLI delta-V
    body: 'earth',
    color: '#FFD54F',
  },
  {
    id: 'transfer',
    name: 'Earth-Moon Transfer',
    nameCn: '地月转移飞行',
    description: 'Coast phase lasting ~112 hours (4.67 days). The spacecraft travels ~384,400 km from Earth to Moon along a near-Hohmann transfer orbit. Two mid-course corrections refine the trajectory.',
    descriptionCn: '约112小时（4.67天）的滑行段。航天器沿近霍曼转移轨道飞行约384,400公里。期间执行两次中途修正，精确调整轨道。',
    durationSeconds: 403200,    // ~4.67 days
    altitudeStartKm: 200,
    altitudeEndKm: 384400,      // distance from Earth (approx Moon distance)
    velocityKms: 1.0,           // average velocity (varies)
    deltaVMs: 30,               // mid-course corrections total
    body: 'transfer',
    color: '#81C784',
  },
  {
    id: 'loi',
    name: 'Lunar Orbit Insertion',
    nameCn: '近月制动',
    description: 'The spacecraft fires its engine to decelerate and enter a 200km circular orbit around the Moon. This critical burn lasts ~17 minutes.',
    descriptionCn: '航天器发动机点火减速约17分钟，被月球引力捕获，进入200公里环月圆轨道。这是任务的关键节点。',
    durationSeconds: 1020,      // ~17 min burn
    altitudeStartKm: 200,
    altitudeEndKm: 200,
    velocityKms: 1.64,          // lunar orbital velocity at 200km
    deltaVMs: 850,              // LOI delta-V
    body: 'moon',
    color: '#CE93D8',
  },
  {
    id: 'lunar_orbit',
    name: 'Lunar Orbit',
    nameCn: '环月轨道',
    description: 'Orbiting the Moon at ~200km, then lowering to 15km × 200km elliptical orbit. The orbiter-returner separates from the lander-ascender.',
    descriptionCn: '在200公里环月轨道飞行，随后降低至15×200公里椭圆轨道。轨道器-返回器与着陆器-上升器分离。',
    durationSeconds: 259200,    // ~3 days in lunar orbit before landing
    altitudeStartKm: 200,
    altitudeEndKm: 15,          // periapsis lowered to 15km
    velocityKms: 1.64,
    deltaVMs: 45,               // orbit lowering
    body: 'moon',
    color: '#7986CB',
  },
  {
    id: 'descent',
    name: 'Powered Descent',
    nameCn: '动力下降',
    description: 'From 15km periapsis, the lander fires its variable-thrust engine for ~12 minutes, decelerating from 1.7 km/s to near-zero for a soft landing at Mons Rümker.',
    descriptionCn: '从近月点15公里开始，着陆器变推力发动机点火约12分钟，从1.7 km/s减速至接近零速，在吕姆克山软着陆。',
    durationSeconds: 720,       // ~12 min powered descent
    altitudeStartKm: 15,
    altitudeEndKm: 0,
    velocityKms: 0,
    deltaVMs: 1700,             // descent delta-V
    body: 'moon',
    color: '#EF5350',
  },
  {
    id: 'surface',
    name: 'Lunar Surface Operations',
    nameCn: '月面作业',
    description: 'Landing site: 43.06°N, 51.92°W (Mons Rümker, Oceanus Procellarum). Robotic arm drills and scoops 1,731g of lunar regolith. First sample return since Luna 24 (1976).',
    descriptionCn: '着陆点：月球风暴洋吕姆克山（43.06°N, 51.92°W）。机械臂钻取和表取1,731克月壤样品。这是自1976年月球24号以来首次月球取样返回。',
    durationSeconds: 68400,     // ~19 hours on surface
    altitudeStartKm: 0,
    altitudeEndKm: 0,
    velocityKms: 0,
    body: 'moon',
    color: '#FFA726',
  },
  {
    id: 'ascent',
    name: 'Lunar Ascent',
    nameCn: '月面起飞',
    description: 'The ascender module fires a single engine, lifting off from the Moon with 1,731g of samples. It reaches a 15km × 180km orbit in ~6 minutes — China\'s first lunar launch.',
    descriptionCn: '上升器单发动机点火，携带1,731克月壤样品从月面起飞。约6分钟进入15×180公里环月轨道——中国首次月面起飞。',
    durationSeconds: 360,       // ~6 min ascent burn
    altitudeStartKm: 0,
    altitudeEndKm: 180,
    velocityKms: 1.68,
    deltaVMs: 1680,             // lunar ascent delta-V
    body: 'moon',
    color: '#FF8A65',
  },
  {
    id: 'rendezvous',
    name: 'Lunar Orbit Rendezvous',
    nameCn: '月球轨道交会对接',
    description: 'The ascender autonomously rendezvous and docks with the orbiter in lunar orbit. Sample container is transferred. First robotic docking in lunar orbit.',
    descriptionCn: '上升器在月球轨道与轨道器自主交会对接。样品容器转移至返回器。这是人类首次在月球轨道实现无人交会对接。',
    durationSeconds: 21600,     // ~6 hours for rendezvous
    altitudeStartKm: 180,
    altitudeEndKm: 200,
    velocityKms: 1.64,
    deltaVMs: 50,
    body: 'moon',
    color: '#AB47BC',
  },
  {
    id: 'tei',
    name: 'Trans-Earth Injection',
    nameCn: '月地转移变轨',
    description: 'The orbiter-returner fires its engine for ~3 minutes, escaping lunar orbit and entering a return trajectory to Earth. TEI delta-V: ~830 m/s.',
    descriptionCn: '轨道器-返回器发动机点火约3分钟，逃离月球引力，进入月地转移轨道。变轨速度增量约830 m/s。',
    durationSeconds: 180,       // ~3 min TEI burn
    altitudeStartKm: 200,
    altitudeEndKm: 200,
    velocityKms: 2.47,          // escape velocity from Moon orbit
    deltaVMs: 830,
    body: 'moon',
    color: '#42A5F5',
  },
  {
    id: 'return_transfer',
    name: 'Moon-Earth Transfer',
    nameCn: '月地转移飞行',
    description: 'Return coast phase lasting ~4.5 days. The returner separates from the orbiter ~5,000km before Earth. One mid-course correction is performed.',
    descriptionCn: '返回滑行段约4.5天。返回器在距地球约5,000公里处与轨道器分离。期间执行一次轨道修正。',
    durationSeconds: 388800,    // ~4.5 days
    altitudeStartKm: 384400,
    altitudeEndKm: 5000,
    velocityKms: 1.0,
    deltaVMs: 15,
    body: 'transfer',
    color: '#66BB6A',
  },
  {
    id: 'reentry',
    name: 'Skip Re-entry',
    nameCn: '半弹道跳跃式再入',
    description: 'The returner enters Earth\'s atmosphere at 11.2 km/s (2nd cosmic velocity). Uses "skip re-entry" — bouncing off the atmosphere once to reduce speed, then re-entering for final descent to Inner Mongolia.',
    descriptionCn: '返回器以11.2 km/s（第二宇宙速度）再入大气层。采用半弹道跳跃式再入——先弹出大气层减速，再次进入后打开降落伞着陆于内蒙古四子王旗。',
    durationSeconds: 600,       // ~10 min from atmospheric entry to landing
    altitudeStartKm: 120,      // atmospheric entry interface
    altitudeEndKm: 0,
    velocityKms: 11.2,
    deltaVMs: 0,                // aerobraking, no propulsive delta-V
    body: 'earth',
    color: '#F44336',
  },
];

// ═══════════════════════════════════════════════════════════════
// MISSION CONSTANTS
// ═══════════════════════════════════════════════════════════════

export const MISSION_INFO = {
  name: "Chang'e 5",
  nameCn: '嫦娥五号',
  rocket: 'Long March 5 (CZ-5)',
  rocketCn: '长征五号遥五',
  launchSite: 'Wenchang Space Launch Center',
  launchSiteCn: '海南文昌航天发射场',
  launchDate: '2020-11-24T04:30:00Z',
  returnDate: '2020-12-17T01:59:00Z',
  totalMissionDays: 23,
  sampleMassGrams: 1731,
  landingSite: 'Mons Rümker, Oceanus Procellarum',
  landingSiteCn: '风暴洋吕姆克山',
  landingCoord: { lat: 43.06, lon: -51.92 },
  totalDeltaVMs: 17800,         // approximate total mission delta-V
};

// Orbital parameters
export const ORBITAL_PARAMS = {
  earthRadiusKm: 6371,
  moonRadiusKm: 1737,
  earthMoonDistKm: 384400,
  parkingOrbitKm: 200,
  lunarOrbitKm: 200,
  lunarDescentPeriapsisKm: 15,
  tliVelocityKms: 10.93,
  parkingVelocityKms: 7.78,
  lunarOrbitalVelocityKms: 1.64,
  escapeVelocityKms: 11.2,
  transferTimeDays: 4.67,
  returnTimeDays: 4.5,
};

// ═══════════════════════════════════════════════════════════════
// LAUNCH SUB-PHASES
// ═══════════════════════════════════════════════════════════════

export interface LaunchSubPhase {
  timeSeconds: number;
  nameCn: string;
  descriptionCn: string;
  visualAction?: 'drop_boosters' | 'drop_fairing' | 'stage_separate';
}

export const LAUNCH_SUB_PHASES: LaunchSubPhase[] = [
  { timeSeconds: 0,   nameCn: '点火起飞',       descriptionCn: '长征五号一级发动机及4个助推器同时点火' },
  { timeSeconds: 12,  nameCn: '程序转弯',       descriptionCn: '火箭开始俯仰程序转弯，偏离垂直方向' },
  { timeSeconds: 174, nameCn: '助推器分离',     descriptionCn: '4个3.35米助推器耗尽推进剂，分离脱落', visualAction: 'drop_boosters' },
  { timeSeconds: 185, nameCn: '整流罩抛罩',     descriptionCn: '有效载荷整流罩分离，暴露嫦娥五号探测器', visualAction: 'drop_fairing' },
  { timeSeconds: 460, nameCn: '一二级分离',     descriptionCn: '芯一级发动机关机，一二级火工品分离', visualAction: 'stage_separate' },
  { timeSeconds: 480, nameCn: '二级发动机点火', descriptionCn: '芯二级氢氧发动机启动，继续加速' },
  { timeSeconds: 500, nameCn: '入轨',           descriptionCn: '进入200公里近地停泊轨道' },
];

// ═══════════════════════════════════════════════════════════════
// AUTO-SPEED MAP (speed multiplier per phase for "Auto" mode)
// ═══════════════════════════════════════════════════════════════

export const PHASE_AUTO_SPEED: Record<string, number> = {
  launch:           50,
  parking:          200,
  tli:              50,
  transfer:         15000,
  loi:              100,
  lunar_orbit:      10000,
  descent:          50,
  surface:          5000,
  ascent:           50,
  rendezvous:       1000,
  tei:              30,
  return_transfer:  15000,
  reentry:          50,
};

// ═══════════════════════════════════════════════════════════════
// CAMERA DISTANCE PER PHASE (scene units for adaptive focus)
// ═══════════════════════════════════════════════════════════════

export const PHASE_CAMERA_DISTANCE: Record<string, number> = {
  launch:           0.15,
  parking:          0.25,
  tli:              0.2,
  transfer:         16,
  loi:              0.5,
  lunar_orbit:      0.4,
  descent:          0.15,
  surface:          0.15,
  ascent:           0.2,
  rendezvous:       0.4,
  tei:              0.5,
  return_transfer:  16,
  reentry:          0.2,
};

// Scene-unit conversions (matching existing codebase: 1 Earth radius = 1 scene unit)
export const EARTH_RADIUS_SCENE = 1;
export const MOON_DISTANCE_SCENE = 60.3;  // Earth radii (matching App.tsx moonMesh positioning)
export const MOON_RADIUS_SCENE = 0.27;    // matching App.tsx moonMesh
