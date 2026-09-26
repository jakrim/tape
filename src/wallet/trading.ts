import { ExchangeClient } from '@nktkas/hyperliquid';
import type { PrivateKeyAccount } from 'viem/accounts';
import { create } from 'zustand';

import { track } from '@/lib/analytics';
import { getClients, type Network } from '@/market/clients';

import { createKey, keyNames, loadKey } from './keys';
import type { Owner } from './store';

// Account-level actions are EIP-712 signed with the Arbitrum chain id, as Hyperliquid's own app does.
const SIGNATURE_CHAIN_ID = { mainnet: '0xa4b1', testnet: '0x66eee' } as const;
const AGENT_NAME = 'Tape';

export type AgentStatus = 'checking' | 'none' | 'approved' | 'approving' | 'error';

type TradingState = {
  status: AgentStatus;
  agent: PrivateKeyAccount | null;
  error: string | null;
};

/**
 * Hyperliquid "agent" (API wallet) pattern: the owner wallet signs one approval, then a key
 * generated and kept on this device signs every order with no prompt. That is what makes
 * one-tap trading possible, and the agent can trade but never withdraw.
 */
export const useTrading = create<TradingState>(() => ({ status: 'checking', agent: null, error: null }));

function ownerExchange(owner: Owner, network: Network) {
  return new ExchangeClient({
    wallet: owner.signer,
    transport: getClients(network).http,
    signatureChainId: SIGNATURE_CHAIN_ID[network],
  });
}

export function agentExchange(network: Network): ExchangeClient {
  const { agent } = useTrading.getState();
  if (!agent) throw new Error('Trading is not enabled');
  return new ExchangeClient({ wallet: agent, transport: getClients(network).http });
}

/** Asks the exchange (not local state) whether this device's key is an approved agent. */
export async function refreshAgent(owner: Owner, network: Network) {
  useTrading.setState({ status: 'checking', error: null });
  try {
    const agent = await loadKey(keyNames.agent(network, owner.address));
    if (!agent) {
      useTrading.setState({ status: 'none', agent: null });
      return;
    }
    const approved = await getClients(network).info.extraAgents({ user: owner.address });
    const now = Date.now();
    const ok = approved.some(
      (a) => a.address.toLowerCase() === agent.address.toLowerCase() && (a.validUntil === null || a.validUntil > now),
    );
    useTrading.setState({ status: ok ? 'approved' : 'none', agent: ok ? agent : null });
  } catch (e) {
    useTrading.setState({ status: 'error', error: messageOf(e) });
  }
}

export async function enableTrading(owner: Owner, network: Network) {
  useTrading.setState({ status: 'approving', error: null });
  try {
    const name = keyNames.agent(network, owner.address);
    const agent = (await loadKey(name)) ?? (await createKey(name));
    await ownerExchange(owner, network).approveAgent({ agentAddress: agent.address, agentName: AGENT_NAME });
    useTrading.setState({ status: 'approved', agent });
    track('trading_enabled', { network });
  } catch (e) {
    useTrading.setState({ status: 'error', error: messageOf(e) });
  }
}

/** Exchange errors are shown to the user verbatim: the exchange knows best why it said no. */
export function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message.replace(/^.*?:\s*(?=[A-Z])/, '');
  return String(e);
}
