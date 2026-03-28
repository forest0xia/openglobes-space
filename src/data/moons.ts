/**
 * Natural satellites of the solar system planets.
 * Only showing the most notable moons per planet.
 * Distance in Earth radii from parent planet center.
 * Radius in km. Speed relative to Moon=1.
 */
export interface NaturalMoon {
  id: string;
  name: string;
  nameCn: string;
  parentId: string;      // planet id
  radiusKm: number;
  distanceKm: number;    // from parent center
  orbitalPeriodDays: number;
  color: string;
  fact: string;
}

export const NATURAL_MOONS: NaturalMoon[] = [
  // ═══ Earth ═══
  { id: 'moon', name: 'Moon', nameCn: '月球', parentId: 'earth',
    radiusKm: 1737, distanceKm: 384400, orbitalPeriodDays: 27.32, color: '#AAAAAA',
    fact: '月球是地球唯一的天然卫星。它的自转周期与公转周期相同（潮汐锁定），所以我们始终只能看到月球的同一面。' },

  // ═══ Mars ═══
  { id: 'phobos', name: 'Phobos', nameCn: '火卫一', parentId: 'mars',
    radiusKm: 11, distanceKm: 9376, orbitalPeriodDays: 0.32, color: '#8B7D6B',
    fact: '火卫一是太阳系中距离行星最近的卫星，每天绕火星转3圈。它正在缓慢靠近火星，预计5000万年内会撞上火星或碎裂成环。' },
  { id: 'deimos', name: 'Deimos', nameCn: '火卫二', parentId: 'mars',
    radiusKm: 6, distanceKm: 23460, orbitalPeriodDays: 1.26, color: '#9B9080',
    fact: '火卫二是太阳系中最小的已知卫星之一，形状不规则，可能是被火星引力捕获的小行星。' },

  // ═══ Jupiter (top 5) ═══
  { id: 'io', name: 'Io', nameCn: '木卫一', parentId: 'jupiter',
    radiusKm: 1822, distanceKm: 421700, orbitalPeriodDays: 1.77, color: '#E8C84A',
    fact: '木卫一是太阳系中火山活动最剧烈的天体，拥有400多座活火山。木星的潮汐力不断挤压加热它的内部。' },
  { id: 'europa', name: 'Europa', nameCn: '木卫二', parentId: 'jupiter',
    radiusKm: 1561, distanceKm: 671034, orbitalPeriodDays: 3.55, color: '#C8D8E8',
    fact: '木卫二表面覆盖着冰层，冰层下可能存在液态海洋，是太阳系中最可能存在地外生命的天体之一。' },
  { id: 'ganymede', name: 'Ganymede', nameCn: '木卫三', parentId: 'jupiter',
    radiusKm: 2634, distanceKm: 1070412, orbitalPeriodDays: 7.15, color: '#A0A8A0',
    fact: '木卫三是太阳系最大的卫星，比水星还大。它是唯一拥有自身磁场的卫星。' },
  { id: 'callisto', name: 'Callisto', nameCn: '木卫四', parentId: 'jupiter',
    radiusKm: 2410, distanceKm: 1882709, orbitalPeriodDays: 16.69, color: '#706860',
    fact: '木卫四是四颗伽利略卫星中距木星最远的，表面布满陨石坑，是太阳系中陨石坑密度最高的天体。' },
  { id: 'amalthea', name: 'Amalthea', nameCn: '木卫五', parentId: 'jupiter',
    radiusKm: 84, distanceKm: 181366, orbitalPeriodDays: 0.50, color: '#CC6644',
    fact: '木卫五是木星的内侧卫星，形状极不规则，呈红色，是太阳系中最红的天体之一。' },

  // ═══ Saturn (top 5) ═══
  { id: 'titan', name: 'Titan', nameCn: '土卫六', parentId: 'saturn',
    radiusKm: 2575, distanceKm: 1221870, orbitalPeriodDays: 15.95, color: '#D4A050',
    fact: '土卫六是太阳系中唯一拥有浓厚大气层的卫星，表面有液态甲烷湖泊和河流，是除地球外唯一存在稳定液体的天体。' },
  { id: 'enceladus', name: 'Enceladus', nameCn: '土卫二', parentId: 'saturn',
    radiusKm: 252, distanceKm: 237948, orbitalPeriodDays: 1.37, color: '#E8E8F0',
    fact: '土卫二南极的冰裂缝喷射出水蒸气羽流，暗示冰层下有液态海洋，是寻找地外生命的重要目标。' },
  { id: 'mimas', name: 'Mimas', nameCn: '土卫一', parentId: 'saturn',
    radiusKm: 198, distanceKm: 185520, orbitalPeriodDays: 0.94, color: '#C0C0C0',
    fact: '土卫一因巨大的赫歇尔陨石坑而被称为"死星"，这个陨石坑的直径达到卫星直径的三分之一。' },
  { id: 'rhea', name: 'Rhea', nameCn: '土卫五', parentId: 'saturn',
    radiusKm: 764, distanceKm: 527108, orbitalPeriodDays: 4.52, color: '#BBB8B0',
    fact: '土卫五是土星第二大卫星，主要由冰组成，可能拥有一个稀薄的氧和二氧化碳大气层。' },
  { id: 'dione', name: 'Dione', nameCn: '土卫四', parentId: 'saturn',
    radiusKm: 561, distanceKm: 377396, orbitalPeriodDays: 2.74, color: '#CCCCBB',
    fact: '土卫四表面有明亮的冰悬崖和暗色的平原，可能在冰壳之下有液态水海洋。' },

  { id: 'iapetus', name: 'Iapetus', nameCn: '土卫八', parentId: 'saturn',
    radiusKm: 735, distanceKm: 3560820, orbitalPeriodDays: 79.32, color: '#8B8070',
    fact: '土卫八是太阳系中最神秘的卫星之一，一面极亮一面极暗（阴阳脸），赤道上有一条高达20公里的山脊环绕整颗卫星。' },

  // ═══ Uranus (top 2) ═══
  { id: 'titania', name: 'Titania', nameCn: '天卫三', parentId: 'uranus',
    radiusKm: 789, distanceKm: 435910, orbitalPeriodDays: 8.71, color: '#B8B0A8',
    fact: '天卫三是天王星最大的卫星，以莎士比亚《仲夏夜之梦》中的仙后命名。表面有巨大的峡谷和陨石坑。' },
  { id: 'oberon', name: 'Oberon', nameCn: '天卫四', parentId: 'uranus',
    radiusKm: 761, distanceKm: 583520, orbitalPeriodDays: 13.46, color: '#A09890',
    fact: '天卫四是天王星第二大卫星，表面有暗色的陨石坑底部，可能含有碳质沉积物。' },

  // ═══ Neptune ═══
  { id: 'triton', name: 'Triton', nameCn: '海卫一', parentId: 'neptune',
    radiusKm: 1353, distanceKm: 354759, orbitalPeriodDays: 5.88, color: '#C0C8D8',
    fact: '海卫一是太阳系中唯一逆行公转的大型卫星，表面温度-235°C，是太阳系中最冷的天体之一。它可能是被海王星捕获的柯伊伯带天体。' },
];

// Count total known moons per planet (for "..." display)
export const MOON_COUNTS: Record<string, number> = {
  mercury: 0, venus: 0, earth: 1, mars: 2,
  jupiter: 95, saturn: 146, uranus: 28, neptune: 16,
};
