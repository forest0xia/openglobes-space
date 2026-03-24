// Visual scale factors (not real scale — optimized for aesthetics)
export const AU = 20; // 1 AU = 20 scene units for inner planets
export const SCENE_SCALE = 1;

// Colors
export const COLORS = {
  bg: '#030014',
  accent: '#4FC3F7',
  accent2: '#FFB74D',
  accent3: '#CE93D8',
  accent4: '#81C784',
  glass: 'rgba(10, 15, 40, 0.78)',
  glassBorder: 'rgba(79, 195, 247, 0.15)',
  text: '#E0E6ED',
  textDim: '#7B8CA8',
} as const;

// Satellite constellation colors
export const SAT_COLORS = {
  beidou: '#DE2910',
  gps: '#3B82F6',
  stations: '#F59E0B',
  change: '#A855F7',
} as const;
