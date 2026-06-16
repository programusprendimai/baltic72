/**
 * Semantic color tokens for Baltic72.
 * Use ONLY these keys in app code — never hex literals.
 * See AGENTS.md → "Baltic72 design system" for the rules.
 */

const palette = {
  baltic: '#1B4D8C',
  balticOnDark: '#6BA3E8',
  alertRed: '#B91C1C',
  alertRedSoft: '#FEE2E2',
  alertRedDarkSoft: '#450A0A',
  alertRedOnDark: '#F87171',
  safeGreen: '#15803D',
  safeGreenSoft: '#DCFCE7',
  safeGreenOnDark: '#4ADE80',
  warnAmber: '#B45309',
  warnAmberSoft: '#FEF3C7',
  warnAmberOnDark: '#FBBF24',
  slate900: '#0F172A',
  slate700: '#334155',
  slate600: '#475569',
  slate500: '#64748B',
  slate400: '#94A3B8',
  slate300: '#CBD5E1',
  slate200: '#E2E8F0',
  slate100: '#F1F5F9',
  slate50: '#F8FAFC',
  white: '#FFFFFF',
  black: '#0B1220',
} as const;

type ColorScheme = {
  text: string;
  textSecondary: string;
  textMuted: string;
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  divider: string;
  tint: string;
  brand: string;
  brandSoft: string;
  onBrand: string;
  tabIconDefault: string;
  tabIconSelected: string;
  alert: string;
  alertBackground: string;
  alertOnBackground: string;
  safe: string;
  safeBackground: string;
  warn: string;
  warnBackground: string;
  overlay: string;
};

const Colors: { light: ColorScheme; dark: ColorScheme } = {
  light: {
    text: palette.slate900,
    textSecondary: palette.slate600,
    textMuted: palette.slate500,
    background: palette.slate50,
    surface: palette.white,
    surfaceMuted: palette.slate100,
    border: palette.slate200,
    divider: palette.slate100,
    tint: palette.baltic,
    brand: palette.baltic,
    brandSoft: '#DCE9F8',
    onBrand: palette.white,
    tabIconDefault: palette.slate400,
    tabIconSelected: palette.baltic,
    alert: palette.alertRed,
    alertBackground: palette.alertRedSoft,
    alertOnBackground: palette.alertRed,
    safe: palette.safeGreen,
    safeBackground: palette.safeGreenSoft,
    warn: palette.warnAmber,
    warnBackground: palette.warnAmberSoft,
    overlay: 'rgba(15,23,42,0.32)',
  },
  dark: {
    text: palette.slate100,
    textSecondary: palette.slate400,
    textMuted: palette.slate500,
    background: palette.black,
    surface: '#162033',
    surfaceMuted: '#1E293B',
    border: palette.slate700,
    divider: '#1E293B',
    tint: palette.balticOnDark,
    brand: palette.balticOnDark,
    brandSoft: '#1E3A5F',
    onBrand: palette.white,
    tabIconDefault: palette.slate500,
    tabIconSelected: palette.balticOnDark,
    alert: palette.alertRedOnDark,
    alertBackground: palette.alertRedDarkSoft,
    alertOnBackground: palette.alertRedOnDark,
    safe: palette.safeGreenOnDark,
    safeBackground: '#0F2E1B',
    warn: palette.warnAmberOnDark,
    warnBackground: '#3A2A0B',
    overlay: 'rgba(0,0,0,0.56)',
  },
};

export type ThemeColors = ColorScheme;
export default Colors;
