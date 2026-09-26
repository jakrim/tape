import type { AbstractWallet } from '@nktkas/hyperliquid/signing';
import { create } from 'zustand';

export type OwnerKind = 'privy' | 'device';

/**
 * The owner wallet holds the account and signs rare, account-level actions (approving a
 * trading key). It's either a Privy embedded wallet or a key generated on this device.
 */
export type Owner = {
  kind: OwnerKind;
  address: `0x${string}`;
  signer: AbstractWallet;
  signMessage: (message: string) => Promise<`0x${string}`>; // plain EIP-191 signing, used for Sign in with Ethereum
  label: string; // e.g. the Privy login email
};

type WalletState = {
  owner: Owner | null;
  // Set when Privy has a logged-in user but the embedded wallet is still being created/connected.
  privyPending: boolean;
  setOwner: (owner: Owner | null) => void;
};

export const useWallet = create<WalletState>((set) => ({
  owner: null,
  privyPending: false,
  setOwner: (owner) => set({ owner }),
}));
