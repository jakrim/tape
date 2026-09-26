import { useEffect } from 'react';
import { create } from 'zustand';

import { onNextFrame } from './batcher';
import { getClients, useConnection } from './clients';
import { countMessage, reportFeedError } from './diagnostics';

export const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
export type Interval = (typeof INTERVALS)[number];

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

const INTERVAL_MS: Record<Interval, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

const CANDLE_COUNT = 90;

type CandleState = { key: string | null; candles: Candle[]; loading: boolean };

export const useCandleStore = create<CandleState>(() => ({ key: null, candles: [], loading: true }));

function parse(c: { t: number; o: string; h: string; l: string; c: string; v: string }): Candle {
  return { t: c.t, o: Number(c.o), h: Number(c.h), l: Number(c.l), c: Number(c.c), v: Number(c.v) };
}

/** Updates the forming candle in place, or appends when a new period starts. Ignores stale candles. */
export function upsertCandle(candles: Candle[], next: Candle, max = CANDLE_COUNT): Candle[] {
  const last = candles[candles.length - 1];
  if (!last || next.t > last.t) return [...candles, next].slice(-max);
  if (next.t === last.t) return [...candles.slice(0, -1), next];
  return candles;
}

/** History over HTTP, then the forming candle over the shared socket. */
export function useCandles(coin: string, interval: Interval) {
  const network = useConnection((s) => s.network);

  useEffect(() => {
    const key = `${network}:${coin}:${interval}`;
    useCandleStore.setState({ key, candles: [], loading: true });
    const { info, subs } = getClients(network);
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const endTime = Date.now();
    info
      .candleSnapshot({ coin, interval, startTime: endTime - INTERVAL_MS[interval] * CANDLE_COUNT, endTime })
      .then((history) => {
        if (cancelled) return;
        useCandleStore.setState({ candles: history.map(parse), loading: false });
        return subs.candle({ coin, interval }, (event) => {
          countMessage('candle');
          onNextFrame(`candle:${key}`, () => {
            if (useCandleStore.getState().key !== key) return;
            useCandleStore.setState((s) => ({ candles: upsertCandle(s.candles, parse(event)) }));
          });
        });
      })
      .then((sub) => {
        if (!sub) return;
        if (cancelled) sub.unsubscribe().catch(() => {});
        else unsubscribe = () => sub.unsubscribe().catch(() => {});
      })
      .catch((e) => {
        reportFeedError('candles', e);
        if (!cancelled) useCandleStore.setState({ loading: false });
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [coin, interval, network]);
}
