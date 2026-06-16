import * as Localization from 'expo-localization';

import et from '@/lib/i18n/locales/et';
import en from '@/lib/i18n/locales/en';
import lv from '@/lib/i18n/locales/lv';
import lt from '@/lib/i18n/locales/lt';
import pl from '@/lib/i18n/locales/pl';
import uk from '@/lib/i18n/locales/uk';
import type { Locale, Messages } from '@/lib/i18n/types';

export const LOCALES: Locale[] = ['lt', 'lv', 'et', 'pl', 'en', 'uk'];

export const LOCALE_LABELS: Record<Locale, string> = {
  lt: 'Lietuvių',
  lv: 'Latviešu',
  et: 'Eesti',
  pl: 'Polski',
  en: 'English',
  uk: 'Українська',
};

const catalogs = { lt, lv, et, pl, en, uk } as const satisfies Record<Locale, Messages>;

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && LOCALES.includes(value as Locale);
}

export function resolveDeviceLocale(): Locale {
  const tag = Localization.getLocales()[0]?.languageCode?.toLowerCase();
  if (isLocale(tag)) return tag;
  return 'en';
}

export function getMessages(locale: Locale): Messages {
  return catalogs[locale];
}

type Params = Record<string, string | number>;

export function formatMessage(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    String(params[key] ?? `{{${key}}}`)
  );
}

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

export function translate(
  locale: Locale,
  key: string,
  params?: Params
): string {
  const value = getNestedValue(catalogs[locale], key);
  if (typeof value === 'string') {
    return formatMessage(value, params);
  }
  return key;
}
