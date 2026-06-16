import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import {
  registerDevice,
  registerPushSubscription,
  updatePushPreferences,
} from '@/lib/family/api';
import { getOrCreateIdentity } from '@/lib/family/identity';

export type NotifyCountry = 'LT' | 'EE' | 'LV' | 'PL';

export const NOTIFY_COUNTRIES: NotifyCountry[] = ['LT', 'EE', 'LV', 'PL'];
export const NOTIFY_PREFS_KEY = 'settings.notify.countries.v1';
export const PUSH_CHANNEL_ID = 'emergency-alerts';

type NotifyRecord = Record<NotifyCountry, boolean>;

const EMPTY_NOTIFY: NotifyRecord = {
  LT: false,
  EE: false,
  LV: false,
  PL: false,
};

export function countriesFromNotifyRecord(notify: NotifyRecord): NotifyCountry[] {
  return NOTIFY_COUNTRIES.filter((code) => notify[code]);
}

export function notifyRecordFromCountries(countries: string[]): NotifyRecord {
  return {
    LT: countries.includes('LT'),
    EE: countries.includes('EE'),
    LV: countries.includes('LV'),
    PL: countries.includes('PL'),
  };
}

export async function readNotificationCountries(): Promise<NotifyCountry[]> {
  const raw = await AsyncStorage.getItem(NOTIFY_PREFS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return NOTIFY_COUNTRIES.filter((code) => parsed.includes(code));
  } catch {
    return [];
  }
}

export async function writeNotificationCountries(countries: NotifyCountry[]): Promise<void> {
  await AsyncStorage.setItem(NOTIFY_PREFS_KEY, JSON.stringify(countries));
}

export function emptyNotifyRecord(): NotifyRecord {
  return { ...EMPTY_NOTIFY };
}

export async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: 'Emergency alerts',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
  });
}

function canReceiveNotifications(settings: Notifications.NotificationPermissionsStatus): boolean {
  if (Platform.OS === 'ios') {
    const status = settings.ios?.status;
    return (
      status === Notifications.IosAuthorizationStatus.AUTHORIZED ||
      status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
      status === Notifications.IosAuthorizationStatus.EPHEMERAL
    );
  }
  return settings.status === 'granted';
}

export async function ensureNotificationPermission(): Promise<boolean> {
  await ensureAndroidNotificationChannel();

  const existing = await Notifications.getPermissionsAsync();
  if (canReceiveNotifications(existing)) return true;

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  return canReceiveNotifications(requested);
}

function nativePushPlatform(): 'ios' | 'android' | null {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null;
}

function normalizeDevicePushToken(token: Notifications.DevicePushToken): string {
  return typeof token.data === 'string' ? token.data : JSON.stringify(token.data);
}

async function syncCountriesWithToken(
  countries: NotifyCountry[],
  locale: string,
  appVersion: string,
  token?: Notifications.DevicePushToken
): Promise<void> {
  const platform = nativePushPlatform();
  if (!platform) return;

  const identity = await getOrCreateIdentity();
  await registerDevice(identity);

  if (countries.length === 0) {
    await updatePushPreferences(identity, { countries: [] });
    return;
  }

  await ensureAndroidNotificationChannel();
  const nativeToken = token ?? (await Notifications.getDevicePushTokenAsync());
  await registerPushSubscription(identity, {
    platform,
    token: normalizeDevicePushToken(nativeToken),
    environment: __DEV__ && platform === 'ios' ? 'sandbox' : 'production',
    countries,
    locale,
    appVersion,
  });
}

async function syncFamilyPushToken(
  locale: string,
  appVersion: string,
  token?: Notifications.DevicePushToken
): Promise<void> {
  const platform = nativePushPlatform();
  if (!platform) return;

  const identity = await getOrCreateIdentity();
  await registerDevice(identity);

  const allowed = await ensureNotificationPermission();
  if (!allowed) return;

  const countries = await readNotificationCountries();
  const nativeToken = token ?? (await Notifications.getDevicePushTokenAsync());
  await registerPushSubscription(identity, {
    platform,
    token: normalizeDevicePushToken(nativeToken),
    environment: __DEV__ && platform === 'ios' ? 'sandbox' : 'production',
    countries,
    locale,
    appVersion,
    familyEnabled: true,
  });
}

export async function persistNotificationPreferences(
  notify: NotifyRecord,
  locale: string,
  appVersion: string
): Promise<void> {
  const countries = countriesFromNotifyRecord(notify);
  await writeNotificationCountries(countries);
  await syncCountriesWithToken(countries, locale, appVersion);
}

export function useStoredPushTokenRegistration(locale: string): void {
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  useEffect(() => {
    if (!nativePushPlatform()) return;

    let cancelled = false;

    async function refreshCurrentToken() {
      const countries = await readNotificationCountries();
      if (cancelled || countries.length === 0) return;
      await ensureAndroidNotificationChannel();
      const permissions = await Notifications.getPermissionsAsync();
      if (!canReceiveNotifications(permissions)) return;
      const token = await Notifications.getDevicePushTokenAsync();
      if (!cancelled) await syncCountriesWithToken(countries, locale, appVersion, token);
    }

    void refreshCurrentToken().catch((err) => {
      console.warn('push token refresh failed', err);
    });

    const subscription = Notifications.addPushTokenListener((token) => {
      void readNotificationCountries()
        .then((countries) => {
          if (!cancelled && countries.length > 0) {
            return syncCountriesWithToken(countries, locale, appVersion, token);
          }
          return undefined;
        })
        .catch((err) => {
          console.warn('push token rotation sync failed', err);
        });
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [appVersion, locale]);
}

export function useFamilyPushTokenRegistration(enabled: boolean, locale: string): void {
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  useEffect(() => {
    if (!enabled || !nativePushPlatform()) return;

    let cancelled = false;

    void syncFamilyPushToken(locale, appVersion).catch((err) => {
      if (!cancelled) console.warn('family push token sync failed', err);
    });

    const subscription = Notifications.addPushTokenListener((token) => {
      void syncFamilyPushToken(locale, appVersion, token).catch((err) => {
        if (!cancelled) console.warn('family push token rotation sync failed', err);
      });
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [appVersion, enabled, locale]);
}
