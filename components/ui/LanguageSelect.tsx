import { Check, ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { radius, spacing } from '@/constants/design';
import { LOCALE_LABELS, LOCALES } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n/types';
import { useI18n } from '@/providers/I18nProvider';
import { Body } from '@/components/ui/Typography';

type LanguageSelectProps = {
  compact?: boolean;
};

export function LanguageSelect({ compact = false }: LanguageSelectProps) {
  const { locale, setLocale, t } = useI18n();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.root}>
      {open ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('family.cancel')}
          style={styles.dismissLayer}
          onPress={() => setOpen(false)}
        />
      ) : null}
      <View style={styles.anchor}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.language')}
          onPress={() => setOpen((visible) => !visible)}
          style={({ pressed }) => [
            styles.trigger,
            compact ? styles.triggerCompact : null,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}>
          <Body strong>{LOCALE_LABELS[locale]}</Body>
          <ChevronDown size={20} color={colors.textMuted} />
        </Pressable>

        {open ? (
          <View
            style={[
              styles.dropdown,
              compact ? styles.dropdownCompact : null,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                shadowColor: colors.text,
              },
            ]}>
            {LOCALES.map((code: Locale, index) => {
              const selected = code === locale;
              return (
                <Pressable
                  key={code}
                  onPress={() => {
                    setLocale(code);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    index < LOCALES.length - 1
                      ? {
                          borderBottomColor: colors.divider,
                          borderBottomWidth: StyleSheet.hairlineWidth,
                        }
                      : null,
                    pressed ? { backgroundColor: colors.surfaceMuted } : null,
                  ]}>
                  <Body strong tone={selected ? 'brand' : 'text'} style={styles.label}>
                    {LOCALE_LABELS[code]}
                  </Body>
                  {selected ? <Check size={20} color={colors.brand} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    zIndex: 10,
  },
  dismissLayer: {
    position: 'absolute',
    top: -1000,
    right: -1000,
    bottom: -1000,
    left: -1000,
    zIndex: 1,
  },
  anchor: {
    zIndex: 2,
  },
  trigger: {
    minHeight: 56,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  triggerCompact: {
    minHeight: 44,
    alignSelf: 'flex-end',
  },
  dropdown: {
    position: 'absolute',
    top: 62,
    left: 0,
    right: 0,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    zIndex: 3,
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  dropdownCompact: {
    left: undefined,
    width: 220,
  },
  row: {
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  label: {
    flex: 1,
  },
});
