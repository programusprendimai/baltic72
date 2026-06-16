import { StyleSheet, View } from 'react-native';

import { spacing } from '@/constants/design';
import { Body, Title } from '@/components/ui/Typography';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
};

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <View style={styles.wrap}>
      <Title>{title}</Title>
      {subtitle ? (
        <Body tone="textSecondary" style={styles.subtitle}>
          {subtitle}
        </Body>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.xxl,
  },
  subtitle: {
    marginTop: spacing.sm,
  },
});
