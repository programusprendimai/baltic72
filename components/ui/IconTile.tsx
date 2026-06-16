import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius } from '@/constants/design';

const TILE = 30;

type IconTileProps = {
  /** Background fill of the tile (a semantic hex from Colors, passed by the screen). */
  color: string;
  /** Icon element; rendered centered. Size it to ~18 and color it white. */
  children: ReactNode;
};

/**
 * The rounded, color-filled icon square used at the leading edge of an iOS-style
 * settings row. Fixed 30 × 30 so every row's text aligns to the same baseline.
 */
export function IconTile({ color, children }: IconTileProps) {
  return (
    <View style={[styles.tile, { backgroundColor: color }]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.sm - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
