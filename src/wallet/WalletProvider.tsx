import { PrivyProvider, useEmbeddedEthereumWallet, usePrivy } from '@privy-io/expo';
import { useEffect, type ReactNode } from 'react';
import { createWalletClient, custom } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';

import { signInWithWallet, signOutOfBackend, useBackend } from '@/backend/session';
import { useConnection } from '@/market/clients';
import { syncFavorites } from '@/market/favorites';

import { useAccountFeed } from './account';
import { createKey, deleteKey, keyNames, loadKey } from './keys';
import { useWallet, type Owner } from './store';
import { refreshAgent, useTrading } from './trading';

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
  const { wallets } = useEmbeddedEthereumWallet();
  const wallet = wallets[0];

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
    else useTrading.setState({ status: 'none', agent: null, error: null });
  }, [owner, network]);

  // Sign in to the backend with the wallet itself (SIWE), then load the saved watchlist.
  useEffect(() => {
    if (!owner) {
      signOutOfBackend();
      return;
    }
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
}

export async function removeDeviceWallet() {
  await deleteKey(keyNames.deviceOwner);
  useWallet.getState().setOwner(null);
}
