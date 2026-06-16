import { StyleSheet, View } from 'react-native';

import { spacing } from '@/constants/design';
import { Label } from '@/components/ui/Typography';

type SectionLabelProps = {
  children: string;
  trailing?: React.ReactNode;
};

export function SectionLabel({ children, trailing }: SectionLabelProps) {
  return (
    <View style={styles.row}>
      <Label style={styles.label}>{children}</Label>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  label: {
    flexShrink: 1,
  },
});
