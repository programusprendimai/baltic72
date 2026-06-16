import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/Typography';
import Colors from '@/constants/Colors';
import { radius, spacing } from '@/constants/design';
import { useColorScheme } from '@/components/useColorScheme';

export type StatTileTone = 'safe' | 'warn' | 'alert' | 'neutral';

type StatTileProps = {
  tone: StatTileTone;
  icon: LucideIcon;
  /** Mini-cap label above the value (e.g. "Family"). */
  label: string;
  /** The status itself (e.g. "Everyone is safe"). */
  value: string;
  /** Optional trailing figure shown top-right (e.g. "1/1"). */
  meta?: string;
  onPress?: () => void;
};

/**
 * A soft, tone-tinted dashboard stat tile. Designed to sit two-up in a row:
 * always `flex: 1` so a pair splits the width evenly and a lone tile fills it.
 * Tinting follows the app's status language (safe/warn/alert + neutral brand).
 */
export function StatTile({ tone, icon: Icon, label, value, meta, onPress }: StatTileProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  const palette: Record<StatTileTone, { bg: string; fg: string }> = {
    safe: { bg: colors.safeBackground, fg: colors.safe },
    warn: { bg: colors.warnBackground, fg: colors.warn },
    alert: { bg: colors.alertBackground, fg: colors.alert },
    neutral: { bg: colors.brandSoft, fg: colors.brand },
  };
  const { bg, fg } = palette[tone];

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: bg },
        pressed && onPress ? { opacity: 0.7 } : null,
      ]}>
      <View style={styles.topRow}>
        <Icon size={20} color={fg} />
        {meta ? (
          <ThemedText variant="caption" style={{ color: fg }}>
            {meta}
          </ThemedText>
        ) : onPress ? (
          <ChevronRight size={16} color={fg} style={styles.chevron} />
        ) : null}
      </View>
      <View style={styles.text}>
        <ThemedText variant="label" style={[styles.label, { color: fg }]}>
          {label}
        </ThemedText>
        <ThemedText variant="bodyStrong" numberOfLines={2} style={{ color: fg }}>
          {value}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 104,
    borderRadius: radius.lg,
    padding: spacing.lg,
    // Top-align so the mini-cap labels line up across tiles regardless of how
    // many lines each value wraps to.
    justifyContent: 'flex-start',
    gap: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  text: {
    gap: spacing.xs,
  },
  label: {
    opacity: 0.85,
  },
  chevron: {
    opacity: 0.6,
  },
});
