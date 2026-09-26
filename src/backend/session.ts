import { createClient } from '@supabase/supabase-js';
import { createSiweMessage, generateSiweNonce } from 'viem/siwe';
import { create } from 'zustand';

import type { Owner } from '@/wallet/store';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY;

// Must match an allowed redirect URL in the Supabase project (see supabase/config.toml).
const SIWE_DOMAIN = 'tape.local';
const SIWE_URI = 'https://tape.local';

/**
 * The backend holds user data only (the watchlist). Market data never goes through it.
 * No session is stored on the device: the owner wallet signs a fresh Sign in with Ethereum
 * message at launch, which is silent for both the device key and Privy's embedded wallet.
 */
export const supabase = URL && KEY ? createClient(URL, KEY, { auth: { persistSession: false, detectSessionInUrl: false } }) : null;

type BackendState = {
  status: 'off' | 'signing-in' | 'signed-in' | 'error';
  userId: string | null;
  error: string | null;
};

export const useBackend = create<BackendState>(() => ({ status: 'off', userId: null, error: null }));

export async function signInWithWallet(owner: Owner) {
  if (!supabase) return;
  useBackend.setState({ status: 'signing-in', error: null });
  try {
    const message = createSiweMessage({
      address: owner.address,
      chainId: 42161,
      domain: SIWE_DOMAIN,
      uri: SIWE_URI,
      nonce: generateSiweNonce(),
      version: '1',
      issuedAt: new Date(),
      statement: 'Sign in to Tape',
    });
    const signature = await owner.signMessage(message);
    const { data, error } = await supabase.auth.signInWithWeb3({ chain: 'ethereum', message, signature });
    if (error) throw error;
    useBackend.setState({ status: 'signed-in', userId: data.user.id });
  } catch (e) {
    useBackend.setState({ status: 'error', userId: null, error: e instanceof Error ? e.message : String(e) });
  }
}

export async function signOutOfBackend() {
  await supabase?.auth.signOut();
  useBackend.setState({ status: 'off', userId: null, error: null });
}
