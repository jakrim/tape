import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { track } from '@/lib/analytics';
import { INTERVALS, useCandles, useCandleStore, type Interval } from '@/market/candles';
import { useConnection } from '@/market/clients';
import { useCoin, useCoinFeed } from '@/market/coin';
import { useFavorites } from '@/market/favorites';
import { STALE_AFTER, useClock } from '@/market/freshness';
import { useMarkets } from '@/market/markets';
import { formatCountdown, formatFunding, formatPct, formatPrice, formatUsdCompact } from '@/trading/format';
import { msToNextFunding } from '@/trading/math';
import { Button } from '@/ui/Button';
import { CandleChart } from '@/ui/CandleChart';
import { Chip } from '@/ui/Chip';
import { LiveBadge } from '@/ui/LiveBadge';
import { OrderBook } from '@/ui/OrderBook';
import { PositionCard } from '@/ui/PositionCard';
import { Segmented } from '@/ui/Segmented';
import { Text } from '@/ui/Text';
import { TradeTape } from '@/ui/TradeTape';
import { colors, space } from '@/ui/theme';

export default function MarketScreen() {
  const { coin } = useLocalSearchParams<{ coin: string }>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [interval, setChartInterval] = useState<Interval>('15m');
  const [panel, setPanel] = useState<'book' | 'trades'>('book');

  useCoinFeed(coin);
  useCandles(coin, interval);

  const perp = useMarkets((s) => s.perpByCoin[coin]);
  const listCtx = useMarkets((s) => s.ctxByCoin[coin]);
  const liveCtx = useCoin((s) => s.ctx);
  const ctxAt = useCoin((s) => s.ctxAt);
  const book = useCoin((s) => s.book);
  const bookAt = useCoin((s) => s.bookAt);
  const trades = useCoin((s) => s.trades);
  const candles = useCandleStore((s) => s.candles);
  const candlesLoading = useCandleStore((s) => s.loading);
  const network = useConnection((s) => s.network);

  useEffect(() => {
    track('market_opened', { coin, network });
  }, [coin, network]);

  // The focused-asset stream updates ~1/s; fall back to the list snapshot until it arrives.
  const ctx = liveCtx ?? listCtx;
  const change = ctx && ctx.prevDayPx > 0 ? (ctx.markPx - ctx.prevDayPx) / ctx.prevDayPx : null;
  const szDecimals = perp?.szDecimals ?? 4;

  const openTicket = (side: 'long' | 'short', px?: number) =>
    router.push({ pathname: '/order', params: { coin, side, ...(px ? { kind: 'limit', px: String(px) } : {}) } });

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: coin, headerRight: () => <FavoriteButton coin={coin} /> }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 96 + insets.bottom }}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.levBadge}>
              <Text variant="label" tone="muted">
                {perp ? `${perp.maxLeverage}x perp` : 'perp'}
              </Text>
            </View>
            <LiveBadge updatedAt={ctxAt ?? bookAt} staleAfterMs={STALE_AFTER.assetCtx} />
          </View>
          <Text variant="display" testID="mark-price">
            {ctx ? formatPrice(ctx.markPx) : '—'}
          </Text>
          <Text variant="num" tone={(change ?? 0) >= 0 ? 'up' : 'down'}>
            {change === null ? ' ' : `${formatPct(change)} 24h`}
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stats}>
          <Stat label="Oracle" value={ctx ? formatPrice(ctx.oraclePx) : '—'} />
          <Stat label="24h volume" value={ctx ? formatUsdCompact(ctx.dayNtlVlm) : '—'} />
          <Stat label="Open interest" value={ctx ? formatUsdCompact(ctx.openInterest * ctx.markPx) : '—'} />
          <FundingStat rate={ctx?.funding} />
        </ScrollView>

        <View style={styles.intervals}>
          {INTERVALS.map((i) => (
            <Chip key={i} label={i} selected={i === interval} onPress={() => setChartInterval(i)} />
          ))}
        </View>
        <CandleChart candles={candles} width={width} height={260} loading={candlesLoading} />
        <Text variant="caption" tone="faint" style={styles.hint}>
          Press and hold the chart to inspect a candle
        </Text>

        <PositionCard coin={coin} />

        <View style={styles.panelSwitch}>
          <Segmented
            size="sm"
            value={panel}
            onChange={setPanel}
            options={[
              { value: 'book', label: 'Order book' },
              { value: 'trades', label: 'Trades' },
            ]}
          />
        </View>
        {panel === 'book' ? (
          <View>
            <View style={styles.panelMeta}>
              <LiveBadge updatedAt={bookAt} staleAfterMs={STALE_AFTER.book} />
            </View>
            <OrderBook
              book={book}
              sizeDecimals={szDecimals}
              onPressPrice={(px, side) => openTicket(side === 'ask' ? 'long' : 'short', px)}
            />
          </View>
        ) : (
          <TradeTape trades={trades} sizeDecimals={szDecimals} />
        )}

        {network === 'mainnet' ? (
          <Text variant="caption" tone="faint" style={styles.hint}>
            Viewing mainnet. Orders are placed on testnet; switch networks in Account.
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + space.sm }]}>
        <Button testID="long-button" title="Long" kind="long" onPress={() => openTicket('long')} style={styles.action} />
        <Button testID="short-button" title="Short" kind="short" onPress={() => openTicket('short')} style={styles.action} />
      </View>
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <View style={styles.stat}>
      <Text variant="caption" tone="faint">
        {label}
      </Text>
      <Text variant="num" tone={tone}>
        {value}
      </Text>
    </View>
  );
}

// Isolated so only this stat re-renders on the one-second clock.
function FundingStat({ rate }: { rate: number | undefined }) {
  const countdown = useClock((s) => formatCountdown(msToNextFunding(s.now)));
  return (
    <Stat
      label={`Funding · ${countdown}`}
      value={rate === undefined ? '—' : formatFunding(rate)}
      tone={rate === undefined ? undefined : rate >= 0 ? 'up' : 'down'}
    />
  );
}

function FavoriteButton({ coin }: { coin: string }) {
  const isFavorite = useFavorites((s) => Boolean(s.coins[coin]));
  const toggle = useFavorites((s) => s.toggle);
  return (
    <Pressable onPress={() => toggle(coin)} hitSlop={12} accessibilityLabel={isFavorite ? 'Remove favorite' : 'Add favorite'}>
      <Ionicons name={isFavorite ? 'star' : 'star-outline'} size={22} color={isFavorite ? colors.accent : colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space.lg, gap: 2 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.xs },
  levBadge: { backgroundColor: colors.surface, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  stats: { paddingHorizontal: space.lg, gap: space.xl, paddingVertical: space.md },
  stat: { gap: 2 },
  intervals: { flexDirection: 'row', paddingHorizontal: space.md, marginBottom: space.xs },
  hint: { paddingHorizontal: space.lg, paddingTop: space.xs },
  panelSwitch: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm },
  panelMeta: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: space.lg, paddingBottom: space.xs },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  action: { flex: 1 },
});
