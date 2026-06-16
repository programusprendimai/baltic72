import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Info, RefreshCw } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  Switch,
} from 'react-native';

import { Flag, type FlagCode } from '@/components/ui/Flag';
import { IconTile } from '@/components/ui/IconTile';
import { LanguageSelect } from '@/components/ui/LanguageSelect';
import { ListGroup } from '@/components/ui/ListGroup';
import { ListRow } from '@/components/ui/ListRow';
import { Screen } from '@/components/ui/Screen';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Stack } from '@/components/ui/Stack';
import { Footnote } from '@/components/ui/Typography';
import Colors from '@/constants/Colors';
import { spacing } from '@/constants/design';
import { useColorScheme } from '@/components/useColorScheme';
import {
  NOTIFY_COUNTRIES,
  countriesFromNotifyRecord,
  emptyNotifyRecord,
  ensureNotificationPermission,
  notifyRecordFromCountries,
  persistNotificationPreferences,
  readNotificationCountries,
  writeNotificationCountries,
  type NotifyCountry,
} from '@/lib/notifications/push';
import { legalUrl } from '@/lib/legal';
import { getLastSyncCheck, isShelterUpdateConfigured, refreshShelters } from '@/lib/sync';
import { useI18n } from '@/providers/I18nProvider';

const SETTINGS_NOTIFY_COUNTRIES = NOTIFY_COUNTRIES as FlagCode[];

// Per-country emergency-alert notifications are hidden for v1: alerts are
// operator-issued only (no automated source yet), so a per-country toggle would
// overpromise. Flip to true once an authoritative alert pipeline/partnership is
// live. All wiring is kept so it's a one-line restore.
const SHOW_ALERT_NOTIFICATIONS = false;

// Official source page for each country's shelter data + the flag to show.
const DATA_SOURCES: { code: FlagCode; title: string; subtitle: string; url: string }[] = [
  { code: 'LT', title: 'PAGD · data.gov.lt', subtitle: 'Lietuva', url: 'https://data.gov.lt/datasets/3984' },
  {
    code: 'EE',
    title: 'Päästeamet · SMIT',
    subtitle: 'Eesti',
    url: 'https://www.rescue.ee/et/juhend/avaandmed/avalikud-varjumiskohad',
  },
  {
    code: 'LV',
    title: 'VUGD · 112.lv',
    subtitle: 'Latvija',
    url: 'https://www.112.lv/lv/patvertnes',
  },
  {
    code: 'PL',
    title: 'KG PSP · dane.gov.pl',
    subtitle: 'Polska',
    url: 'https://dane.gov.pl/pl/dataset/28058,punkty-schronienia-w-polsce',
  },
];

export default function SettingsScreen() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const db = useSQLiteContext();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const [notify, setNotify] = useState<Record<NotifyCountry, boolean>>(emptyNotifyRecord());

  const updatesConfigured = isShelterUpdateConfigured();
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!updatesConfigured) return;
    void getLastSyncCheck(db).then((date) => {
      if (date) setSyncStatus(`${t('settings.lastChecked')}: ${date.toLocaleDateString(locale)}`);
    });
  }, [db, updatesConfigured, locale, t]);

  useEffect(() => {
    void readNotificationCountries().then((countries) => {
      setNotify(notifyRecordFromCountries(countries));
    });
  }, []);

  const onUpdateData = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncStatus(t('settings.updating'));
    const result = await refreshShelters(db, { force: true });
    setSyncing(false);
    switch (result.status) {
      case 'disabled':
      case 'unavailable':
        setSyncStatus(t('settings.updateUnavailable'));
        break;
      case 'updated':
        setSyncStatus(t('settings.updated'));
        break;
      case 'up_to_date':
      case 'cooldown':
        setSyncStatus(t('settings.upToDate'));
        break;
      case 'error':
        setSyncStatus(t('settings.updateFailedWithReason', { message: result.message }));
        break;
      default:
        setSyncStatus(t('settings.updateFailed'));
    }
  };

  const toggleCountry = async (code: NotifyCountry, next: boolean) => {
    const nextNotify = { ...notify, [code]: next };
    if (next && !(await ensureNotificationPermission())) {
      Alert.alert(t('settings.notifications'), t('settings.notificationsDenied'));
      return;
    }
    setNotify(nextNotify);
    try {
      await persistNotificationPreferences(nextNotify, locale, version);
    } catch {
      setNotify(notify);
      await writeNotificationCountries(countriesFromNotifyRecord(notify)).catch(() => undefined);
      Alert.alert(t('settings.notifications'), t('settings.updateFailed'));
    }
  };

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen>
      <Stack gap="xxl">
        <Stack gap="sm" style={styles.languageSection}>
          <SectionLabel>{t('settings.language')}</SectionLabel>
          <LanguageSelect />
        </Stack>

        {SHOW_ALERT_NOTIFICATIONS && (
          <Stack gap="sm">
            <SectionLabel>{t('settings.notifications')}</SectionLabel>
            <ListGroup separatorInset={spacing.lg + 26 + spacing.md}>
              {SETTINGS_NOTIFY_COUNTRIES.map((code) => (
                <ListRow
                  key={code}
                  grouped
                  showChevron={false}
                  leading={<Flag code={code} />}
                  title={t(`settings.countries.${code}`)}
                  trailing={
                    <Switch
                      value={notify[code]}
                      onValueChange={(v) => void toggleCountry(code as NotifyCountry, v)}
                      trackColor={{ true: colors.brand, false: colors.border }}
                    />
                  }
                />
              ))}
            </ListGroup>
            <Footnote style={{ marginHorizontal: spacing.xs }}>
              {t('settings.notificationsHint')}
            </Footnote>
            <Footnote style={{ marginHorizontal: spacing.xs }}>
              {t('settings.notificationsDisclaimer')}
            </Footnote>
          </Stack>
        )}

        <Stack gap="sm">
          <SectionLabel>{t('settings.data')}</SectionLabel>
          <ListGroup>
            <ListRow
              grouped
              showChevron={false}
              leading={
                <IconTile color={updatesConfigured ? colors.brand : colors.textMuted}>
                  <RefreshCw size={18} color={colors.onBrand} />
                </IconTile>
              }
              title={t('settings.updateData')}
              subtitle={
                syncStatus ??
                (updatesConfigured ? t('settings.updateReady') : t('settings.updateUnavailable'))
              }
              onPress={() => void onUpdateData()}
              trailing={syncing ? <ActivityIndicator color={colors.brand} /> : undefined}
            />
          </ListGroup>
        </Stack>

        <Stack gap="sm">
          <SectionLabel>{t('settings.dataSources')}</SectionLabel>
          <ListGroup separatorInset={spacing.lg + 26 + spacing.md}>
            {DATA_SOURCES.map((src) => (
              <ListRow
                key={src.code}
                grouped
                leading={<Flag code={src.code} />}
                title={src.title}
                subtitle={src.subtitle}
                onPress={() => void Linking.openURL(src.url)}
              />
            ))}
          </ListGroup>
          <Footnote style={{ marginHorizontal: spacing.xs }}>
            {t('settings.notAffiliated')}
          </Footnote>
        </Stack>

        <Stack gap="sm">
          <SectionLabel>{t('settings.about')}</SectionLabel>
          <ListGroup>
            <ListRow
              grouped
              leading={
                <IconTile color={colors.brand}>
                  <Info size={18} color={colors.onBrand} />
                </IconTile>
              }
              title={t('settings.about')}
              subtitle={t('settings.version', { version })}
              onPress={() => router.push('/modal')}
            />
          </ListGroup>
        </Stack>

        <Stack gap="sm">
          <SectionLabel>{t('settings.legal')}</SectionLabel>
          <ListGroup>
            <ListRow
              grouped
              title={t('settings.privacyPolicy')}
              onPress={() => void Linking.openURL(legalUrl(locale, 'privacy'))}
            />
            <ListRow
              grouped
              title={t('settings.terms')}
              onPress={() => void Linking.openURL(legalUrl(locale, 'terms'))}
            />
          </ListGroup>
        </Stack>
      </Stack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  languageSection: {
    zIndex: 2,
  },
});
