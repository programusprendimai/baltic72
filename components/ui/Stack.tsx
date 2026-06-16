import { View, type ViewProps } from 'react-native';

import { spacing, type SpacingToken } from '@/constants/design';

type StackProps = ViewProps & {
  gap?: SpacingToken;
  direction?: 'vertical' | 'horizontal';
  align?: 'flex-start' | 'flex-end' | 'center' | 'stretch';
  justify?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around';
  wrap?: boolean;
};

export function Stack({
  gap = 'md',
  direction = 'vertical',
  align,
  justify,
  wrap = false,
  style,
  children,
  ...rest
}: StackProps) {
  return (
    <View
      style={[
        {
          flexDirection: direction === 'vertical' ? 'column' : 'row',
          gap: spacing[gap],
          alignItems: align,
          justifyContent: justify,
          flexWrap: wrap ? 'wrap' : 'nowrap',
        },
        style,
      ]}
      {...rest}>
      {children}
    </View>
  );
}
