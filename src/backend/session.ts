import { createClient, type Session } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { createSiweMessage, generateSiweNonce } from 'viem/siwe';
import { create } from 'zustand';

import type { Owner } from '@/wallet/store';

import { secureStorage } from './secureStorage';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY;

// Must match an allowed redirect URL in the Supabase project (see supabase/config.toml).
const SIWE_DOMAIN = 'tape.local';
const SIWE_URI = 'https://tape.local';

/**
 * The backend holds user data only (the watchlist). Market data never goes through it.
 * The session lives in the Keychain / Keystore and refreshes itself, so the wallet signs a
 * Sign in with Ethereum message only when there is no session for it. At 50k users that is the
 * difference between one sign-in per install and one per launch, against auth rate limits that
 * are also per IP.
 */
export const supabase = URL && KEY
  ? createClient(URL, KEY, {
      auth: { storage: secureStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;

// Token refresh timers only run while the app is in the foreground (Supabase's React Native guidance).
if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

type BackendState = {
  status: 'off' | 'signing-in' | 'signed-in' | 'error';
  userId: string | null;
  error: string | null;
};

export const useBackend = create<BackendState>(() => ({ status: 'off', userId: null, error: null }));

/** The wallet address Supabase recorded when this session was created with SIWE. */
function sessionAddress(session: Session | null): string | undefined {
  const claims = session?.user.user_metadata?.custom_claims as { address?: string } | undefined;
  return claims?.address?.toLowerCase();
}

export async function signInWithWallet(owner: Owner) {
  if (!supabase) return;
  useBackend.setState({ status: 'signing-in', error: null });
  try {
    const { data: existing } = await supabase.auth.getSession();
    if (existing.session && sessionAddress(existing.session) === owner.address.toLowerCase()) {
      useBackend.setState({ status: 'signed-in', userId: existing.session.user.id });
      return;
    }
    // A session for a different wallet (or none): start clean.
    if (existing.session) await supabase.auth.signOut({ scope: 'local' });

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
  await supabase?.auth.signOut({ scope: 'local' });
  useBackend.setState({ status: 'off', userId: null, error: null });
}
