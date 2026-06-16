import { Modal, Pressable, StyleSheet, View } from 'react-native';

import Colors from '@/constants/Colors';
import { spacing } from '@/constants/design';
import { useColorScheme } from '@/components/useColorScheme';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Stack } from '@/components/ui/Stack';
import { Body, Heading } from '@/components/ui/Typography';

type InfoModalProps = {
  visible: boolean;
  title: string;
  body: string;
  closeLabel: string;
  onClose: () => void;
};

export function InfoModal({
  visible,
  title,
  body,
  closeLabel,
  onClose,
}: InfoModalProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          style={[styles.backdrop, { backgroundColor: colors.overlay }]}
          onPress={onClose}
        />
        <View style={styles.content} pointerEvents="box-none">
          <Card>
            <Stack gap="lg">
              <Stack gap="sm">
                <Heading>{title}</Heading>
                <Body tone="textSecondary">{body}</Body>
              </Stack>
              <Button title={closeLabel} variant="secondary" onPress={onClose} />
            </Stack>
          </Card>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  content: {
    alignSelf: 'stretch',
  },
});
