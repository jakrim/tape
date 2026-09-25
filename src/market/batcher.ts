// Frame batching for market data.
//
// Messages can arrive faster than the screen draws, especially in bursts during volatility.
// Socket handlers never touch React state directly. They register "apply the latest value"
// jobs here, keyed by stream, and we run all pending jobs once per animation frame. A newer
// message for the same stream replaces the older job, so React renders at most once per frame
// no matter how many messages arrived, and the JS thread never falls behind the socket.

const jobs = new Map<string, () => void>();
let scheduled = false;

export const batchStats = { frames: 0, jobsApplied: 0, jobsDropped: 0, maxApplyMs: 0 };

export function onNextFrame(key: string, job: () => void) {
  if (jobs.has(key)) batchStats.jobsDropped++;
  jobs.set(key, job);
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(flush);
  }
}

function flush() {
  scheduled = false;
  const pending = Array.from(jobs.values());
  jobs.clear();
  const start = performance.now();
  for (const job of pending) job();
  const elapsed = performance.now() - start;
  batchStats.frames++;
  batchStats.jobsApplied += pending.length;
  if (elapsed > batchStats.maxApplyMs) batchStats.maxApplyMs = elapsed;
}
