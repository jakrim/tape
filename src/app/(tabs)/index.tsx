import { FlashList } from '@shopify/flash-list';
import { useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useConnection } from '@/market/clients';
import { useFavorites } from '@/market/favorites';
import { STALE_AFTER } from '@/market/freshness';
import { refreshMarkets, retryMarkets, useLiveMarkets, useMarkets } from '@/market/markets';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { LiveBadge } from '@/ui/LiveBadge';
import { MARKET_ROW_HEIGHT, MarketRow } from '@/ui/MarketRow';
import { MarketListSkeleton } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { colors, fonts, radius, space } from '@/ui/theme';

type Sort = 'volume' | 'gainers' | 'losers' | 'favorites';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'volume', label: 'Volume' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'gainers', label: 'Gainers' },
  { value: 'losers', label: 'Losers' },
];

export default function MarketsScreen() {
  useLiveMarkets();
  const network = useConnection((s) => s.network);
  const perps = useMarkets((s) => s.perps);
  const updatedAt = useMarkets((s) => s.updatedAt);
  const error = useMarkets((s) => s.error);
  const favorites = useFavorites((s) => s.coins);
  const [sort, setSort] = useState<Sort>('volume');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // The order is computed when the sort, search or market list changes, not on every tick,
  // so rows never jump under the user's thumb while prices update.
  const coins = useMemo(() => {
    const q = query.trim().toUpperCase();
    let list = perps.map((p) => p.coin).filter((c) => !q || c.includes(q));
    if (sort === 'favorites') return list.filter((c) => favorites[c]);
    if (sort === 'volume') return list;
    const ctx = useMarkets.getState().ctxByCoin;
    const change = (c: string) => {
      const x = ctx[c];
      return x && x.prevDayPx > 0 ? (x.markPx - x.prevDayPx) / x.prevDayPx : 0;
    };
    list = [...list].sort((a, b) => change(b) - change(a));
    return sort === 'gainers' ? list : list.reverse();
  }, [perps, sort, query, favorites]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text variant="display">Markets</Text>
          <LiveBadge updatedAt={updatedAt} staleAfterMs={STALE_AFTER.markets} />
        </View>
        <Text variant="caption" tone="faint">
          Hyperliquid perps · {network === 'mainnet' ? 'Mainnet (view only)' : 'Testnet'}
        </Text>
        <TextInput
          testID="market-search"
          value={query}
          onChangeText={setQuery}
          placeholder="Search markets"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.search}
        />
        <View style={styles.chips}>
          {SORTS.map((s) => (
            <Chip key={s.value} label={s.label} selected={sort === s.value} onPress={() => setSort(s.value)} />
          ))}
        </View>
      </View>

      {error ? (
        <View style={styles.center}>
          <Text tone="muted">{error}</Text>
          <Button title="Try again" kind="secondary" onPress={retryMarkets} style={{ marginTop: space.lg }} />
        </View>
      ) : perps.length === 0 ? (
        <MarketListSkeleton rowHeight={MARKET_ROW_HEIGHT} />
      ) : (
        <FlashList
          // A new sort starts a fresh list at the top. (The blank first row seen after re-sorting or
          // refreshing was FlashList 2.0.2 keeping stale layout indices; fixed by upgrading to 2.3.)
          key={sort}
          maintainVisibleContentPosition={{ disabled: true }}
          testID="market-list"
          data={coins}
          keyExtractor={(c) => c}
          renderItem={({ item }) => <MarketRow coin={item} />}
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.accent}
              onRefresh={async () => {
                setRefreshing(true);
                await refreshMarkets();
                setRefreshing(false);
              }}
            />
          }
          contentInsetAdjustmentBehavior="automatic"
          ListEmptyComponent={
            <View style={styles.center}>
              <Text tone="muted">{sort === 'favorites' ? 'No favorites yet' : `No markets match "${query}"`}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm, paddingBottom: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  search: {
    marginTop: space.sm,
    height: 44,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  chips: { flexDirection: 'row', gap: space.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: space.xxl },
});
