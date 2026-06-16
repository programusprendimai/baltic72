import { StyleSheet, View } from 'react-native';

import Colors from '@/constants/Colors';
import { radius, spacing } from '@/constants/design';
import { Body, Heading } from '@/components/ui/Typography';
import { useColorScheme } from '@/components/useColorScheme';

type Tone = 'safe' | 'warn' | 'alert' | 'info';

type StatusBannerProps = {
  tone?: Tone;
  title: string;
  body?: string;
  leading?: React.ReactNode;
};

export function StatusBanner({ tone = 'info', title, body, leading }: StatusBannerProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  const palette = (() => {
    switch (tone) {
      case 'safe':
        return { bg: colors.safeBackground, border: colors.safe, text: colors.safe };
      case 'warn':
        return { bg: colors.warnBackground, border: colors.warn, text: colors.warn };
      case 'alert':
        return { bg: colors.alertBackground, border: colors.alert, text: colors.alert };
      case 'info':
      default:
        return { bg: colors.brandSoft, border: colors.brand, text: colors.brand };
    }
  })();

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}>
      {leading ? <View style={styles.icon}>{leading}</View> : null}
      <View style={{ flex: 1 }}>
        <Heading style={{ color: palette.text }}>{title}</Heading>
        {body ? (
          <Body tone="textSecondary" style={styles.body}>
            {body}
          </Body>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  icon: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  body: {
    marginTop: spacing.sm,
  },
});
