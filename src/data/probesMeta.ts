export interface ProbeMeta {
  id: string;
  name: string;
  nameCn: string;
  color: string;
  emoji: string;
  launched: number;
  desc: string;
  // Hardcoded fallback positions (AU from sun, angle in radians)
  // Will be replaced by real data from probes.json when available
  fallbackPosition: { distance: number; angle: number } | { orbitPlanetId: string; orbitDist: number };
}

export const PROBES: ProbeMeta[] = [
  {
    id: 'voyager1', name: 'Voyager 1', nameCn: '旅行者1号', color: '#81C784', emoji: '🛸',
    launched: 1977,
    desc: '1977年发射，已飞出日球层，是离地球最远的人造物体。信号到达需要约22.8小时。',
    fallbackPosition: { distance: 164, angle: 0.7 },
  },
  {
    id: 'voyager2', name: 'Voyager 2', nameCn: '旅行者2号', color: '#4DB6AC', emoji: '🛸',
    launched: 1977,
    desc: '唯一访问过天王星和海王星的探测器，2018年穿越日球层。',
    fallbackPosition: { distance: 140, angle: 3.2 },
  },
  {
    id: 'newhorizons', name: 'New Horizons', nameCn: '新视野号', color: '#7986CB', emoji: '🔭',
    launched: 2006,
    desc: '2015年飞掠冥王星，拍摄了冥王星著名的"心形"照片。',
    fallbackPosition: { distance: 90, angle: 1.5 },
  },
  {
    id: 'juno', name: 'Juno', nameCn: '朱诺号', color: '#FFD54F', emoji: '⚡',
    launched: 2011,
    desc: '绕木星运行，研究其大气层、磁场和内部结构。',
    fallbackPosition: { orbitPlanetId: 'jupiter', orbitDist: 5.5 },
  },
  {
    id: 'parker', name: 'Parker Solar Probe', nameCn: '帕克太阳探测器', color: '#FFB74D', emoji: '☀️',
    launched: 2018,
    desc: '人类首个"触摸"太阳的探测器，以692,000 km/h成为最快人造物体。',
    fallbackPosition: { orbitPlanetId: 'sun', orbitDist: 7 },
  },
  {
    id: 'perseverance', name: 'Perseverance', nameCn: '毅力号', color: '#EF5350', emoji: '🔴',
    launched: 2020,
    desc: '在火星杰泽罗撞击坑寻找古代生命痕迹，首次在火星上制造氧气。',
    fallbackPosition: { orbitPlanetId: 'mars', orbitDist: 0.65 }, // on Mars surface (radius 0.6)
  },
  {
    id: 'jwst', name: 'James Webb', nameCn: '韦伯望远镜', color: '#CE93D8', emoji: '🔭',
    launched: 2021,
    desc: '在日-地L2拉格朗日点运行，捕捉宇宙最深处的红外图像。',
    fallbackPosition: { orbitPlanetId: 'earth', orbitDist: 3.5 },
  },
  {
    id: 'clipper', name: 'Europa Clipper', nameCn: '欧罗巴快帆', color: '#4FC3F7', emoji: '🧊',
    launched: 2024,
    desc: '前往木卫二欧罗巴，探测冰层下的海洋是否适合生命存在。',
    fallbackPosition: { orbitPlanetId: 'jupiter', orbitDist: 7 },
  },
  {
    id: 'juice', name: 'JUICE', nameCn: 'JUICE', color: '#80DEEA', emoji: '🧃',
    launched: 2023,
    desc: 'ESA木星冰卫星探测器，将探索木卫三、木卫四和木卫二。2031年抵达木星。',
    fallbackPosition: { orbitPlanetId: 'jupiter', orbitDist: 8 }, // en route, shown near Jupiter
  },
  {
    id: 'bepi', name: 'BepiColombo', nameCn: '贝皮科伦布', color: '#BCAAA4', emoji: '☿️',
    launched: 2018,
    desc: 'ESA/JAXA联合水星轨道器，2025年12月进入水星轨道。',
    fallbackPosition: { orbitPlanetId: 'mercury', orbitDist: 3 }, // arriving at Mercury
  },
  {
    id: 'lucy', name: 'Lucy', nameCn: '露西号', color: '#F48FB1', emoji: '💎',
    launched: 2021,
    desc: '前往木星特洛伊小行星群，探访太阳系形成的"化石"。',
    fallbackPosition: { orbitPlanetId: 'jupiter', orbitDist: 12 }, // en route to Jupiter Trojans
  },
  {
    id: 'psyche', name: 'Psyche', nameCn: '灵神星探测器', color: '#B0BEC5', emoji: '🪨',
    launched: 2023,
    desc: '前往金属小行星灵神星，探索行星核心的秘密。2029年抵达。',
    fallbackPosition: { orbitPlanetId: 'mars', orbitDist: 8 }, // in asteroid belt near Mars orbit
  },
  {
    id: 'osirisapex', name: 'OSIRIS-APEX', nameCn: 'OSIRIS-APEX', color: '#FF8A65', emoji: '☄️',
    launched: 2016,
    desc: '完成贝努小行星采样后，正前往阿波菲斯小行星。2029年抵达。',
    fallbackPosition: { orbitPlanetId: 'earth', orbitDist: 5 }, // near-Earth asteroid mission
  },
  {
    id: 'solarorbiter', name: 'Solar Orbiter', nameCn: '太阳轨道器', color: '#FFF176', emoji: '🌞',
    launched: 2020,
    desc: 'ESA太阳探测器，首次拍摄太阳极区的详细图像。',
    fallbackPosition: { orbitPlanetId: 'sun', orbitDist: 9 },
  },
];
