import type { ISubscription } from '@nktkas/hyperliquid';
import { useEffect } from 'react';
import { create } from 'zustand';

import { onNextFrame } from '@/market/batcher';
import { getClients, useConnection } from '@/market/clients';
import { counters, reportFeedError } from '@/market/diagnostics';

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

type AccountState = {
  accountValue: number | null;
  withdrawable: number | null;
  marginUsed: number | null;
  positions: Position[];
  orders: OpenOrder[];
  updatedAt: number | null;
};

const empty: AccountState = { accountValue: null, withdrawable: null, marginUsed: null, positions: [], orders: [], updatedAt: null };

export const useAccount = create<AccountState>(() => empty);

/** Streams the owner's margin, positions and open orders from the exchange. Mounted once at the root. */
export function useAccountFeed() {
  const network = useConnection((s) => s.network);
  const user = useWallet((s) => s.owner?.address);

  useEffect(() => {
    useAccount.setState(empty);
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
        counters.user++;
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
        counters.user++;
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

    return () => {
      cancelled = true;
      handles.forEach((h) => h.unsubscribe().catch(() => {}));
    };
  }, [network, user]);
}
