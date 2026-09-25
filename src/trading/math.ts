// Pure trading math. No React, no network: every function here is covered by math.test.ts.
// Rules follow the Hyperliquid docs (tick-and-lot-size, liquidations).

export type Side = 'long' | 'short';

// Perp prices may have at most 5 significant figures and at most (6 - szDecimals) decimals.
const MAX_PERP_DECIMALS = 6;
const MAX_SIG_FIGS = 5;

// Hyperliquid rejects orders below $10 notional.
export const MIN_ORDER_NOTIONAL = 10;

// Base-tier perp fees. Shown as estimates; the user's real tier can be lower.
export const TAKER_FEE = 0.00045;
export const MAKER_FEE = 0.00015;

// Market orders are sent as IOC limit orders with a price cap, like the official SDKs do.
export const DEFAULT_MARKET_SLIPPAGE = 0.05;

// TWAP orders run between 5 minutes and 24 hours.
export const TWAP_MIN_MINUTES = 5;
export const TWAP_MAX_MINUTES = 24 * 60;

function stripZeros(fixed: string): string {
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

/** Rounds a price to the nearest valid tick and returns it in wire format (no trailing zeros). */
export function toWirePrice(px: number, szDecimals: number): string {
  if (!(px > 0) || !Number.isFinite(px)) throw new Error('Price must be a positive number');
  // Integer prices are always valid, and above 100k a whole number is closer than 5 sig figs.
  if (px >= 1e5) return String(Math.round(px));
  const maxDecimals = Math.max(0, MAX_PERP_DECIMALS - szDecimals);
  const rounded = Number(Number(px.toPrecision(MAX_SIG_FIGS)).toFixed(maxDecimals));
  if (rounded <= 0) throw new Error('Price is below the smallest tick');
  return stripZeros(rounded.toFixed(maxDecimals));
}

/** Rounds a size down to the asset's lot size, so we never send more than the user asked for. */
export function toWireSize(size: number, szDecimals: number): string {
  if (!(size > 0) || !Number.isFinite(size)) return '0';
  const factor = 10 ** szDecimals;
  const floored = Math.floor(size * factor + 1e-9) / factor;
  return stripZeros(floored.toFixed(szDecimals));
}

/** IOC price cap for a market order: the mid moved against us by the slippage allowance. */
export function marketLimitPrice(mid: number, side: Side, szDecimals: number, slippage = DEFAULT_MARKET_SLIPPAGE): string {
  const px = side === 'long' ? mid * (1 + slippage) : mid * (1 - slippage);
  return toWirePrice(px, szDecimals);
}

export function marginRequired(notional: number, leverage: number): number {
  return notional / leverage;
}

export function feeEstimate(notional: number, isTaker: boolean): number {
  return notional * (isTaker ? TAKER_FEE : MAKER_FEE);
}

/**
 * Estimated liquidation price for a new position.
 * liq = price - side * margin_available / size / (1 - l * side), where l = 1 / (2 * maxLeverage).
 * Isolated: margin_available = margin posted - maintenance margin.
 * Cross: margin_available = account value - maintenance margin.
 * Assets with margin tiers can differ, so the UI labels this as an estimate and shows the
 * exchange's own liquidation price once the position exists.
 */
export function estimateLiquidationPrice(p: {
  side: Side;
  entryPx: number;
  size: number;
  leverage: number;
  maxLeverage: number;
  isCross: boolean;
  accountValue?: number;
}): number | null {
  const { side, entryPx, size, leverage, maxLeverage, isCross, accountValue } = p;
  if (!(entryPx > 0 && size > 0 && leverage > 0 && maxLeverage > 0)) return null;
  const s = side === 'long' ? 1 : -1;
  const l = 1 / (2 * maxLeverage);
  const notional = entryPx * size;
  const maintenance = notional * l;
  const collateral = isCross && accountValue !== undefined ? accountValue : notional / leverage;
  const marginAvailable = collateral - maintenance;
  const liq = entryPx - (s * marginAvailable) / size / (1 - l * s);
  return liq > 0 ? liq : null;
}

export function unrealizedPnl(side: Side, entryPx: number, markPx: number, size: number): number {
  return (side === 'long' ? markPx - entryPx : entryPx - markPx) * size;
}

/** Milliseconds until the next hourly funding payment. */
export function msToNextFunding(now: number): number {
  const hour = 60 * 60 * 1000;
  return hour - (now % hour);
}

export type OrderKind = 'market' | 'limit' | 'twap';

export type TicketInput = {
  kind: OrderKind;
  side: Side;
  notionalUsd: number;
  leverage: number;
  maxLeverage: number;
  limitPx?: number;
  referencePx: number; // mid price used for market orders and TP/SL sanity checks
  takeProfitPx?: number;
  stopLossPx?: number;
  twapMinutes?: number;
  availableMargin?: number; // undefined when no wallet is connected
  dataIsLive: boolean;
};

/** Returns the first reason the order can't be sent, or null when it's valid. */
export function validateTicket(t: TicketInput): string | null {
  if (!t.dataIsLive) return 'Waiting for live prices';
  if (!(t.notionalUsd > 0)) return 'Enter an amount';
  if (t.notionalUsd < MIN_ORDER_NOTIONAL) return `Minimum order is $${MIN_ORDER_NOTIONAL}`;
  if (!(t.leverage >= 1 && t.leverage <= t.maxLeverage)) return `Leverage must be 1–${t.maxLeverage}x`;
  if (t.kind === 'limit' && !(t.limitPx && t.limitPx > 0)) return 'Enter a limit price';
  if (t.kind === 'twap') {
    const m = t.twapMinutes ?? 0;
    if (m < TWAP_MIN_MINUTES || m > TWAP_MAX_MINUTES) return 'TWAP runs 5 minutes to 24 hours';
  }
  const entry = t.kind === 'limit' && t.limitPx ? t.limitPx : t.referencePx;
  const isLong = t.side === 'long';
  if (t.takeProfitPx !== undefined) {
    if (isLong ? t.takeProfitPx <= entry : t.takeProfitPx >= entry)
      return `Take profit must be ${isLong ? 'above' : 'below'} entry`;
  }
  if (t.stopLossPx !== undefined) {
    if (isLong ? t.stopLossPx >= entry : t.stopLossPx <= entry)
      return `Stop loss must be ${isLong ? 'below' : 'above'} entry`;
  }
  if (t.availableMargin !== undefined && marginRequired(t.notionalUsd, t.leverage) > t.availableMargin)
    return 'Not enough margin';
  return null;
}
