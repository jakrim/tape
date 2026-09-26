import type { ISubscription } from '@nktkas/hyperliquid';
import { useEffect } from 'react';
import { create } from 'zustand';

import { onNextFrame } from '@/market/batcher';
import { getClients, useConnection } from '@/market/clients';
import { countMessage, reportFeedError } from '@/market/diagnostics';

import { formatPrice, formatUsd } from '@/trading/format';
import { showToast } from '@/ui/Toast';

import { useWallet } from './store';

export type Position = {
  coin: string;
  szi: number; // signed size: > 0 long, < 0 short
  entryPx: number;
  positionValue: number;
  unrealizedPnl: number;
  returnOnEquity: number;
  liquidationPx: number | null; // the exchange's own number, not our estimate
  leverage: number;
  isCross: boolean;
  marginUsed: number;
};

export type OpenOrder = {
  oid: number;
  coin: string;
  side: 'buy' | 'sell';
  limitPx: number;
  sz: number;
  orderType: string;
  triggerPx: number;
  reduceOnly: boolean;
  timestamp: number;
};

export type Fill = {
  id: number;
  coin: string;
  side: 'buy' | 'sell';
  px: number;
  sz: number;
  dir: string; // e.g. "Open Long", "Close Short"
  closedPnl: number;
  time: number;
};

type AccountState = {
  accountValue: number | null;
  withdrawable: number | null;
  marginUsed: number | null;
  positions: Position[];
  orders: OpenOrder[];
  fills: Fill[]; // newest first
  updatedAt: number | null;
};

const empty: AccountState = { accountValue: null, withdrawable: null, marginUsed: null, positions: [], orders: [], fills: [], updatedAt: null };
const MAX_FILLS = 20;

export const useAccount = create<AccountState>(() => empty);

let accountKey = '';

function announceFill(f: Fill) {
  const pnl = f.closedPnl !== 0 ? ` · realized ${formatUsd(f.closedPnl)}` : '';
  showToast({
    title: `Filled ${f.sz} ${f.coin}`,
    body: `${f.dir} at ${formatPrice(f.px)}${pnl}`,
    tone: 'up', // a fill always succeeded, even one that realizes a loss
  });
}

/** Streams the owner's margin, positions, open orders and fills from the exchange. Mounted once at the root. */
export function useAccountFeed() {
  const network = useConnection((s) => s.network);
  const epoch = useConnection((s) => s.epoch);
  const user = useWallet((s) => s.owner?.address);

  useEffect(() => {
    // A different wallet or network starts clean; a new socket for the same one keeps the last values.
    const key = `${network}:${user ?? ''}`;
    if (key !== accountKey) {
      useAccount.setState(empty);
      accountKey = key;
    }
    if (!user) return;
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
      'account',
      subs.clearinghouseState({ user }, (event) => {
        countMessage('user');
        onNextFrame('account', () => {
          const s = event.clearinghouseState;
          useAccount.setState({
            accountValue: Number(s.marginSummary.accountValue),
            withdrawable: Number(s.withdrawable),
            marginUsed: Number(s.marginSummary.totalMarginUsed),
            positions: s.assetPositions.map(({ position: p }) => ({
              coin: p.coin,
              szi: Number(p.szi),
              entryPx: Number(p.entryPx),
              positionValue: Number(p.positionValue),
              unrealizedPnl: Number(p.unrealizedPnl),
              returnOnEquity: Number(p.returnOnEquity),
              liquidationPx: p.liquidationPx === null ? null : Number(p.liquidationPx),
              leverage: p.leverage.value,
              isCross: p.leverage.type === 'cross',
              marginUsed: Number(p.marginUsed),
            })),
            updatedAt: Date.now(),
          });
        });
      }),
    );

    track(
      'orders',
      subs.openOrders({ user }, (event) => {
        countMessage('user');
        onNextFrame('orders', () => {
          useAccount.setState({
            orders: event.orders.map((o) => ({
              oid: o.oid,
              coin: o.coin,
              side: o.side === 'B' ? 'buy' : 'sell',
              limitPx: Number(o.limitPx),
              sz: Number(o.sz),
              orderType: o.orderType,
              triggerPx: Number(o.triggerPx),
              reduceOnly: o.reduceOnly,
              timestamp: o.timestamp,
            })),
          });
        });
      }),
    );

    // Fills arrive the moment the exchange matches an order, including a resting limit order that
    // fills minutes later. The first message is a snapshot of recent history: listed, not announced.
    track(
      'fills',
      subs.userFills({ user }, (event) => {
        countMessage('user');
        const incoming: Fill[] = event.fills.map((f) => ({
          id: f.tid,
          coin: f.coin,
          side: f.side === 'B' ? 'buy' : 'sell',
          px: Number(f.px),
          sz: Number(f.sz),
          dir: f.dir,
          closedPnl: Number(f.closedPnl),
          time: f.time,
        }));
        if (!event.isSnapshot) incoming.forEach(announceFill);
        onNextFrame('fills', () => {
          useAccount.setState((s) => {
            const seen = new Set(s.fills.map((f) => f.id));
            const fresh = incoming.filter((f) => !seen.has(f.id));
            if (fresh.length === 0) return s;
            return { fills: [...fresh, ...s.fills].sort((a, b) => b.time - a.time).slice(0, MAX_FILLS) };
          });
        });
      }),
    );

    return () => {
      cancelled = true;
      handles.forEach((h) => h.unsubscribe().catch(() => {}));
    };
  }, [network, user, epoch]);
}
