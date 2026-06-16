import { Children, Fragment, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import Colors from '@/constants/Colors';
import { radius, spacing } from '@/constants/design';
import { useColorScheme } from '@/components/useColorScheme';

type ListGroupProps = {
  children: ReactNode;
  /**
   * Left inset of the hairline separators, so they begin at the row text rather
   * than under the leading icon. Defaults to align past a 30 pt IconTile.
   */
  separatorInset?: number;
};

const DEFAULT_INSET = spacing.lg + 30 + spacing.md;

/**
 * iOS-style grouped, inset list container. Renders its `<ListRow>` children
 * inside a single rounded surface card and draws a hairline separator between
 * each, with none after the last. Pass rows in `grouped` mode.
 */
export function ListGroup({ children, separatorInset = DEFAULT_INSET }: ListGroupProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const rows = Children.toArray(children).filter(Boolean);

  return (
    <View
      style={[
        styles.group,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}>
      {rows.map((child, i) => (
        <Fragment key={i}>
          {child}
          {i < rows.length - 1 ? (
            <View
              style={[
                styles.separator,
                { backgroundColor: colors.border, marginLeft: separatorInset },
              ]}
            />
          ) : null}
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
});
