import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import Colors from '@/constants/Colors';
import { radius, spacing } from '@/constants/design';
import { Body, Caption } from '@/components/ui/Typography';
import { useColorScheme } from '@/components/useColorScheme';

type ListRowProps = {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  /**
   * When inside a `<ListGroup>`, the group owns the surface, border and radius —
   * the row renders transparent with no border of its own.
   */
  grouped?: boolean;
};

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  showChevron = true,
  grouped = false,
}: ListRowProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        grouped
          ? { backgroundColor: pressed && onPress ? colors.surfaceMuted : 'transparent' }
          : {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: radius.lg,
              opacity: pressed && onPress ? 0.7 : 1,
            },
      ]}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.text}>
        <Body strong>{title}</Body>
        {subtitle ? <Caption>{subtitle}</Caption> : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {!trailing && onPress && showChevron ? (
        <ChevronRight size={20} color={colors.textMuted} style={styles.chevron} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 56,
    gap: spacing.md,
  },
  leading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: spacing.xs,
  },
  trailing: {
    marginLeft: spacing.sm,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  chevron: {
    marginLeft: spacing.sm,
  },
});
