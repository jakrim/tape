import { router } from 'expo-router';
import { memo, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { useMarkets } from '@/market/markets';
import { formatPct, formatPrice, formatUsdCompact } from '@/trading/format';

import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { colors, radius, space } from './theme';

export const MARKET_ROW_HEIGHT = 64;

/**
 * One market. Subscribes to its own coin only, so a price change in BTC re-renders the BTC
 * row and nothing else. The up/down flash runs on the UI thread.
 */
export const MarketRow = memo(function MarketRow({ coin }: { coin: string }) {
  const perp = useMarkets((s) => s.perpByCoin[coin]);
  const ctx = useMarkets((s) => s.ctxByCoin[coin]);

  const flash = useSharedValue(0); // 1 = flashed up, -1 = flashed down, 0 = rest
  const lastPx = useRef<number | undefined>(undefined);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const px = ctx?.markPx;
    if (!reduceMotion && px !== undefined && lastPx.current !== undefined && px !== lastPx.current) {
      flash.set(px > lastPx.current ? 1 : -1);
      flash.set(withTiming(0, { duration: 700 }));
    }
    lastPx.current = px;
  }, [ctx?.markPx, flash, reduceMotion]);

  const flashStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(flash.value, [-1, 0, 1], [colors.downFaint, 'transparent', colors.upFaint]),
  }));

  if (!perp) return null;
  const change = ctx && ctx.prevDayPx > 0 ? (ctx.markPx - ctx.prevDayPx) / ctx.prevDayPx : null;
  const up = (change ?? 0) >= 0;

  return (
    <PressableScale
      scaleTo={0.985}
      testID={`market-row-${coin}`}
      accessibilityRole="button"
      accessibilityLabel={`${coin} ${ctx ? formatPrice(ctx.markPx) : ''}`}
      onPress={() => router.push({ pathname: '/market/[coin]', params: { coin } })}
      style={styles.row}>
      <View style={styles.left}>
        <View style={styles.nameLine}>
          <Text variant="heading">{coin}</Text>
          <View style={styles.levBadge}>
            <Text variant="label" tone="muted">
              {perp.maxLeverage}x
            </Text>
          </View>
        </View>
        <Text variant="numSmall" tone="faint">
          {ctx ? `${formatUsdCompact(ctx.dayNtlVlm)} vol` : '—'}
        </Text>
      </View>
      <Animated.View style={[styles.priceBox, flashStyle]}>
        <Text variant="num">{ctx ? formatPrice(ctx.markPx) : '—'}</Text>
      </Animated.View>
      <View style={[styles.changePill, { backgroundColor: up ? colors.upFaint : colors.downFaint }]}>
        <Text variant="num" tone={up ? 'up' : 'down'} style={styles.changeText}>
          {change === null ? '—' : formatPct(change)}
        </Text>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: {
    height: MARKET_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  left: { flex: 1, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  levBadge: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  priceBox: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 },
  changePill: {
    minWidth: 76,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: radius.control - 2,
  },
  changeText: { fontSize: 13 },
});
