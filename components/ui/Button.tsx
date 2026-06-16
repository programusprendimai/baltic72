import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import Colors, { type ThemeColors } from '@/constants/Colors';
import { radius, spacing } from '@/constants/design';
import { ThemedText } from '@/components/ui/Typography';
import { useColorScheme } from '@/components/useColorScheme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'alert';
type Size = 'md' | 'lg';

type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  block?: boolean;
};

function colorsForVariant(theme: ThemeColors, variant: Variant) {
  switch (variant) {
    case 'primary':
      return {
        background: theme.brand,
        text: theme.onBrand,
        border: theme.brand,
      };
    case 'alert':
      return {
        background: theme.alert,
        text: '#FFFFFF',
        border: theme.alert,
      };
    case 'secondary':
      return {
        background: theme.surface,
        text: theme.text,
        border: theme.border,
      };
    case 'ghost':
    default:
      return {
        background: 'transparent',
        text: theme.brand,
        border: 'transparent',
      };
  }
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  leading,
  trailing,
  disabled = false,
  loading = false,
  block = true,
}: ButtonProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const palette = colorsForVariant(colors, variant);
  const inactive = disabled || loading;
  const height = size === 'lg' ? 56 : 48;

  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          backgroundColor: palette.background,
          borderColor: palette.border,
          alignSelf: block ? 'stretch' : 'flex-start',
          opacity: inactive ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <View style={styles.content}>
          {leading ? <View style={styles.icon}>{leading}</View> : null}
          <ThemedText
            variant={size === 'lg' ? 'bodyStrong' : 'bodyStrong'}
            style={{ color: palette.text }}>
            {title}
          </ThemedText>
          {trailing ? <View style={styles.icon}>{trailing}</View> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
