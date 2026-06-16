import { StatusBanner } from '@/components/ui/StatusBanner';
import { useI18n } from '@/providers/I18nProvider';

/**
 * Legacy wrapper. Composes the design-system <StatusBanner> primitive so that
 * existing call sites keep importing AlertBanner without behavioural change.
 */
export function AlertBanner() {
  const { t } = useI18n();

  return (
    <StatusBanner
      tone="safe"
      title={t('home.statusNormal')}
      body={t('home.statusNormalHint')}
    />
  );
}
