/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { summarizeQuote } from './relay.ts';

// Recorded from api.relay.link on 2026-09-25: 100 USDC on Base into Hyperliquid perps.
const fixture = JSON.parse(readFileSync(new URL('./relayQuote.fixture.json', import.meta.url), 'utf8'));

test('a Relay quote reduces to what the deposit sheet shows', () => {
  const q = summarizeQuote(fixture);
  assert.equal(q.send, 100);
  assert.equal(q.receive, 98.769998);
  assert.equal(q.relayerFeeUsd, 1.229874);
  assert.equal(q.gasFeeUsd, 0.008296);
  assert.equal(q.seconds, 1);
  assert.equal(q.impactPct, -1.23);
  assert.deepEqual(q.steps, ['Approve USDC', 'Deposit']);
});

test('missing fees count as zero rather than NaN', () => {
  const q = summarizeQuote({ ...fixture, fees: {} });
  assert.equal(q.relayerFeeUsd, 0);
  assert.equal(q.gasFeeUsd, 0);
});
