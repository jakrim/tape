# Real-time data and performance

Two goals drive the market-data design: the screen must never show numbers as live when they aren't, and it must hold 60 fps on a mid-range Android phone while data streams in. This document covers how Tape does both, what has been measured, and what hasn't.

## Keeping the screen honest

| Rule | Where |
|---|---|
| Each stream has a freshness limit set from its measured cadence: 12 s for the market list, 3 s for the order book, 5 s for the focused market. Past that, the badge says Delayed with the age. | `src/market/freshness.ts` |
| The badge also reflects the socket: Connecting, Reconnecting, or Live. | `src/ui/LiveBadge.tsx` |
| The order ticket will not submit while the book is stale, and its button says why. | `src/app/order.tsx` |
| An order book snapshot older than the one on screen is dropped. | `src/market/coin.ts` |
| Returning from more than 5 s in the background forces a reconnect, since iOS can leave a dead socket with no close event. | `src/market/markets.ts` |
| Before an order, margin, fee and liquidation are labeled as estimates. After it, positions, PnL and liquidation price come from the exchange. | `src/trading/math.ts`, `src/wallet/account.ts` |
| Exchange errors are shown as returned. | `src/wallet/trading.ts` |
| The watchlist updates optimistically and rolls back on failure. Orders never do. | `src/market/favorites.ts` |

## Holding the frame rate

**Measured cadence** (Hyperliquid mainnet, 2026-09-25, 20 s samples): all-market contexts every ~4 s at ~55 KB, the fast order book 2 times a second (worst gap 646 ms), the focused market's context about once a second, trades 2 to 3 a second for BTC and ETH. Normal traffic is light. Bursts during volatility are what the design protects against.

- **One socket, shared.** Every screen subscribes on the same connection.
- **Frame batching.** Socket handlers only record the latest payload per stream. `src/market/batcher.ts` applies pending updates once per animation frame, so a burst of 50 messages costs one render.
- **Narrow re-renders.** The market list keeps each market's object when its values did not change, and each row subscribes to its own market. A BTC tick re-renders the BTC row only.
- **Recycled list rows.** FlashList v2 with fixed-height rows.
- **UI-thread motion.** The chart crosshair, the candle lookup under the finger, the OHLC readout and the row price flashes run on the UI thread through Reanimated and Skia. JS-thread work does not delay them.
- **Cheap chart redraws.** Candles and volume bars are four Skia paths in total, however many candles there are.
- **One clock.** Every freshness check and countdown reads a single one-second clock and selects a boolean, so components re-render when state flips, not every second.
- **Stable digits.** Prices use tabular figures so text width does not change as digits change.

## What has been measured

The Account screen has a diagnostics panel that anyone can read on their own device: UI-thread fps (counted in a Reanimated frame callback, so it counts frames the UI thread produced), JS-thread fps, long UI frames, socket messages per second, and the frame batcher's numbers.

| Where | Result |
|---|---|
| iOS simulator (iPhone 17 Pro, debug build) after scrolling markets and opening BTC | UI thread 60 fps, JS thread 60 fps. Slowest frame spent applying market updates: 1.5 ms of the 16.7 ms budget. |
| Frame batcher at current traffic | 0 updates merged: at today's rates two updates for the same stream rarely land in one frame. Merging only kicks in during bursts. |
| Android emulator (Pixel 6a profile) | All Maestro flows pass. No frame-rate numbers are reported: the emulator ran on a heavily loaded Mac and emulators are not representative of real phones. |

**Not yet measured:** a physical mid-range Android phone under sustained load. The plan is to install the release APK on a Pixel 6a or Galaxy A-series device, hold the BTC trade screen during an active market, and record:

- `adb shell dumpsys gfxinfo com.jakrim.tape` for janky-frame percentage and frame-time percentiles on the UI thread;
- a Perfetto trace for JS-thread work, especially parsing the 55 KB market payload every 4 s;
- the in-app diagnostics panel as a cross-check.

If parsing shows up on the JS thread, the candidates are a small relay that sends only changed markets, or parsing on a separate worklet runtime.

## Problems found and fixed during the build

- **React Compiler miscompile.** `counters.book++` on an imported object inside a hook compiled to `counters.book = module.book + 1`, which is NaN. The diagnostics panel showed NaN, and the compiled bundle confirmed the cause. Counters now go through a plain module function.
- **Blank first row after changing sort.** After scrolling, switching the list from Gainers back to Volume left the first FlashList cell blank. The list now gets a fresh instance per sort. A Maestro flow (`.maestro/markets-sort.yaml`) guards it.
- **Liquidation estimate above entry.** With an empty cross-margin account, the estimate for a long landed above the entry price. The estimate now never assumes less collateral than the order posts. A unit test guards it.
