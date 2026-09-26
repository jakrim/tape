# Real-time data, performance and scale

Three goals drive the market-data design: the screen never shows numbers as live when they aren't, it holds 60 fps on a mid-range Android phone while data streams in, and it stays within the exchange's limits when tens of thousands of phones run it. This document covers how Tape does each, what has been measured, and what hasn't.

## Designing for 50,000 users

Every phone talks to Hyperliquid directly today. Hyperliquid's public API limits are per IP address ([rate limits](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits)):

| Limit (per IP) | Value |
|---|---|
| WebSocket connections | 10 |
| New WebSocket connections per minute | 30 |
| Subscriptions | 1,000 |
| Unique users in user-specific subscriptions | 10 |
| REST request weight per minute | 1,200 (most info requests weigh 20; `l2Book`, `allMids`, `clearinghouseState` weigh 2) |

Mobile carriers put many phones behind one public IP (carrier-grade NAT), so at 50,000 users some phones will share these limits with other Tape users. Two conclusions follow.

**In production, market data should come from a relay or Arcade's own node.** The relay holds a few upstream connections and fans out to phones, and snapshots like market metadata and candle history can be cached at the edge. Tape is ready for this: `EXPO_PUBLIC_HL_WS_URL` and `EXPO_PUBLIC_HL_API_URL` point mainnet traffic anywhere that speaks the same protocol, with no code change.

**Until then, and after, each phone should ask for as little as possible.** What Tape does:

| Cost | What Tape does |
|---|---|
| Connections | One WebSocket per app for every screen. Reconnects back off exponentially with jitter, so a network blip doesn't send every phone back at the same instant. |
| Bandwidth | The all-markets stream is about 54 KB every 4 s, or roughly 43 MB an hour, and Hyperliquid does not offer WebSocket compression (measured: no `permessage-deflate`). Tape subscribes to it only while the Markets list is on screen. Positions use the exchange's own valuation instead. |
| Background | Every stream stops when the app leaves the foreground and resumes with fresh snapshots on return. Android otherwise keeps a backgrounded socket alive. |
| Request weight | Candle history is cached for 60 s, so reopening a market or switching back to an interval costs nothing. Snapshot loads retry with jittered backoff instead of hammering. |
| Order latency | Orders and account actions go over the already-open socket when it's live, with HTTP as fallback. From a desktop connection, median latency was 150 ms over the socket versus 156 ms over HTTP, and p90 152 ms versus 178 ms. The gain is mostly in the tail, and in skipping new connections on flaky mobile networks. |
| Backend sign-ins | The Supabase session is kept in the Keychain or Keystore and refreshed, so the wallet signs in with Ethereum once per install instead of once per launch. Measured: two relaunches created no new auth sessions. |
| Crash and analytics volume | Sentry traces 5% of sessions. PostHog events come from a short typed list. |

The backend holds only user data, and the phone reaches it through Supabase's HTTP API, so the app never opens a Postgres connection. At this scale the next steps are Supabase's Pro plan, and connection pooling for any server-side jobs.

## Keeping the screen honest

| Rule | Where |
|---|---|
| Each stream has a freshness limit set from its measured cadence: 12 s for the market list, 3 s for the order book, 5 s for the focused market. Past that, the badge says Delayed with the age. | `src/market/freshness.ts` |
| The badge also reflects the socket: Connecting, Reconnecting, Paused or Live. | `src/ui/LiveBadge.tsx` |
| The order ticket will not submit while the book is stale or a stress test is running, and its button says why. | `src/app/order.tsx` |
| An order book snapshot older than the one on screen is dropped. Trades resent after a reconnect are not shown twice. | `src/market/coin.ts`, `src/market/trades.ts` |
| A network switch clears the market list before anything uses it, because asset ids differ between mainnet and testnet. | `src/market/markets.ts` |
| Before an order, margin, fee and liquidation are labeled as estimates. After it, positions, PnL, liquidation price and fills come from the exchange. | `src/trading/math.ts`, `src/wallet/account.ts` |
| Exchange errors are shown as returned. | `src/wallet/trading.ts` |
| The watchlist updates optimistically and rolls back on failure. Orders never do. | `src/market/favorites.ts` |

## Holding the frame rate

**Measured cadence** (Hyperliquid mainnet, 2026-09-25, 20 s samples): all-market contexts every ~4 s at ~54 KB, the fast order book twice a second (worst gap 646 ms), the focused market's context about once a second, trades 2 to 3 a second for BTC and ETH. Normal traffic is light. Bursts during volatility are what the design protects against.

- **Frame batching.** Socket handlers only record the latest payload per stream. `src/market/batcher.ts` applies pending updates once per animation frame, so a burst of 50 messages costs one render.
- **Narrow re-renders.** The market list keeps each market's object when its values did not change, and each row subscribes to its own market. On the trade screen, the header, chart, order book and trade tape each subscribe to their own stream, so a book update re-renders the book and nothing else.
- **Recycled list rows.** FlashList v2 with fixed-height rows.
- **UI-thread motion.** The chart crosshair, the candle lookup under the finger, the OHLC readout, the pulsing live dot, row price flashes, depth bars, the size slider and press feedback all run on the UI thread through Reanimated and Skia. The chart's animated layers take only shared values as props, so they render once and never re-render when candles update.
- **Cheap chart redraws.** Candles, the line, its fill and the volume bars are a handful of Skia paths however many candles there are.
- **One clock.** Freshness checks and countdowns read a single one-second clock and select a boolean, so components re-render when state flips, not every second.
- **Nothing runs off screen.** Native tabs mount every tab up front, so diagnostics probes and the all-markets stream run only while their screen is focused.

## Stress test

Normal traffic never stresses the pipeline, so the Account screen can run a 15 s burst test on the BTC trade screen (`src/market/stress.ts`). It pushes synthetic updates through the same path as live data at 20x to 50x normal rates: 40 book updates, 100 trades, 10 mark prices, 20 candle updates and 5 full all-markets payloads a second. Each all-markets payload is parsed from a real-size JSON string, so parse cost is included. The generator paces by elapsed time, so if the JS thread falls behind, the backlog grows like a real socket's would. A banner labels the data as synthetic throughout, orders are blocked, and the real streams take over again afterwards.

It reports UI and JS frame rates (average and lowest) and the longest JS-thread stall. Anyone can run it on their own phone from the Account screen, including from the preview APK.

## What has been measured

| Where | Result |
|---|---|
| iOS simulator, debug build, normal traffic | UI thread 60 fps, JS thread 60 fps. Slowest frame spent applying market updates: 1.5 ms. The batcher merged 0 updates, because at normal rates two updates for one stream rarely land in the same frame. |
| iOS simulator, debug build, stress test, hands-off (load average 13 to 35 on the Mac) | 1,331 synthetic messages in 15 s. Lowest UI 34 fps, lowest JS 28 fps, longest JS stall 63 ms. The batcher merged 26% of updates before render. |
| iOS simulator, **release build**, stress test, hands-off (load average 75 to 85 on the Mac) | 2,626 synthetic messages in 15 s, the full target rate. UI thread average 58 fps (lowest 43), JS thread average 59 fps (lowest 44), longest JS stall 25 ms. Slowest frame spent applying updates: 0.6 ms of the 16.7 ms budget. The batcher merged 28% of updates. |
| Android emulator (Pixel 6a profile) | All end-to-end flows pass. No frame numbers are reported: the emulator ran on a heavily loaded Mac and emulators are not representative of phones. |

Debug builds run React in development mode; the release build did twice the work with a quarter of the worst JS stall. Test tooling also affects results: on the iOS simulator, a Maestro screenshot or accessibility query during the test paused the display and produced false dips, so the stress numbers above were taken with no test tooling touching the app while it ran.

**Not yet measured:** a release build on a physical mid-range Android phone. The plan is to install the preview APK on a Pixel 6a or Galaxy A-series device, run the stress test, and record `adb shell dumpsys gfxinfo com.jakrim.tape` (janky-frame percentage and frame-time percentiles) plus a Perfetto trace of JS-thread work. If parsing the all-markets payload shows up, the candidates are a relay that sends only changed markets, or parsing on a separate worklet runtime.

## Problems found and fixed during the build

- **React Compiler and shared values.** The compiler treats `.value` on a Reanimated shared value as a plain property. It turned `counters.book++` on an imported object inside a hook into `counters.book = module.book + 1` (NaN), and it moved shared-value reads made inside effects into render, which Reanimated flagged about twice a second. The diagnostics panel exposed both; stack traces and the compiled bundle confirmed the causes. Counters now go through a plain module function, and code outside worklets uses Reanimated's `get()` and `set()`.
- **Diagnostics running on every screen.** Native tabs mount every screen at launch, so the frame-rate probes (a JS frame loop and a UI-thread callback) ran all the time. They now run only while the Account tab is focused.
- **A new backend session on every launch.** 35 sessions had built up during testing. The session is now persisted and reused.
- **Blank first row after re-sorting or refreshing.** The first market row went blank after switching sort or pulling to refresh. The cause was stale layout indices in FlashList 2.0.2, the version Expo pins for SDK 57; FlashList 2.2.2 fixed it, and Tape now uses 2.3.2. The first attempted fix (a fresh list per sort) only covered one trigger, which the recorded demo video exposed. A Maestro flow (`.maestro/markets-sort.yaml`) covers both.
- **Liquidation estimate above entry.** With an empty cross-margin account, the estimate for a long landed above the entry price. The estimate now never assumes less collateral than the order posts. A unit test guards it.
