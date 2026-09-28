/** Review consent belongs to one wallet/network, and is deliberately short-lived. */
export function reviewBlocker(review: { ownerAddress: string; at: number }, current: {
  ownerAddress?: string; network: string; now: number; dataIsLive: boolean; stressRunning: boolean;
}): string | null {
  if (current.network !== 'testnet') return 'Trading is on testnet';
  if (current.ownerAddress?.toLowerCase() !== review.ownerAddress.toLowerCase()) return 'Wallet changed. Review the order again.';
  if (current.stressRunning) return 'Stress test running: prices are synthetic';
  if (!current.dataIsLive) return 'Waiting for live prices';
  if (current.now < review.at || current.now - review.at > 30_000) return 'Order review expired. Review again.';
  return null;
}
