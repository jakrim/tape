import { useLayoutEffect, useState } from 'react';
import { Text as RNText, useWindowDimensions, View, type TextStyle } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { useMotionPreference } from './motionPreference';
import { priceTransition } from './priceMotion';
import { colors, type } from './theme';

const AnimatedText = Animated.createAnimatedComponent(RNText);
const glyphWidth = (char: string) => char === '.' || char === ',' ? 0.30 : char === '$' ? 0.64 : 0.65;

/** Three attributed-text layers keep digit alignment without a native animated view per digit. */
export function AnimatedPrice({ value, style, testID, maxWidth, reduceMotion = false }: {
  value: number | undefined; style?: TextStyle; testID?: string; maxWidth?: number; reduceMotion?: boolean;
}) {
  const systemReducedMotion = useReducedMotion();
  const reducedPreference = useMotionPreference(s => s.reduced);
  const quiet = (reducedPreference ?? systemReducedMotion) || reduceMotion;
  const { width, fontScale } = useWindowDimensions();
  const [snapshot, setSnapshot] = useState({ value, previous: value });
  if (!Object.is(snapshot.value, value)) setSnapshot({ value, previous: snapshot.value });
  const transition = priceTransition(snapshot.previous, snapshot.value);
  const moving = !quiet && transition.direction !== 0;
  const progress = useSharedValue(1);
  const tint = useSharedValue(0);
  const baseSize = (style?.fontSize ?? type.display.fontSize) * Math.min(fontScale, 1.3);
  const units = transition.glyphs.reduce((sum, g) => sum + glyphWidth(g.current), 0);
  const fontSize = Math.min(baseSize, (maxWidth ?? width - 32) / units);
  const lineHeight = Math.ceil(fontSize * 1.25);
  const textStyle: TextStyle = { ...type.display, ...style, color: colors.text, fontSize, lineHeight, letterSpacing: 0, fontVariant: ['tabular-nums'] };

  useLayoutEffect(() => {
    progress.set(moving ? 0 : 1);
    tint.set(moving ? transition.direction : 0);
    if (moving) {
      progress.set(withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) }));
      tint.set(withTiming(0, { duration: 900 }));
    }
  }, [snapshot, moving, transition.direction, progress, tint]);

  const incoming = useAnimatedStyle(() => ({
    transform: [{ translateY: moving ? transition.direction * lineHeight * (1 - progress.value) : 0 }],
    opacity: moving ? 0.35 + progress.value * 0.65 : 1,
    color: interpolateColor(tint.value, [-1, 0, 1], [colors.down, colors.text, colors.up]),
  }));
  const outgoing = useAnimatedStyle(() => ({
    transform: [{ translateY: -transition.direction * lineHeight * progress.value }],
    opacity: 1 - progress.value,
    color: interpolateColor(tint.value, [-1, 0, 1], [colors.down, colors.text, colors.up]),
  }));

  // Group adjacent spans into attributed runs. Hidden spans still take up exactly the same
  // space in all layers; tabular figures keep changed digits anchored to their decimal place.
  const runs: { key: string; current: string; previous: string; changed: boolean }[] = [];
  for (const glyph of transition.glyphs) {
    const last = runs[runs.length - 1];
    if (last && last.changed === glyph.changed) {
      last.current += glyph.current;
      last.previous += glyph.previous;
    } else runs.push({ ...glyph });
  }
  const layer = { position: 'absolute' as const, top: 0, left: 0, width: units * fontSize };

  return (
    <View testID={testID} accessible accessibilityRole="text" accessibilityLabel={`Mark price ${transition.label}`}
      style={{ height: lineHeight, width: units * fontSize, maxWidth: '100%', overflow: 'hidden' }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <RNText allowFontScaling={false} numberOfLines={1} style={textStyle}>
          {moving ? runs.map(run => <RNText key={run.key} style={run.changed ? { color: 'transparent' } : undefined}>{run.current}</RNText>) : transition.label}
        </RNText>
        {moving ? <>
          <AnimatedText allowFontScaling={false} numberOfLines={1} style={[textStyle, layer, outgoing]}>
            {runs.map(run => <RNText key={run.key} style={run.changed ? undefined : { color: 'transparent' }}>{run.previous}</RNText>)}
          </AnimatedText>
          <AnimatedText allowFontScaling={false} numberOfLines={1} style={[textStyle, layer, incoming]}>
            {runs.map(run => <RNText key={run.key} style={run.changed ? undefined : { color: 'transparent' }}>{run.current}</RNText>)}
          </AnimatedText>
        </> : null}
      </View>
    </View>
  );
}
