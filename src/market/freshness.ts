import { create } from 'zustand';

import { useConnection } from './clients';

// How long each stream may go quiet before we stop calling it live. Set from measured
// mainnet cadence: asset contexts ~every 4s, fast book every 0.5s (worst gap ~650ms),
// focused-asset context ~1/s. Roughly three missed updates flips a stream to stale.
export const STALE_AFTER = {
  markets: 12_000,
  book: 3_000,
  assetCtx: 5_000,
} as const;

// One clock for the whole app. Components derive booleans from it, so they re-render only
// when "stale" flips, not every second.
export const useClock = create(() => ({ now: Date.now() }));
setInterval(() => useClock.setState({ now: Date.now() }), 1000);

/** True only when the socket is connected and this stream updated recently. */
export function useIsLive(updatedAt: number | null, maxAgeMs: number): boolean {
  const connected = useConnection((s) => s.status === 'live');
  const fresh = useClock((s) => updatedAt !== null && s.now - updatedAt <= maxAgeMs);
  return connected && fresh;
}

/** Seconds since the last update, for "Delayed 14s" labels. Null when there's no data yet. */
export function useAgeSeconds(updatedAt: number | null): number | null {
  return useClock((s) => (updatedAt === null ? null : Math.floor((s.now - updatedAt) / 1000)));
}
