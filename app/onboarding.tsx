import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { LanguageSelect } from '@/components/ui/LanguageSelect';
import { PageHeader } from '@/components/ui/PageHeader';
import { Screen } from '@/components/ui/Screen';
import { Stack } from '@/components/ui/Stack';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { layout, onboarding, spacing } from '@/constants/design';
import { useFamily } from '@/providers/FamilyProvider';
import { useOnboarding } from '@/providers/OnboardingProvider';
import { useI18n } from '@/providers/I18nProvider';

const SLIDES = [
  {
    key: 'shelters',
    image: require('../assets/images/onboarding-shelters.png'),
  },
  {
    key: 'guides',
    image: require('../assets/images/onboarding-guides.png'),
  },
  {
    key: 'kit',
    image: require('../assets/images/onboarding-kit.png'),
  },
  {
    key: 'family',
    image: require('../assets/images/onboarding-family.png'),
  },
] as const;

export default function OnboardingScreen() {
  const { t } = useI18n();
  const { complete } = useOnboarding();
  const fam = useFamily();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const slideWidth = width - layout.screenPaddingHorizontal * 2;
  const isLast = index === SLIDES.length - 1;

  const goTo = (nextIndex: number) => {
    setIndex(nextIndex);
    scrollRef.current?.scrollTo({ x: slideWidth * nextIndex, animated: true });
  };

  const finish = async () => {
    await complete();
    router.replace((fam.pendingInvite ? '/(tabs)/family' : '/(tabs)') as never);
  };

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / slideWidth);
    setIndex(Math.max(0, Math.min(SLIDES.length - 1, next)));
  };

  return (
    <Screen scroll={false} withTabBar={false}>
      <Stack gap="lg" style={styles.root}>
        <View style={styles.languageRow}>
          <LanguageSelect compact />
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          scrollEventThrottle={16}
          style={styles.pager}
          contentContainerStyle={styles.pagerContent}>
          {SLIDES.map((slide) => (
            <View key={slide.key} style={[styles.slide, { width: slideWidth }]}>
              <Image
                source={slide.image}
                resizeMode="contain"
                style={[
                  styles.artwork,
                  { width: Math.min(slideWidth, onboarding.artworkMaxWidth) },
                ]}
                accessible={false}
                accessibilityIgnoresInvertColors
              />
            </View>
          ))}
        </ScrollView>

        <PageHeader
          title={t(`onboarding.slides.${SLIDES[index].key}.title`)}
          subtitle={t(`onboarding.slides.${SLIDES[index].key}.body`)}
        />

        <StepIndicator count={SLIDES.length} index={index} onSelect={goTo} />

        <View style={styles.footer}>
          {index > 0 ? (
            <Button
              title={t('onboarding.actions.back')}
              variant="secondary"
              onPress={() => goTo(index - 1)}
            />
          ) : null}
          <Button
            title={isLast ? t('onboarding.actions.start') : t('onboarding.actions.next')}
            size="lg"
            onPress={() => (isLast ? void finish() : goTo(index + 1))}
          />
        </View>
      </Stack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  languageRow: {
    minHeight: 56,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  pager: {
    flex: 1,
  },
  pagerContent: {
    alignItems: 'stretch',
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artwork: {
    maxWidth: '100%',
    height: onboarding.artworkHeight,
  },
  footer: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
});
