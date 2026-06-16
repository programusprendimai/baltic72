import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  Check,
  Fingerprint,
  Footprints,
  HelpCircle,
  House,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconTile } from '@/components/ui/IconTile';
import { InfoModal } from '@/components/ui/InfoModal';
import { ListGroup } from '@/components/ui/ListGroup';
import { ListRow } from '@/components/ui/ListRow';
import { Screen } from '@/components/ui/Screen';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Stack } from '@/components/ui/Stack';
import { StatusBanner } from '@/components/ui/StatusBanner';
import { TextField } from '@/components/ui/TextField';
import { Body, Caption, Heading } from '@/components/ui/Typography';
import Colors, { type ThemeColors } from '@/constants/Colors';
import { radius, spacing } from '@/constants/design';
import { useColorScheme } from '@/components/useColorScheme';
import { summarizeFamily } from '@/lib/family/summary';
import { useFamily, type FamilyStatus, type Member } from '@/providers/FamilyProvider';
import { useI18n } from '@/providers/I18nProvider';

const FAMILY_EMPTY_IMAGE = require('../../assets/images/family-empty.png');

function statusVisual(status: FamilyStatus, colors: ThemeColors) {
  switch (status) {
    case 'safe':
      return { color: colors.safe, Icon: ShieldCheck };
    case 'enroute':
      return { color: colors.warn, Icon: Footprints };
    case 'sheltered':
      return { color: colors.brand, Icon: House };
    case 'help':
      return { color: colors.alert, Icon: ShieldAlert };
    default:
      return { color: colors.textMuted, Icon: HelpCircle };
  }
}

// Statuses a member can set for themselves (Unknown is only the no-response state).
const SETTABLE: FamilyStatus[] = ['safe', 'enroute', 'sheltered', 'help'];
// Lower = more urgent; used to sort the member list and pick the summary tone.
const SEVERITY: Record<FamilyStatus, number> = {
  help: 0,
  unknown: 1,
  enroute: 2,
  sheltered: 3,
  safe: 4,
};

export default function FamilyScreen() {
  const { t } = useI18n();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const fam = useFamily();

  const [name, setName] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [safetyVisible, setSafetyVisible] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const canScanInvite = !fam.hasGroup;

  useEffect(() => {
    if (!canScanInvite && scanning) setScanning(false);
  }, [canScanInvite, scanning]);

  // --- QR scanner overlay ---
  if (scanning && canScanInvite) {
    return (
      <View style={styles.scanRoot}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              if (fam.submitInviteUrl(data)) setScanning(false);
            }}
          />
        ) : (
          <View style={styles.scanCenter}>
            <Body tone="onBrand" align="center">
              {t('family.cameraDenied')}
            </Body>
          </View>
        )}
        <View style={styles.scanHint} pointerEvents="none">
          <Body tone="onBrand" align="center">
            {t('family.scanTitle')}
          </Body>
        </View>
        <Pressable
          style={[styles.scanClose, { backgroundColor: colors.surface }]}
          onPress={() => setScanning(false)}
          hitSlop={8}>
          <X size={22} color={colors.text} />
        </Pressable>
      </View>
    );
  }

  const startScan = async () => {
    if (!canScanInvite) return;
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    setScanning(true);
  };

  // --- Not configured / loading ---
  if (!fam.configured) {
    return (
      <Screen>
        <StatusBanner tone="warn" title={t('family.notConfigured')} />
      </Screen>
    );
  }

  // --- Pending invite prompt ---
  if (fam.pendingInvite && !fam.hasGroup) {
    return (
      <Screen>
        <Stack gap="lg">
          <Body tone="textSecondary">{t('family.joinHint')}</Body>
          <TextField
            placeholder={t('family.namePlaceholder')}
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={40}
          />
          <Button
            title={t('family.join')}
            loading={fam.busy}
            onPress={() => void fam.acceptInvite(name.trim() || t('family.you'))}
          />
          <Button title={t('family.cancel')} variant="ghost" onPress={fam.dismissInvite} />
        </Stack>
      </Screen>
    );
  }

  // --- Onboarding (no group yet) ---
  if (!fam.hasGroup) {
    return (
      <>
        <InfoModal
          visible={privacyVisible}
          title={t('family.privacyTitle')}
          body={t('family.privacyBody')}
          closeLabel={t('family.cancel')}
          onClose={() => setPrivacyVisible(false)}
        />
        <Screen>
          <Stack gap="xxl">
            <FamilyEmptyArt />

            <Stack gap="md">
              <Body tone="textSecondary">{t('family.intro')}</Body>
              <ListRow
                title={t('family.privacyLink')}
                leading={
                  <IconTile color={colors.brand}>
                    <ShieldCheck size={18} color={colors.onBrand} />
                  </IconTile>
                }
                onPress={() => setPrivacyVisible(true)}
              />
            </Stack>

            <Card>
              <Stack gap="lg">
                <Stack gap="sm">
                  <SectionLabel>{t('family.yourName')}</SectionLabel>
                  <TextField
                    placeholder={t('family.namePlaceholder')}
                    value={name}
                    onChangeText={setName}
                    maxLength={40}
                  />
                </Stack>
                <Button
                  title={t('family.create')}
                  loading={fam.busy}
                  onPress={() => void fam.createFamily(name.trim() || t('family.you'))}
                />
              </Stack>
            </Card>

            <Stack gap="sm">
              <SectionLabel>{t('family.or')}</SectionLabel>
              <Button
                title={t('family.scan')}
                variant="secondary"
                leading={<UserPlus size={18} color={colors.text} />}
                onPress={() => void startScan()}
              />
            </Stack>
          </Stack>
        </Screen>
      </>
    );
  }

  // --- Group view ---
  const summary = summarizeFamily(fam.members);
  const sortedMembers = [...fam.members].sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status]);

  const onShare = async () => {
    try {
      const link = await fam.makeInviteLink();
      setInviteLink(link);
    } catch (e) {
      Alert.alert(t('common.error'), String(e));
    }
  };

  const confirmLeave = () =>
    Alert.alert(t('family.leave'), t('family.leaveConfirm'), [
      { text: t('family.cancel'), style: 'cancel' },
      { text: t('family.leave'), style: 'destructive', onPress: () => void fam.leaveFamily() },
    ]);

  const confirmRemove = (m: Member) =>
    Alert.alert(t('family.removeTitle'), t('family.removeConfirm', { name: m.name }), [
      { text: t('family.cancel'), style: 'cancel' },
      { text: t('family.remove'), style: 'destructive', onPress: () => void fam.removeMember(m.deviceId) },
    ]);

  const meIsOwner = fam.members.find((m) => m.isSelf)?.role === 'owner';

  return (
    <>
      <SafetyNumberModal
        visible={safetyVisible}
        code={fam.safetyNumber}
        colors={colors}
        onClose={() => setSafetyVisible(false)}
        title={t('family.safetyNumber')}
        body={t('family.safetyNumberBody')}
        doneLabel={t('family.safetyNumberDone')}
      />
      <Screen>
      <Stack gap="xxl">
        <FamilyStatusHero
          tone={summary.tone}
          icon={summary.icon}
          title={t(`family.${summary.titleKey}`)}
          subtitle={t('family.statusSummary', { safe: summary.safeCount, total: summary.total })}
          colors={colors}
        />

        <Stack gap="sm">
          <SectionLabel>{t('family.myStatus')}</SectionLabel>
          <ListGroup>
            {SETTABLE.map((s) => {
              const v = statusVisual(s, colors);
              return (
                <ListRow
                  key={s}
                  grouped
                  showChevron={false}
                  leading={
                    <IconTile color={v.color}>
                      <v.Icon size={18} color="#FFFFFF" />
                    </IconTile>
                  }
                  title={t(`family.${s}`)}
                  onPress={() => void fam.setStatus(s)}
                  trailing={
                    fam.myStatus === s ? <Check size={20} color={colors.brand} /> : undefined
                  }
                />
              );
            })}
          </ListGroup>
        </Stack>

        <Stack gap="sm">
          <SectionLabel>{`${t('family.members')} · ${fam.members.length}`}</SectionLabel>
          <ListGroup>
            {sortedMembers.map((m) => (
              <MemberRow
                key={m.deviceId}
                member={m}
                colors={colors}
                youLabel={t('family.you')}
                statusLabel={t(`family.${m.status}`)}
                canRemove={meIsOwner && !m.isSelf}
                onRemove={() => confirmRemove(m)}
              />
            ))}
          </ListGroup>
          {fam.safetyNumber ? (
            // Out-of-band MITM check: opens a modal with the comparable code.
            <ListRow
              title={t('family.safetyNumber')}
              subtitle={t('family.safetyNumberHint')}
              leading={
                <IconTile color={colors.brand}>
                  <Fingerprint size={18} color={colors.onBrand} />
                </IconTile>
              }
              onPress={() => setSafetyVisible(true)}
            />
          ) : null}
        </Stack>

        <Stack gap="sm">
          <SectionLabel>{t('family.invite')}</SectionLabel>
          {inviteLink ? (
            <Card variant="flat">
              <Stack gap="md" style={styles.center}>
                <View style={styles.qrFrame}>
                  <QRCode value={inviteLink} size={196} backgroundColor="#FFFFFF" color="#0F172A" />
                </View>
                <Caption align="center">{t('family.inviteHint')}</Caption>
                <Button
                  title={t('family.share')}
                  variant="secondary"
                  onPress={() => void Share.share({ message: inviteLink })}
                />
                <Button
                  title={t('family.closeInvite')}
                  variant="ghost"
                  leading={<X size={18} color={colors.brand} />}
                  onPress={() => setInviteLink(null)}
                />
              </Stack>
            </Card>
          ) : (
            <Button
              title={t('family.invite')}
              leading={<UserPlus size={18} color={colors.onBrand} />}
              onPress={() => void onShare()}
            />
          )}
        </Stack>

        <Button title={t('family.leave')} variant="ghost" onPress={confirmLeave} />
      </Stack>
      </Screen>
    </>
  );
}

function FamilyEmptyArt() {
  return (
    <Image
      source={FAMILY_EMPTY_IMAGE}
      style={styles.emptyArt}
      resizeMode="contain"
      accessible={false}
      accessibilityIgnoresInvertColors
    />
  );
}

function FamilyStatusHero({
  tone,
  icon: Icon,
  title,
  subtitle,
  colors,
}: {
  tone: 'safe' | 'warn' | 'alert';
  icon: LucideIcon;
  title: string;
  subtitle: string;
  colors: ThemeColors;
}) {
  const map = {
    safe: { bg: colors.safeBackground, fg: colors.safe },
    warn: { bg: colors.warnBackground, fg: colors.warn },
    alert: { bg: colors.alertBackground, fg: colors.alert },
  } as const;
  const v = map[tone];
  return (
    <View style={[styles.hero, { backgroundColor: v.bg }]}>
      <View style={[styles.heroIcon, { backgroundColor: v.fg }]}>
        <Icon size={30} color="#FFFFFF" />
      </View>
      <Heading align="center" style={{ color: v.fg }}>
        {title}
      </Heading>
      <Caption align="center">{subtitle}</Caption>
    </View>
  );
}

function MemberRow({
  member,
  colors,
  youLabel,
  statusLabel,
  canRemove,
  onRemove,
}: {
  member: Member;
  colors: ThemeColors;
  youLabel: string;
  statusLabel: string;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const { color, Icon } = statusVisual(member.status, colors);
  return (
    <ListRow
      grouped
      showChevron={false}
      leading={
        <IconTile color={color}>
          <Icon size={18} color="#FFFFFF" />
        </IconTile>
      }
      title={member.isSelf ? `${member.name} (${youLabel})` : member.name}
      subtitle={statusLabel}
      trailing={
        canRemove ? (
          <Pressable onPress={onRemove} hitSlop={10}>
            <Trash2 size={18} color={colors.textMuted} />
          </Pressable>
        ) : undefined
      }
    />
  );
}

function SafetyNumberModal({
  visible,
  code,
  colors,
  onClose,
  title,
  body,
  doneLabel,
}: {
  visible: boolean;
  code: string;
  colors: ThemeColors;
  onClose: () => void;
  title: string;
  body: string;
  doneLabel: string;
}) {
  // The code is groups of digits separated by spaces; lay them out a few groups
  // per line so it reads cleanly and is easy to compare aloud.
  const groups = code.split(/\s+/).filter(Boolean);
  const rows: string[] = [];
  for (let i = 0; i < groups.length; i += 4) {
    rows.push(groups.slice(i, i + 4).join(' '));
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={doneLabel}
          style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}
          onPress={onClose}
        />
        <View style={styles.modalContent} pointerEvents="box-none">
          <Card>
            <Stack gap="lg">
              <Stack gap="sm" style={styles.center}>
                <IconTile color={colors.brand}>
                  <Fingerprint size={18} color={colors.onBrand} />
                </IconTile>
                <Heading align="center">{title}</Heading>
              </Stack>
              <View style={[styles.codeBox, { backgroundColor: colors.surfaceMuted }]}>
                {rows.map((row, i) => (
                  <Text
                    key={i}
                    selectable
                    style={[styles.codeText, { color: colors.text }]}>
                    {row}
                  </Text>
                ))}
              </View>
              <Body tone="textSecondary" align="center">
                {body}
              </Body>
              <Button title={doneLabel} variant="secondary" onPress={onClose} />
            </Stack>
          </Card>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  emptyArt: {
    width: '100%',
    maxWidth: 340,
    height: 220,
    alignSelf: 'center',
  },
  hero: {
    borderRadius: radius.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  center: {
    alignItems: 'center',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  modalContent: {
    alignSelf: 'stretch',
  },
  codeBox: {
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 20,
    lineHeight: 30,
    letterSpacing: 3,
    fontWeight: '600',
    textAlign: 'center',
  },
  qrFrame: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#FFFFFF',
  },
  scanRoot: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scanCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  scanHint: {
    position: 'absolute',
    top: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scanClose: {
    position: 'absolute',
    top: 60,
    right: spacing.xl,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
