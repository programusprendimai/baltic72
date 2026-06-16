import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';

import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

/** Height of the bar's content row, above the bottom safe-area inset. */
export const TAB_BAR_HEIGHT = 56;

const ICON_SIZE = 26;

/**
 * Grounded, full-width tab bar — the canonical iOS pattern: a solid surface
 * flush to the bottom edge, a hairline top separator, and icon + label per
 * item. Active item uses the brand tint; no floating pill, no glass.
 */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  const activeColor = colors.tabIconSelected;
  const inactiveColor = colors.tabIconDefault;

  // Drop hidden routes (kit, guides) so only the four primary tabs render.
  const visibleRoutes = useMemo(() => {
    return state.routes
      .map((route, index) => ({ route, originalIndex: index }))
      .filter(({ route }) => {
        const options = descriptors[route.key].options;
        const itemStyle = options.tabBarItemStyle as { display?: string } | undefined;
        const hidden =
          options.tabBarButton !== undefined || itemStyle?.display === 'none';
        return !hidden;
      });
  }, [state.routes, descriptors]);

  return (
    <View
      style={[
        styles.bar,
        {
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      ]}>
      <View style={styles.row}>
        {visibleRoutes.map(({ route, originalIndex }) => {
          const { options } = descriptors[route.key];
          const focused = originalIndex === state.index;
          const labelSource =
            options.tabBarLabel !== undefined ? options.tabBarLabel : options.title ?? route.name;
          const label = typeof labelSource === 'string' ? labelSource : route.name;
          const tintColor = focused ? activeColor : inactiveColor;
          const icon = options.tabBarIcon
            ? options.tabBarIcon({ focused, color: tintColor, size: ICON_SIZE })
            : null;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [styles.item, pressed && { opacity: 0.55 }]}>
              {icon}
              <Text
                numberOfLines={1}
                allowFontScaling={false}
                style={[styles.label, { color: tintColor }, focused && styles.labelActive]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  item: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  label: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  labelActive: {
    fontWeight: '700',
  },
});
