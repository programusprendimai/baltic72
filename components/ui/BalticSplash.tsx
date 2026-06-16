import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';

import { Title } from '@/components/ui/Typography';
import { spacing } from '@/constants/design';
import {
  REGION_BBOX_BY_CODE,
  REGION_FLAG_BANDS,
  REGION_LENGTH,
  REGION_ORDER,
  REGION_PATHS,
  REGION_SIZE,
  REGION_VIEWBOX,
  type RegionCode,
} from '@/constants/baltic-geo';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

const BG = '#F8FAFC';
const OUTLINE = '#1B4D8C';
const STROKE_W = 1.1;

// Timeline (ms)
const DRAW_MS = 1200;
const FILL_MS = 750;
const FILL_BASE_DELAY = 850;
const FILL_STAGGER = 200;
const HOLD_MS = 600;
const FADE_OUT_MS = 450;
const TOTAL_BEFORE_OUT =
  FILL_BASE_DELAY + FILL_STAGGER * (REGION_ORDER.length - 1) + FILL_MS + HOLD_MS;

type Props = { onDone: () => void };

export function BalticSplash({ onDone }: Props) {
  const { width, height } = useWindowDimensions();

  // Fit the map within ~64% of the screen, keeping aspect ratio.
  const maxW = width * 0.64;
  const maxH = height * 0.6;
  const aspect = REGION_SIZE.width / REGION_SIZE.height;
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }

  const draw = useSharedValue(0);
  const fillEE = useSharedValue(0);
  const fillLV = useSharedValue(0);
  const fillLT = useSharedValue(0);
  const fillPL = useSharedValue(0);
  const fills: Record<RegionCode, typeof fillEE> = {
    EE: fillEE,
    LV: fillLV,
    LT: fillLT,
    PL: fillPL,
  };

  const containerOpacity = useSharedValue(0);
  const containerScale = useSharedValue(0.94);
  const wordmark = useSharedValue(0);

  useEffect(() => {
    containerOpacity.value = withTiming(1, { duration: 320 });
    containerScale.value = withTiming(1, {
      duration: 620,
      easing: Easing.out(Easing.cubic),
    });
    draw.value = withTiming(1, {
      duration: DRAW_MS,
      easing: Easing.inOut(Easing.cubic),
    });

    REGION_ORDER.forEach((code, i) => {
      fills[code].value = withDelay(
        FILL_BASE_DELAY + i * FILL_STAGGER,
        withTiming(1, { duration: FILL_MS, easing: Easing.out(Easing.cubic) })
      );
    });

    wordmark.value = withDelay(
      FILL_BASE_DELAY + FILL_STAGGER * (REGION_ORDER.length - 1) + 250,
      withTiming(1, { duration: 500 })
    );

    const id = setTimeout(() => {
      containerOpacity.value = withTiming(
        0,
        { duration: FADE_OUT_MS, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(onDone)();
        }
      );
    }, TOTAL_BEFORE_OUT);

    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
    transform: [{ scale: containerScale.value }],
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmark.value,
    transform: [{ translateY: (1 - wordmark.value) * 8 }],
  }));

  return (
    <View style={[StyleSheet.absoluteFill, styles.root]}>
      <Animated.View style={[styles.center, containerStyle]}>
        <Svg width={w} height={h} viewBox={REGION_VIEWBOX}>
          <Defs>
            {REGION_ORDER.map((code) => (
              <ClipPath key={code} id={`clip-${code}`}>
                <Path d={REGION_PATHS[code]} />
              </ClipPath>
            ))}
          </Defs>

          {/* Flag-colored fills, clipped to each country and revealed in turn */}
          {REGION_ORDER.map((code) => (
            <CountryFill key={code} code={code} progress={fills[code]} />
          ))}

          {/* Outlines drawn on top with a stroke-draw animation */}
          {REGION_ORDER.map((code) => (
            <CountryOutline key={code} code={code} draw={draw} />
          ))}
        </Svg>

        <Animated.View style={wordmarkStyle}>
          <Title tone="brand" align="center" style={styles.wordmark}>
            Baltic72
          </Title>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function CountryFill({
  code,
  progress,
}: {
  code: RegionCode;
  progress: { value: number };
}) {
  const [minX, minY, maxX, maxY] = REGION_BBOX_BY_CODE[code];
  const w = maxX - minX;
  const hgt = maxY - minY;

  const animatedProps = useAnimatedProps(() => ({ opacity: progress.value }));

  return (
    <AnimatedG
      clipPath={`url(#clip-${code})`}
      animatedProps={animatedProps}>
      {REGION_FLAG_BANDS[code].map((band, i) => {
        const y = minY + band.from * hgt;
        const bh = (band.to - band.from) * hgt;
        return (
          <Rect
            key={i}
            x={minX - 1}
            y={y - 0.3}
            width={w + 2}
            height={bh + 0.6}
            fill={band.color}
          />
        );
      })}
    </AnimatedG>
  );
}

function CountryOutline({
  code,
  draw,
}: {
  code: RegionCode;
  draw: { value: number };
}) {
  const len = REGION_LENGTH[code];
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: len * (1 - draw.value),
  }));

  return (
    <AnimatedPath
      d={REGION_PATHS[code]}
      fill="none"
      stroke={OUTLINE}
      strokeWidth={STROKE_W}
      strokeLinejoin="round"
      strokeLinecap="round"
      strokeDasharray={len}
      animatedProps={animatedProps}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    marginTop: spacing.xxl,
    letterSpacing: 0.5,
  },
});
