import { Pressable, StyleSheet } from 'react-native';
import { Link } from 'expo-router';

import { Body, Heading } from '@/components/ui/Typography';
import { Card } from '@/components/ui/Card';
import { Stack } from '@/components/ui/Stack';
import { minTouchTarget } from '@/constants/design';
import type { GuideId } from '@/lib/db/types';

type GuideCardProps = {
  id: GuideId;
  title: string;
  description: string;
};

export function GuideCard({ id, title, description }: GuideCardProps) {
  return (
    <Link href={`/guide/${id}` as never} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={title}
        style={styles.pressable}>
        {({ pressed }) => (
          <Card style={pressed ? styles.pressed : null}>
            <Stack gap="xs">
              <Heading>{title}</Heading>
              <Body tone="textSecondary">{description}</Body>
            </Stack>
          </Card>
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minHeight: minTouchTarget,
  },
  pressed: {
    opacity: 0.85,
  },
});
