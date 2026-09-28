import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ExchangeClient, type IRequestTransport } from '@nktkas/hyperliquid';
import { ApproveAgentTypes } from '@nktkas/hyperliquid/api/exchange';
import { createL1ActionHash, type Signature } from '@nktkas/hyperliquid/signing';
import { recoverTypedDataAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Public, deterministic fixture keys. No real wallet keys and no network requests.
const owner = privateKeyToAccount(`0x${'01'.repeat(32)}`);
const agent = privateKeyToAccount(`0x${'02'.repeat(32)}`);
const zero = '0x0000000000000000000000000000000000000000' as const;
const signatureValue = (s: Signature) => ({ r: s.r, s: s.s, v: BigInt(s.v) });

test('the installed SDK signs orders with the agent and binds them to testnet', async () => {
  let payload: { action: Record<string, unknown>; nonce: number; signature: Signature } | undefined;
  const transport: IRequestTransport = {
    isTestnet: true,
    async request<T>(_endpoint: string, body: unknown): Promise<T> {
      payload = body as typeof payload;
      return { status: 'ok', response: { type: 'order', data: { statuses: [{ resting: { oid: 123 } }] } } } as T;
    },
  };
  await new ExchangeClient({ wallet: agent, transport }).order({
    orders: [{ a: 0, b: true, p: '80000', s: '0.001', r: false, t: { limit: { tif: 'Gtc' } } }], grouping: 'na',
  });
  assert.ok(payload);
  const typed = {
    domain: { name: 'Exchange', version: '1', chainId: 1337, verifyingContract: zero },
    types: { Agent: [{ name: 'source', type: 'string' }, { name: 'connectionId', type: 'bytes32' }] },
    primaryType: 'Agent',
    signature: signatureValue(payload.signature),
  } as const;
  const connectionId = createL1ActionHash({ action: payload.action, nonce: payload.nonce });
  assert.equal(await recoverTypedDataAddress({ ...typed, message: { source: 'b', connectionId } }), agent.address);
  assert.notEqual(await recoverTypedDataAddress({ ...typed, message: { source: 'a', connectionId } }), agent.address);
  assert.notEqual(agent.address, owner.address);
});

test('agent approval is signed by the owner and its network cannot be changed', async () => {
  type Approval = { signatureChainId: `0x${string}`; hyperliquidChain: string; agentAddress: `0x${string}`; agentName: string; nonce: number };
  let payload: { action: Approval; signature: Signature } | undefined;
  const transport: IRequestTransport = {
    isTestnet: true,
    async request<T>(_endpoint: string, body: unknown): Promise<T> {
      payload = body as typeof payload;
      return { status: 'ok', response: { type: 'default' } } as T;
    },
  };
  await new ExchangeClient({ wallet: owner, transport, signatureChainId: '0x66eee' }).approveAgent({ agentAddress: agent.address, agentName: 'Tape' });
  assert.ok(payload);
  assert.equal(payload.action.hyperliquidChain, 'Testnet');
  assert.equal(payload.action.agentAddress.toLowerCase(), agent.address.toLowerCase());
  const typed = {
    domain: { name: 'HyperliquidSignTransaction', version: '1', chainId: 421614, verifyingContract: zero },
    types: ApproveAgentTypes,
    primaryType: 'HyperliquidTransaction:ApproveAgent',
    signature: signatureValue(payload.signature),
  } as const;
  assert.equal(await recoverTypedDataAddress({ ...typed, message: payload.action }), owner.address);
  assert.notEqual(await recoverTypedDataAddress({ ...typed, message: { ...payload.action, hyperliquidChain: 'Mainnet' } }), owner.address);
});
