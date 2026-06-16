import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Backpack, BookOpen, Navigation, Siren } from 'lucide-react-native';

import { QuickAction } from '@/components/QuickAction';
import { FamilyStatusTile } from '@/components/FamilyStatusTile';
import { BalticGlobe, type GlobeTone } from '@/components/ui/BalticGlobe';
import { Screen } from '@/components/ui/Screen';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Stack } from '@/components/ui/Stack';
import { StatTile, type StatTileTone } from '@/components/ui/StatTile';
import { Footnote } from '@/components/ui/Typography';
import { spacing } from '@/constants/design';
import { useI18n } from '@/providers/I18nProvider';

// Regional civil-protection status. Flip this to 'warn' | 'alert' when an
// active alert arrives — the globe colour and status tile follow automatically.
const STATUS: GlobeTone = 'safe';

export default function HomeScreen() {
  const { t } = useI18n();
  const { width } = useWindowDimensions();

  const globeSize = Math.min(width - spacing.xl * 2, 240);
  const statusTitle = t('home.statusNormal');

  const alertsTone: StatTileTone = STATUS === 'brand' ? 'neutral' : STATUS;

  return (
    <Screen>
      <Stack gap="xxl">
        <View style={styles.hero}>
          <BalticGlobe tone={STATUS} size={globeSize} label={statusTitle} />
        </View>

        <Stack gap="sm">
          <View style={styles.statRow}>
            <FamilyStatusTile />
            <StatTile
              tone={alertsTone}
              icon={Siren}
              label={t('home.alertsLabel')}
              value={statusTitle}
            />
          </View>
          <Footnote style={{ marginHorizontal: spacing.xs }}>
            {t('home.alertsDisclaimer')}
          </Footnote>
        </Stack>

        <Stack gap="sm">
          <SectionLabel>{t('home.quickActions')}</SectionLabel>
          <Stack gap="md">
            <QuickAction
              href="/(tabs)/map?focus=current"
              title={t('home.findShelter')}
              icon={Navigation}
              accent="alert"
            />
            <QuickAction href="/(tabs)/guides" title={t('home.openGuides')} icon={BookOpen} />
            <QuickAction href="/(tabs)/kit" title={t('home.openKit')} icon={Backpack} />
          </Stack>
        </Stack>
      </Stack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.md,
  },
});
