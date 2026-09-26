export type Trade = { id: number; px: number; sz: number; side: 'buy' | 'sell'; time: number };

/**
 * Adds new trades to the tape, newest first. After a reconnect the exchange resends recent
 * trades, so anything already on the tape is skipped. Returns the same array when nothing is
 * new, so subscribers don't re-render.
 */
export function mergeTrades(incoming: Trade[], existing: Trade[], max: number): Trade[] {
  const seen = new Set(existing.map((t) => t.id));
  const fresh: Trade[] = [];
  for (const t of incoming) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    fresh.push(t);
  }
  if (fresh.length === 0) return existing;
  return [...fresh, ...existing].sort((a, b) => b.time - a.time || b.id - a.id).slice(0, max);
}
