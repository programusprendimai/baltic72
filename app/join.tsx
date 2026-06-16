import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Screen } from '@/components/ui/Screen';
import { Stack } from '@/components/ui/Stack';
import { StatusBanner } from '@/components/ui/StatusBanner';
import { Body } from '@/components/ui/Typography';
import { useFamily } from '@/providers/FamilyProvider';
import { useI18n } from '@/providers/I18nProvider';

export default function JoinScreen() {
  const fam = useFamily();
  const { t } = useI18n();
  const currentUrl = Linking.useURL();
  const handledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const inviteUrl = currentUrl ?? (await Linking.getInitialURL());
      if (cancelled || handledRef.current || !inviteUrl) return;
      handledRef.current = true;
      fam.submitInviteUrl(inviteUrl);
      router.replace('/(tabs)/family');
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUrl, fam]);

  return (
    <Screen withTabBar={false}>
      <PageHeader title={t('family.joinTitle')} />
      <Stack gap="lg">
        <StatusBanner tone="info" title={t('family.joinTitle')} body={t('family.joinHint')} />
        <Body tone="textSecondary">{t('family.inviteHint')}</Body>
        <Button title={t('family.join')} onPress={() => router.replace('/(tabs)/family')} />
      </Stack>
    </Screen>
  );
}
