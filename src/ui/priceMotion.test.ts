import assert from 'node:assert/strict';
import { test } from 'node:test';
import { priceTransition } from './priceMotion.ts';

test('initial, missing and invalid quotes do not imply a move', () => {
  for (const [before, after] of [[undefined, 100], [100, undefined], [100, NaN], [Infinity, 100]] as const) {
    const result = priceTransition(before, after);
    assert.equal(result.direction, 0);
    assert.equal(result.glyphs.some(g => g.changed), false);
  }
});
test('only the changed cent rolls on an increase', () => {
  const result = priceTransition(123.45, 123.46);
  assert.equal(result.direction, 1);
  assert.equal(result.label, '$123.46');
  assert.deepEqual(result.glyphs.filter(g => g.changed).map(g => [g.previous, g.current]), [['5', '6']]);
});
test('a decrease rolls downward even when an individual digit increases', () => {
  const result = priceTransition(100.00, 99.99);
  assert.equal(result.direction, -1);
  assert.deepEqual(result.glyphs.filter(g => g.changed).map(g => [g.previous, g.current]), [['0', '9'], ['0', '9'], ['0', '9'], ['0', '9']]);
});
test('carry across a thousands separator keeps matching decimal places', () => {
  const result = priceTransition(999.99, 1000);
  assert.equal(result.label, '$1,000.00');
  assert.equal(new Set(result.glyphs.map(g => g.key)).size, result.glyphs.length);
  assert.equal(result.glyphs.filter(g => g.changed).length, 5);
  assert.equal(result.glyphs.find(g => g.current === ',')?.changed, false);
});
test('small-asset precision survives and stable display does not move', () => {
  // Hyperliquid perps quote at most 6 decimals.
  assert.equal(priceTransition(0.004405, 0.004406).label, '$0.004406');
  assert.equal(priceTransition(1.000000001, 1.000000002).direction, 0);
});
test('rapid reversal uses the latest quote rather than a queued older value', () => {
  const up = priceTransition(100, 101);
  const down = priceTransition(101, 99);
  assert.equal(up.direction, 1);
  assert.equal(down.direction, -1);
  assert.equal(down.label, '$99.000'); // 5 significant figures, as quoted
  assert.equal(down.glyphs.find(g => g.key === 'integer-1')?.previous, '1');
});
