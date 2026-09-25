import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Trade } from '@/market/coin';
import { formatPrice } from '@/trading/format';

import { Text } from './Text';
import { space } from './theme';

const ROWS = 11;

function time(ms: number) {
  const d = new Date(ms);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}

export const TradeTape = memo(function TradeTape({ trades, sizeDecimals }: { trades: Trade[]; sizeDecimals: number }) {
  return (
    <View testID="trade-tape">
      <View style={styles.row}>
        <Text variant="label" tone="faint" style={styles.col}>Price</Text>
        <Text variant="label" tone="faint" style={[styles.col, styles.right]}>Size</Text>
        <Text variant="label" tone="faint" style={[styles.col, styles.right]}>Time</Text>
      </View>
      {trades.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="caption" tone="faint">Waiting for trades…</Text>
        </View>
      ) : (
        trades.slice(0, ROWS).map((t) => (
          <View key={t.id} style={styles.row}>
            <Text variant="numSmall" tone={t.side === 'buy' ? 'up' : 'down'} style={styles.col}>
              {formatPrice(t.px)}
            </Text>
            <Text variant="numSmall" tone="muted" style={[styles.col, styles.right]}>
              {t.sz.toFixed(sizeDecimals)}
            </Text>
            <Text variant="numSmall" tone="faint" style={[styles.col, styles.right]}>
              {time(t.time)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { height: 24, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg },
  col: { flex: 1 },
  right: { textAlign: 'right' },
  empty: { height: 24 * 5, alignItems: 'center', justifyContent: 'center' },
});
