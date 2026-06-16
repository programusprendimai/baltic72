import { GuideCard } from '@/components/GuideCard';
import { Screen } from '@/components/ui/Screen';
import { Stack } from '@/components/ui/Stack';
import { Body } from '@/components/ui/Typography';
import { spacing } from '@/constants/design';
import { useI18n } from '@/providers/I18nProvider';

export default function GuidesScreen() {
  const { t } = useI18n();

  return (
    <Screen>
      <Body tone="textSecondary" style={{ marginBottom: spacing.xl }}>
        {t('guides.subtitle')}
      </Body>

      <Stack gap="md">
        <GuideCard id="air" title={t('guides.air')} description={t('guides.airDesc')} />
        <GuideCard id="missile" title={t('guides.missile')} description={t('guides.missileDesc')} />
        <GuideCard id="nuclear" title={t('guides.nuclear')} description={t('guides.nuclearDesc')} />
        <GuideCard id="natural" title={t('guides.natural')} description={t('guides.naturalDesc')} />
      </Stack>
    </Screen>
  );
}
