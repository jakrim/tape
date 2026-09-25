// Plain counters, deliberately not React state: incrementing them per message must cost nothing.
// The diagnostics screen reads them on the shared one-second clock.
export const counters = { markets: 0, book: 0, trades: 0, assetCtx: 0, candle: 0, user: 0 };

export const feedErrors: { stream: string; message: string; at: number }[] = [];

export function reportFeedError(stream: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  feedErrors.unshift({ stream, message, at: Date.now() });
  feedErrors.length = Math.min(feedErrors.length, 20);
  console.warn(`[feed:${stream}]`, message);
}
