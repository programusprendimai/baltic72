import { type ReactNode } from 'react';
import { StyleSheet, Text as RNText, type TextProps } from 'react-native';

import Colors, { type ThemeColors } from '@/constants/Colors';
import { typography, type TypographyVariant } from '@/constants/design';
import { useColorScheme } from '@/components/useColorScheme';

type ToneToken =
  | 'text'
  | 'textSecondary'
  | 'textMuted'
  | 'brand'
  | 'alert'
  | 'safe'
  | 'warn'
  | 'onBrand';

type BaseProps = TextProps & {
  variant?: TypographyVariant;
  tone?: ToneToken;
  align?: 'auto' | 'left' | 'center' | 'right';
  children?: ReactNode;
};

function resolveTone(colors: ThemeColors, tone?: ToneToken): string {
  switch (tone) {
    case 'textSecondary':
      return colors.textSecondary;
    case 'textMuted':
      return colors.textMuted;
    case 'brand':
      return colors.brand;
    case 'alert':
      return colors.alert;
    case 'safe':
      return colors.safe;
    case 'warn':
      return colors.warn;
    case 'onBrand':
      return colors.onBrand;
    case 'text':
    default:
      return colors.text;
  }
}

export function ThemedText({
  variant = 'body',
  tone = 'text',
  align,
  style,
  ...rest
}: BaseProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  return (
    <RNText
      style={[
        typography[variant],
        { color: resolveTone(colors, tone) },
        align ? { textAlign: align } : null,
        style,
      ]}
      {...rest}
    />
  );
}

export function Display(props: Omit<BaseProps, 'variant'>) {
  return <ThemedText variant="display" {...props} />;
}
export function Title(props: Omit<BaseProps, 'variant'>) {
  return <ThemedText variant="title" {...props} />;
}
export function Heading(props: Omit<BaseProps, 'variant'>) {
  return <ThemedText variant="heading" {...props} />;
}
export function Body({
  strong = false,
  ...props
}: Omit<BaseProps, 'variant'> & { strong?: boolean }) {
  return <ThemedText variant={strong ? 'bodyStrong' : 'body'} {...props} />;
}
export function Callout(props: Omit<BaseProps, 'variant'>) {
  return <ThemedText variant="callout" tone="textSecondary" {...props} />;
}
export function Caption(props: Omit<BaseProps, 'variant'>) {
  return <ThemedText variant="caption" tone="textSecondary" {...props} />;
}
export function Label(props: Omit<BaseProps, 'variant'>) {
  return <ThemedText variant="label" tone="textMuted" {...props} />;
}
export function Footnote(props: Omit<BaseProps, 'variant'>) {
  return <ThemedText variant="footnote" tone="textMuted" {...props} />;
}

const _styles = StyleSheet.create({});
void _styles;
