import { Canvas, DashPathEffect, Group, Line, Path, Rect, Skia, Text as SkText, matchFont, vec } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

import type { Candle } from '@/market/candles';
import { formatPrice, priceDecimals } from '@/trading/format';

import { colors } from './theme';

const AXIS_W = 60; // right-hand price labels
const VOLUME_SHARE = 0.16;
const TOP = 22; // room for the OHLC readout
const font = matchFont({ fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 10 });

type Props = { candles: Candle[]; width: number; height: number; loading?: boolean };

/**
 * Candles drawn with Skia. Geometry is rebuilt only when the candle array changes, which the
 * frame batcher limits to once per frame. The crosshair is driven entirely on the UI thread:
 * the finger position, the candle under it and the readout text never touch React state,
 * so dragging stays smooth even while the JS thread is busy with market data.
 */
export function CandleChart({ candles, width, height, loading }: Props) {
  const plotW = width - AXIS_W;
  const priceH = height * (1 - VOLUME_SHARE) - TOP;
  const volTop = TOP + priceH + 6;
  const volH = height - volTop;

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
    candles.forEach((c, i) => {
      const x = i * step + (step - bodyW) / 2;
      const mid = i * step + step / 2;
      const path = c.c >= c.o ? up : down;
      path.addRect(Skia.XYWHRect(mid - 0.5, y(c.h), 1, Math.max(1, y(c.l) - y(c.h))));
      const top = y(Math.max(c.o, c.c));
      path.addRect(Skia.XYWHRect(x, top, bodyW, Math.max(1, y(Math.min(c.o, c.c)) - top)));
      const vh = vMax > 0 ? (c.v / vMax) * volH : 0;
      (c.c >= c.o ? upVol : downVol).addRect(Skia.XYWHRect(x, volTop + volH - vh, bodyW, vh));
    });

    const last = candles[n - 1];
    const lastY = y(last.c);
    const grid = [0.2, 0.4, 0.6, 0.8].map((f) => {
      const p = hi - (hi - lo) * f;
      // Hide a label that would collide with the last-price tag.
      return { y: y(p), label: Math.abs(y(p) - lastY) < 14 ? '' : formatPrice(p) };
    });
    return {
      n, lo, hi, step, grid, lastY,
      up: up.detach(),
      down: down.detach(),
      upVol: upVol.detach(),
      downVol: downVol.detach(),
      lastUp: last.c >= last.o,
      lastLabel: formatPrice(last.c),
    };
  }, [candles, plotW, priceH, volTop, volH]);

  // Plain arrays the UI thread can read while the user drags.
  const series = useSharedValue({ o: [] as number[], h: [] as number[], l: [] as number[], c: [] as number[], lo: 0, hi: 1, step: 1, d: 2 });
  useEffect(() => {
    if (!g) return;
    series.value = {
      o: candles.map((c) => c.o),
      h: candles.map((c) => c.h),
      l: candles.map((c) => c.l),
      c: candles.map((c) => c.c),
      lo: g.lo,
      hi: g.hi,
      step: g.step,
      d: priceDecimals(candles[candles.length - 1].c),
    };
  }, [g, candles, series]);

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
  const crossOpacity = useDerivedValue(() => (active.value ? 1 : 0));
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

  return (
    <GestureDetector gesture={pan}>
      <Canvas style={{ width, height }} testID="candle-chart">
        {g.grid.map((line) => (
          <Group key={line.label + line.y}>
            <Line p1={vec(0, line.y)} p2={vec(plotW, line.y)} color={colors.border} strokeWidth={1} />
            <SkText x={plotW + 6} y={line.y + 3} text={line.label} font={font} color={colors.textFaint} />
          </Group>
        ))}
        <Path path={g.upVol} color={colors.upFaint} />
        <Path path={g.downVol} color={colors.downFaint} />
        <Path path={g.up} color={colors.up} />
        <Path path={g.down} color={colors.down} />

        <Line p1={vec(0, g.lastY)} p2={vec(plotW, g.lastY)} color={lastColor} strokeWidth={1} opacity={0.7}>
          <DashPathEffect intervals={[3, 3]} />
        </Line>
        <Rect x={plotW + 2} y={g.lastY - 8} width={AXIS_W - 4} height={16} color={lastColor} />
        <SkText x={plotW + 6} y={g.lastY + 3} text={g.lastLabel} font={font} color={colors.onAccent} />

        <Group opacity={crossOpacity}>
          <Line p1={vTop} p2={vBottom} color={colors.textMuted} strokeWidth={1}>
            <DashPathEffect intervals={[4, 4]} />
          </Line>
          <Line p1={hLeft} p2={hRight} color={colors.textMuted} strokeWidth={1}>
            <DashPathEffect intervals={[4, 4]} />
          </Line>
          <SkText x={4} y={12} text={readout} font={font} color={colors.text} />
        </Group>
      </Canvas>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});
