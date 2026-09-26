import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptic } from './haptics';
import { colors } from './theme';

const DETENTS = [0, 0.25, 0.5, 0.75, 1];
const SNAP = 0.03; // within 3% of a detent, the thumb snaps to it
const THUMB = 22;

type Props = {
  value: number; // 0..1
  onChange: (value: number) => void;
  color?: string;
  disabled?: boolean;
  testID?: string;
};

/**
 * Drag or tap to set a fraction. The thumb follows the finger on the UI thread; JS hears about
 * it only when the whole-percent value changes. Stops at 25/50/75% snap and give a haptic detent.
 */
export function Slider({ value, onChange, color = colors.accent, disabled, testID }: Props) {
  const width = useSharedValue(0);
  const fraction = useSharedValue(value);
  const dragging = useSharedValue(false);

  // Follow the value from outside (typing an amount) unless the finger is on the slider.
  useEffect(() => {
    if (!dragging.get()) fraction.set(Math.min(1, Math.max(0, value)));
  }, [value, fraction, dragging]);

  const setFromX = (x: number) => {
    'worklet';
    if (width.value <= 0) return;
    let f = Math.min(1, Math.max(0, x / width.value));
    for (const d of DETENTS) if (Math.abs(f - d) < SNAP) f = d;
    fraction.value = f;
  };

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .minDistance(0)
    .onBegin((e) => {
      dragging.value = true;
      setFromX(e.x);
    })
    .onUpdate((e) => setFromX(e.x))
    .onFinalize(() => {
      dragging.value = false;
    });

  // Report whole percents to JS, and tick when the thumb lands on a detent.
  useAnimatedReaction(
    () => Math.round(fraction.value * 100),
    (pct, prev) => {
      if (prev === null || pct === prev || !dragging.value) return;
      scheduleOnRN(onChange, pct / 100);
      if (DETENTS.some((d) => Math.round(d * 100) === pct)) scheduleOnRN(haptic, 'detent');
    },
  );

  const fillStyle = useAnimatedStyle(() => ({ width: fraction.value * width.value }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: fraction.value * width.value - THUMB / 2 }, { scale: dragging.value ? 1.15 : 1 }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <View
        testID={testID}
        accessibilityRole="adjustable"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
        style={[styles.hit, disabled && { opacity: 0.35 }]}
        onLayout={(e) => {
          width.set(e.nativeEvent.layout.width);
        }}>
        <View style={styles.track} />
        <Animated.View style={[styles.fill, { backgroundColor: color }, fillStyle]} />
        {DETENTS.map((d) => (
          <View key={d} style={[styles.detent, { left: `${d * 100}%` }]} />
        ))}
        <Animated.View style={[styles.thumb, { borderColor: color }, thumbStyle]} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  hit: { height: 36, justifyContent: 'center', marginHorizontal: THUMB / 2 },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceRaised },
  fill: { position: 'absolute', left: 0, height: 4, borderRadius: 2 },
  detent: { position: 'absolute', width: 8, height: 8, marginLeft: -4, borderRadius: 4, backgroundColor: colors.border },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.text,
    borderWidth: 3,
  },
});
