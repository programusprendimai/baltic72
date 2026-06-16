import {
  Accessibility,
  Building2,
  Clock,
  Droplets,
  Lightbulb,
  MapPin,
  Navigation,
  RadioTower,
  Signpost,
  Users,
  Wind,
  type LucideIcon,
} from 'lucide-react-native';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Body, Caption, Footnote, Label } from '@/components/ui/Typography';
import Colors from '@/constants/Colors';
import { radius, spacing } from '@/constants/design';
import { useColorScheme } from '@/components/useColorScheme';
import type { Shelter, ShelterCategory } from '@/lib/db/types';
import { useI18n } from '@/providers/I18nProvider';

type ShelterCardProps = {
  shelter: Shelter;
  highlighted?: boolean;
  /** When pinned, shows a "show all" button that clears the selection. */
  onClear?: () => void;
};

// Category accent colors are data-domain (not theme tokens) — kept inline by design.
const CATEGORY_ACCENT: Record<ShelterCategory, string> = {
  kas: '#0F766E',
  priedanga: '#1B4D8C',
  evakuacija: '#B45309',
  sirena: '#7C2D12',
};

function openDirections(shelter: Shelter) {
  const { latitude, longitude, name } = shelter;
  const label = encodeURIComponent(name);
  const url = Platform.select({
    ios: `maps://?daddr=${latitude},${longitude}&q=${label}`,
    android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`,
    default: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
  });
  void Linking.openURL(url);
}

export function ShelterCard({ shelter, highlighted = false, onClear }: ShelterCardProps) {
  const { t } = useI18n();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const accent = CATEGORY_ACCENT[shelter.category];
  const isSiren = shelter.category === 'sirena';
  const typeLabel = t(`map.types.${shelter.type}`);
  const categoryLabel = t(`map.categories.${shelter.category}`);
  const localityParts = [shelter.city, shelter.municipality].filter(
    (part): part is string => !!part && part !== shelter.city
  );

  const badges: { label: string; Icon: LucideIcon }[] = [];
  if (shelter.accessible)
    badges.push({ label: t('map.badges.accessible'), Icon: Accessibility });
  if (shelter.always_open)
    badges.push({ label: t('map.badges.always_open'), Icon: Clock });
  if (shelter.marked) badges.push({ label: t('map.badges.marked'), Icon: Signpost });
  if (shelter.has_ventilation)
    badges.push({ label: t('map.badges.ventilation'), Icon: Wind });
  if (shelter.has_lighting)
    badges.push({ label: t('map.badges.lighting'), Icon: Lightbulb });
  if (shelter.has_sanitation)
    badges.push({ label: t('map.badges.sanitation'), Icon: Droplets });

  return (
    <View style={styles.pressable}>
      <Card
        style={highlighted ? { borderColor: accent, borderWidth: 2 } : undefined}>
        <View style={styles.headerRow}>
          <View style={[styles.categoryPill, { backgroundColor: accent }]}>
            <Caption style={{ color: colors.onBrand }}>{categoryLabel}</Caption>
          </View>
          {shelter.distanceKm != null ? (
            <View style={styles.inline}>
              <Navigation size={15} color={colors.brand} />
              <Body strong tone="brand">
                {t('map.kmAway', { distance: shelter.distanceKm.toFixed(1) })}
              </Body>
            </View>
          ) : null}
        </View>

        <Body strong numberOfLines={2} style={styles.name}>
          {shelter.name}
        </Body>

        <Caption tone="textSecondary" numberOfLines={1}>
          {typeLabel}
          {shelter.city ? ` · ${shelter.city}` : ''}
          {localityParts.length ? ` · ${localityParts.join(' · ')}` : ''}
        </Caption>

        {shelter.address ? (
          <View style={styles.inline}>
            <MapPin size={13} color={colors.textSecondary} />
            <Caption tone="textSecondary" numberOfLines={1} style={styles.flex}>
              {shelter.address}
            </Caption>
          </View>
        ) : null}

        {shelter.category === 'sirena' && shelter.siren_radius_m ? (
          <View style={styles.inline}>
            <RadioTower size={13} color={colors.textSecondary} />
            <Caption tone="textSecondary">
              {t('map.sirenRadius', { radius: Math.round(shelter.siren_radius_m) })}
            </Caption>
          </View>
        ) : null}

        {(!isSiren && (shelter.capacity || shelter.area_m2)) || shelter.hours ? (
          <View style={styles.metricsRow}>
            {!isSiren && shelter.capacity ? (
              <View style={styles.metric}>
                <Label>{t('map.capacityLabel')}</Label>
                <View style={styles.inline}>
                  <Users size={15} color={colors.text} />
                  <Body strong>{t('map.capacity', { count: shelter.capacity })}</Body>
                </View>
              </View>
            ) : null}
            {!isSiren && shelter.area_m2 ? (
              <View style={styles.metric}>
                <Label>{t('map.areaLabel')}</Label>
                <View style={styles.inline}>
                  <Building2 size={15} color={colors.text} />
                  <Body strong>{t('map.area', { area: Math.round(shelter.area_m2) })}</Body>
                </View>
              </View>
            ) : null}
            {shelter.hours ? (
              <View style={styles.inline}>
                <Clock size={14} color={colors.textSecondary} />
                <Caption tone="textSecondary">{shelter.hours}</Caption>
              </View>
            ) : null}
          </View>
        ) : null}

        {badges.length ? (
          <View style={styles.badgeRow}>
            {badges.map(({ label, Icon }) => (
              <View
                key={label}
                style={[
                  styles.badge,
                  { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
                ]}>
                <Icon size={12} color={colors.textSecondary} />
                <Footnote tone="textSecondary">{label}</Footnote>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            title={t('map.directions')}
            variant="primary"
            size="md"
            onPress={() => openDirections(shelter)}
            leading={<Navigation size={18} color={colors.onBrand} />}
          />
          {highlighted && onClear ? (
            <Button
              title={t('map.showAll')}
              variant="secondary"
              size="md"
              onPress={onClear}
            />
          ) : null}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  pressable: {
    // No bottom margin: the card sits in the map's bottom carousel and any
    // margin here just adds dead space below it.
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  categoryPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  name: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  flex: {
    flex: 1,
  },
  metricsRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    alignItems: 'flex-start',
  },
  metric: {
    gap: 2,
  },
  badgeRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  actions: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
