import { createStore } from 'zustand/vanilla';

export type AgentStatus = 'checking' | 'none' | 'approved' | 'approving' | 'error';
export type ApprovalContext = { ownerAddress: string; network: 'mainnet' | 'testnet' };

export function assertTestnet(network: string) {
  if (network !== 'testnet') throw new Error('Trading is on testnet');
}

/** Invalidating a session clears its key immediately and discards every pending result. */
export function createApprovalSession<Agent>() {
  const store = createStore<{
    status: AgentStatus; agent: Agent | null; error: string | null; context: ApprovalContext | null;
  }>(() => ({ status: 'none', agent: null, error: null, context: null }));
  let revision = 0;
  const reset = () => {
    revision++;
    store.setState({ status: 'none', agent: null, error: null, context: null });
  };
  const run = async (context: ApprovalContext, status: 'checking' | 'approving', operation: (current: () => boolean) => Promise<Agent | null>) => {
    const id = ++revision;
    const current = () => id === revision;
    store.setState({ status, agent: null, error: null, context });
    try {
      assertTestnet(context.network);
      const agent = await operation(current);
      if (current()) store.setState({ status: agent ? 'approved' : 'none', agent });
    } catch (e) {
      if (current()) store.setState({ status: 'error', agent: null, error: e instanceof Error ? e.message : String(e) });
    }
  };
  const requireAgent = (context: ApprovalContext): Agent => {
    assertTestnet(context.network);
    const s = store.getState();
    if (s.status !== 'approved' || !s.agent || s.context?.network !== context.network
      || s.context.ownerAddress.toLowerCase() !== context.ownerAddress.toLowerCase()) {
      throw new Error('Enable trading for this wallet and network');
    }
    return s.agent;
  };
  return { store, reset, run, requireAgent };
}
