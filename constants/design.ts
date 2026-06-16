/**
 * Baltic72 design tokens.
 * See AGENTS.md → "Baltic72 design system" for the rules these encode.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  max: 56,
} as const;

export type SpacingToken = keyof typeof spacing;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;

export const typography = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '800' as const },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800' as const },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  callout: { fontSize: 14, lineHeight: 20, fontWeight: '500' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
  footnote: { fontSize: 11, lineHeight: 14, fontWeight: '500' as const },
} as const;

export type TypographyVariant = keyof typeof typography;

export const minTouchTarget = 48;

export const stepIndicator = {
  segmentWidth: spacing.xxl,
  segmentHeight: spacing.xs,
} as const;

export const onboarding = {
  artworkMaxWidth: 340,
  artworkHeight: 260,
} as const;

export const layout = {
  screenPaddingHorizontal: spacing.xl,
  screenPaddingTop: spacing.lg,
  blockGap: spacing.xxl,
  cardStackGap: spacing.md,
  rowGap: spacing.sm,
} as const;
