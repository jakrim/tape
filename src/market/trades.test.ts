/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mergeTrades, type Trade } from './trades.ts';

const t = (id: number, time: number): Trade => ({ id, time, px: 100, sz: 1, side: 'buy' });

test('new trades go on top, newest first', () => {
  const merged = mergeTrades([t(3, 30), t(4, 40)], [t(2, 20), t(1, 10)], 10);
  assert.deepEqual(merged.map((x) => x.id), [4, 3, 2, 1]);
});

test('trades resent after a reconnect are not duplicated', () => {
  const existing = [t(2, 20), t(1, 10)];
  const merged = mergeTrades([t(1, 10), t(2, 20), t(3, 30)], existing, 10);
  assert.deepEqual(merged.map((x) => x.id), [3, 2, 1]);
});

test('nothing new keeps the same array, so nothing re-renders', () => {
  const existing = [t(2, 20), t(1, 10)];
  assert.equal(mergeTrades([t(1, 10)], existing, 10), existing);
});

test('the tape is capped', () => {
  const merged = mergeTrades([t(5, 50), t(4, 40), t(3, 30)], [t(2, 20), t(1, 10)], 3);
  assert.deepEqual(merged.map((x) => x.id), [5, 4, 3]);
});
