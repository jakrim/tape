import {
  Canvas,
  Circle,
  DashPathEffect,
  Group,
  Line,
  LinearGradient,
  Path,
  Rect,
  Skia,
  Text as SkText,
  matchFont,
  type SkPoint,
  vec,
} from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Easing,
  type DerivedValue,
  useAnimatedReaction,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { Candle } from '@/market/candles';
import { formatPrice, priceDecimals } from '@/trading/format';

import { haptic } from './haptics';
import { colors } from './theme';

const AXIS_W = 60; // right-hand price labels
const VOLUME_SHARE = 0.16;
const TOP = 22; // room for the OHLC readout
const font = matchFont({ fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 10 });

export type ChartMode = 'candles' | 'line';

type Props = { candles: Candle[]; width: number; height: number; loading?: boolean; mode?: ChartMode };

/**
 * Price chart drawn with Skia, as candles or as a line with a gradient fill.
 * Geometry is rebuilt only when the candle array changes, which the frame batcher limits to
 * once per frame, and each mode is a handful of paths however many candles there are.
 * The crosshair runs entirely on the UI thread: the finger position, the candle under it and
 * the readout never touch React state, so scrubbing stays smooth while prices stream in.
 * Crossing a candle gives a light haptic tick, like scrubbing a picker.
 */
export function CandleChart({ candles, width, height, loading, mode = 'candles' }: Props) {
  const plotW = width - AXIS_W;
  const priceH = height * (1 - VOLUME_SHARE) - TOP;
  const volTop = TOP + priceH + 6;
  const volH = height - volTop;
  const reduceMotion = useReducedMotion();

  const g = useMemo(() => {
    const n = candles.length;
    if (n < 2 || plotW <= 0) return null;
    let lo = Infinity;
    let hi = -Infinity;
    let vMax = 0;
    for (const c of candles) {
      if (c.l < lo) lo = c.l;
      if (c.h > hi) hi = c.h;
      if (c.v > vMax) vMax = c.v;
    }
    const pad = (hi - lo) * 0.06 || hi * 0.001;
    lo -= pad;
    hi += pad;
    const step = plotW / n;
    const bodyW = Math.max(1, step * 0.62);
    const y = (p: number) => TOP + ((hi - p) / (hi - lo)) * priceH;

    const up = Skia.PathBuilder.Make();
    const down = Skia.PathBuilder.Make();
    const upVol = Skia.PathBuilder.Make();
    const downVol = Skia.PathBuilder.Make();
    const line = Skia.PathBuilder.Make();
    const area = Skia.PathBuilder.Make();
    candles.forEach((c, i) => {
      const x = i * step + (step - bodyW) / 2;
      const mid = i * step + step / 2;
      const path = c.c >= c.o ? up : down;
      path.addRect(Skia.XYWHRect(mid - 0.5, y(c.h), 1, Math.max(1, y(c.l) - y(c.h))));
      const top = y(Math.max(c.o, c.c));
      path.addRect(Skia.XYWHRect(x, top, bodyW, Math.max(1, y(Math.min(c.o, c.c)) - top)));
      const vh = vMax > 0 ? (c.v / vMax) * volH : 0;
      (c.c >= c.o ? upVol : downVol).addRect(Skia.XYWHRect(x, volTop + volH - vh, bodyW, vh));
      if (i === 0) {
        line.moveTo(mid, y(c.c));
        area.moveTo(mid, TOP + priceH);
        area.lineTo(mid, y(c.c));
      } else {
        line.lineTo(mid, y(c.c));
        area.lineTo(mid, y(c.c));
      }
    });
    const first = candles[0];
    const last = candles[n - 1];
    area.lineTo((n - 1) * step + step / 2, TOP + priceH);
    area.close();

    const lastY = y(last.c);
    const grid = [0.2, 0.4, 0.6, 0.8].map((f) => {
      const p = hi - (hi - lo) * f;
      // Hide a label that would collide with the last-price tag.
      return { y: y(p), label: Math.abs(y(p) - lastY) < 14 ? '' : formatPrice(p) };
    });
    return {
      n, lo, hi, step, grid, lastY,
      lastX: (n - 1) * step + step / 2,
      up: up.detach(),
      down: down.detach(),
      upVol: upVol.detach(),
      downVol: downVol.detach(),
      line: line.detach(),
      area: area.detach(),
      lastUp: last.c >= last.o,
      periodUp: last.c >= first.o,
      lastLabel: formatPrice(last.c),
    };
  }, [candles, plotW, priceH, volTop, volH]);

  // Plain arrays the UI thread can read while the user drags.
  const series = useSharedValue({ o: [] as number[], h: [] as number[], l: [] as number[], c: [] as number[], lo: 0, hi: 1, step: 1, d: 2 });
  useEffect(() => {
    if (!g) return;
    series.set({
      o: candles.map((c) => c.o),
      h: candles.map((c) => c.h),
      l: candles.map((c) => c.l),
      c: candles.map((c) => c.c),
      lo: g.lo,
      hi: g.hi,
      step: g.step,
      d: priceDecimals(candles[candles.length - 1].c),
    });
  }, [g, candles, series]);

  // The live dot's position is a shared value too, so the animated layers below never re-render
  // when a candle updates. (Skia reads shared-value props when a layer re-renders.)
  const dotX = useSharedValue(0);
  const dotY = useSharedValue(0);
  useEffect(() => {
    if (!g) return;
    dotX.set(g.lastX);
    dotY.set(g.lastY);
  }, [g, dotX, dotY]);

  const active = useSharedValue(false);
  const touchX = useSharedValue(0);

  const pan = Gesture.Pan()
    .activateAfterLongPress(120)
    .onStart((e) => {
      active.value = true;
      touchX.value = e.x;
    })
    .onUpdate((e) => {
      touchX.value = e.x;
    })
    .onFinalize(() => {
      active.value = false;
    });

  const index = useDerivedValue(() => {
    const s = series.value;
    const i = Math.floor(touchX.value / s.step);
    return Math.min(Math.max(i, 0), Math.max(s.c.length - 1, 0));
  });

  // A firmer tick when the crosshair appears, then a light tick per candle crossed.
  useAnimatedReaction(
    () => (active.value ? index.value : -1),
    (current, previous) => {
      if (current < 0 || current === previous) return;
      scheduleOnRN(haptic, previous === -1 || previous === null ? 'select' : 'tick');
    },
  );

  const crossX = useDerivedValue(() => index.value * series.value.step + series.value.step / 2);
  const crossY = useDerivedValue(() => {
    const s = series.value;
    const c = s.c[index.value] ?? s.lo;
    return TOP + ((s.hi - c) / (s.hi - s.lo)) * priceH;
  });
  const vTop = useDerivedValue(() => vec(crossX.value, TOP));
  const vBottom = useDerivedValue(() => vec(crossX.value, height));
  const hLeft = useDerivedValue(() => vec(0, crossY.value));
  const hRight = useDerivedValue(() => vec(plotW, crossY.value));
  const crossOpacity = useDerivedValue<number>(() => (active.value ? 1 : 0));
  const readout = useDerivedValue(() => {
    const s = series.value;
    const i = index.value;
    if (!active.value || s.c[i] === undefined) return '';
    const f = (n: number) => n.toFixed(s.d);
    return `O ${f(s.o[i])}  H ${f(s.h[i])}  L ${f(s.l[i])}  C ${f(s.c[i])}`;
  });

  if (!g) {
    return (
      <View style={[styles.placeholder, { width, height }]}>
        {loading ? <ActivityIndicator color={colors.textFaint} /> : null}
      </View>
    );
  }

  const lastColor = g.lastUp ? colors.up : colors.down;
  const lineColor = g.periodUp ? colors.up : colors.down;

  return (
    <GestureDetector gesture={pan}>
      <Canvas style={{ width, height }} testID="candle-chart">
        {g.grid.map((gridLine) => (
          <Group key={gridLine.label + gridLine.y}>
            <Line p1={vec(0, gridLine.y)} p2={vec(plotW, gridLine.y)} color={colors.border} strokeWidth={1} />
            <SkText x={plotW + 6} y={gridLine.y + 3} text={gridLine.label} font={font} color={colors.textFaint} />
          </Group>
        ))}
        <Path path={g.upVol} color={colors.upFaint} />
        <Path path={g.downVol} color={colors.downFaint} />

        {mode === 'candles' ? (
          <>
            <Path path={g.up} color={colors.up} />
            <Path path={g.down} color={colors.down} />
          </>
        ) : (
          <>
            <Path path={g.area}>
              <LinearGradient
                start={vec(0, TOP)}
                end={vec(0, TOP + priceH)}
                colors={[g.periodUp ? 'rgba(70,255,4,0.28)' : 'rgba(255,77,106,0.28)', 'rgba(0,0,0,0)']}
              />
            </Path>
            <Path path={g.line} color={lineColor} style="stroke" strokeWidth={2} strokeJoin="round" strokeCap="round" />
          </>
        )}

        <Line p1={vec(0, g.lastY)} p2={vec(plotW, g.lastY)} color={lastColor} strokeWidth={1} opacity={0.6}>
          <DashPathEffect intervals={[3, 3]} />
        </Line>
        <LiveDot x={dotX} y={dotY} color={lastColor} animate={!reduceMotion} />
        <Rect x={plotW + 2} y={g.lastY - 8} width={AXIS_W - 4} height={16} color={lastColor} />
        <SkText x={plotW + 6} y={g.lastY + 3} text={g.lastLabel} font={font} color={colors.onAccent} />

        <Crosshair
          opacity={crossOpacity}
          vTop={vTop}
          vBottom={vBottom}
          hLeft={hLeft}
          hRight={hRight}
          x={crossX}
          y={crossY}
          readout={readout}
        />
      </Canvas>
    </GestureDetector>
  );
}

/** Pulsing ring at the last price. Props are shared values, so it renders once. */
const LiveDot = memo(function LiveDot({ x, y, color, animate }: { x: DerivedValue<number>; y: DerivedValue<number>; color: string; animate: boolean }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (animate) pulse.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false));
  }, [pulse, animate]);
  const ringR = useDerivedValue(() => 3 + pulse.value * 9);
  const ringOpacity = useDerivedValue(() => 0.45 * (1 - pulse.value));
  return (
    <>
      <Circle cx={x} cy={y} r={ringR} color={color} opacity={ringOpacity} />
      <Circle cx={x} cy={y} r={3} color={color} />
    </>
  );
});

type CrosshairProps = {
  opacity: DerivedValue<number>;
  vTop: DerivedValue<SkPoint>;
  vBottom: DerivedValue<SkPoint>;
  hLeft: DerivedValue<SkPoint>;
  hRight: DerivedValue<SkPoint>;
  x: DerivedValue<number>;
  y: DerivedValue<number>;
  readout: DerivedValue<string>;
};

/** Crosshair layer, driven entirely by shared values: it renders once and animates on the UI thread. */
const Crosshair = memo(function Crosshair(p: CrosshairProps) {
  return (
    <Group opacity={p.opacity}>
      <Line p1={p.vTop} p2={p.vBottom} color={colors.textMuted} strokeWidth={1}>
        <DashPathEffect intervals={[4, 4]} />
      </Line>
      <Line p1={p.hLeft} p2={p.hRight} color={colors.textMuted} strokeWidth={1}>
        <DashPathEffect intervals={[4, 4]} />
      </Line>
      <Circle cx={p.x} cy={p.y} r={4} color={colors.text} />
      <SkText x={4} y={12} text={p.readout} font={font} color={colors.text} />
    </Group>
  );
});

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});
