# Security and funding checks

Reviewed locally on September 27, 2026. These are scoped engineering checks, not an independent security audit or proof that deposits and funded trading work end to end.

## What Tape does with funds

Mainnet market data is read-only. Trading approvals, entries, closes and cancellations are restricted to testnet by the shared exchange-client layer, in addition to the screen controls. The Deposit screen obtains mainnet Relay quotes; it does not execute them. Tape has no card or bank payment integration.

Receive test funds shows the owner's public address and a QR code generated locally. It directs the sender to **Hyperliquid testnet perps, test USDC only**. The QR payload is an address, not a network selector or payment request. Sending an ERC-20 token on Ethereum, Base or Arbitrum does not fund the testnet perps account. The Solana wallet address is separate.

A device wallet has no recovery/export flow in Tape. Removing that wallet deletes its owner key and can lose access to funds. Use this demo with test funds only.

## Changes from this review

- Mainnet writes were blocked only by screen state. `agentExchange` and owner approval now enforce the testnet boundary before creating a signing client.
- Trading keys were not bound to the current owner/network in memory. An old approval response could finish after a wallet change. The approval session now clears immediately on a context change, ignores obsolete successes and failures, and checks the owner/network again before signing. An entry also checks again after the separate leverage request.
- Orders went directly from entry to submission. They now show a review with direction, wallet, size rounded to exchange precision, margin mode, estimated fees, limit or market price cap, and optional exits. Confirmation expires after 30 seconds and rechecks live data, wallet, network and synthetic stress mode. Rapid repeated confirmation is guarded synchronously. Unfunded wallets can inspect the review without signing or submitting anything.
- Prices below the smallest tick and orders below the minimum after size rounding are rejected before review or leverage changes. Hidden TP/SL fields no longer leak into a TWAP submission.

## Checks and their limits

| Check | Local evidence | Does not establish |
|---|---|---|
| Unit suite | 41 passing tests, including price motion and decimal alignment, formatting, review expiry, approval races, order precision and SDK signature recovery | Successful funded exchange execution |
| Order signing | The installed Hyperliquid SDK signs a captured request with a public fixture agent key; recovery matches that key on testnet and differs under the mainnet domain | Server acceptance, fills, or protection against every replay scenario |
| Trading approval | Captured SDK approval recovers the public fixture owner key; changing the network invalidates that identity | A real owner's approval or provider authentication |
| Backend row-level security | 10 pgTAP assertions passed against Tape's local Supabase database; cover own-row access, cross-wallet read/write/update/delete isolation and anonymous reads | The remote database's deployed policies or all backend security |
| iOS simulator | Development build succeeded; market navigation, sorting and mainnet order blocking passed. Receive/copy was exercised and its QR independently decoded to the displayed address; dotted chart visually inspected. A focused order flow passed: enter $250, dismiss the numeric keyboard using Done editing, and open the unfunded review with the amount preserved. | Android behavior, physical-device performance or funded confirmation |
| Dependencies | `npm audit --omit=dev`: 0 high/critical and 14 moderate advisories | Absence of vulnerabilities; moderate advisories remain unresolved |
| Source key handling | Device keys are generated through viem and stored through Expo SecureStore; no key logging found in reviewed code | Physical-device extraction resistance or a complete telemetry audit |

Signature tests replace the transport with an in-memory recorder. They do not send orders or transfer funds. The review tests cover the consent checks; the funded confirmation and fill path still needs the exercise below.

## Key storage boundaries

`WHEN_UNLOCKED_THIS_DEVICE_ONLY` is an **iOS** Keychain accessibility setting that prevents migration to another device. Android uses Keystore-backed encrypted storage and the SecureStore plugin's backup exclusions. The app does not request biometric authentication for every key read. iOS Keychain values can persist after an app uninstall, so uninstalling is not a reliable key-revocation mechanism. Privy's embedded-wallet recovery model is separate from the local device-wallet fallback.

Sources: [Expo SDK 57 SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/), [Hyperliquid API wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets), and the installed `@nktkas/hyperliquid` signing implementation.

## Remaining funded-device exercise

1. On the intended physical device, select testnet and open Receive test funds. Verify the copied address against the complete displayed address and the QR decode.
2. Have a wallet that already has Hyperliquid testnet USDC transfer test funds within the testnet perps system. Record the exchange transfer receipt, recipient and before/after balance. Do not use real funds to demonstrate this.
3. Enable trading, then review and confirm a small testnet order. Record the actual exchange order ID and fill or resting status. Test limit cancellation, position close, TP/SL child-order acceptance and TWAP separately.
4. Repeat wallet/network switching and offline/resume checks on the device. Verify that stale reviews cannot submit and that no prior wallet's trading authority survives.
