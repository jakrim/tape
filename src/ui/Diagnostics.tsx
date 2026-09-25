import { useEffect, useRef, useState } from 'react';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { batchStats } from '@/market/batcher';
import { useConnection } from '@/market/clients';
import { feedErrors, totalMessages } from '@/market/diagnostics';
import { useClock } from '@/market/freshness';

import { Card, Row } from './Card';

type Snapshot = {
  uiFps: number;
  jsFps: number;
  longFrames: number;
  msgsPerSec: number;
  frames: number;
  merged: number;
  mergedPct: number;
  maxApplyMs: number;
  lastError: string | null;
};

const initial: Snapshot = { uiFps: 0, jsFps: 0, longFrames: 0, msgsPerSec: 0, frames: 0, merged: 0, mergedPct: 0, maxApplyMs: 0, lastError: null };

/**
 * Live numbers a reviewer can check on their own phone: frame rate on both threads,
 * socket message rates, and how much work the frame batcher absorbed.
 * The UI-thread counter runs in a Reanimated frame callback, so it counts frames the UI thread
 * actually produced rather than JS timer ticks. Everything is sampled once a second into state;
 * render never reads the mutable counters directly.
 */
export function Diagnostics() {
  const status = useConnection((s) => s.status);
  const reconnects = useConnection((s) => s.reconnects);
  const now = useClock((s) => s.now);

  const uiFrames = useSharedValue(0);
  const uiLongFrames = useSharedValue(0);
  useFrameCallback((frame) => {
    uiFrames.value += 1;
    if ((frame.timeSincePreviousFrame ?? 0) > 25) uiLongFrames.value += 1;
  });

  const jsFrames = useRef(0);
  useEffect(() => {
    let id = 0;
    const tick = () => {
      jsFrames.current += 1;
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  const last = useRef<{ at: number; js: number; ui: number; msgs: number } | null>(null);
  const [snap, setSnap] = useState<Snapshot>(initial);
  useEffect(() => {
    const cur = { at: now, js: jsFrames.current, ui: uiFrames.value, msgs: totalMessages() };
    const prev = last.current;
    last.current = cur;
    if (!prev || cur.at === prev.at) return;
    const secs = (cur.at - prev.at) / 1000;
    const total = batchStats.jobsApplied + batchStats.jobsDropped;
    setSnap({
      uiFps: Math.round((cur.ui - prev.ui) / secs),
      jsFps: Math.round((cur.js - prev.js) / secs),
      longFrames: uiLongFrames.value,
      msgsPerSec: Math.round(((cur.msgs - prev.msgs) / secs) * 10) / 10,
      frames: batchStats.frames,
      merged: batchStats.jobsDropped,
      mergedPct: total > 0 ? Math.round((batchStats.jobsDropped / total) * 100) : 0,
      maxApplyMs: batchStats.maxApplyMs,
      lastError: feedErrors[0]?.message ?? null,
    });
  }, [now, uiFrames, uiLongFrames]);

  return (
    <Card title="Diagnostics">
      <Row label="Socket" value={`${status}${reconnects ? ` · ${reconnects} reconnects` : ''}`} tone={status === 'live' ? 'up' : 'warning'} />
      <Row label="UI thread" value={`${snap.uiFps} fps`} tone={snap.uiFps >= 55 ? 'up' : 'warning'} />
      <Row label="JS thread" value={`${snap.jsFps} fps`} tone={snap.jsFps >= 55 ? 'up' : 'warning'} />
      <Row label="Long UI frames since open" value={String(snap.longFrames)} tone="muted" />
      <Row label="Socket messages" value={`${snap.msgsPerSec}/s`} />
      <Row label="Frames that applied updates" value={String(snap.frames)} tone="muted" />
      <Row label="Updates merged before render" value={`${snap.merged} (${snap.mergedPct}%)`} tone="muted" />
      <Row label="Slowest frame apply" value={`${snap.maxApplyMs.toFixed(1)} ms`} tone="muted" />
      {snap.lastError ? <Row label="Last feed error" value={snap.lastError.slice(0, 32)} tone="warning" /> : null}
    </Card>
  );
}
