import { create } from 'zustand';

import { onNextFrame } from './batcher';
import { useCandleStore, upsertCandle } from './candles';
import { useCoin, type Trade } from './coin';
import { countMessage } from './diagnostics';
import { applyCtxs, refreshMarkets, useMarkets, type RawCtx } from './markets';

/**
 * A reproducible burst test for "60 fps under sustained load". For a fixed time it pushes
 * synthetic updates through the same path as live data (socket handler -> frame batcher ->
 * stores -> components) at 20x to 50x normal traffic. The all-markets message is parsed from a
 * real-size JSON string each time, so JS parse cost is included. A banner labels the data as
 * synthetic the whole time, orders are blocked, and the real streams take over again after.
 */
export const RATES_PER_SECOND = { book: 40, trades: 100, assetCtx: 10, candle: 20, markets: 5 };
const TICK_MS = 10;

export type StressResults = {
  seconds: number;
  messages: number;
  avgUiFps: number;
  minUiFps: number;
  avgJsFps: number;
  minJsFps: number;
  maxJsStallMs: number;
};

type StressState = {
  running: boolean;
  endsAt: number;
  results: StressResults | null;
};

export const useStress = create<StressState>(() => ({ running: false, endsAt: 0, results: null }));

// Per-second samples reported by the overlay while the test runs.
const samples = { minUi: Infinity, minJs: Infinity, sumUi: 0, sumJs: 0, n: 0, maxStall: 0, messages: 0 };
export function reportStressSample(uiFps: number, jsFps: number, stallMs: number) {
  samples.minUi = Math.min(samples.minUi, uiFps);
  samples.minJs = Math.min(samples.minJs, jsFps);
  samples.sumUi += uiFps;
  samples.sumJs += jsFps;
  samples.n += 1;
  samples.maxStall = Math.max(samples.maxStall, stallMs);
}

const jitter = (x: number, pct: number) => x * (1 + (Math.random() * 2 - 1) * pct);

export function startStressTest(seconds = 15) {
  if (useStress.getState().running) return;
  const { ctxByCoin, universe } = useMarkets.getState();
  // A real-size all-markets payload, re-parsed for every synthetic message.
  const template = JSON.stringify(
    universe.map((coin) => {
      const c = ctxByCoin[coin];
      return {
        markPx: String(c?.markPx ?? 1),
        midPx: String(c?.midPx ?? c?.markPx ?? 1),
        prevDayPx: String(c?.prevDayPx ?? 1),
        funding: String(c?.funding ?? 0),
        openInterest: String(c?.openInterest ?? 0),
        dayNtlVlm: String(c?.dayNtlVlm ?? 0),
        oraclePx: String(c?.oraclePx ?? 1),
        premium: '0',
        impactPxs: [String(c?.markPx ?? 1), String(c?.markPx ?? 1)],
        dayBaseVlm: '0',
      };
    }),
  );

  Object.assign(samples, { minUi: Infinity, minJs: Infinity, sumUi: 0, sumJs: 0, n: 0, maxStall: 0, messages: 0 });
  useStress.setState({ running: true, endsAt: Date.now() + seconds * 1000, results: null });

  const owed = { book: 0, trades: 0, assetCtx: 0, candle: 0, markets: 0 };
  let tradeId = -1;
  let lastTick = Date.now();
  const timer = setInterval(() => {
    // Pace by elapsed time: if the JS thread falls behind, the backlog grows like a real
    // socket's would, instead of the generator quietly producing less load.
    const now = Date.now();
    const dt = now - lastTick;
    lastTick = now;
    for (const k of Object.keys(owed) as (keyof typeof owed)[]) owed[k] += (RATES_PER_SECOND[k] * dt) / 1000;
    const { coin, book, ctx } = useCoin.getState();

    while (owed.markets >= 1) {
      owed.markets -= 1;
      samples.messages++;
      countMessage('markets');
      const raw = JSON.parse(template) as RawCtx[];
      for (let i = 0; i < 12 && raw.length; i++) {
        const r = raw[Math.floor(Math.random() * raw.length)];
        r.markPx = String(jitter(Number(r.markPx), 0.002));
      }
      onNextFrame('markets', () => applyCtxs(raw));
    }

    if (coin && book) {
      while (owed.book >= 1) {
        owed.book -= 1;
        samples.messages++;
        countMessage('book');
        const next = {
          time: book.time, // same exchange time, so the next real snapshot is accepted immediately
          bids: book.bids.map((l) => ({ ...l, sz: jitter(l.sz, 0.3) })),
          asks: book.asks.map((l) => ({ ...l, sz: jitter(l.sz, 0.3) })),
        };
        let total = 0;
        for (const l of next.bids) l.total = total += l.sz;
        total = 0;
        for (const l of next.asks) l.total = total += l.sz;
        onNextFrame(`book:${coin}`, () => useCoin.setState({ book: next, bookAt: Date.now() }));
      }
      const mid = (book.bids[0].px + book.asks[0].px) / 2;
      const incoming: Trade[] = [];
      while (owed.trades >= 1) {
        owed.trades -= 1;
        samples.messages++;
        countMessage('trades');
        incoming.push({ id: tradeId--, px: jitter(mid, 0.0002), sz: Math.random(), side: Math.random() > 0.5 ? ('buy' as const) : ('sell' as const), time: Date.now() });
      }
      if (incoming.length) {
        onNextFrame(`trades:${coin}`, () => useCoin.setState((s) => ({ trades: [...incoming.reverse(), ...s.trades].slice(0, 40) })));
      }
      while (owed.assetCtx >= 1 && ctx) {
        owed.assetCtx -= 1;
        samples.messages++;
        countMessage('assetCtx');
        const next = { ...ctx, markPx: jitter(mid, 0.0005) };
        onNextFrame(`ctx:${coin}`, () => useCoin.setState({ ctx: next, ctxAt: Date.now() }));
      }
      while (owed.candle >= 1) {
        owed.candle -= 1;
        samples.messages++;
        countMessage('candle');
        const { candles, key } = useCandleStore.getState();
        const last = candles[candles.length - 1];
        if (last && key) {
          const c = jitter(last.c, 0.0005);
          const next = { ...last, c, h: Math.max(last.h, c), l: Math.min(last.l, c) };
          onNextFrame(`candle:${key}`, () => useCandleStore.setState((s) => ({ candles: upsertCandle(s.candles, next) })));
        }
      }
    }
    owed.book %= 1;
    owed.trades %= 1;
    owed.assetCtx %= 1;
    owed.candle %= 1;

    if (Date.now() >= useStress.getState().endsAt) {
      clearInterval(timer);
      finish(seconds);
    }
  }, TICK_MS);
}

function finish(seconds: number) {
  // Drop synthetic trades and let the real streams (and a fresh market snapshot) take over.
  useCoin.setState((s) => ({ trades: s.trades.filter((t) => t.id >= 0) }));
  refreshMarkets();
  useStress.setState({
    running: false,
    results: {
      seconds,
      messages: samples.messages,
      avgUiFps: samples.n ? Math.round(samples.sumUi / samples.n) : 0,
      minUiFps: Number.isFinite(samples.minUi) ? samples.minUi : 0,
      avgJsFps: samples.n ? Math.round(samples.sumJs / samples.n) : 0,
      minJsFps: Number.isFinite(samples.minJs) ? samples.minJs : 0,
      maxJsStallMs: samples.maxStall,
    },
  });
}
