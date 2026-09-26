import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { colors, radius, space } from './theme';

function Bone({ width, height = 12 }: { width: DimensionValue; height?: number }) {
  return <View style={[styles.bone, { width, height }]} />;
}

/** Placeholder rows shaped like market rows, pulsing gently while the list loads. */
export function MarketListSkeleton({ rows = 9, rowHeight }: { rows?: number; rowHeight: number }) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0.5);
  useEffect(() => {
    if (!reduceMotion) pulse.set(withRepeat(withTiming(1, { duration: 800 }), -1, true));
  }, [pulse, reduceMotion]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View style={animated} testID="markets-skeleton" accessibilityLabel="Loading markets">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={[styles.row, { height: rowHeight }]}>
          <View style={styles.left}>
            <Bone width={56} height={14} />
            <Bone width={84} height={10} />
          </View>
          <Bone width={72} height={14} />
          <View style={styles.pill} />
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, gap: space.md },
  left: { flex: 1, gap: 8 },
  bone: { borderRadius: 4, backgroundColor: colors.surfaceRaised },
  pill: { width: 76, height: 28, borderRadius: radius.control - 2, backgroundColor: colors.surface },
});
