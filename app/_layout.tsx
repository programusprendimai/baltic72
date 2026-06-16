import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import '@/lib/silenceMapRejections';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { router, Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { BalticSplash } from '@/components/ui/BalticSplash';
import { useColorScheme } from '@/components/useColorScheme';
import { AppProviders } from '@/providers/AppProviders';
import { useFamily } from '@/providers/FamilyProvider';
import { I18nProvider, useI18n } from '@/providers/I18nProvider';
import { OnboardingProvider, useOnboarding } from '@/providers/OnboardingProvider';
import {
  useFamilyPushTokenRegistration,
  useStoredPushTokenRegistration,
} from '@/lib/notifications/push';
import { Sentry, initSentry } from '@/lib/observability/sentry';

// Initialise crash reporting before the React tree renders so startup crashes
// are captured. No-op when no DSN is configured.
initSentry();

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) {
      Sentry.captureException(error);
      throw error;
    }
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <I18nProvider>
      <OnboardingProvider>
        <AppProviders>
          <RootLayoutNav />
          <SplashGate />
        </AppProviders>
      </OnboardingProvider>
    </I18nProvider>
  );
}

function SplashGate() {
  const [done, setDone] = useState(false);
  if (done) return null;
  return <BalticSplash onDone={() => setDone(true)} />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { t, locale } = useI18n();
  const onboarding = useOnboarding();
  const family = useFamily();
  useStoredPushTokenRegistration(locale);
  useFamilyPushTokenRegistration(family.ready && family.hasGroup, locale);
  useNotificationObserver(onboarding.completed);

  if (!onboarding.ready) return null;

  // `Stack.Protected` makes guarded-out routes unavailable, so expo-router
  // redirects to the onboarding route instead of falling through to the
  // `unstable_settings.initialRouteName` ('(tabs)'). A plain conditional Stack
  // does NOT do this — the filesystem-registered (tabs) route still wins.
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!onboarding.completed}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={onboarding.completed}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="join" />
          <Stack.Screen
            name="guide/[id]"
            options={{ headerShown: true, headerBackTitle: t('common.back') }}
          />
          <Stack.Screen
            name="modal"
            options={{ headerShown: true, presentation: 'modal', title: t('settings.about') }}
          />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}

// `Sentry.wrap` installs the native error boundary + touch/profiling hooks
// around the root component.
export default Sentry.wrap(RootLayout);

function useNotificationObserver(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    function redirect(notification: Notifications.Notification) {
      const url = notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) {
        router.push(url as never);
      }
    }

    const response = Notifications.getLastNotificationResponse();
    if (response?.notification) redirect(response.notification);

    const subscription = Notifications.addNotificationResponseReceivedListener((nextResponse) => {
      redirect(nextResponse.notification);
    });

    return () => {
      subscription.remove();
    };
  }, [enabled]);
}
