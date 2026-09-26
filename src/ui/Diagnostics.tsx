import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { batchStats } from '@/market/batcher';
import { useConnection } from '@/market/clients';
import { feedErrors, totalMessages } from '@/market/diagnostics';
import { useClock } from '@/market/freshness';
import { RATES_PER_SECOND, startStressTest, useStress } from '@/market/stress';

import { Button } from './Button';
import { Card, Row } from './Card';
import { Text } from './Text';
import { usePerfSampler } from './usePerfSampler';

type Snapshot = { msgsPerSec: number; frames: number; merged: number; mergedPct: number; maxApplyMs: number; lastError: string | null };

const initial: Snapshot = { msgsPerSec: 0, frames: 0, merged: 0, mergedPct: 0, maxApplyMs: 0, lastError: null };

/**
 * Live numbers anyone can check on their own phone: frame rate on both threads, the longest
 * JS-thread stall, socket message rates, and how much work the frame batcher absorbed.
 * Everything is sampled once a second into state; render never reads the mutable counters.
 */
export function Diagnostics() {
  const status = useConnection((s) => s.status);
  const reconnects = useConnection((s) => s.reconnects);
  const now = useClock((s) => s.now);
  const perf = usePerfSampler();
  const stressRunning = useStress((s) => s.running);
  const stressResults = useStress((s) => s.results);

  // Message rate over a 10 s window: some streams only tick every ~4 s, so a 1 s window reads 0.
  const msgSamples = useRef<{ at: number; msgs: number }[]>([]);
  const [snap, setSnap] = useState<Snapshot>(initial);
  useEffect(() => {
    const samples = msgSamples.current;
    samples.push({ at: now, msgs: totalMessages() });
    while (samples.length > 1 && now - samples[0].at > 10_000) samples.shift();
    const windowSecs = Math.max((now - samples[0].at) / 1000, 1);
    const total = batchStats.jobsApplied + batchStats.jobsDropped;
    setSnap({
      msgsPerSec: Math.round(((samples[samples.length - 1].msgs - samples[0].msgs) / windowSecs) * 10) / 10,
      frames: batchStats.frames,
      merged: batchStats.jobsDropped,
      mergedPct: total > 0 ? Math.round((batchStats.jobsDropped / total) * 100) : 0,
      maxApplyMs: batchStats.maxApplyMs,
      lastError: feedErrors[0]?.message ?? null,
    });
  }, [now]);

  const perSecond = Object.values(RATES_PER_SECOND).reduce((a, b) => a + b, 0);

  return (
    <Card title="Diagnostics">
      <Row label="Socket" value={`${status}${reconnects ? ` · ${reconnects} reconnects` : ''}`} tone={status === 'live' ? 'up' : 'warning'} />
      <Row label="UI thread" value={`${perf.uiFps} fps`} tone={perf.uiFps >= 55 ? 'up' : 'warning'} />
      <Row label="JS thread" value={`${perf.jsFps} fps`} tone={perf.jsFps >= 55 ? 'up' : 'warning'} />
      <Row label="Longest JS stall (last second)" value={`${perf.stallMs} ms`} tone={perf.stallMs > 50 ? 'warning' : 'muted'} />
      <Row label="Long UI frames since open" value={String(perf.longUiFrames)} tone="muted" />
      <Row label="Socket messages (10s avg)" value={`${snap.msgsPerSec}/s`} />
      <Row label="Frames that applied updates" value={String(snap.frames)} tone="muted" />
      <Row label="Updates merged before render" value={`${snap.merged} (${snap.mergedPct}%)`} tone="muted" />
      <Row label="Slowest frame apply" value={`${snap.maxApplyMs.toFixed(1)} ms`} tone="muted" />
      {snap.lastError ? <Row label="Last feed error" value={snap.lastError.slice(0, 32)} tone="warning" /> : null}
      {stressResults ? (
        <Text variant="caption" tone="muted" testID="stress-results">
          Last stress test: {stressResults.messages.toLocaleString()} messages in {stressResults.seconds}s · UI avg{' '}
          {stressResults.avgUiFps} / low {stressResults.minUiFps} fps · JS avg {stressResults.avgJsFps} / low{' '}
          {stressResults.minJsFps} fps · longest JS stall {stressResults.maxJsStallMs} ms
        </Text>
      ) : null}
      <Button
        testID="run-stress-test"
        title={stressRunning ? 'Stress test running…' : 'Run 15 s stress test on BTC'}
        kind="secondary"
        disabled={stressRunning}
        onPress={() => {
          router.push({ pathname: '/market/[coin]', params: { coin: 'BTC' } });
          setTimeout(() => startStressTest(15), 1500);
        }}
      />
      <Text variant="caption" tone="faint">
        Pushes about {perSecond} synthetic updates a second through the live data path (20x to 50x normal traffic),
        clearly labeled, then hands back to real data.
      </Text>
    </Card>
  );
}
