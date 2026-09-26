import { Sentry } from '@/lib/monitoring';

// Plain counters, deliberately not React state: incrementing them per message must cost nothing.
// The diagnostics screen reads them on the shared one-second clock.
export const counters = { markets: 0, book: 0, trades: 0, assetCtx: 0, candle: 0, user: 0 };

/**
 * Always count through this plain function. Writing `counters.book++` inside a hook gets
 * miscompiled by the React Compiler into `counters.book = _module.book + 1` (NaN), because
 * the read side loses the object. Plain module functions are not compiled.
 */
export function countMessage(stream: keyof typeof counters) {
  counters[stream] += 1;
}

export function totalMessages(): number {
  return counters.markets + counters.book + counters.trades + counters.assetCtx + counters.candle + counters.user;
}

export const feedErrors: { stream: string; message: string; at: number }[] = [];

export function reportFeedError(stream: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  Sentry.captureException(error, { tags: { stream } });
  feedErrors.unshift({ stream, message, at: Date.now() });
  feedErrors.length = Math.min(feedErrors.length, 20);
  console.warn(`[feed:${stream}]`, message);
}
