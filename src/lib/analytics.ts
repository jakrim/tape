import PostHog from 'posthog-react-native';

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

// Product analytics. Off unless a key is configured.
export const posthog = KEY ? new PostHog(KEY, { host: HOST, captureAppLifecycleEvents: true }) : null;

/**
 * Every event the app can send, with its properties. Nothing outside this list can be sent,
 * and no event carries a wallet address, key, balance or order size.
 */
type Events = {
  market_opened: { coin: string; network: 'mainnet' | 'testnet' };
  order_ticket_opened: { coin: string; side: 'long' | 'short' };
  order_submitted: { coin: string; kind: 'market' | 'limit' | 'twap'; side: 'long' | 'short'; tpsl: boolean };
  order_result: { coin: string; status: 'filled' | 'resting' | 'twap' | 'waiting' | 'rejected' };
  wallet_created: { kind: 'privy' | 'device' };
  trading_enabled: { network: 'mainnet' | 'testnet' };
};

export function track<E extends keyof Events>(event: E, props: Events[E]) {
  posthog?.capture(event, props);
}
