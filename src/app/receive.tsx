import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useConnection } from '@/market/clients';
import { formatUsd } from '@/trading/format';
import { AddressQR } from '@/ui/AddressQR';
import { Button } from '@/ui/Button';
import { Card, Row } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { colors, space } from '@/ui/theme';
import { useWallet } from '@/wallet/store';
import { useAccount } from '@/wallet/account';

export default function ReceiveScreen() {
  const owner = useWallet((s) => s.owner);
  const network = useConnection((s) => s.network);
  const balance = useAccount((s) => s.accountValue);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <ScrollView contentContainerStyle={styles.content} testID="receive-screen">
      <Stack.Screen options={{ title: 'Receive test funds' }} />
      <Text variant="title">Hyperliquid testnet</Text>
      <Text tone="warning">Test USDC only. Do not send real funds.</Text>
      {!owner ? <Text tone="muted">Create a wallet in Account to receive test funds.</Text> : network !== 'testnet' ? (
        <Card title="Switch to testnet">
          <Text tone="muted">Tape uses mainnet for viewing markets. Receiving test funds and trading happen on Hyperliquid testnet.</Text>
          <Button testID="receive-switch-testnet" title="Switch to testnet" onPress={() => useConnection.getState().setNetwork('testnet')} />
        </Card>
      ) : (
        <>
          <View style={styles.qr}><AddressQR address={owner.address} /></View>
          <Text variant="numSmall" selectable testID="receive-address">{owner.address}</Text>
          <Row label="Asset" value="Test USDC" />
          <Row label="Destination" value="Hyperliquid testnet perps" />
          <Button testID="copy-receive-address" title={copiedAddress === owner.address ? 'Address copied' : 'Copy address'} onPress={async () => {
            try {
              await Clipboard.setStringAsync(owner.address);
              setCopiedAddress(owner.address);
              setError(null);
            } catch {
              setError('Could not copy. Select the address above to copy it.');
            }
          }} />
          {error ? <Text tone="warning">{error}</Text> : null}
          <Card title="How to receive test funds">
            <Text>Ask someone with test USDC in their Hyperliquid testnet perps account to transfer it to this address using Hyperliquid testnet.</Text>
            <Text tone="muted">The QR code contains an address only. It does not select a network. Ethereum, Base, Arbitrum and Solana transfers do not fund this testnet perps account.</Text>
            <Text tone="muted">The Deposit screen provides mainnet bridge quotes only. Tape does not execute those deposits or accept card or bank payments.</Text>
          </Card>
          <Row label="Testnet account value" value={balance === null ? 'Loading…' : formatUsd(balance)} />
          <Text variant="caption" tone="faint">Account value includes open positions. A balance alone is not proof of a new transfer; confirm the transfer in Hyperliquid testnet.</Text>
          {owner.kind === 'device' ? <Text variant="caption" tone="warning">This device wallet has no recovery phrase or export flow in Tape. Removing it loses access. Use it only with test funds.</Text> : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 48, backgroundColor: colors.bg },
  qr: { alignItems: 'center', paddingVertical: space.md },
});
