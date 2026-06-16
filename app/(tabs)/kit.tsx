import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { ChecklistRow } from '@/components/ChecklistRow';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Stack } from '@/components/ui/Stack';
import { Body, Caption } from '@/components/ui/Typography';
import { getChecklistItems, setChecklistItemChecked } from '@/lib/db/queries';
import type { ChecklistItem } from '@/lib/db/types';
import { useI18n } from '@/providers/I18nProvider';

export default function KitScreen() {
  const { t } = useI18n();
  const db = useSQLiteContext();
  const [items, setItems] = useState<ChecklistItem[]>([]);

  const refresh = useCallback(async () => {
    const rows = await getChecklistItems(db);
    setItems(
      rows.map((row) => ({
        ...row,
        checked: Boolean(row.checked),
      }))
    );
  }, [db]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const checkedCount = items.filter((i) => i.checked).length;

  const toggle = async (item: ChecklistItem) => {
    await setChecklistItemChecked(db, item.id, !item.checked);
    await refresh();
  };

  const essentials = items.filter((i) => i.category === 'essentials');
  const personal = items.filter((i) => i.category === 'personal');

  return (
    <Screen>
      <Stack gap="xxl">
        <Card variant="tinted">
          <Body strong tone="brand">
            {t('kit.progress', { checked: checkedCount, total: items.length })}
          </Body>
          <Caption>{t('kit.subtitle')}</Caption>
        </Card>

        <Stack gap="sm">
          <SectionLabel>{t('kit.essentials')}</SectionLabel>
          <Stack gap="sm">
            {essentials.map((item) => (
              <ChecklistRow
                key={item.id}
                label={t(item.label_key)}
                checked={item.checked}
                onToggle={() => void toggle(item)}
              />
            ))}
          </Stack>
        </Stack>

        <Stack gap="sm">
          <SectionLabel>{t('kit.personal')}</SectionLabel>
          <Stack gap="sm">
            {personal.map((item) => (
              <ChecklistRow
                key={item.id}
                label={t(item.label_key)}
                checked={item.checked}
                onToggle={() => void toggle(item)}
              />
            ))}
          </Stack>
        </Stack>
      </Stack>
    </Screen>
  );
}
