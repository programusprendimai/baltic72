import { Pressable, StyleSheet, View } from 'react-native';

import { Body } from '@/components/ui/Typography';
import { Card } from '@/components/ui/Card';
import Colors from '@/constants/Colors';
import { radius, spacing } from '@/constants/design';
import { useColorScheme } from '@/components/useColorScheme';

type ChecklistRowProps = {
  label: string;
  checked: boolean;
  onToggle: () => void;
};

const MIN_ROW_HEIGHT = 56;
const CHECKBOX_SIZE = 24;

export function ChecklistRow({ label, checked, onToggle }: ChecklistRowProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      hitSlop={spacing.sm}>
      {({ pressed }) => (
        <Card style={[styles.card, pressed ? styles.pressed : null]}>
          <View
            style={[
              styles.box,
              {
                borderColor: checked ? colors.safe : colors.border,
                backgroundColor: checked ? colors.safe : 'transparent',
              },
            ]}>
            {checked ? (
              <Body strong tone="onBrand">
                ✓
              </Body>
            ) : null}
          </View>
          <Body
            style={[
              styles.label,
              checked ? styles.labelChecked : null,
            ]}>
            {label}
          </Body>
        </Card>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_ROW_HEIGHT,
  },
  pressed: {
    opacity: 0.9,
  },
  box: {
    width: CHECKBOX_SIZE,
    height: CHECKBOX_SIZE,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
  },
  labelChecked: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
});
