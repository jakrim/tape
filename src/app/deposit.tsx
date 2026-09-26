import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { fetchDepositQuote, SOURCES, type DepositQuote, type Source } from '@/deposit/relay';
import { useAgeSeconds } from '@/market/freshness';
import { formatUsd, shortAddress } from '@/trading/format';
import { Button } from '@/ui/Button';
import { Row } from '@/ui/Card';
import { Segmented } from '@/ui/Segmented';
import { Text } from '@/ui/Text';
import { colors, fonts, radius, space } from '@/ui/theme';
import { useWallet } from '@/wallet/store';

const REFRESH_MS = 15_000;
// Quotes need an address; before a wallet exists we price the route with a neutral one.
const PREVIEW_ADDRESS = '0x000000000000000000000000000000000000dEaD';

export default function DepositSheet() {
  const owner = useWallet((s) => s.owner);
  const [source, setSource] = useState<Source>(SOURCES[0]);
  const [amount, setAmount] = useState('100');
  const [lastQuote, setQuote] = useState<DepositQuote | null>(null);
  const [quotedAt, setQuotedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const age = useAgeSeconds(quotedAt);

  const amountUsdc = Number(amount);
  const quote = amountUsdc > 0 ? lastQuote : null;
  const address = owner?.address ?? PREVIEW_ADDRESS;

  // Debounced quote on input change, then refreshed every 15 s because route quotes go stale.
  useEffect(() => {
    if (!(amountUsdc > 0)) return;
    const controller = new AbortController();
    const load = () => {
      setLoading(true);
      fetchDepositQuote({ source, amountUsdc, address, signal: controller.signal })
        .then((q) => {
          setQuote(q);
          setQuotedAt(Date.now());
          setError(null);
        })
        .catch((e) => {
          if (controller.signal.aborted) return;
          setQuote(null);
          setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => setLoading(false));
    };
    const debounce = setTimeout(load, 400);
    const refresh = setInterval(load, REFRESH_MS);
    return () => {
      controller.abort();
      clearTimeout(debounce);
      clearInterval(refresh);
    };
  }, [source, amountUsdc, address]);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="deposit-sheet">
      <Text variant="title">Deposit to Hyperliquid</Text>
      <Text tone="muted">Bridge USDC from another chain into your perps balance. Routes and fees come live from Relay.</Text>

      <Segmented<string>
        value={String(source.chainId)}
        onChange={(v) => setSource(SOURCES.find((s) => String(s.chainId) === v) ?? SOURCES[0])}
        options={SOURCES.map((s) => ({ value: String(s.chainId), label: s.name }))}
      />

      <View style={styles.field}>
        <Text variant="caption" tone="faint">You send (USDC on {source.name})</Text>
        <TextInput
          testID="deposit-amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
        />
      </View>

      <View style={styles.summary} testID="deposit-quote">
        {error ? (
          <Text tone="warning">{error}</Text>
        ) : quote ? (
          <>
            <Row label="You receive" value={`${quote.receive.toFixed(2)} USDC`} tone="up" />
            <Row label="Relayer fee" value={formatUsd(quote.relayerFeeUsd)} tone="muted" />
            <Row label={`Network gas on ${source.name}`} value={formatUsd(quote.gasFeeUsd, 3)} tone="muted" />
            <Row label="Estimated time" value={`~${quote.seconds}s`} tone="muted" />
            <Row label="Wallet steps" value={quote.steps.join(' → ')} tone="muted" />
            <Text variant="caption" tone="faint">
              {loading ? 'Refreshing quote…' : `Quote from Relay, updated ${age ?? 0}s ago`}
            </Text>
          </>
        ) : (
          <Text tone="faint">{loading ? 'Finding a route…' : 'Enter an amount'}</Text>
        )}
      </View>

      <Text variant="caption" tone="faint">
        Destination: {owner ? shortAddress(owner.address) : 'your wallet'} on Hyperliquid (perps balance).
      </Text>
      <Button title="Preview only: Tape doesn't send mainnet transactions" kind="secondary" disabled onPress={() => {}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.xl, gap: space.md, paddingBottom: space.xxl * 2 },
  field: { backgroundColor: colors.surface, borderRadius: radius.control, paddingHorizontal: space.md, paddingVertical: space.sm },
  input: { color: colors.text, fontFamily: fonts.medium, fontSize: 22, paddingVertical: 4, fontVariant: ['tabular-nums'] },
  summary: { backgroundColor: colors.surface, borderRadius: radius.card, padding: space.md, gap: 2 },
});
