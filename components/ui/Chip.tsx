import { Pressable, StyleSheet } from 'react-native';

import Colors from '@/constants/Colors';
import { radius, spacing } from '@/constants/design';
import { ThemedText } from '@/components/ui/Typography';
import { useColorScheme } from '@/components/useColorScheme';

type ChipProps = {
  label: string;
  selected?: boolean;
  accent?: string;
  block?: boolean;
  onPress?: () => void;
  testID?: string;
};

export function Chip({
  label,
  selected = false,
  accent,
  block = false,
  onPress,
  testID,
}: ChipProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const activeBg = accent ?? colors.brand;

  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: selected ? activeBg : colors.surface,
          borderColor: selected ? activeBg : colors.border,
          alignSelf: block ? 'stretch' : 'flex-start',
          flexGrow: block ? 1 : 0,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <ThemedText
        variant="caption"
        numberOfLines={1}
        style={{
          color: selected ? colors.onBrand : colors.text,
          textAlign: 'center',
        }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
