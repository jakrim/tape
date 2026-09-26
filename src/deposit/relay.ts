// Cross-chain deposit quotes into Hyperliquid via Relay (relay.link).
// Tape only reads quotes. Relay's response also contains ready-to-sign mainnet transactions;
// the app never sends them.

export const SOURCES = [
  { chainId: 8453, name: 'Base', usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' },
  { chainId: 42161, name: 'Arbitrum', usdc: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
  { chainId: 1, name: 'Ethereum', usdc: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
] as const;

export type Source = (typeof SOURCES)[number];

const HYPERLIQUID_CHAIN_ID = 1337;
const HYPERLIQUID_PERPS_USDC = '0x00000000000000000000000000000000';
const USDC_DECIMALS = 6;

export type DepositQuote = {
  send: number;
  receive: number;
  relayerFeeUsd: number;
  gasFeeUsd: number;
  seconds: number;
  impactPct: number;
  steps: string[];
};

type RawQuote = {
  details: {
    currencyIn: { amountFormatted: string };
    currencyOut: { amountFormatted: string };
    timeEstimate: number;
    totalImpact?: { percent?: string };
  };
  fees: Record<string, { amountUsd?: string } | undefined>;
  steps: { id: string }[];
};

const STEP_LABELS: Record<string, string> = {
  approve: 'Approve USDC',
  deposit: 'Deposit',
  swap: 'Swap',
};

/** Reduces Relay's quote to what the sheet shows. Pure, tested against a recorded response. */
export function summarizeQuote(raw: RawQuote): DepositQuote {
  const usd = (key: string) => Number(raw.fees[key]?.amountUsd ?? 0);
  return {
    send: Number(raw.details.currencyIn.amountFormatted),
    receive: Number(raw.details.currencyOut.amountFormatted),
    relayerFeeUsd: usd('relayer'),
    gasFeeUsd: usd('gas'),
    seconds: raw.details.timeEstimate,
    impactPct: Number(raw.details.totalImpact?.percent ?? 0),
    steps: raw.steps.map((s) => STEP_LABELS[s.id] ?? s.id),
  };
}

export async function fetchDepositQuote(p: {
  source: Source;
  amountUsdc: number;
  address: string;
  signal?: AbortSignal;
}): Promise<DepositQuote> {
  const res = await fetch('https://api.relay.link/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: p.signal,
    body: JSON.stringify({
      user: p.address,
      recipient: p.address,
      originChainId: p.source.chainId,
      destinationChainId: HYPERLIQUID_CHAIN_ID,
      originCurrency: p.source.usdc,
      destinationCurrency: HYPERLIQUID_PERPS_USDC,
      amount: String(Math.round(p.amountUsdc * 10 ** USDC_DECIMALS)),
      tradeType: 'EXACT_INPUT',
    }),
  });
  const json = await res.json();
  // Relay explains rejected quotes (too small, unsupported route); show its message as returned.
  if (!res.ok) throw new Error(typeof json?.message === 'string' ? json.message : `Quote failed (${res.status})`);
  return summarizeQuote(json as RawQuote);
}
