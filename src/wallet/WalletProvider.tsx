import { PrivyProvider, useEmbeddedEthereumWallet, useEmbeddedSolanaWallet, usePrivy } from '@privy-io/expo';
import { useEffect, useRef, type ReactNode } from 'react';
import { createWalletClient, custom } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';

import { signInWithWallet, signOutOfBackend, useBackend } from '@/backend/session';
import { track } from '@/lib/analytics';
import { useConnection } from '@/market/clients';
import { syncFavorites } from '@/market/favorites';

import { useAccountFeed } from './account';
import { createKey, deleteKey, keyNames, loadKey } from './keys';
import { useWallet, type Owner } from './store';
import { refreshAgent, resetTrading } from './trading';

export const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID;
const PRIVY_CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID;
export const privyEnabled = Boolean(PRIVY_APP_ID);

/**
 * Owner wallet, two ways:
 * - Privy embedded wallet (email login) when a Privy app is configured.
 * - A key generated on this device otherwise, so the app works end to end without Privy.
 * Both end up as the same `Owner` shape, so trading code never knows which one it has.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const body = (
    <>
      <DeviceWalletLoader />
      <WalletEffects />
      {children}
    </>
  );
  if (!PRIVY_APP_ID) return body;
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      clientId={PRIVY_CLIENT_ID}
      config={{ embedded: { ethereum: { createOnLogin: 'users-without-wallets' }, solana: { createOnLogin: 'users-without-wallets' } } }}>
      <PrivyOwnerSync />
      {body}
    </PrivyProvider>
  );
}

function DeviceWalletLoader() {
  useEffect(() => {
    loadKey(keyNames.deviceOwner).then((account) => {
      if (!account || useWallet.getState().owner) return;
      useWallet.getState().setOwner(deviceOwner(account));
    });
  }, []);
  return null;
}

function PrivyOwnerSync() {
  const { user } = usePrivy();
  const { wallets, create } = useEmbeddedEthereumWallet();
  const solana = useEmbeddedSolanaWallet();
  const wallet = wallets[0];

  // Privy's create-on-login only covers its built-in modal. Tape uses its own email screen,
  // so create the EVM and Solana wallets once after login if the user has none.
  useEffect(() => {
    if (!user) return;
    if (wallets.length === 0) create().catch((e) => console.warn('[privy] evm wallet', e));
    if (solana.status === 'not-created') solana.create?.().catch((e) => console.warn('[privy] solana wallet', e));
  }, [user, wallets.length, create, solana]);

  useEffect(() => {
    const address = solana.status === 'connected' ? solana.wallets[0]?.address : undefined;
    useWallet.setState({ solanaAddress: address ?? null });
  }, [solana]);

  useEffect(() => {
    useWallet.setState({ privyPending: Boolean(user && !wallet) });
    if (!user || !wallet) {
      if (useWallet.getState().owner?.kind === 'privy') useWallet.getState().setOwner(null);
      return;
    }
    let cancelled = false;
    wallet.getProvider().then((provider) => {
      if (cancelled) return;
      const address = wallet.address as `0x${string}`;
      // The embedded wallet is a standard EIP-1193 provider, so viem (and the Hyperliquid SDK) can sign with it.
      const signer = createWalletClient({ account: address, transport: custom(provider) });
      const email = user.linked_accounts.find((a) => a.type === 'email');
      const label = email && 'address' in email ? String(email.address) : 'Privy wallet';
      useWallet.getState().setOwner({
        kind: 'privy',
        address,
        signer,
        signMessage: (message) => signer.signMessage({ account: address, message }),
        label,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [user, wallet]);

  return null;
}

/** Re-checks trading approval whenever the owner or network changes, and keeps the account feed running. */
function WalletEffects() {
  const owner = useWallet((s) => s.owner);
  const network = useConnection((s) => s.network);
  useAccountFeed();

  useEffect(() => {
    if (owner) refreshAgent(owner, network);
    else resetTrading();
  }, [owner, network]);

  // Sign in to the backend with the wallet itself (SIWE), then load the saved watchlist.
  // Sign out only when a wallet is removed. At launch the owner is briefly null while the key
  // loads, and signing out then would throw away the saved session every time.
  const hadOwner = useRef(false);
  useEffect(() => {
    if (!owner) {
      if (hadOwner.current) signOutOfBackend();
      return;
    }
    hadOwner.current = true;
    signInWithWallet(owner).then(() => {
      if (useBackend.getState().status === 'signed-in') syncFavorites();
    });
  }, [owner]);

  return null;
}

function deviceOwner(account: PrivateKeyAccount): Owner {
  return {
    kind: 'device',
    address: account.address,
    signer: account,
    signMessage: (message) => account.signMessage({ message }),
    label: 'Device wallet',
  };
}

export async function createDeviceWallet() {
  const account = await createKey(keyNames.deviceOwner);
  useWallet.getState().setOwner(deviceOwner(account));
  track('wallet_created', { kind: 'device' });
}

export async function removeDeviceWallet() {
  await deleteKey(keyNames.deviceOwner);
  useWallet.getState().setOwner(null);
}
