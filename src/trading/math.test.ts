/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  estimateLiquidationPrice,
  marketLimitPrice,
  msToNextFunding,
  toWirePrice,
  toWireSize,
  unrealizedPnl,
  validateTicket,
  validateOrderPrecision,
  type TicketInput,
} from './math.ts';

test('prices follow the Hyperliquid tick rules (examples from the docs)', () => {
  assert.equal(toWirePrice(1234.5, 0), '1234.5');
  assert.equal(toWirePrice(1234.56, 0), '1234.6'); // 6 sig figs -> 5
  assert.equal(toWirePrice(0.001234, 0), '0.001234');
  assert.equal(toWirePrice(0.0012345, 0), '0.001234'); // max 6 decimals (0.0012345 is stored just below the tie)
  assert.equal(toWirePrice(0.01234, 1), '0.01234');
  assert.equal(toWirePrice(0.012345, 1), '0.01235'); // 6 - szDecimals(1) = 5 decimals
});

test('large prices round to integers, which are always valid', () => {
  assert.equal(toWirePrice(84040.4, 5), '84040');
  assert.equal(toWirePrice(123456.7, 5), '123457');
  assert.equal(toWirePrice(99999.6, 5), '100000');
});

test('prices never carry trailing zeros on the wire', () => {
  assert.equal(toWirePrice(2693.1, 4), '2693.1');
  assert.equal(toWirePrice(150, 2), '150');
});

test('invalid prices throw instead of sending a bad order', () => {
  assert.throws(() => toWirePrice(0, 2));
  assert.throws(() => toWirePrice(Number.NaN, 2));
  assert.throws(() => toWirePrice(0.0000001, 0));
});

test('sizes round down to the lot size', () => {
  assert.equal(toWireSize(0.123456789, 5), '0.12345');
  assert.equal(toWireSize(1.99999, 2), '1.99');
  assert.equal(toWireSize(10, 0), '10');
  assert.equal(toWireSize(0.3, 1), '0.3'); // float noise (0.29999…) must not drop a lot
  assert.equal(toWireSize(-1, 2), '0');
});

test('market orders cap price at mid ± slippage', () => {
  assert.equal(marketLimitPrice(2000, 'long', 4, 0.05), '2100');
  assert.equal(marketLimitPrice(2000, 'short', 4, 0.05), '1900');
});

test('isolated liquidation price matches the documented formula', () => {
  // Long 1 BTC at 100k, 10x isolated, 40x max. l = 1/80, margin 10k, maintenance 1.25k.
  // liq = 100000 - 8750 / 1 / (1 - 0.0125) = 91139.24...
  const liq = estimateLiquidationPrice({
    side: 'long', entryPx: 100_000, size: 1, leverage: 10, maxLeverage: 40, isCross: false,
  });
  assert.ok(liq !== null);
  assert.ok(Math.abs(liq - 91139.2405) < 0.01, `got ${liq}`);

  const shortLiq = estimateLiquidationPrice({
    side: 'short', entryPx: 100_000, size: 1, leverage: 10, maxLeverage: 40, isCross: false,
  });
  assert.ok(shortLiq !== null && shortLiq > 100_000);
});

test('cross liquidation uses the whole account value', () => {
  const isolated = estimateLiquidationPrice({
    side: 'long', entryPx: 100, size: 10, leverage: 5, maxLeverage: 20, isCross: false,
  });
  const cross = estimateLiquidationPrice({
    side: 'long', entryPx: 100, size: 10, leverage: 5, maxLeverage: 20, isCross: true, accountValue: 400,
  });
  assert.ok(isolated !== null && cross !== null && cross < isolated);
});

test('an empty cross account never puts a long liquidation above entry', () => {
  // Regression: with $0 account value the estimate used to land above the entry price.
  const liq = estimateLiquidationPrice({
    side: 'long', entryPx: 2691.4, size: 0.0929, leverage: 10, maxLeverage: 25, isCross: true, accountValue: 0,
  });
  assert.ok(liq !== null && liq < 2691.4, `got ${liq}`);
});

test('a fully collateralized long cannot be liquidated', () => {
  const liq = estimateLiquidationPrice({
    side: 'long', entryPx: 100, size: 1, leverage: 1, maxLeverage: 50, isCross: false,
  });
  assert.equal(liq, null);
});

test('pnl and funding countdown', () => {
  assert.equal(unrealizedPnl('long', 100, 110, 2), 20);
  assert.equal(unrealizedPnl('short', 100, 110, 2), -20);
  assert.equal(msToNextFunding(Date.UTC(2026, 8, 25, 12, 59, 30)), 30_000);
});

const base: TicketInput = {
  kind: 'market', side: 'long', notionalUsd: 100, leverage: 10, maxLeverage: 40,
  referencePx: 100, dataIsLive: true,
};

test('ticket validation explains the first problem', () => {
  assert.equal(validateTicket(base), null);
  assert.equal(validateTicket({ ...base, dataIsLive: false }), 'Waiting for live prices');
  assert.equal(validateTicket({ ...base, notionalUsd: 5 }), 'Minimum order is $10');
  assert.equal(validateTicket({ ...base, leverage: 50 }), 'Leverage must be 1–40x');
  assert.equal(validateTicket({ ...base, kind: 'limit' }), 'Enter a limit price');
  assert.equal(validateTicket({ ...base, kind: 'twap', twapMinutes: 2 }), 'TWAP runs 5 minutes to 24 hours');
  assert.equal(validateTicket({ ...base, takeProfitPx: 90 }), 'Take profit must be above entry');
  assert.equal(validateTicket({ ...base, side: 'short', stopLossPx: 90 }), 'Stop loss must be above entry');
  assert.equal(validateTicket({ ...base, availableMargin: 5 }), 'Not enough margin');
});

test('invalid numeric inputs cannot reach order review', () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.notEqual(validateTicket({ ...base, notionalUsd: value }), null);
    assert.notEqual(validateTicket({ ...base, referencePx: value }), null);
    assert.notEqual(validateTicket({ ...base, takeProfitPx: value }), null);
    assert.notEqual(validateTicket({ ...base, stopLossPx: value }), null);
  }
  assert.notEqual(validateTicket({ ...base, kind: 'twap', twapMinutes: 5.5 }), null);
});

test('review rejects prices below the tick and amounts below the rounded lot minimum', () => {
  assert.equal(validateOrderPrecision(base, 3), null);
  assert.match(validateOrderPrecision({ ...base, kind: 'limit', limitPx: 0.000000001 }, 3)!, /smallest tick/);
  assert.match(validateOrderPrecision({ ...base, referencePx: 84585, notionalUsd: 10 }, 5)!, /Rounded order size/);
});
