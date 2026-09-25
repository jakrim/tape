import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Book, BookLevel } from '@/market/coin';
import { formatPct, formatPrice } from '@/trading/format';

import { Text } from './Text';
import { colors, space } from './theme';

const ROW_H = 26;
const LEVELS = 5; // the fast feed sends the top 5 per side twice a second

type Props = {
  book: Book | null;
  sizeDecimals: number;
  onPressPrice: (px: number, side: 'bid' | 'ask') => void;
};

/**
 * Fixed-height rows, fixed row count: the layout never shifts as levels change, and each
 * update is a cheap text/width change rather than a list diff.
 */
export const OrderBook = memo(function OrderBook({ book, sizeDecimals, onPressPrice }: Props) {
  const bids = book?.bids.slice(0, LEVELS) ?? [];
  const asks = book?.asks.slice(0, LEVELS) ?? [];
  const maxTotal = Math.max(bids[bids.length - 1]?.total ?? 0, asks[asks.length - 1]?.total ?? 0) || 1;
  const bestBid = bids[0]?.px;
  const bestAsk = asks[0]?.px;
  const spread = bestBid && bestAsk ? bestAsk - bestBid : null;

  const row = (level: BookLevel | undefined, side: 'bid' | 'ask', i: number) => (
    <Pressable
      key={`${side}${i}`}
      disabled={!level}
      onPress={() => level && onPressPrice(level.px, side)}
      style={styles.row}
      accessibilityLabel={level ? `${side} ${formatPrice(level.px)}` : undefined}>
      {level ? (
        <>
          <View
            style={[
              styles.depth,
              { width: `${(level.total / maxTotal) * 100}%`, backgroundColor: side === 'bid' ? colors.upFaint : colors.downFaint },
            ]}
          />
          <Text variant="numSmall" tone={side === 'bid' ? 'up' : 'down'} style={styles.px}>
            {formatPrice(level.px)}
          </Text>
          <Text variant="numSmall" tone="muted" style={styles.sz}>
            {level.sz.toFixed(sizeDecimals)}
          </Text>
          <Text variant="numSmall" tone="faint" style={styles.sz}>
            {level.total.toFixed(sizeDecimals)}
          </Text>
        </>
      ) : null}
    </Pressable>
  );

  return (
    <View testID="order-book">
      <View style={styles.head}>
        <Text variant="label" tone="faint" style={styles.px}>Price</Text>
        <Text variant="label" tone="faint" style={styles.sz}>Size</Text>
        <Text variant="label" tone="faint" style={styles.sz}>Total</Text>
      </View>
      {Array.from({ length: LEVELS }, (_, i) => row(asks[LEVELS - 1 - i], 'ask', LEVELS - 1 - i))}
      <View style={styles.spread}>
        <Text variant="numSmall" tone="muted">
          {spread !== null && bestBid
            ? `Spread ${formatPrice(spread)} (${formatPct(spread / bestBid, 3).replace('+', '')})`
            : 'Loading book…'}
        </Text>
      </View>
      {Array.from({ length: LEVELS }, (_, i) => row(bids[i], 'bid', i))}
    </View>
  );
});

const styles = StyleSheet.create({
  head: { flexDirection: 'row', paddingHorizontal: space.lg, paddingBottom: space.xs },
  row: { height: ROW_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg },
  depth: { position: 'absolute', right: 0, top: 2, bottom: 2 },
  px: { flex: 1.2 },
  sz: { flex: 1, textAlign: 'right' },
  spread: { height: ROW_H, alignItems: 'center', justifyContent: 'center' },
});
