import Svg, { ClipPath, Defs, G, Rect } from 'react-native-svg';

export type FlagCode = 'LT' | 'EE' | 'LV' | 'PL';

const W = 26;
const H = 18;

// Horizontal bands, top → bottom, as fractions of height.
const FLAGS: Record<FlagCode, { c: string; from: number; to: number }[]> = {
  LT: [
    { c: '#FDB913', from: 0, to: 1 / 3 },
    { c: '#006A44', from: 1 / 3, to: 2 / 3 },
    { c: '#C1272D', from: 2 / 3, to: 1 },
  ],
  EE: [
    { c: '#0072CE', from: 0, to: 1 / 3 },
    { c: '#0A0A0A', from: 1 / 3, to: 2 / 3 },
    { c: '#FFFFFF', from: 2 / 3, to: 1 },
  ],
  LV: [
    { c: '#9E1B32', from: 0, to: 0.4 },
    { c: '#FFFFFF', from: 0.4, to: 0.6 },
    { c: '#9E1B32', from: 0.6, to: 1 },
  ],
  PL: [
    { c: '#FFFFFF', from: 0, to: 0.5 },
    { c: '#D4213D', from: 0.5, to: 1 },
  ],
};

/** A small rounded country flag drawn as SVG bands (no emoji, per the design rules). */
export function Flag({ code }: { code: FlagCode }) {
  const clip = `flag-${code}`;
  return (
    <Svg width={W} height={H}>
      <Defs>
        <ClipPath id={clip}>
          <Rect x={0} y={0} width={W} height={H} rx={3} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clip})`}>
        {FLAGS[code].map((b, i) => (
          <Rect
            key={i}
            x={0}
            y={b.from * H}
            width={W}
            height={(b.to - b.from) * H + 0.5}
            fill={b.c}
          />
        ))}
      </G>
      {/* Hairline border so white bands read against the surface. */}
      <Rect
        x={0.5}
        y={0.5}
        width={W - 1}
        height={H - 1}
        rx={3}
        fill="none"
        stroke="rgba(0,0,0,0.15)"
        strokeWidth={1}
      />
    </Svg>
  );
}
