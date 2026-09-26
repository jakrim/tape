import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { create } from 'zustand';

import { onNextFrame } from './batcher';
import { getClients, useConnection, type Network } from './clients';
import { countMessage, reportFeedError } from './diagnostics';
import { withRetry } from './retry';

export type Perp = {
  coin: string;
  index: number; // asset id used when placing orders
  szDecimals: number;
  maxLeverage: number;
  isolatedOnly: boolean;
};

export type AssetCtx = {
  markPx: number;
  midPx: number | null;
  prevDayPx: number;
  funding: number; // hourly rate
  openInterest: number; // in coin units
  dayNtlVlm: number; // 24h notional volume, USD
  oraclePx: number;
};

export type RawCtx = {
  markPx: string;
  midPx: string | null;
  prevDayPx: string;
  funding: string;
  openInterest: string;
  dayNtlVlm: string;
  oraclePx: string;
};

type MarketsState = {
  // Full universe in exchange order: asset contexts arrive as an array aligned to it.
  universe: string[];
  perps: Perp[]; // active only, sorted by 24h volume at load
  perpByCoin: Record<string, Perp>;
  ctxByCoin: Record<string, AssetCtx>;
  updatedAt: number | null;
  error: string | null;
  attempt: number;
};

const empty = { universe: [], perps: [], perpByCoin: {}, ctxByCoin: {}, updatedAt: null, error: null };

export const useMarkets = create<MarketsState>(() => ({ ...empty, attempt: 0 }));

export function retryMarkets() {
  useMarkets.setState((s) => ({ attempt: s.attempt + 1 }));
}

export function parseCtx(raw: RawCtx): AssetCtx {
  return {
    markPx: Number(raw.markPx),
    midPx: raw.midPx === null ? null : Number(raw.midPx),
    prevDayPx: Number(raw.prevDayPx),
    funding: Number(raw.funding),
    openInterest: Number(raw.openInterest),
    dayNtlVlm: Number(raw.dayNtlVlm),
    oraclePx: Number(raw.oraclePx),
  };
}

function sameCtx(a: AssetCtx, b: AssetCtx) {
  return (
    a.markPx === b.markPx &&
    a.midPx === b.midPx &&
    a.funding === b.funding &&
    a.dayNtlVlm === b.dayNtlVlm &&
    a.openInterest === b.openInterest &&
    a.prevDayPx === b.prevDayPx
  );
}

/**
 * Merges a full asset-context snapshot into the store. A coin keeps its previous object when
 * nothing changed, so list rows (which select their own coin) re-render only when their
 * numbers move.
 */
export function applyCtxs(raw: RawCtx[]) {
  const { universe, ctxByCoin } = useMarkets.getState();
  const next: Record<string, AssetCtx> = {};
  for (let i = 0; i < raw.length && i < universe.length; i++) {
    const coin = universe[i];
    const parsed = parseCtx(raw[i]);
    const prev = ctxByCoin[coin];
    next[coin] = prev && sameCtx(prev, parsed) ? prev : parsed;
  }
  useMarkets.setState({ ctxByCoin: next, updatedAt: Date.now() });
}

async function loadSnapshot(network: Network) {
  const { info } = getClients(network);
  const [meta, ctxs] = await withRetry(() => info.metaAndAssetCtxs());
  const universe = meta.universe.map((u) => u.name);
  const perps: Perp[] = meta.universe
    .map((u, index) => ({
      coin: u.name,
      index,
      szDecimals: u.szDecimals,
      maxLeverage: u.maxLeverage,
      isolatedOnly: Boolean(u.onlyIsolated || u.marginMode),
      delisted: Boolean(u.isDelisted),
      volume: Number(ctxs[index]?.dayNtlVlm ?? 0),
    }))
    .filter((p) => !p.delisted)
    .sort((a, b) => b.volume - a.volume)
    .map(({ delisted, volume, ...perp }) => perp);
  const perpByCoin = Object.fromEntries(perps.map((p) => [p.coin, p]));
  useMarkets.setState({ universe, perps, perpByCoin, error: null });
  applyCtxs(ctxs);
}

/**
 * Loads the market list once per network (and after returning from the background). Mounted
 * at the root because every screen needs the market metadata: asset ids, size decimals,
 * max leverage.
 */
/** Pull-to-refresh: a fresh snapshot now, without waiting for the next stream message. */
export function refreshMarkets(): Promise<void> {
  return loadSnapshot(useConnection.getState().network).catch((e) => reportFeedError('markets', e));
}

let loadedNetwork: Network | null = null;

export function useMarketsFeed() {
  const network = useConnection((s) => s.network);
  const epoch = useConnection((s) => s.epoch);
  const attempt = useMarkets((s) => s.attempt);

  useEffect(() => {
    let cancelled = false;
    // Asset ids differ per network (BTC is 0 on mainnet, 3 on testnet), so a network change must
    // clear the old universe before anything can use it. Returning from the background keeps it.
    if (loadedNetwork !== network) {
      useMarkets.setState(empty);
      loadedNetwork = network;
    }
    loadSnapshot(network).catch((error) => {
      reportFeedError('markets', error);
      if (!cancelled) useMarkets.setState({ error: 'Could not load markets' });
    });
    return () => {
      cancelled = true;
    };
  }, [network, epoch, attempt]);
}

// The all-markets stream is about 54 KB every 4 s (roughly 43 MB an hour on mobile data), so it
// runs only while a screen that shows every market is focused.
const REFRESH_IF_OLDER_THAN = 12_000;

/** Live prices for every market, while the calling screen is focused. */
export function useLiveMarkets() {
  const network = useConnection((s) => s.network);
  const epoch = useConnection((s) => s.epoch);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let unsubscribe: (() => void) | undefined;
      const { updatedAt } = useMarkets.getState();
      if (updatedAt !== null && Date.now() - updatedAt > REFRESH_IF_OLDER_THAN) {
        loadSnapshot(network).catch((e) => reportFeedError('markets', e));
      }
      getClients(network)
        .subs.assetCtxs((event) => {
          countMessage('markets');
          onNextFrame('markets', () => applyCtxs(event.ctxs));
        })
        .then((sub) => {
          if (cancelled) sub.unsubscribe().catch(() => {});
          else unsubscribe = () => sub.unsubscribe().catch(() => {});
        })
        .catch((e) => reportFeedError('markets', e));
      return () => {
        cancelled = true;
        unsubscribe?.();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- a new epoch must resubscribe
    }, [network, epoch]),
  );
}
