import { Pressable, StyleSheet, View } from 'react-native';

import Colors from '@/constants/Colors';
import { minTouchTarget, radius, spacing, stepIndicator } from '@/constants/design';
import { useColorScheme } from '@/components/useColorScheme';

type StepIndicatorProps = {
  count: number;
  index: number;
  onSelect?: (index: number) => void;
};

export function StepIndicator({ count, index, onSelect }: StepIndicatorProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      {Array.from({ length: count }).map((_, i) => {
        const selected = i === index;
        const segment = (
          <View
            style={[
              styles.segment,
              {
                backgroundColor: selected ? colors.brand : colors.border,
              },
            ]}
          />
        );

        if (!onSelect) {
          return <View key={i}>{segment}</View>;
        }

        return (
          <Pressable
            key={i}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onSelect(i)}
            style={styles.touch}>
            {segment}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  touch: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segment: {
    width: stepIndicator.segmentWidth,
    height: stepIndicator.segmentHeight,
    borderRadius: radius.pill,
  },
});
