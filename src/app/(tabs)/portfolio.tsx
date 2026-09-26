import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useConnection } from '@/market/clients';
import { useMarkets } from '@/market/markets';
import { formatPrice, formatUsd } from '@/trading/format';
import { cancelOrder } from '@/trading/orders';
import { Button } from '@/ui/Button';
import { Card, Row } from '@/ui/Card';
import { PositionRow } from '@/ui/PositionCard';
import { Text } from '@/ui/Text';
import { colors, space } from '@/ui/theme';
import { useAccount, type OpenOrder } from '@/wallet/account';
import { useWallet } from '@/wallet/store';
import { messageOf, useTrading } from '@/wallet/trading';

export default function PortfolioScreen() {
  const owner = useWallet((s) => s.owner);
  const network = useConnection((s) => s.network);
  const accountValue = useAccount((s) => s.accountValue);
  const withdrawable = useAccount((s) => s.withdrawable);
  const marginUsed = useAccount((s) => s.marginUsed);
  const positions = useAccount((s) => s.positions);
  const orders = useAccount((s) => s.orders);
  const fills = useAccount((s) => s.fills);
  const updatedAt = useAccount((s) => s.updatedAt);
  const totalPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <Text variant="display">Portfolio</Text>
        <Text variant="caption" tone="faint">
          Hyperliquid {network}
        </Text>

        {!owner ? (
          <Card>
            <Text variant="heading">No wallet yet</Text>
            <Text tone="muted">Create a wallet to see balances and positions.</Text>
            <Button title="Set up wallet" onPress={() => router.navigate('/account')} />
          </Card>
        ) : updatedAt === null ? (
          <Card>
            <Text tone="muted">Loading account…</Text>
          </Card>
        ) : (
          <>
            <Card>
              <Text variant="caption" tone="faint">Account value</Text>
              <Text variant="display" testID="account-value">{formatUsd(accountValue ?? 0)}</Text>
              <Row label="Unrealized PnL" value={formatUsd(totalPnl)} tone={totalPnl >= 0 ? 'up' : 'down'} />
              <Row label="Margin used" value={formatUsd(marginUsed ?? 0)} tone="muted" />
              <Row label="Withdrawable" value={formatUsd(withdrawable ?? 0)} tone="muted" />
              <Button testID="open-deposit" title="Deposit from another chain" kind="secondary" onPress={() => router.push('/deposit')} />
            </Card>

            <Text variant="heading">Positions</Text>
            {positions.length === 0 ? (
              <Text tone="faint">No open positions</Text>
            ) : (
              positions.map((p) => <PositionRow key={p.coin} position={p} />)
            )}

            <Text variant="heading">Open orders</Text>
            {orders.length === 0 ? (
              <Text tone="faint">No open orders</Text>
            ) : (
              <Card>
                {orders.map((o) => (
                  <OrderRow key={o.oid} order={o} />
                ))}
              </Card>
            )}

            <Text variant="heading">Recent fills</Text>
            {fills.length === 0 ? (
              <Text tone="faint">No fills yet</Text>
            ) : (
              <Card>
                {fills.map((f) => (
                  <View key={f.id} style={styles.order} testID="fill-row">
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong">
                        {f.coin} <Text tone={f.side === 'buy' ? 'up' : 'down'}>{f.dir}</Text>
                      </Text>
                      <Text variant="numSmall" tone="muted">
                        {f.sz} @ {formatPrice(f.px)} · {new Date(f.time).toLocaleTimeString()}
                      </Text>
                    </View>
                    {f.closedPnl !== 0 ? (
                      <Text variant="num" tone={f.closedPnl >= 0 ? 'up' : 'down'}>
                        {formatUsd(f.closedPnl)}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function OrderRow({ order: o }: { order: OpenOrder }) {
  const perp = useMarkets((s) => s.perpByCoin[o.coin]);
  const network = useConnection((s) => s.network);
  const canTrade = useTrading((s) => s.status === 'approved');
  const [error, setError] = useState<string | null>(null);
  const px = o.triggerPx > 0 ? o.triggerPx : o.limitPx;

  return (
    <View style={styles.order}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">
          {o.coin} <Text tone={o.side === 'buy' ? 'up' : 'down'}>{o.side === 'buy' ? 'Buy' : 'Sell'}</Text>
        </Text>
        <Text variant="numSmall" tone="muted">
          {o.orderType}
          {o.reduceOnly ? ' · reduce only' : ''} · {o.sz} @ {formatPrice(px)}
        </Text>
        {error ? <Text variant="caption" tone="down">{error}</Text> : null}
      </View>
      <Pressable
        disabled={!perp || !canTrade}
        onPress={() => perp && cancelOrder(o.oid, perp, network).catch((e) => setError(messageOf(e)))}
        hitSlop={8}>
        <Text variant="label" tone={canTrade ? 'down' : 'faint'}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  order: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
});
