import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import Colors from '@/constants/Colors';
import { radius, spacing, typography } from '@/constants/design';
import { useColorScheme } from '@/components/useColorScheme';

type TextFieldProps = TextInputProps;

/** Single-line text input that matches the design-system surface/border/radius. */
export function TextField(props: TextFieldProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      {...props}
      style={[
        styles.input,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          color: colors.text,
        },
        props.style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: typography.body.fontSize,
  },
});
