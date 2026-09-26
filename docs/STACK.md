# Stack decisions

Each choice lists why it was made, what else was considered, and where I have shipped it before. "Prior work" refers to three production Expo apps I built: Get Mentors, LiveVault and Our Little World.

## App platform: Expo SDK 57, React Native 0.86, TypeScript strict

- **Why.** SDK 57 is the current Expo release. From React Native 0.82 the New Architecture is the only architecture, so Fabric, TurboModules and JSI are the baseline, with Hermes as the engine. Native projects are generated from `app.json` and config plugins (`ios/` and `android/` are not committed), which keeps SDK upgrades to a config change plus a rebuild.
- **React Compiler is on.** It removes most hand-written memoization, which matters on a screen that re-renders with live prices. It also produced one real bug here: `importedObject.prop++` inside a hook compiled to `obj.prop = module.prop + 1` (NaN). The diagnostics panel caught it, the compiled bundle confirmed it, and all counters now go through a plain module function. See `src/market/diagnostics.ts`.
- **Considered.** Staying on an older SDK. Not worth it for a new app; upgrading later costs more than starting current.
- **Prior work.** All three apps run on SDK 57 today.

## Navigation: Expo Router with native tabs and native sheets

- **Why.** File-based routes with typed paths. Native tab bar (iOS 26 glass, Material on Android) and native form sheets for the order ticket, so gestures and transitions are the platform's own.
- **Prior work.** Expo Router with typed routes and native tabs in Get Mentors and LiveVault.

## Exchange access: `@nktkas/hyperliquid`

- **Why.** Typed requests and events for Hyperliquid's info, exchange and WebSocket APIs. Supports React Native 0.86 with no polyfills. Reconnects with backoff and resubscribes on its own. Signs with any viem account or wallet client, so Privy's embedded wallet and an on-device key both work unchanged.
- **Considered.** Raw WebSocket plus our own L1 action signing (msgpack hashing and EIP-712). More code in the one place where a mistake means a rejected or wrong order.

## Market data path: phone to exchange, no proxy

- **Why.** Lowest latency and no server to scale. The backend never sees market data.
- **Trade-off.** Every phone parses the full asset-context payload (about 55 KB every 4 s). If profiling on low-end Android shows parse cost, a small relay that sends only changed markets is the next step.

## Live state: Zustand and a frame batcher

- **Why.** Stores live outside React, so socket handlers write with `setState` without touching components. Components subscribe to a slice, so a BTC update re-renders only what shows BTC. The batcher applies at most one update per stream per frame.
- **Considered.** TanStack Query, which is built for request and response caching, not streams. Redux Toolkit, which I use in Get Mentors, is more ceremony than a socket-driven store needs.
- **Prior work.** Zustand stores in Get Mentors.

## Charts and motion: Skia, Reanimated 4, Gesture Handler

- **Why.** Candles are drawn as two Skia paths per color, so the draw cost does not grow with candle count. The crosshair gesture, the candle lookup and the OHLC readout run on the UI thread. Row price flashes are Reanimated color interpolations.
- **Considered.** victory-native (built on Skia, less control over the render path) and SVG chart libraries (a view per candle).
- **Prior work.** Reanimated in 158 files of Get Mentors and 26 in LiveVault.

## Lists: FlashList v2

- **Why.** Recycles row views instead of mounting new ones, and supports the New Architecture. Rows have a fixed height, and each row subscribes to its own market.

## Wallets and keys: Privy, viem, on-device trading key

- **Why.** Privy embedded wallets (EVM and Solana) need only an email, and they expose a standard EIP-1193 provider that viem wraps. For trading, the owner wallet approves a Hyperliquid agent key once. That key is generated on the device and stored in the Keychain or Keystore with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so it is never in a backup and cannot leave the phone. It signs orders with no prompt and cannot withdraw.
- **Fallback.** Without a Privy app ID the owner is a key generated on the device, so the whole flow works in a clean checkout.
- **Considered.** External wallets (WalletConnect / Reown). Switching to another app for every order does not work for trading.

## Backend: Supabase with Sign in with Ethereum

- **Why.** Supabase verifies SIWE messages natively and issues a session, so row-level security keys off the wallet with no custom auth server. The app stores no session: the wallet signs a new SIWE message at launch, which is silent for both wallet types.
- **Scope.** User data only (the watchlist). RLS is covered by pgTAP tests in `supabase/tests`.
- **Considered.** A Hono API like LiveVault's. More code to own for the same result at this size.
- **Prior work.** Our Little World runs on Supabase with 205 RLS policies and pgTAP tests.

## Styling: StyleSheet and one tokens file

- **Why.** No runtime styling cost, and every color, radius and type style lives in `src/ui/theme.ts`. Prices use tabular figures so digits do not shift as they change. Moving to a team's design system is a change to that file.
- **Considered.** NativeWind and Tamagui. Both are fine; neither was needed here.
- **Prior work.** The same token approach in all three apps.

## Testing

- `node --test` for pure trading math, with no Jest setup. Test cases include Hyperliquid's documented tick-size examples and regressions found during the build.
- pgTAP for row-level security.
- Maestro for end-to-end flows on the iOS simulator and Android emulator. The same flows gate the weekly release.
- **Prior work.** 84 Maestro flows in Get Mentors, including 30 release gates; pgTAP in Our Little World.

## Releases: EAS Build, Submit, Update and Workflows

- **Why.** `runtimeVersion` uses the fingerprint policy, so an over-the-air update only reaches binaries with a matching native layer. The weekly workflow checks for an existing store build with the current fingerprint: if there is one it ships an update, otherwise it builds and submits both platforms. Details in [SHIPPING.md](SHIPPING.md).
- **Prior work.** The same fingerprint deploy in Get Mentors; five EAS Workflows in LiveVault.

## Monitoring: Sentry and PostHog

- **Why.** Sentry for crashes and feed errors (every feed error is reported with its stream name). PostHog for product analytics through a typed event list. No event carries a wallet address, key, balance or order size. Both stay off until their keys are set.
- **Prior work.** Both in Get Mentors and LiveVault; LiveVault validates every analytics event against a shared schema.
