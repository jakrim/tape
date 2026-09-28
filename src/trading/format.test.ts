/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { displayedPriceDirection, formatDisplayPrice, formatCountdown, formatFunding, formatPct, formatPrice, formatUsdCompact, priceDecimals } from './format.ts';

test('prices show 5 significant figures, like the exchange quotes them', () => {
  assert.equal(priceDecimals(84040), 0);
  assert.equal(priceDecimals(2693.1), 1);
  assert.equal(priceDecimals(1.2345), 4);
  assert.equal(priceDecimals(0.001234), 6);
  assert.equal(formatPrice('84040.0'), '84,040');
  assert.equal(formatPrice(2693.15), '2,693.2');
  assert.equal(formatPrice('not a number'), '—');
});

test('compact volume and percentages', () => {
  assert.equal(formatUsdCompact(2_874_646_705), '$2.87B');
  assert.equal(formatUsdCompact(38_261_910), '$38.26M');
  assert.equal(formatUsdCompact(950_000), '$950.0K');
  assert.equal(formatPct(0.0123), '+1.23%');
  assert.equal(formatPct(-0.05), '-5.00%');
  assert.equal(formatFunding(0.0000095351), '0.0010%');
  assert.equal(formatCountdown(65_000), '01:05');
});

test('display prices keep cents and extra quoted precision without changing wire formatting', () => {
  assert.equal(formatDisplayPrice(84585), '$84,585.00');
  assert.equal(formatDisplayPrice(2688.2), '$2,688.20');
  assert.equal(formatDisplayPrice(91.681), '$91.681');
  assert.equal(formatDisplayPrice(91.68), '$91.680');
  assert.equal(formatDisplayPrice(0.004405), '$0.004405');
  assert.equal(formatDisplayPrice(NaN), '—');
  assert.equal(formatPrice(84585), '84,585');
});

test('price pulses only on a visible change and never on initial data', () => {
  assert.equal(displayedPriceDirection(undefined, 100), 0);
  assert.equal(displayedPriceDirection(100, 101), 1);
  assert.equal(displayedPriceDirection(100, 99), -1);
  assert.equal(displayedPriceDirection(100, 100), 0);
  assert.equal(displayedPriceDirection(1, 1.000000001), 0);
  assert.equal(displayedPriceDirection(NaN, 1), 0);
});
