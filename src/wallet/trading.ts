import { ExchangeClient } from '@nktkas/hyperliquid';
import type { PrivateKeyAccount } from 'viem/accounts';
import { useStore } from 'zustand';

import { track } from '@/lib/analytics';
import { getClients, requestTransport, useConnection, type Network } from '@/market/clients';

import { createKey, keyNames, loadKey } from './keys';
import { useWallet, type Owner } from './store';
import { assertTestnet, createApprovalSession } from './approval';

// Account-level actions are EIP-712 signed with the Arbitrum chain id, as Hyperliquid's own app does.
const SIGNATURE_CHAIN_ID = { mainnet: '0xa4b1', testnet: '0x66eee' } as const;
const AGENT_NAME = 'Tape';

/**
 * Hyperliquid "agent" (API wallet) pattern: the owner wallet signs one approval, then a key
 * generated and kept on this device signs every order with no prompt. That is what makes
 * one-tap trading possible, and the agent can trade but never withdraw.
 */
const session = createApprovalSession<PrivateKeyAccount>();
export function useTrading<T>(selector: (state: ReturnType<typeof session.store.getState>) => T): T {
  return useStore(session.store, selector);
}
export const resetTrading = session.reset;

// Synchronous invalidation closes the gap before React effects run.
useWallet.subscribe((state, previous) => {
  if (state.owner !== previous.owner) resetTrading();
});
useConnection.subscribe((state, previous) => {
  if (state.network !== previous.network) resetTrading();
});

function ownerExchange(owner: Owner, network: Network) {
  assertTestnet(network);
  if (useWallet.getState().owner !== owner || useConnection.getState().network !== network) {
    throw new Error('Wallet or network changed');
  }
  return new ExchangeClient({
    wallet: owner.signer,
    transport: requestTransport(network),
    signatureChainId: SIGNATURE_CHAIN_ID[network],
  });
}

export function agentExchange(network: Network): ExchangeClient {
  assertTestnet(network);
  const owner = useWallet.getState().owner;
  if (!owner || useConnection.getState().network !== network) throw new Error('Wallet or network changed');
  const agent = session.requireAgent({ ownerAddress: owner.address, network });
  // Orders go over the already-open socket when it's live: no TCP/TLS setup per order, which is
  // most of the latency of a fresh HTTPS request on mobile. HTTP is the fallback while reconnecting.
  return new ExchangeClient({ wallet: agent, transport: requestTransport(network) });
}

/** Asks the exchange (not local state) whether this device's key is an approved agent. */
export async function refreshAgent(owner: Owner, network: Network) {
  if (network === 'mainnet') { resetTrading(); return; }
  await session.run({ ownerAddress: owner.address, network }, 'checking', async (current) => {
    const agent = await loadKey(keyNames.agent(network, owner.address));
    if (!agent || !current()) return null;
    const approved = await getClients(network).info.extraAgents({ user: owner.address });
    const now = Date.now();
    const ok = approved.some(
      (a) => a.address.toLowerCase() === agent.address.toLowerCase() && (a.validUntil === null || a.validUntil > now),
    );
    return ok ? agent : null;
  });
}

export async function enableTrading(owner: Owner, network: Network) {
  await session.run({ ownerAddress: owner.address, network }, 'approving', async (current) => {
    const name = keyNames.agent(network, owner.address);
    const agent = (await loadKey(name)) ?? (await createKey(name));
    if (!current()) return null;
    await ownerExchange(owner, network).approveAgent({ agentAddress: agent.address, agentName: AGENT_NAME });
    if (current()) track('trading_enabled', { network });
    return agent;
  });
}

/** Exchange errors are shown to the user verbatim: the exchange knows best why it said no. */
export function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message.replace(/^.*?:\s*(?=[A-Z])/, '');
  return String(e);
}
