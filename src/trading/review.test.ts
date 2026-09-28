import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reviewBlocker } from './review.ts';

const review = { ownerAddress: '0xABC', at: 1000 };
const current = { ownerAddress: '0xabc', network: 'testnet', now: 2000, dataIsLive: true, stressRunning: false };

test('review permits the same wallet on live testnet within 30 seconds', () => {
  assert.equal(reviewBlocker(review, current), null);
  assert.equal(reviewBlocker(review, { ...current, now: 31000 }), null);
});
test('confirmation fails closed after logout, network switch, stale prices or stress injection', () => {
  for (const changed of [
    { ownerAddress: undefined }, { ownerAddress: '0xDEF' }, { network: 'mainnet' },
    { dataIsLive: false }, { stressRunning: true }, { now: 31001 }, { now: 999 },
  ]) assert.notEqual(reviewBlocker(review, { ...current, ...changed }), null);
});
