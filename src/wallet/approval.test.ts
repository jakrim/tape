import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApprovalSession } from './approval.ts';

const context = { ownerAddress: '0xABC', network: 'testnet' as const };

test('mainnet approval and signing are rejected before any operation', async () => {
  const session = createApprovalSession<string>();
  let called = false;
  await session.run({ ...context, network: 'mainnet' }, 'approving', async () => { called = true; return 'key'; });
  assert.equal(called, false);
  assert.equal(session.store.getState().agent, null);
  assert.throws(() => session.requireAgent({ ...context, network: 'mainnet' }), /testnet/);
});

test('approval belongs to one wallet and one network', async () => {
  const session = createApprovalSession<string>();
  await session.run(context, 'checking', async () => 'key');
  assert.equal(session.requireAgent({ ...context, ownerAddress: '0xabc' }), 'key');
  assert.throws(() => session.requireAgent({ ...context, ownerAddress: '0xDEF' }), /Enable trading/);
  assert.throws(() => session.requireAgent({ ...context, network: 'mainnet' }), /testnet/);
});

test('logout or network change discards an approval that arrives late', async () => {
  const session = createApprovalSession<string>();
  let resolve!: (value: string) => void;
  const pending = session.run(context, 'approving', () => new Promise<string>((r) => { resolve = r; }));
  session.reset();
  resolve('old key');
  await pending;
  assert.equal(session.store.getState().status, 'none');
  assert.equal(session.store.getState().agent, null);
  assert.throws(() => session.requireAgent(context), /Enable trading/);
});

test('a stale failure cannot erase a newer successful approval', async () => {
  const session = createApprovalSession<string>();
  let reject!: (error: Error) => void;
  const old = session.run(context, 'checking', () => new Promise<string>((_, r) => { reject = r; }));
  await session.run(context, 'approving', async () => 'new key');
  reject(new Error('old request failed'));
  await old;
  assert.equal(session.requireAgent(context), 'new key');
  assert.equal(session.store.getState().error, null);
});

test('rechecking approval removes the usable key, including on failure', async () => {
  const session = createApprovalSession<string>();
  await session.run(context, 'checking', async () => 'key');
  await session.run(context, 'checking', async () => {
    assert.throws(() => session.requireAgent(context), /Enable trading/);
    throw new Error('offline');
  });
  assert.equal(session.store.getState().agent, null);
  assert.equal(session.store.getState().status, 'error');
});
