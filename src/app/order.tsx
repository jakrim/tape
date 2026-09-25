import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { useConnection } from '@/market/clients';
import { bookMid, useCoin } from '@/market/coin';
import { STALE_AFTER, useIsLive } from '@/market/freshness';
import { useMarkets } from '@/market/markets';
import { formatPrice, formatUsd } from '@/trading/format';
import {
  estimateLiquidationPrice,
  feeEstimate,
  marginRequired,
  validateTicket,
  type OrderKind,
  type Side,
} from '@/trading/math';
import { submitTicket, type Outcome } from '@/trading/orders';
import { Button } from '@/ui/Button';
import { Row } from '@/ui/Card';
import { Segmented } from '@/ui/Segmented';
import { Text } from '@/ui/Text';
import { colors, fonts, radius, space } from '@/ui/theme';
import { useAccount } from '@/wallet/account';
import { useWallet } from '@/wallet/store';
import { messageOf, useTrading } from '@/wallet/trading';

const LEVERAGE_STEPS = [1, 2, 3, 5, 10, 20, 25, 40, 50];

function num(s: string): number | undefined {
  const n = Number(s.replace(/,/g, ''));
  return s.trim() !== '' && Number.isFinite(n) ? n : undefined;
}

export default function OrderTicket() {
  const params = useLocalSearchParams<{ coin: string; side?: Side; kind?: OrderKind; px?: string }>();
  const coin = params.coin;
  const perp = useMarkets((s) => s.perpByCoin[coin]);
  const book = useCoin((s) => s.book);
  const bookAt = useCoin((s) => s.bookAt);
  const live = useIsLive(bookAt, STALE_AFTER.book);
  const network = useConnection((s) => s.network);
  const owner = useWallet((s) => s.owner);
  const agentStatus = useTrading((s) => s.status);
  const withdrawable = useAccount((s) => s.withdrawable);
  const accountValue = useAccount((s) => s.accountValue);

  const maxLeverage = perp?.maxLeverage ?? 1;
  const [side, setSide] = useState<Side>(params.side ?? 'long');
  const [kind, setKind] = useState<OrderKind>(params.kind ?? 'market');
  const [amount, setAmount] = useState('');
  const [leverage, setLeverage] = useState(Math.min(10, maxLeverage));
  const [isCross, setIsCross] = useState(!perp?.isolatedOnly);
  const [limitPx, setLimitPx] = useState(params.px ?? '');
  const [tpsl, setTpsl] = useState(false);
  const [tp, setTp] = useState('');
  const [sl, setSl] = useState('');
  const [minutes, setMinutes] = useState('30');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: true; outcome: Outcome } | { ok: false; message: string } | null>(null);

  const mid = bookMid(book);
  const notional = num(amount) ?? 0;
  const entry = kind === 'limit' ? (num(limitPx) ?? 0) : (mid ?? 0);
  const size = entry > 0 ? notional / entry : 0;
  const margin = marginRequired(notional, leverage);
  const liq = estimateLiquidationPrice({
    side, entryPx: entry, size, leverage, maxLeverage, isCross,
    accountValue: isCross && accountValue !== null ? accountValue : undefined,
  });

  const ticket = {
    kind, side, notionalUsd: notional, leverage, maxLeverage,
    referencePx: mid ?? 0,
    limitPx: num(limitPx),
    takeProfitPx: tpsl ? num(tp) : undefined,
    stopLossPx: tpsl ? num(sl) : undefined,
    twapMinutes: num(minutes),
    availableMargin: withdrawable ?? undefined,
    dataIsLive: live && mid !== null,
  };

  // The button always says exactly why it can't be pressed.
  let blocker: string | null = null;
  if (!perp) blocker = `${coin} isn't listed on ${network}`;
  else if (network === 'mainnet') blocker = 'Trading is on testnet';
  else if (!owner) blocker = 'Create a wallet to trade';
  else if (agentStatus !== 'approved') blocker = 'Enable trading in Account';
  else blocker = validateTicket(ticket);

  const submit = async () => {
    if (!perp || mid === null) return;
    setSubmitting(true);
    setResult(null);
    try {
      const outcome = await submitTicket({ ...ticket, referencePx: mid, isCross }, perp, network);
      setResult({ ok: true, outcome });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setResult({ ok: false, message: messageOf(e) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSubmitting(false);
    }
  };

  const pct = (f: number) => {
    if (withdrawable) setAmount(String(Math.floor(withdrawable * leverage * f * 100) / 100));
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="order-ticket">
      <View style={styles.head}>
        <Text variant="title">{coin}</Text>
        <Text variant="num" tone="muted">
          {mid ? `Mid ${formatPrice(mid)}` : 'Waiting for book…'}
        </Text>
      </View>

      <Segmented<Side>
        value={side}
        onChange={setSide}
        activeColor={(v) => (v === 'long' ? colors.up : colors.down)}
        options={[
          { value: 'long', label: 'Long' },
          { value: 'short', label: 'Short' },
        ]}
      />
      <Segmented<OrderKind>
        size="sm"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'market', label: 'Market' },
          { value: 'limit', label: 'Limit' },
          { value: 'twap', label: 'TWAP' },
        ]}
      />

      {kind === 'limit' ? (
        <Field label="Limit price" value={limitPx} onChange={setLimitPx} suffix="USD" right={mid ? { label: 'Mid', onPress: () => setLimitPx(formatPrice(mid).replace(/,/g, '')) } : undefined} />
      ) : null}
      <Field label="Amount" value={amount} onChange={setAmount} suffix="USD" testID="amount-input" />
      <View style={styles.pcts}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <Pressable key={f} onPress={() => pct(f)} style={styles.pct} disabled={!withdrawable}>
            <Text variant="label" tone={withdrawable ? 'muted' : 'faint'}>
              {f * 100}%
            </Text>
          </Pressable>
        ))}
      </View>
      {kind === 'twap' ? <Field label="Run for" value={minutes} onChange={setMinutes} suffix="min" /> : null}

      <View style={styles.levRow}>
        <Text tone="muted">Leverage</Text>
        <View style={styles.levControls}>
          {!perp?.isolatedOnly ? (
            <Pressable onPress={() => setIsCross((c) => !c)} style={styles.modeChip}>
              <Text variant="label">{isCross ? 'Cross' : 'Isolated'}</Text>
            </Pressable>
          ) : null}
          <Stepper value={leverage} max={maxLeverage} onChange={setLeverage} />
        </View>
      </View>

      {kind !== 'twap' ? (
        <View style={styles.levRow}>
          <Text tone="muted">Take profit / stop loss</Text>
          <Switch value={tpsl} onValueChange={setTpsl} trackColor={{ true: colors.accent, false: colors.surfaceRaised }} />
        </View>
      ) : null}
      {tpsl && kind !== 'twap' ? (
        <View style={styles.tpsl}>
          <Field label="Take profit" value={tp} onChange={setTp} suffix="USD" compact />
          <Field label="Stop loss" value={sl} onChange={setSl} suffix="USD" compact />
        </View>
      ) : null}

      <View style={styles.summary}>
        <Row label="Order value" value={formatUsd(notional)} />
        <Row label="Size" value={perp && size > 0 ? `${size.toFixed(perp.szDecimals)} ${coin}` : '—'} tone="muted" />
        <Row label="Margin required" value={formatUsd(margin)} />
        <Row label="Est. liquidation" value={liq ? formatPrice(liq) : '—'} tone="warning" />
        <Row label="Est. fee" value={formatUsd(feeEstimate(notional, kind !== 'limit'), 3)} tone="muted" />
        {withdrawable !== null ? <Row label="Available" value={formatUsd(withdrawable)} tone="muted" /> : null}
      </View>

      {result ? <ResultBanner result={result} coin={coin} /> : null}

      {result?.ok ? (
        <Button title="Done" kind="secondary" onPress={() => router.back()} />
      ) : (
        <Button
          testID="submit-order"
          title={blocker ?? `${side === 'long' ? 'Long' : 'Short'} ${coin}`}
          kind={blocker ? 'secondary' : side}
          disabled={Boolean(blocker)}
          loading={submitting}
          onPress={submit}
        />
      )}
      {network === 'mainnet' ? (
        <Button
          title="Switch to testnet"
          kind="primary"
          onPress={() => {
            useConnection.getState().setNetwork('testnet');
            router.back();
          }}
        />
      ) : null}
      <Text variant="caption" tone="faint">
        Liquidation and fees are estimates at the base fee tier. Positions show the exchange's own numbers once opened.
      </Text>
    </ScrollView>
  );
}

function ResultBanner({ result, coin }: { result: { ok: true; outcome: Outcome } | { ok: false; message: string }; coin: string }) {
  if (!result.ok) {
    return (
      <View style={[styles.banner, { backgroundColor: colors.downFaint }]} testID="order-error">
        <Text variant="bodyStrong" tone="down">Exchange rejected the order</Text>
        <Text tone="muted">{result.message}</Text>
      </View>
    );
  }
  const o = result.outcome;
  const text =
    o.status === 'filled'
      ? `Filled ${o.size} ${coin} at ${formatPrice(o.avgPx)}`
      : o.status === 'resting'
        ? `Order resting on the book (#${o.oid})`
        : o.status === 'twap'
          ? `TWAP running (#${o.twapId})`
          : 'Waiting for the exchange to confirm';
  return (
    <View style={[styles.banner, { backgroundColor: colors.upFaint }]} testID="order-success">
      <Text variant="bodyStrong" tone="up">{text}</Text>
    </View>
  );
}

function Field(p: {
  label: string; value: string; onChange: (v: string) => void; suffix: string; testID?: string; compact?: boolean;
  right?: { label: string; onPress: () => void };
}) {
  return (
    <View style={[styles.field, p.compact && { flex: 1 }]}>
      <Text variant="caption" tone="faint">{p.label}</Text>
      <View style={styles.fieldRow}>
        <TextInput
          testID={p.testID}
          value={p.value}
          onChangeText={p.onChange}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.textFaint}
          style={styles.fieldInput}
        />
        {p.right ? (
          <Pressable onPress={p.right.onPress} hitSlop={8}>
            <Text variant="label" tone="accent">{p.right.label}</Text>
          </Pressable>
        ) : null}
        <Text variant="label" tone="faint">{p.suffix}</Text>
      </View>
    </View>
  );
}

function Stepper({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  const steps = LEVERAGE_STEPS.filter((s) => s <= max);
  if (!steps.includes(max)) steps.push(max);
  const i = Math.max(0, steps.indexOf(value));
  const go = (d: number) => {
    const next = steps[Math.min(steps.length - 1, Math.max(0, i + d))];
    if (next !== value) {
      Haptics.selectionAsync();
      onChange(next);
    }
  };
  return (
    <View style={styles.stepper}>
      <Pressable onPress={() => go(-1)} hitSlop={8} style={styles.stepBtn} accessibilityLabel="Lower leverage">
        <Text variant="heading">−</Text>
      </Pressable>
      <Text variant="num" style={styles.stepValue}>{value}x</Text>
      <Pressable onPress={() => go(1)} hitSlop={8} style={styles.stepBtn} accessibilityLabel="Raise leverage">
        <Text variant="heading">+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.xl, gap: space.md, paddingBottom: space.xxl * 2 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  field: { backgroundColor: colors.surface, borderRadius: radius.control, paddingHorizontal: space.md, paddingVertical: space.sm },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  fieldInput: { flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 20, paddingVertical: 4, fontVariant: ['tabular-nums'] },
  pcts: { flexDirection: 'row', gap: space.sm },
  pct: { flex: 1, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control, backgroundColor: colors.surface },
  levRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  levControls: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  modeChip: { paddingHorizontal: space.md, height: 32, justifyContent: 'center', borderRadius: radius.control, backgroundColor: colors.surface },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.control },
  stepBtn: { width: 36, height: 32, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 40, textAlign: 'center' },
  tpsl: { flexDirection: 'row', gap: space.sm },
  summary: { backgroundColor: colors.surface, borderRadius: radius.card, padding: space.md, gap: 2 },
  banner: { borderRadius: radius.control, padding: space.md, gap: space.xs },
});
