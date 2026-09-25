/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatCountdown, formatFunding, formatPct, formatPrice, formatUsdCompact, priceDecimals } from './format.ts';

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
