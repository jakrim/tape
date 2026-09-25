import { useLoginWithEmail, usePrivy } from '@privy-io/expo';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useConnection, type Network } from '@/market/clients';
import { formatUsd, shortAddress } from '@/trading/format';
import { Button } from '@/ui/Button';
import { Card, Row } from '@/ui/Card';
import { Diagnostics } from '@/ui/Diagnostics';
import { Segmented } from '@/ui/Segmented';
import { Text } from '@/ui/Text';
import { colors, fonts, radius, space } from '@/ui/theme';
import { useAccount } from '@/wallet/account';
import { useWallet } from '@/wallet/store';
import { enableTrading, useTrading } from '@/wallet/trading';
import { createDeviceWallet, privyEnabled, removeDeviceWallet } from '@/wallet/WalletProvider';

export default function AccountScreen() {
  const owner = useWallet((s) => s.owner);
  const privyPending = useWallet((s) => s.privyPending);
  const network = useConnection((s) => s.network);
  const setNetwork = useConnection((s) => s.setNetwork);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <Text variant="display">Account</Text>

        <Card title="Network">
          <Segmented<Network>
            value={network}
            onChange={setNetwork}
            options={[
              { value: 'mainnet', label: 'Mainnet · view only' },
              { value: 'testnet', label: 'Testnet · trading' },
            ]}
          />
          <Text variant="caption" tone="faint">
            Mainnet shows real markets. Orders are only placed on testnet in this demo.
          </Text>
        </Card>

        {owner ? <WalletCard /> : privyPending ? <Card title="Wallet"><Text tone="muted">Creating your wallet…</Text></Card> : <CreateWallet />}
        {owner ? <TradingCard /> : null}
        <Diagnostics />
      </ScrollView>
    </SafeAreaView>
  );
}

function CreateWallet() {
  const [busy, setBusy] = useState(false);
  return (
    <Card title="Wallet">
      <Text variant="heading">Trade from a wallet on this phone</Text>
      <Text tone="muted">
        Sign in with email for a Privy embedded wallet, or generate a key that never leaves this device.
      </Text>
      {privyEnabled ? <EmailLogin /> : null}
      <Button
        testID="create-device-wallet"
        title="Create device wallet"
        kind={privyEnabled ? 'secondary' : 'primary'}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          await createDeviceWallet().finally(() => setBusy(false));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }}
      />
    </Card>
  );
}

// Auth is deliberately thin: Privy's email code flow, then straight to the wallet.
function EmailLogin() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const { state, sendCode, loginWithCode } = useLoginWithEmail();
  const awaitingCode = state.status === 'awaiting-code-input' || state.status === 'submitting-code';

  return (
    <View style={styles.login}>
      {awaitingCode ? (
        <>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="6-digit code"
            placeholderTextColor={colors.textFaint}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            style={styles.input}
          />
          <Button title="Verify" loading={state.status === 'submitting-code'} onPress={() => loginWithCode({ code, email })} />
        </>
      ) : (
        <>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textFaint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            style={styles.input}
          />
          <Button title="Continue with email" loading={state.status === 'sending-code'} onPress={() => sendCode({ email })} />
        </>
      )}
      {state.status === 'error' ? <Text tone="down">{state.error?.message ?? 'Something went wrong'}</Text> : null}
    </View>
  );
}

function WalletCard() {
  const owner = useWallet((s) => s.owner)!;
  const network = useConnection((s) => s.network);
  const accountValue = useAccount((s) => s.accountValue);
  const withdrawable = useAccount((s) => s.withdrawable);
  const unfunded = accountValue !== null && accountValue === 0;

  const copy = async () => {
    await Clipboard.setStringAsync(owner.address);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <Card title="Wallet">
      <View style={styles.walletHead}>
        <View style={{ flex: 1 }}>
          <Text variant="heading">{owner.label}</Text>
          <Text variant="numSmall" tone="muted" testID="wallet-address">
            {shortAddress(owner.address)} · {owner.kind === 'privy' ? 'Privy embedded wallet' : 'Key in device keychain'}
          </Text>
        </View>
        <Button title="Copy" kind="secondary" onPress={copy} style={styles.smallButton} />
      </View>
      <Row label={`Account value (${network})`} value={accountValue === null ? '—' : formatUsd(accountValue)} />
      <Row label="Withdrawable" value={withdrawable === null ? '—' : formatUsd(withdrawable)} tone="muted" />
      {network === 'testnet' && unfunded ? (
        <View style={styles.notice}>
          <Text variant="bodyStrong">Fund this wallet with test USDC</Text>
          <Text tone="muted">
            Hyperliquid's faucet only pays wallets that have deposited on mainnet. Claim 1,000 test USDC at
            app.hyperliquid-testnet.xyz/drip with that wallet, then send it to the address above.
          </Text>
        </View>
      ) : null}
      <SignOut />
    </Card>
  );
}

function SignOut() {
  const owner = useWallet((s) => s.owner)!;
  if (owner.kind === 'privy') return <PrivySignOut />;
  return (
    <Button
      title="Remove device wallet"
      kind="secondary"
      onPress={() =>
        Alert.alert('Remove device wallet?', 'The key is deleted from this phone. Funds on this address become unreachable.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => removeDeviceWallet() },
        ])
      }
    />
  );
}

function PrivySignOut() {
  const { logout } = usePrivy();
  return <Button title="Sign out" kind="secondary" onPress={() => logout()} />;
}

function TradingCard() {
  const owner = useWallet((s) => s.owner)!;
  const network = useConnection((s) => s.network);
  const status = useTrading((s) => s.status);
  const agent = useTrading((s) => s.agent);
  const error = useTrading((s) => s.error);

  return (
    <Card title="One-tap trading">
      {status === 'approved' && agent ? (
        <>
          <Row label="Status" value="Enabled" tone="up" />
          <Row label="Trading key" value={shortAddress(agent.address)} tone="muted" />
          <Text variant="caption" tone="faint">
            Orders are signed by a key kept on this device. It can trade, but it can never withdraw funds.
          </Text>
        </>
      ) : (
        <>
          <Text tone="muted">
            Approve a trading key stored on this device. Your wallet signs once; after that orders go out instantly
            with no prompts. The key can trade but can't withdraw.
          </Text>
          {network === 'mainnet' ? (
            <Text variant="caption" tone="warning">Switch to testnet to enable trading.</Text>
          ) : (
            <Button
              testID="enable-trading"
              title="Enable trading"
              loading={status === 'approving' || status === 'checking'}
              onPress={() => enableTrading(owner, network)}
            />
          )}
          {status === 'error' && error ? <Text tone="down">{error}</Text> : null}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.lg, paddingBottom: 120 },
  login: { gap: space.sm },
  input: {
    height: 48,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: space.md,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 16,
  },
  walletHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  smallButton: { height: 36, paddingHorizontal: space.md },
  notice: { backgroundColor: colors.warningFaint, borderRadius: radius.control, padding: space.md, gap: space.xs },
});
