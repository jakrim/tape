import { useEffect, useRef, useState } from 'react';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { useClock } from '@/market/freshness';

export type PerfSample = { uiFps: number; jsFps: number; stallMs: number; longUiFrames: number };

const STALL_PROBE_MS = 50;

/**
 * Samples once a second while mounted:
 * - UI fps: frames counted in a Reanimated frame callback, i.e. frames the UI thread produced
 * - JS fps: requestAnimationFrame callbacks the JS thread managed to run
 * - JS stall: the longest the JS thread was blocked (drift of a 50 ms timer)
 * Mounted only on the diagnostics card and during a stress test, since the probes keep the
 * JS thread awake every frame.
 */
export function usePerfSampler(): PerfSample {
  const now = useClock((s) => s.now);

  const uiFrames = useSharedValue(0);
  const longUiFrames = useSharedValue(0);
  useFrameCallback((frame) => {
    uiFrames.value += 1;
    if ((frame.timeSincePreviousFrame ?? 0) > 25) longUiFrames.value += 1;
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

  const maxStall = useRef(0);
  useEffect(() => {
    let expected = Date.now() + STALL_PROBE_MS;
    const timer = setInterval(() => {
      const t = Date.now();
      maxStall.current = Math.max(maxStall.current, t - expected);
      expected = t + STALL_PROBE_MS;
    }, STALL_PROBE_MS);
    return () => clearInterval(timer);
  }, []);

  const last = useRef<{ at: number; js: number; ui: number } | null>(null);
  const [sample, setSample] = useState<PerfSample>({ uiFps: 0, jsFps: 0, stallMs: 0, longUiFrames: 0 });
  useEffect(() => {
    const cur = { at: now, js: jsFrames.current, ui: uiFrames.get() };
    const prev = last.current;
    last.current = cur;
    if (!prev || cur.at === prev.at) return;
    const secs = (cur.at - prev.at) / 1000;
    setSample({
      uiFps: Math.round((cur.ui - prev.ui) / secs),
      jsFps: Math.round((cur.js - prev.js) / secs),
      stallMs: Math.max(0, Math.round(maxStall.current)),
      longUiFrames: longUiFrames.get(),
    });
    maxStall.current = 0;
  }, [now, uiFrames, longUiFrames]);

  return sample;
}
