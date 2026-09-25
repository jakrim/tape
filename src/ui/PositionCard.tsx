import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useConnection } from '@/market/clients';
import { useMarkets } from '@/market/markets';
import { formatPct, formatPrice, formatUsd } from '@/trading/format';
import { closePosition } from '@/trading/orders';
import { useAccount, type Position } from '@/wallet/account';
import { messageOf, useTrading } from '@/wallet/trading';

import { Button } from './Button';
import { Text } from './Text';
import { colors, radius, space } from './theme';

/** A live position. PnL, ROE and liquidation price are the exchange's numbers, not ours. */
export function PositionRow({ position: p }: { position: Position }) {
  const perp = useMarkets((s) => s.perpByCoin[p.coin]);
  const mark = useMarkets((s) => s.ctxByCoin[p.coin]?.markPx);
  const network = useConnection((s) => s.network);
  const canTrade = useTrading((s) => s.status === 'approved');
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const long = p.szi > 0;
  const up = p.unrealizedPnl >= 0;

  const close = async () => {
    if (!perp || !mark) return;
    setClosing(true);
    setError(null);
    try {
      await closePosition(p, perp, mark, network);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setClosing(false);
    }
  };

  return (
    <View style={styles.card} testID={`position-${p.coin}`}>
      <View style={styles.head}>
        <View style={styles.title}>
          <Text variant="heading">{p.coin}</Text>
          <View style={[styles.tag, { backgroundColor: long ? colors.upFaint : colors.downFaint }]}>
            <Text variant="label" tone={long ? 'up' : 'down'}>
              {long ? 'Long' : 'Short'} {p.leverage}x {p.isCross ? 'cross' : 'isolated'}
            </Text>
          </View>
        </View>
        <View style={styles.pnl}>
          <Text variant="num" tone={up ? 'up' : 'down'}>
            {formatUsd(p.unrealizedPnl)}
          </Text>
          <Text variant="numSmall" tone={up ? 'up' : 'down'}>
            {formatPct(p.returnOnEquity)}
          </Text>
        </View>
      </View>
      <View style={styles.grid}>
        <Cell label="Size" value={`${Math.abs(p.szi)}`} />
        <Cell label="Entry" value={formatPrice(p.entryPx)} />
        <Cell label="Mark" value={mark ? formatPrice(mark) : '—'} />
        <Cell label="Liq. price" value={p.liquidationPx ? formatPrice(p.liquidationPx) : '—'} tone="warning" />
      </View>
      {error ? <Text tone="down">{error}</Text> : null}
      <Button title="Close position" kind="secondary" onPress={close} loading={closing} disabled={!canTrade || !mark} style={styles.close} />
    </View>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: 'warning' }) {
  return (
    <View style={styles.cell}>
      <Text variant="caption" tone="faint">{label}</Text>
      <Text variant="numSmall" tone={tone}>{value}</Text>
    </View>
  );
}

/** Shown on a market's screen when the user holds a position in it. */
export function PositionCard({ coin }: { coin: string }) {
  const position = useAccount((s) => s.positions.find((p) => p.coin === coin));
  if (!position) return null;
  return (
    <View style={styles.wrap}>
      <PositionRow position={position} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.lg, paddingTop: space.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: space.lg, gap: space.md },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { gap: space.xs },
  tag: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  pnl: { alignItems: 'flex-end' },
  grid: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { gap: 2 },
  close: { height: 40 },
});
