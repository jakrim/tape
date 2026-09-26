import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useClock } from '@/market/freshness';
import { reportStressSample, useStress } from '@/market/stress';

import { Text } from './Text';
import { colors, radius, space } from './theme';
import { usePerfSampler } from './usePerfSampler';

/**
 * Shown on every screen while a stress test runs, so synthetic numbers are never mistaken for
 * market data, and briefly afterwards with the results.
 */
export function StressOverlay() {
  const running = useStress((s) => s.running);
  const results = useStress((s) => s.results);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (!results) return;
    setShowResults(true);
    const t = setTimeout(() => setShowResults(false), 8_000);
    return () => clearTimeout(t);
  }, [results]);

  if (running) return <RunningBanner />;
  if (showResults && results) {
    return (
      <Banner tone="done">
        <Text variant="label">Stress test done · {results.messages.toLocaleString()} synthetic messages</Text>
        <Text variant="numSmall" tone="muted">
          UI avg {results.avgUiFps} / low {results.minUiFps} fps · JS avg {results.avgJsFps} / low {results.minJsFps} fps · longest JS stall {results.maxJsStallMs} ms
        </Text>
      </Banner>
    );
  }
  return null;
}

function RunningBanner() {
  const sample = usePerfSampler();
  const endsAt = useStress((s) => s.endsAt);
  const secondsLeft = useClock((s) => Math.max(0, Math.ceil((endsAt - s.now) / 1000)));

  // The first sample covers the navigation into the screen, not the test itself.
  const seen = useRef(0);
  useEffect(() => {
    if (sample.uiFps > 0 && seen.current++ > 0) reportStressSample(sample.uiFps, sample.jsFps, sample.stallMs);
  }, [sample]);

  return (
    <Banner tone="running">
      <Text variant="label" tone="warning">
        Stress test · synthetic data · {secondsLeft}s
      </Text>
      <Text variant="numSmall" tone="muted" testID="stress-live">
        UI {sample.uiFps} fps · JS {sample.jsFps} fps · JS stall {sample.stallMs} ms
      </Text>
    </Banner>
  );
}

function Banner({ tone, children }: { tone: 'running' | 'done'; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="none" style={[styles.host, { top: insets.top + 2 }]}>
      <View
        testID="stress-banner"
        style={[styles.banner, { borderColor: tone === 'running' ? colors.warning : colors.border }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: space.lg, right: space.lg, zIndex: 90 },
  banner: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.control,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: 2,
  },
});
