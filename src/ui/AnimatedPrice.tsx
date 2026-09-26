import { useEffect, useRef } from 'react';
import { Text as RNText, type TextStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { formatPrice } from '@/trading/format';

import { colors, type } from './theme';

const AnimatedText = Animated.createAnimatedComponent(RNText);

/**
 * A price that flashes green on an uptick and red on a downtick, then settles back to white.
 * The color animation runs on the UI thread; React only renders when the value changes.
 */
export function AnimatedPrice({ value, style, testID }: { value: number | undefined; style?: TextStyle; testID?: string }) {
  const reduceMotion = useReducedMotion();
  const flash = useSharedValue(0);
  const last = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!reduceMotion && value !== undefined && last.current !== undefined && value !== last.current) {
      flash.set(value > last.current ? 1 : -1);
      flash.set(withTiming(0, { duration: 900 }));
    }
    last.current = value;
  }, [value, flash, reduceMotion]);

  const animated = useAnimatedStyle(() => ({
    color: interpolateColor(flash.value, [-1, 0, 1], [colors.down, colors.text, colors.up]),
  }));

  return (
    <AnimatedText testID={testID} maxFontSizeMultiplier={1.3} accessibilityLabel={value === undefined ? undefined : `Mark price ${formatPrice(value)}`} style={[type.display, style, animated]}>
      {value === undefined ? '—' : formatPrice(value)}
    </AnimatedText>
  );
}
