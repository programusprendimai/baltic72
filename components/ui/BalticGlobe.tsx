import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, Path } from 'react-native-svg';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { REGION_BBOX, REGION_ORDER, REGION_PATHS } from '@/constants/baltic-geo';

function clamp8(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Multiply a #RRGGBB colour toward black — used for the country outline. */
function darken(hex: string, factor: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgb(${clamp8(((n >> 16) & 255) * factor)}, ${clamp8(((n >> 8) & 255) * factor)}, ${clamp8((n & 255) * factor)})`;
}

/** Drives the colour of the focused region. Default `safe` = green. */
export type GlobeTone = 'safe' | 'warn' | 'alert' | 'brand';

type Props = {
  tone?: GlobeTone;
  size?: number;
  /** Kept for API compatibility; the flat globe has no animated glow. */
  pulse?: boolean;
  label?: string;
};

let _gid = 0;

/**
 * A clean flat-vector globe: a solid ocean disc, a simple graticule, and the
 * Baltics + Poland filled in the status tone. No gradients, glows, or shadows —
 * the region colour is tone-driven, so an alert state is a one-prop flip.
 */
export function BalticGlobe({ tone = 'safe', size = 240, label }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const dark = scheme === 'dark';
  const colors = Colors[scheme];
  const uid = useMemo(() => `globe${_gid++}`, []);

  const C = size / 2;
  const R = size * 0.45;

  const region =
    tone === 'alert'
      ? colors.alert
      : tone === 'warn'
        ? colors.warn
        : tone === 'brand'
          ? colors.brand
          : colors.safe;
  const outline = darken(region, dark ? 0.78 : 0.6);

  // Flat palette (theme-aware): white ocean, neutral-gray graticule.
  const ocean = dark ? '#162033' : '#FFFFFF';
  const grid = dark ? '#3A4858' : '#D2D8E0';
  const rim = dark ? '#46526A' : '#C2C9D3';

  // Fit the combined region (Baltics + Poland) to ~76% of the disc, centred.
  const [minX, minY, maxX, maxY] = REGION_BBOX;
  const cw = maxX - minX;
  const ch = maxY - minY;
  const s = (R * 1.5) / Math.max(cw, ch);
  const tx = C - s * (minX + cw / 2);
  const ty = C - s * (minY + ch / 2);
  const transform = `translate(${tx}, ${ty}) scale(${s})`;

  // Graticule: parallels bow toward the poles, meridians are ellipses.
  const halfWidth = (dy: number) => Math.sqrt(Math.max(R * R - dy * dy, 0));
  const parallels = [-0.66, -0.34, 0, 0.34, 0.66].map((f) => f * R);
  const meridians = [0.34, 0.66].map((f) => f * R);
  const parallelPath = (dy: number) => {
    const w = halfWidth(dy);
    return `M ${C - w} ${C + dy} Q ${C} ${C + dy * 1.34} ${C + w} ${C + dy}`;
  };

  return (
    <View
      style={{ width: size, height: size }}
      accessibilityRole="image"
      accessibilityLabel={label}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <ClipPath id={`${uid}-disc`}>
            <Circle cx={C} cy={C} r={R} />
          </ClipPath>
        </Defs>

        <G clipPath={`url(#${uid}-disc)`}>
          {/* Flat ocean */}
          <Circle cx={C} cy={C} r={R} fill={ocean} />

          {/* Graticule */}
          <G stroke={grid} strokeWidth={1.2} fill="none">
            {parallels.map((dy, i) => (
              <Path key={`p${i}`} d={parallelPath(dy)} />
            ))}
            <Line x1={C} y1={C - R} x2={C} y2={C + R} />
            {meridians.map((rx, i) => (
              <Ellipse key={`m${i}`} cx={C} cy={C} rx={rx} ry={R} />
            ))}
          </G>

          {/* Focused region: Baltics + Poland, flat fill + clean outline */}
          <G transform={transform}>
            {REGION_ORDER.map((code) => (
              <Path
                key={code}
                d={REGION_PATHS[code]}
                fill={region}
                stroke={outline}
                strokeWidth={1.4 / s}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          </G>
        </G>

        {/* Rim */}
        <Circle cx={C} cy={C} r={R} fill="none" stroke={rim} strokeWidth={1.6} />
      </Svg>
    </View>
  );
}
