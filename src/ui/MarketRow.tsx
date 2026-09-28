import { router } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useMarkets } from '@/market/markets';
import { formatDisplayPrice, formatUsdCompact } from '@/trading/format';

import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { colors, space, type } from './theme';
import { AnimatedPrice } from './AnimatedPrice';

export const MARKET_ROW_HEIGHT = 64;

/**
 * One market. Subscribes to its own coin only, so a price change in BTC re-renders the BTC
 * row and nothing else. The up/down flash runs on the UI thread.
 */
export const MarketRow = memo(function MarketRow({ coin }: { coin: string }) {
  const { width } = useWindowDimensions();
  const perp = useMarkets((s) => s.perpByCoin[coin]);
  const ctx = useMarkets((s) => s.ctxByCoin[coin]);

  if (!perp) return null;
  const change = ctx && ctx.prevDayPx > 0 ? (ctx.markPx - ctx.prevDayPx) / ctx.prevDayPx : null;
  const up = (change ?? 0) >= 0;

  return (
    <PressableScale
      scaleTo={0.985}
      testID={`market-row-${coin}`}
      accessibilityRole="button"
      accessibilityLabel={`${coin} ${ctx ? formatDisplayPrice(ctx.markPx) : ''}`}
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
      <View style={styles.priceBox}>
        <AnimatedPrice key={coin} value={ctx?.markPx} maxWidth={width * 0.37} style={{ ...type.num, fontVariant: ['tabular-nums'], letterSpacing: 0 }} />
      </View>
      <View style={styles.changePill}>
        <Text variant="num" tone={up ? 'up' : 'down'} style={styles.changeText}>
          {change === null ? '—' : `${up ? '↗' : '↘'} ${(Math.abs(change) * 100).toFixed(2)}%`}
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
  priceBox: { maxWidth: '43%', paddingVertical: 4 },
  changePill: {
    minWidth: 76,
    alignItems: 'center',
    paddingVertical: 6,
  },
  changeText: { fontSize: 13 },
});
