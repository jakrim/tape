import { HttpTransport, InfoClient, SubscriptionClient, WebSocketTransport } from '@nktkas/hyperliquid';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

export type Network = 'mainnet' | 'testnet';

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'paused';

type ConnectionState = {
  network: Network;
  status: ConnectionStatus;
  reconnects: number;
  // Bumped whenever the socket is replaced (network switch, return from background).
  // Every subscription effect depends on it, so they all resubscribe on the new socket.
  epoch: number;
  setNetwork: (network: Network) => void;
};

// Mainnet shows real markets read-only. Testnet is where orders are placed.
export const useConnection = create<ConnectionState>((set, get) => ({
  network: 'mainnet',
  status: 'connecting',
  reconnects: 0,
  epoch: 0,
  setNetwork: (network) => {
    if (network === get().network) return;
    closeClients(get().network);
    set((s) => ({ network, status: 'connecting', reconnects: 0, epoch: s.epoch + 1 }));
  },
}));

// Relay-ready: at scale, point mainnet traffic at a relay or our own node instead of Hyperliquid's
// public API, whose limits are per IP (10 sockets, 1200 request weight a minute) and are shared
// by every phone behind the same carrier NAT. The relay speaks the same protocol, so only the URLs change.
const MAINNET_WS_URL = process.env.EXPO_PUBLIC_HL_WS_URL;
const MAINNET_API_URL = process.env.EXPO_PUBLIC_HL_API_URL;

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
 * The SDK reconnects with exponential backoff plus jitter and resubscribes on its own, so a
 * network blip doesn't send every phone back at the same instant. We only listen so the UI
 * can say when data is not live.
 */
export function getClients(network: Network): Clients {
  const existing = clients.get(network);
  if (existing) return existing;

  const isTestnet = network === 'testnet';
  const ws = new WebSocketTransport({ isTestnet, url: isTestnet ? undefined : MAINNET_WS_URL });
  const http = new HttpTransport({ isTestnet, apiUrl: isTestnet ? undefined : MAINNET_API_URL });
  const created = { ws, http, info: new InfoClient({ transport: http }), subs: new SubscriptionClient({ transport: ws }) };

  const isCurrent = () => clients.get(network) === created;
  ws.socket.addEventListener('open', () => {
    if (isCurrent()) useConnection.setState({ status: 'live' });
  });
  ws.socket.addEventListener('close', () => {
    if (!isCurrent()) return;
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

/**
 * Streams stop when the app leaves the foreground: no data or battery spent on screens nobody
 * sees (Android keeps a backgrounded process's socket alive). On return, a new socket and a new
 * epoch make every screen resubscribe, which also delivers fresh snapshots. Freshness badges
 * show Connecting until then, so nothing stale is presented as live.
 */
export function useStreamLifecycle() {
  useEffect(() => {
    let backgrounded = false;
    const sub = AppState.addEventListener('change', (state) => {
      const { network } = useConnection.getState();
      if (state === 'background' && !backgrounded) {
        backgrounded = true;
        closeClients(network);
        useConnection.setState({ status: 'paused' });
      }
      if (state === 'active' && backgrounded) {
        backgrounded = false;
        // Anything that asked for data while in the background created a new socket, which the
        // OS may have killed since, and its open event may have marked the status live. Start
        // clean either way, so every screen resubscribes on a fresh connection.
        closeClients(network);
        useConnection.setState((s) => ({ status: 'connecting', epoch: s.epoch + 1 }));
      }
    });
    return () => sub.remove();
  }, []);
}

/** Order and account requests use the open socket when it's live (no new connection per request). */
export function requestTransport(network: Network) {
  const c = getClients(network);
  return useConnection.getState().status === 'live' ? c.ws : c.http;
}
