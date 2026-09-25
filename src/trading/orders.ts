import type { Network } from '@/market/clients';
import type { Perp } from '@/market/markets';
import { agentExchange } from '@/wallet/trading';

import { marketLimitPrice, toWirePrice, toWireSize, type OrderKind, type Side } from './math';

export type Ticket = {
  kind: OrderKind;
  side: Side;
  notionalUsd: number;
  leverage: number;
  isCross: boolean;
  referencePx: number; // live mid
  limitPx?: number;
  takeProfitPx?: number;
  stopLossPx?: number;
  twapMinutes?: number;
};

// What the exchange actually did. The UI shows this, never an optimistic guess.
export type Outcome =
  | { status: 'filled'; size: string; avgPx: string }
  | { status: 'resting'; oid: number }
  | { status: 'twap'; twapId: number }
  | { status: 'waiting' };

type OrderStatus = { resting: { oid: number } } | { filled: { totalSz: string; avgPx: string; oid: number } } | { error: string } | string;

function toOutcome(status: OrderStatus | undefined): Outcome {
  if (!status || typeof status === 'string') return { status: 'waiting' };
  if ('error' in status) throw new Error(status.error);
  if ('filled' in status) return { status: 'filled', size: status.filled.totalSz, avgPx: status.filled.avgPx };
  return { status: 'resting', oid: status.resting.oid };
}

export async function submitTicket(t: Ticket, perp: Perp, network: Network): Promise<Outcome> {
  const exchange = agentExchange(network);
  const isBuy = t.side === 'long';
  const entryPx = t.kind === 'limit' && t.limitPx ? t.limitPx : t.referencePx;
  const size = toWireSize(t.notionalUsd / entryPx, perp.szDecimals);
  if (Number(size) <= 0) throw new Error('Amount is smaller than the minimum size');

  // Leverage is per asset on Hyperliquid, so set it explicitly before every entry.
  await exchange.updateLeverage({ asset: perp.index, isCross: t.isCross && !perp.isolatedOnly, leverage: t.leverage });

  if (t.kind === 'twap') {
    const res = await exchange.twapOrder({
      twap: { a: perp.index, b: isBuy, s: size, r: false, m: t.twapMinutes ?? 30, t: false },
    });
    // The SDK throws on exchange errors, so a returned response is always a running TWAP.
    return { status: 'twap', twapId: res.response.data.status.running.twapId };
  }

  const price =
    t.kind === 'market' ? marketLimitPrice(t.referencePx, t.side, perp.szDecimals) : toWirePrice(entryPx, perp.szDecimals);
  const orders = [
    { a: perp.index, b: isBuy, p: price, s: size, r: false, t: { limit: { tif: t.kind === 'market' ? ('Ioc' as const) : ('Gtc' as const) } } },
  ];
  // TP/SL ride along as reduce-only trigger orders on the opposite side, grouped with the entry.
  const exitSide: Side = isBuy ? 'short' : 'long';
  for (const [px, tpsl] of [
    [t.takeProfitPx, 'tp'],
    [t.stopLossPx, 'sl'],
  ] as const) {
    if (px === undefined) continue;
    orders.push({
      a: perp.index,
      b: !isBuy,
      p: marketLimitPrice(px, exitSide, perp.szDecimals),
      s: size,
      r: true,
      t: { trigger: { isMarket: true, triggerPx: toWirePrice(px, perp.szDecimals), tpsl } } as never,
    });
  }

  const res = await exchange.order({ orders, grouping: orders.length > 1 ? 'normalTpsl' : 'na' });
  return toOutcome(res.response.data.statuses[0] as OrderStatus);
}

/** Market-closes a position with a reduce-only IOC order. */
export async function closePosition(p: { szi: number }, perp: Perp, markPx: number, network: Network): Promise<Outcome> {
  const exchange = agentExchange(network);
  const closingSide: Side = p.szi > 0 ? 'short' : 'long';
  const res = await exchange.order({
    orders: [
      {
        a: perp.index,
        b: closingSide === 'long',
        p: marketLimitPrice(markPx, closingSide, perp.szDecimals),
        s: toWireSize(Math.abs(p.szi), perp.szDecimals),
        r: true,
        t: { limit: { tif: 'Ioc' } },
      },
    ],
    grouping: 'na',
  });
  return toOutcome(res.response.data.statuses[0] as OrderStatus);
}

export async function cancelOrder(oid: number, perp: Perp, network: Network) {
  await agentExchange(network).cancel({ cancels: [{ a: perp.index, o: oid }] });
}
