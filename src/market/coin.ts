import type { ISubscription } from '@nktkas/hyperliquid';
import { useEffect } from 'react';
import { create } from 'zustand';

import { onNextFrame } from './batcher';
import { getClients, useConnection } from './clients';
import { countMessage, reportFeedError } from './diagnostics';
import { parseCtx, type AssetCtx } from './markets';

export type BookLevel = { px: number; sz: number; total: number };
export type Book = { bids: BookLevel[]; asks: BookLevel[]; time: number };
export type Trade = { id: number; px: number; sz: number; side: 'buy' | 'sell'; time: number };

type CoinState = {
  coin: string | null;
  book: Book | null;
  bookAt: number | null;
  trades: Trade[];
  ctx: AssetCtx | null;
  ctxAt: number | null;
};

const MAX_TRADES = 40;

const empty = { book: null, bookAt: null, trades: [], ctx: null, ctxAt: null };

export const useCoin = create<CoinState>(() => ({ coin: null, ...empty }));

function toLevels(raw: { px: string; sz: string }[]): BookLevel[] {
  let total = 0;
  return raw.map((l) => {
    const sz = Number(l.sz);
    total += sz;
    return { px: Number(l.px), sz, total };
  });
}

// Trades arrive as events, not snapshots, so we buffer them and append once per frame
// instead of letting a newer message replace an older one.
let tradeBuffer: Trade[] = [];

/**
 * Live data for one market: fast order book (top 5 levels, 2x/second), the trade tape,
 * and the focused asset context (mark, funding, OI about once a second).
 * Subscriptions share the app's single socket and are released when the screen unmounts.
 */
export function useCoinFeed(coin: string) {
  const network = useConnection((s) => s.network);

  useEffect(() => {
    useCoin.setState({ coin, ...empty });
    tradeBuffer = [];
    const { subs } = getClients(network);
    let cancelled = false;
    const handles: ISubscription[] = [];
    const track = (stream: string, p: Promise<ISubscription>) =>
      p
        .then((h) => {
          if (cancelled) h.unsubscribe().catch(() => {});
          else handles.push(h);
        })
        .catch((e) => reportFeedError(stream, e));

    track(
      'book',
      subs.l2Book({ coin, fast: true }, (event) => {
        countMessage('book');
        onNextFrame(`book:${coin}`, () => {
          const current = useCoin.getState();
          if (current.coin !== coin) return;
          // Never let an older snapshot overwrite a newer one.
          if (current.book && event.time < current.book.time) return;
          const [bids, asks] = event.levels;
          useCoin.setState({ book: { bids: toLevels(bids), asks: toLevels(asks), time: event.time }, bookAt: Date.now() });
        });
      }),
    );

    track(
      'trades',
      subs.trades({ coin }, (event) => {
        countMessage('trades');
        for (const t of event) {
          tradeBuffer.push({ id: t.tid, px: Number(t.px), sz: Number(t.sz), side: t.side === 'B' ? 'buy' : 'sell', time: t.time });
        }
        onNextFrame(`trades:${coin}`, () => {
          if (useCoin.getState().coin !== coin) return;
          const incoming = tradeBuffer.reverse();
          tradeBuffer = [];
          useCoin.setState((s) => ({ trades: [...incoming, ...s.trades].slice(0, MAX_TRADES) }));
        });
      }),
    );

    track(
      'assetCtx',
      subs.activeAssetCtx({ coin }, (event) => {
        countMessage('assetCtx');
        onNextFrame(`ctx:${coin}`, () => {
          if (useCoin.getState().coin !== coin) return;
          useCoin.setState({ ctx: parseCtx(event.ctx), ctxAt: Date.now() });
        });
      }),
    );

    return () => {
      cancelled = true;
      handles.forEach((h) => h.unsubscribe().catch(() => {}));
    };
  }, [coin, network]);
}

/** Best bid/ask midpoint from the live book, or null if the book isn't loaded. */
export function bookMid(book: Book | null): number | null {
  const bid = book?.bids[0]?.px;
  const ask = book?.asks[0]?.px;
  return bid && ask ? (bid + ask) / 2 : null;
}
