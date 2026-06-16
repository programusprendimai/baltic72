import { ScrollView, StyleSheet, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { layout, spacing } from '@/constants/design';
import { useColorScheme } from '@/components/useColorScheme';

type ScreenProps = ViewProps & {
  scroll?: boolean;
  padded?: boolean;
  /** Set to false to skip the tab-bar bottom reservation (e.g. modals). */
  withTabBar?: boolean;
};

export function Screen({
  children,
  scroll = true,
  padded = true,
  withTabBar = true,
  style,
  ...rest
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  // The grounded tab bar sits in the layout flow, so the scroll area already
  // ends at its top edge — content just needs breathing room, not the bar's
  // height. Modals (no tab bar) still clear the safe-area inset themselves.
  const bottomPadding = withTabBar ? spacing.lg : Math.max(insets.bottom, 16);

  // Tabbed screens run header-less (`headerShown: false`), so nothing reserves
  // the status-bar / notch area — content must clear `insets.top` itself.
  // Screens that DO have a native header (modal, guide) report `insets.top` as
  // 0 here, so this stays correct everywhere.
  const topPadding = insets.top + (padded ? layout.screenPaddingTop : 0);

  const content = (
    <View
      style={[
        styles.inner,
        padded && styles.paddedHorizontal,
        { paddingTop: topPadding, paddingBottom: bottomPadding + 8 },
        style,
      ]}
      {...rest}>
      {children}
    </View>
  );

  if (!scroll) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {content}
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}>
      {content}
    </ScrollView>
  );
}

/** Convenience export — same as `<Screen scroll />`, kept for cleaner imports. */
export function ScreenScroll(props: Omit<ScreenProps, 'scroll'>) {
  return <Screen scroll {...props} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  inner: {
    flex: 1,
  },
  paddedHorizontal: {
    paddingHorizontal: layout.screenPaddingHorizontal,
  },
});
