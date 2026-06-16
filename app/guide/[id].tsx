import { StyleSheet, View } from 'react-native';
import { Stack as RouterStack, useLocalSearchParams } from 'expo-router';

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Stack } from '@/components/ui/Stack';
import { Body, Heading, Title } from '@/components/ui/Typography';
import Colors from '@/constants/Colors';
import { radius, spacing } from '@/constants/design';
import { useColorScheme } from '@/components/useColorScheme';
import type { GuideId } from '@/lib/db/types';
import { getMessages } from '@/lib/i18n';
import { useI18n } from '@/providers/I18nProvider';

const GUIDE_IDS: GuideId[] = ['air', 'missile', 'nuclear', 'natural'];

function isGuideId(value: string): value is GuideId {
  return (GUIDE_IDS as string[]).includes(value);
}

const STEP_NUMBER_SIZE = 36;

export default function GuideDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useI18n();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  if (!id || !isGuideId(id)) {
    return (
      <Screen>
        <Body>{t('common.error')}</Body>
      </Screen>
    );
  }

  const guide = getMessages(locale).guideDetail[id];
  const title = guide.title;
  const steps = guide.steps;

  return (
    <>
      <RouterStack.Screen options={{ title }} />
      <Screen>
        <Stack gap="lg">
          <Title>{title}</Title>
          <Stack gap="md">
            {steps.map((step: string, index: number) => (
              <Card key={index} style={styles.stepCard}>
                <View
                  style={[
                    styles.stepNumber,
                    { backgroundColor: colors.brandSoft },
                  ]}>
                  <Heading tone="brand">{index + 1}</Heading>
                </View>
                <Body style={styles.stepText}>{step}</Body>
              </Card>
            ))}
          </Stack>
        </Stack>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  stepCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  stepNumber: {
    width: STEP_NUMBER_SIZE,
    height: STEP_NUMBER_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
  },
});
