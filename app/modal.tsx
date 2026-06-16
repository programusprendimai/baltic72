import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Stack } from '@/components/ui/Stack';
import { Body, Heading } from '@/components/ui/Typography';
import { useI18n } from '@/providers/I18nProvider';

export default function ModalScreen() {
  const { t } = useI18n();

  return (
    <Screen withTabBar={false}>
      <Stack gap="md">
        <Card>
          <Stack gap="md">
            <Heading>{t('settings.about')}</Heading>
            <Body tone="textSecondary">{t('settings.aboutText')}</Body>
          </Stack>
        </Card>
        <Card>
          <Body tone="textSecondary">{t('settings.notAffiliated')}</Body>
        </Card>
      </Stack>
      <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
    </Screen>
  );
}
