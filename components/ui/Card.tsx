import { type ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import Colors from '@/constants/Colors';
import { radius, spacing } from '@/constants/design';
import { useColorScheme } from '@/components/useColorScheme';

type Variant = 'default' | 'flat' | 'tinted' | 'alert' | 'safe' | 'warn';

type CardProps = ViewProps & {
  variant?: Variant;
  padded?: boolean;
  children?: ReactNode;
};

export function Card({
  variant = 'default',
  padded = true,
  style,
  children,
  ...rest
}: CardProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  let backgroundColor = colors.surface;
  let borderColor = colors.border;
  let borderWidth: number = StyleSheet.hairlineWidth;

  switch (variant) {
    case 'flat':
      backgroundColor = colors.surfaceMuted;
      borderColor = 'transparent';
      borderWidth = 0;
      break;
    case 'tinted':
      backgroundColor = colors.brandSoft;
      borderColor = 'transparent';
      borderWidth = 0;
      break;
    case 'alert':
      backgroundColor = colors.alertBackground;
      borderColor = colors.alert;
      borderWidth = 1;
      break;
    case 'safe':
      backgroundColor = colors.safeBackground;
      borderColor = colors.safe;
      borderWidth = 1;
      break;
    case 'warn':
      backgroundColor = colors.warnBackground;
      borderColor = colors.warn;
      borderWidth = 1;
      break;
    default:
      break;
  }

  return (
    <View
      style={[
        styles.base,
        padded && styles.padded,
        { backgroundColor, borderColor, borderWidth },
        style,
      ]}
      {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
  },
  padded: {
    padding: spacing.lg,
  },
});
