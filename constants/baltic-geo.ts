/**
 * Simplified vector outlines of the three Baltic states, derived from Natural
 * Earth 50m admin-0 boundaries (Douglas–Peucker simplified, equirectangular
 * projection scaled to a shared 108 × 154 viewBox). Used by the launch splash.
 */

export type BalticCode = 'EE' | 'LV' | 'LT';

export const BALTIC_VIEWBOX = '0 0 108 154.21';
export const BALTIC_SIZE = { width: 108, height: 154.21 };

export const BALTIC_PATHS: Record<BalticCode, string> = {
  LT: 'M28.19 138.41L27.05 133.16L29.01 125.32L26.26 122.79L25.42 120.54L18.52 120.42L8.99 115.03L6.85 115.32L6.37 113.3L6.88 110.46L4.42 101.35L4.2 94.81L12.68 88.59L18.69 86.25L29.72 86.51L32.05 88.35L34.19 87.26L47.08 89.87L52.0 89.37L57.13 86.13L60.32 91.5L68.59 93.93L77.21 102.95L81.57 105.06L79.67 113.33L84.11 115.09L81.67 118.73L77.36 118.49L75.73 121.96L71.33 124.1L69.42 129.22L69.45 133.13L66.98 139.05L69.78 140.88L70.02 142.91L68.84 143.91L66.46 143.43L66.7 142.01L65.78 140.04L59.99 144.1L57.53 143.8L56.11 148.13L49.83 150.21L48.07 148.75L39.25 149.53L38.21 149.02L37.78 143.84L36.61 142.39L29.97 137.55L28.19 138.41Z',
  LV: 'M81.57 105.06L77.21 102.95L68.59 93.93L60.32 91.5L57.13 86.13L52.0 89.37L47.08 89.87L34.19 87.26L32.05 88.35L29.72 86.51L18.69 86.25L12.68 88.59L4.2 94.81L4.0 80.4L4.56 75.64L8.45 70.7L9.97 62.95L13.72 56.62L25.24 52.72L26.55 56.0L33.36 62.91L35.46 68.87L40.49 71.89L44.44 70.94L50.73 64.79L49.9 49.0L60.89 44.09L62.53 45.79L64.09 44.7L73.17 49.82L77.45 55.86L79.74 57.3L86.76 55.65L93.79 57.82L94.75 60.22L98.79 63.69L98.82 66.2L96.15 75.08L99.07 74.88L101.29 81.33L102.62 82.71L104.0 89.97L103.25 92.96L99.74 94.66L96.19 98.84L95.28 101.72L87.97 100.91L84.76 104.0L81.57 105.06Z',
  EE: 'M92.14 57.71L86.76 55.65L79.74 57.3L77.45 55.86L73.17 49.82L63.29 44.47L62.95 45.8L60.89 44.09L49.9 49.0L51.87 43.01L52.2 39.05L53.07 37.96L52.78 36.69L50.1 36.0L47.0 38.93L42.16 36.52L41.1 32.84L38.56 28.95L40.95 25.68L38.48 25.61L37.48 22.28L38.64 20.28L37.98 19.44L38.66 17.52L38.35 15.28L46.56 12.83L46.15 10.79L50.7 8.23L65.53 7.0L66.61 6.02L66.45 4.0L82.01 6.17L86.88 8.79L99.68 9.72L101.36 7.94L103.29 10.73L99.75 13.2L97.8 18.94L93.29 25.67L94.65 34.63L94.24 40.07L96.63 47.37L98.09 49.0L94.8 50.81L92.81 54.18L92.14 57.71Z M26.12 29.9L30.95 30.29L35.96 34.23L33.23 34.61L27.69 39.84L22.69 40.18L21.26 41.62L19.63 46.55L17.46 47.45L17.31 45.83L20.12 41.78L15.86 39.03L15.48 38.03L17.29 35.87L15.59 33.06L21.23 32.78L22.08 30.93L26.12 29.9Z',
};

/** [minX, minY, maxX, maxY] in viewBox units. */
export const BALTIC_BBOX: Record<BalticCode, [number, number, number, number]> = {
  EE: [15.48, 4.0, 103.29, 57.71],
  LV: [4.0, 44.09, 104.0, 105.06],
  LT: [4.2, 86.13, 84.11, 150.21],
};

/** Approx total outline length (viewBox units) for stroke-draw timing. */
export const BALTIC_LENGTH: Record<BalticCode, number> = {
  EE: 369,
  LV: 318,
  LT: 260,
};

export type FlagBand = { color: string; from: number; to: number };

/** Horizontal flag bands, top → bottom, as fractions of the country bbox height. */
export const FLAG_BANDS: Record<BalticCode, FlagBand[]> = {
  // Estonia: blue / black / white
  EE: [
    { color: '#0072CE', from: 0, to: 1 / 3 },
    { color: '#0A0A0A', from: 1 / 3, to: 2 / 3 },
    { color: '#FFFFFF', from: 2 / 3, to: 1 },
  ],
  // Latvia: carmine / white / carmine (2 : 1 : 2)
  LV: [
    { color: '#9E1B32', from: 0, to: 0.4 },
    { color: '#FFFFFF', from: 0.4, to: 0.6 },
    { color: '#9E1B32', from: 0.6, to: 1 },
  ],
  // Lithuania: yellow / green / red
  LT: [
    { color: '#FDB913', from: 0, to: 1 / 3 },
    { color: '#006A44', from: 1 / 3, to: 2 / 3 },
    { color: '#C1272D', from: 2 / 3, to: 1 },
  ],
};

export const BALTIC_ORDER: BalticCode[] = ['EE', 'LV', 'LT'];

/**
 * Poland, projected into the SAME equirectangular space as the Baltic paths
 * (derived from Natural Earth 50m; the transform was recovered by matching the
 * Baltic states' geographic bbox to their existing viewBox bbox). It sits below
 * Lithuania and extends west, so its coordinates run past the Baltic viewBox.
 * Used by the dashboard globe — NOT by the three-country launch splash.
 */
export const POLAND_PATH =
  'M41.05 210.64L41.86 215.93L47.77 227.06L46.16 229.28L47.75 233.57L47.69 235.77L46.08 238.83L42.51 239.67L33.26 251.84L28.74 259.29L27.96 261.00L29.10 267.20L28.73 270.36L30.67 272.65L30.16 274.19L19.34 269.38L17.56 265.97L14.13 264.23L6.46 264.07L5.39 266.07L3.57 266.71L0.12 264.75L-3.35 264.91L-6.08 266.66L-7.53 270.10L-9.47 269.08L-11.65 269.51L-11.42 265.24L-13.39 264.37L-15.97 259.50L-18.59 261.70L-19.97 264.54L-22.45 264.63L-22.86 262.03L-24.31 261.72L-24.66 259.10L-27.57 255.43L-28.01 252.34L-31.53 251.45L-35.32 248.37L-35.93 249.29L-38.02 249.69L-40.82 246.31L-41.33 245.26L-39.33 243.40L-39.79 241.45L-43.72 242.78L-47.32 239.64L-51.05 238.40L-49.55 243.24L-54.35 246.67L-60.22 238.49L-57.35 234.67L-59.24 232.59L-63.00 233.70L-63.80 232.21L-66.79 230.45L-71.94 228.61L-73.25 224.88L-76.88 223.46L-77.03 226.71L-79.40 227.41L-76.57 217.39L-78.08 212.03L-80.56 210.49L-80.56 206.98L-82.25 202.64L-80.18 196.29L-81.18 192.02L-82.89 189.23L-82.01 184.93L-83.45 181.95L-88.73 176.03L-84.86 167.87L-86.94 154.37L-82.50 156.66L-82.84 151.99L-87.56 150.78L-87.59 148.75L-85.23 149.40L-72.85 143.93L-60.55 140.10L-55.43 133.39L-50.97 132.31L-45.82 128.92L-34.54 126.22L-31.28 126.16L-25.31 130.07L-24.76 131.37L-29.74 128.54L-26.54 136.52L-22.34 138.61L-16.44 137.66L-13.74 135.80L21.37 138.33L29.09 138.58L31.31 137.55L38.97 143.84L40.96 157.68L44.91 172.23L45.10 180.47L38.39 185.24L35.16 191.08L40.95 195.75L41.70 197.35L41.33 203.23L40.22 205.75L41.05 210.64Z';

export type RegionCode = BalticCode | 'PL';

/** Draw order back-to-front: Poland first, then the Baltic strip. */
export const REGION_ORDER: RegionCode[] = ['PL', 'LT', 'LV', 'EE'];

export const REGION_PATHS: Record<RegionCode, string> = {
  ...BALTIC_PATHS,
  PL: POLAND_PATH,
};

/** [minX, minY, maxX, maxY] union of all four countries, in viewBox units. */
export const REGION_BBOX: [number, number, number, number] = [
  -88.73, 4.0, 104.0, 274.19,
];

/**
 * Splash metadata for the full four-country region (Baltics + Poland), sharing
 * the Baltic equirectangular space. Poland sits south of Lithuania and runs
 * west, so the region viewBox is much taller/wider than the Baltic-only one.
 */
export const REGION_BBOX_BY_CODE: Record<RegionCode, [number, number, number, number]> = {
  ...BALTIC_BBOX,
  PL: [-88.73, 126.16, 47.77, 274.19],
};

/** Approx total outline length (viewBox units) for stroke-draw timing. */
export const REGION_LENGTH: Record<RegionCode, number> = {
  ...BALTIC_LENGTH,
  PL: 720,
};

/** Horizontal flag bands per country (Poland: white over red, 1 : 1). */
export const REGION_FLAG_BANDS: Record<RegionCode, FlagBand[]> = {
  ...FLAG_BANDS,
  PL: [
    { color: '#FFFFFF', from: 0, to: 0.5 },
    { color: '#DC143C', from: 0.5, to: 1 },
  ],
};

// viewBox = REGION_BBOX with ~3 units of padding on every side.
export const REGION_VIEWBOX = '-91.73 1 198.73 276.19';
export const REGION_SIZE = { width: 198.73, height: 276.19 };
