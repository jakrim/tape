# Tape architecture

Tape is a mobile perps trading app on Hyperliquid, built with Expo SDK 57, React Native 0.86 and TypeScript. It shows live mainnet markets read-only and places real orders on Hyperliquid testnet. This document describes how the app works. It is kept current with the code.

## Folder layout

| Path | What lives there |
|---|---|
| `src/app/` | Routes (Expo Router). Tabs: Markets, Portfolio, Account. Stack screens: `market/[coin]`, `order` (native form sheet). |
| `src/market/` | The live-data layer: socket clients, frame batcher, stores, freshness rules, diagnostics counters. |
| `src/trading/` | Pure trading math and formatting (tested with `node --test`), plus order submission. |
| `src/wallet/` | Owner wallet (Privy or device key), trading key approval, account feed. |
| `src/ui/` | Design tokens (`theme.ts`) and components. Every color and size comes from `theme.ts`. |
| `.maestro/` | End-to-end flows, also run by the weekly release workflow. |
| `.eas/workflows/` | PR checks and the weekly release pipeline. |

## Market data

```mermaid
flowchart LR
  HL[Hyperliquid API] -- HTTP snapshot --> S[Stores]
  HL -- WebSocket --> H[Socket handlers]
  H -- latest value per stream --> B[Frame batcher]
  B -- once per frame --> S
  S -- per-row selectors --> UI[Screens]
  C[1s clock] --> F[Freshness checks] --> UI
```

**One socket per network.** `src/market/clients.ts` creates one `WebSocketTransport` per network and every screen shares it. Opening a market adds subscriptions to that socket; closing the screen removes them. The SDK reconnects with exponential backoff and resubscribes by itself. We listen to the socket's `open` and `close` events so the UI can say when data is not live.

**Snapshot first, then stream.** The markets list loads `metaAndAssetCtxs` over HTTP so it paints immediately, then subscribes to `assetCtxs` for live updates. Candles load history over HTTP and then stream the forming candle.

**Frame batching.** Socket handlers never set React state. They register "apply the latest value" jobs in `src/market/batcher.ts`, keyed by stream, and the batcher runs pending jobs once per animation frame. A newer message for the same stream replaces the older job. React renders at most once per frame however many messages arrive, which matters during bursts. Trades are the exception: they are events rather than snapshots, so they are buffered and appended together instead of replaced.

**Narrow re-renders.** When the 178-market update arrives, each market keeps its previous object if its numbers did not change (`applyCtxs` in `src/market/markets.ts`). List rows select only their own market, so a BTC price change re-renders the BTC row and nothing else. The price flash on each row runs on the UI thread with Reanimated.

**Ordering.** Order book messages carry the exchange timestamp. A snapshot older than the one on screen is dropped. Hyperliquid sends full book snapshots, not deltas, so there is no local book to reconcile.

**Measured cadence** (mainnet, 20 second samples, 2026-09-25):

| Stream | Rate | Used for |
|---|---|---|
| `assetCtxs` (all perps) | every ~4s, ~55 KB | Markets list |
| `l2Book` default | 20 levels every ~4s | Not used |
| `l2Book` with `fast: true` | 5 levels, 2 per second, worst gap 646 ms | Order book |
| `activeAssetCtx` | about 1 per second | Trade screen header, funding |
| `bbo` | about 3 per second | Not used yet |
| `trades` (BTC, ETH) | 2 to 3 trades per second | Trade tape |

The trade screen uses the fast book because freshness matters more than depth on a phone, and five levels per side is what fits above the fold.

## Freshness

`src/market/freshness.ts` sets how long each stream may go quiet before the UI stops calling it live: 12 s for the markets list, 3 s for the book, 5 s for the focused asset. These are about three missed updates at the measured cadence. A single one-second clock drives every freshness check, and components select a boolean from it, so they re-render only when "live" flips.

`LiveBadge` shows Live, Delayed Ns, Reconnecting, or Connecting. The order ticket refuses to submit while the book is stale. When the app returns from more than 5 s in the background, the socket reconnects to force fresh snapshots, because iOS can leave a dead socket without a close event.

## Wallet and trading

```mermaid
sequenceDiagram
  participant U as User
  participant O as Owner wallet (Privy or device key)
  participant A as Trading key (device Keychain/Keystore)
  participant X as Hyperliquid
  U->>O: Enable trading
  O->>X: approveAgent(trading key address), signed once
  U->>A: Place order
  A->>X: order, signed on device, no prompt
  X-->>U: resting / filled / error, shown as returned
```

**Owner wallet.** Either a Privy embedded wallet (email login) or a private key generated on the device. Both become the same `Owner` shape in `src/wallet/store.ts`, so trading code does not know which one it has. Privy's embedded wallet is an EIP-1193 provider, wrapped with viem's `createWalletClient`, which the Hyperliquid SDK accepts directly. Privy turns on when `EXPO_PUBLIC_PRIVY_APP_ID` is set; without it the app runs end to end on the device key.

**Trading key.** Hyperliquid lets an account approve an "agent" key that can place and cancel orders but cannot withdraw. Tape generates that key on the device and stores it with `expo-secure-store` using `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so it is readable only while the phone is unlocked and never leaves the device in a backup. The owner signs one approval; after that every order is signed locally with no prompt. Whether the key is approved is read from the exchange (`extraAgents`), not from local state.

**Signing domains.** Account-level actions are EIP-712 signed with the Arbitrum chain id (`0xa4b1` mainnet, `0x66eee` testnet), matching Hyperliquid's own app. Asset ids differ by network (BTC is 0 on mainnet and 3 on testnet), so they always come from the current network's `meta`.

**Orders.** `src/trading/orders.ts` sets leverage, then sends the order.
- Market orders are IOC limit orders capped at mid ± 5%, the same default as the official SDKs.
- TP/SL are reduce-only trigger orders grouped with the entry (`normalTpsl`).
- TWAP uses Hyperliquid's native `twapOrder` (5 to 1440 minutes).

Prices and sizes are rounded by `toWirePrice` and `toWireSize`, which follow the documented tick and lot rules and are unit tested against the examples in Hyperliquid's docs.

**What the UI trusts.** Before an order, the ticket shows estimates: margin, fee at the base tier, and liquidation price from the documented formula. After an order, the app shows only what the exchange returned: the order outcome, and positions from the `clearinghouseState` stream including the exchange's own `liquidationPx` and PnL. Exchange errors are shown verbatim.

## Testing

- `npm test` runs `node --test` over `src/**/*.test.ts`: tick and lot rounding, liquidation estimates, ticket validation, formatting.
- `npm run typecheck` runs `tsc` in strict mode.
- Maestro flows in `.maestro/`: markets to trade screen, order ticket blocking rules, wallet creation and trading approval against testnet.

## Build and release

- `eas.json` profiles: `development`, `development-simulator`, `e2e` (simulator build and Android APK for Maestro), `preview`, `production`.
- `.eas/workflows/pr-checks.yml`: typecheck, unit tests and native fingerprint on every PR.
- `.eas/workflows/weekly-release.yml`: every Tuesday 14:00 GMT. Gates on tests and Maestro, then fingerprints the native layer. If a store build with the same fingerprint exists it ships an over-the-air update; otherwise it builds and submits to TestFlight and the Play internal track.

## Dependency notes

- `viem` is pinned to 2.56.0 because `@privy-io/expo` pins that exact version.
- `.npmrc` sets `legacy-peer-deps=true`. Privy lists `permissionless` as an optional peer that wants an older `ox` than viem ships. Tape does not use Privy smart wallets, so the mismatch is accepted everywhere, including EAS builds.
- `metro.config.js` resolves `isows` without package exports and `jose` with the browser condition, per Privy's setup guide.
- `entrypoint.js` loads `fast-text-encoding`, `react-native-get-random-values` and `@ethersproject/shims` before the router.
