import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { onNextFrame } from './batcher';
import { getClients, reconnect, useConnection, type Network } from './clients';
import { counters, reportFeedError } from './diagnostics';

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

type RawCtx = {
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
 * numbers move. 178 markets update every few seconds; typically only a fraction changed.
 */
function applyCtxs(raw: RawCtx[]) {
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
  const [meta, ctxs] = await info.metaAndAssetCtxs();
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
  useMarkets.setState({ universe, perps, perpByCoin });
  applyCtxs(ctxs);
}

/**
 * Keeps every market's price, funding and volume live while the app is open.
 * Mounted once at the root. Loads a snapshot over HTTP first so the list paints immediately,
 * then streams updates over the shared socket.
 */
export function useMarketsFeed() {
  const network = useConnection((s) => s.network);
  const attempt = useMarkets((s) => s.attempt);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    useMarkets.setState(empty);

    loadSnapshot(network)
      .then(() => {
        if (cancelled) return;
        return getClients(network).subs.assetCtxs((event) => {
          counters.markets++;
          onNextFrame('markets', () => applyCtxs(event.ctxs));
        });
      })
      .then((sub) => {
        if (!sub) return;
        if (cancelled) sub.unsubscribe().catch(() => {});
        else unsubscribe = () => sub.unsubscribe().catch(() => {});
      })
      .catch((error) => {
        reportFeedError('markets', error);
        if (!cancelled) useMarkets.setState({ error: 'Could not load markets' });
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [network, attempt]);

  // Returning from the background: the OS may have killed the socket without a close event.
  // Reconnecting forces fresh snapshots, and the freshness checks keep the UI honest meanwhile.
  useEffect(() => {
    let backgroundedAt = 0;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundedAt = Date.now();
      if (state === 'active' && backgroundedAt && Date.now() - backgroundedAt > 5_000) reconnect(network);
    });
    return () => sub.remove();
  }, [network]);
}
