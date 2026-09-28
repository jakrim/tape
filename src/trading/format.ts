// Display formatting. Pure functions, tested in format.test.ts.

const formatters = new Map<number, Intl.NumberFormat>();

function fixed(decimals: number): Intl.NumberFormat {
  let f = formatters.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    formatters.set(decimals, f);
  }
  return f;
}

/** Decimals needed to show 5 significant figures, the precision Hyperliquid quotes in (max 6). */
export function priceDecimals(px: number): number {
  const abs = Math.abs(px);
  if (abs === 0 || !Number.isFinite(abs)) return 2;
  const intDigits = Math.floor(Math.log10(abs)) + 1;
  return Math.min(6, Math.max(0, 5 - intDigits));
}

export function formatPrice(px: number | string, decimals?: number): string {
  const n = typeof px === 'string' ? Number(px) : px;
  if (!Number.isFinite(n)) return '—';
  return fixed(decimals ?? priceDecimals(n)).format(n);
}

/**
 * Consumer price display: dollars and cents, plus any finer digits the exchange quotes.
 * Decimals are fixed per magnitude so a price ending in 0 ($91.680) keeps its width.
 * Never use this for order sizing.
 */
export function formatDisplayPrice(px: number | string): string {
  const n = typeof px === 'string' ? Number(px) : px;
  if (!Number.isFinite(n)) return '—';
  return `${n < 0 ? '-' : ''}$${fixed(Math.max(2, priceDecimals(n))).format(Math.abs(n))}`;
}

export function displayedPriceDirection(previous: number | undefined, current: number | undefined): -1 | 0 | 1 {
  if (previous === undefined || current === undefined || !Number.isFinite(previous) || !Number.isFinite(current)
    || formatDisplayPrice(previous) === formatDisplayPrice(current)) return 0;
  return current > previous ? 1 : -1;
}

export function formatUsd(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${fixed(decimals).format(Math.abs(n))}`;
}

export function formatUsdCompact(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function formatPct(fraction: number, decimals = 2): string {
  if (!Number.isFinite(fraction)) return '—';
  const pct = fraction * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(decimals)}%`;
}

/** Hourly funding rate as a percentage, e.g. 0.0000125 -> "0.0013%". */
export function formatFunding(rate: number): string {
  if (!Number.isFinite(rate)) return '—';
  return `${(rate * 100).toFixed(4)}%`;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function shortAddress(address: string): string {
  return address.length > 10 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}
