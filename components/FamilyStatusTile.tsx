import { useRouter } from 'expo-router';
import { Users } from 'lucide-react-native';

import { StatTile } from '@/components/ui/StatTile';
import { summarizeFamily } from '@/lib/family/summary';
import { useFamily } from '@/providers/FamilyProvider';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Family half of the dashboard stat row. Uses the shared `summarizeFamily`
 * roll-up (same as the Family tab) and links straight to it. Renders nothing
 * until the provider is ready and only prompts to set up when the feature is
 * configured — when it returns null the sibling alerts tile fills the row.
 */
export function FamilyStatusTile() {
  const { t } = useI18n();
  const router = useRouter();
  const fam = useFamily();

  if (!fam.ready) return null;
  if (!fam.hasGroup && !fam.configured) return null;

  const goToFamily = () => router.push('/(tabs)/family' as never);

  if (!fam.hasGroup) {
    return (
      <StatTile
        tone="neutral"
        icon={Users}
        label={t('home.familySection')}
        value={t('home.familySetUp')}
        onPress={goToFamily}
      />
    );
  }

  const summary = summarizeFamily(fam.members);

  return (
    <StatTile
      tone={summary.tone}
      icon={summary.icon}
      label={t('home.familySection')}
      value={t(`family.${summary.titleKey}`)}
      meta={`${summary.safeCount}/${summary.total}`}
      onPress={goToFamily}
    />
  );
}
