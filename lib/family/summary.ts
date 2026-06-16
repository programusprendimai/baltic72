import { Clock, Footprints, ShieldAlert, ShieldCheck, type LucideIcon } from 'lucide-react-native';

import type { FamilyStatus } from '@/providers/FamilyProvider';

export type FamilySummaryTone = 'safe' | 'warn' | 'alert';
/** i18n key under `family.` for the headline. */
export type FamilySummaryKey = 'allSafe' | 'someoneUnsafe' | 'awaiting' | 'someoneEnroute';

export type FamilySummary = {
  tone: FamilySummaryTone;
  titleKey: FamilySummaryKey;
  icon: LucideIcon;
  safeCount: number;
  total: number;
};

const ICONS: Record<FamilySummaryKey, LucideIcon> = {
  allSafe: ShieldCheck,
  someoneUnsafe: ShieldAlert,
  awaiting: Clock,
  someoneEnroute: Footprints,
};

/**
 * Single source of truth for the family group's roll-up status, shared by the
 * Family tab hero and the dashboard tile so they never disagree. Picks by the
 * most urgent state present:
 *   help → alert · any unknown (no response yet) → awaiting ·
 *   any en route → heading to shelter · otherwise everyone safe/sheltered.
 * "Awaiting" means a genuine non-response — a member who set "en route" has
 * responded, so they read as heading to shelter, not awaiting.
 */
export function summarizeFamily(members: { status: FamilyStatus }[]): FamilySummary {
  const total = members.length;
  const safeCount = members.filter(
    (m) => m.status === 'safe' || m.status === 'sheltered'
  ).length;

  let tone: FamilySummaryTone;
  let titleKey: FamilySummaryKey;
  if (members.some((m) => m.status === 'help')) {
    tone = 'alert';
    titleKey = 'someoneUnsafe';
  } else if (members.some((m) => m.status === 'unknown')) {
    tone = 'warn';
    titleKey = 'awaiting';
  } else if (members.some((m) => m.status === 'enroute')) {
    tone = 'warn';
    titleKey = 'someoneEnroute';
  } else {
    tone = 'safe';
    titleKey = 'allSafe';
  }

  return { tone, titleKey, icon: ICONS[titleKey], safeCount, total };
}
