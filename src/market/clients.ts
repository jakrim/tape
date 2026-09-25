import { HttpTransport, InfoClient, SubscriptionClient, WebSocketTransport } from '@nktkas/hyperliquid';
import { create } from 'zustand';

export type Network = 'mainnet' | 'testnet';

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting';

type ConnectionState = {
  network: Network;
  status: ConnectionStatus;
  reconnects: number;
  setNetwork: (network: Network) => void;
};

// Mainnet shows real markets read-only. Testnet is where orders are placed.
export const useConnection = create<ConnectionState>((set, get) => ({
  network: 'mainnet',
  status: 'connecting',
  reconnects: 0,
  setNetwork: (network) => {
    if (network === get().network) return;
    closeClients(get().network);
    set({ network, status: 'connecting', reconnects: 0 });
  },
}));

type Clients = {
  info: InfoClient;
  subs: SubscriptionClient;
  ws: WebSocketTransport;
  http: HttpTransport;
};

const clients = new Map<Network, Clients>();

/**
 * One WebSocket per network for the whole app. Every screen shares it, so opening a market
 * adds subscriptions to an existing connection instead of opening a new socket.
 * The SDK reconnects with exponential backoff and resubscribes on its own; we only listen
 * so the UI can say when data is not live.
 */
export function getClients(network: Network): Clients {
  const existing = clients.get(network);
  if (existing) return existing;

  const isTestnet = network === 'testnet';
  const ws = new WebSocketTransport({ isTestnet });
  const http = new HttpTransport({ isTestnet });
  const created = { ws, http, info: new InfoClient({ transport: http }), subs: new SubscriptionClient({ transport: ws }) };

  ws.socket.addEventListener('open', () => {
    if (useConnection.getState().network === network) useConnection.setState({ status: 'live' });
  });
  ws.socket.addEventListener('close', () => {
    if (useConnection.getState().network !== network) return;
    useConnection.setState((s) => ({ status: 'reconnecting', reconnects: s.reconnects + 1 }));
  });

  clients.set(network, created);
  return created;
}

function closeClients(network: Network) {
  const existing = clients.get(network);
  if (!existing) return;
  clients.delete(network);
  existing.ws.close();
}

/** Forces a fresh connection, e.g. after the app returns from the background with a possibly dead socket. */
export function reconnect(network: Network) {
  clients.get(network)?.ws.socket.reconnect();
}
