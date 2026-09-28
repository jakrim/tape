import { Stack, useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';

import { AnimatedPrice } from '@/ui/AnimatedPrice';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { colors, radius, space, type } from '@/ui/theme';

const ticks = [67248.52, 67249.83, 67247.16, 67250.04, 67248.52];

/** A separate display sandbox: never writes into market, wallet or order state. */
export default function MotionPreview() {
  const { width } = useWindowDimensions();
  const [value, setValue] = useState(ticks[0]);
  const [playing, setPlaying] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const [label, setLabel] = useState('Ready');
  const focused = useIsFocused();

  useEffect(() => {
    if (!playing || !focused) return;
    let index = 0;
    const timer = setInterval(() => {
      const next = ticks[index % ticks.length];
      setValue(next);
      setLabel('Playing sample ticks');
      index++;
    }, 750);
    return () => clearInterval(timer);
  }, [playing, focused]);

  const move = (direction: -1 | 1) => {
    setPlaying(false);
    setValue(previous => Math.round((previous + direction * 1.27) * 100) / 100);
    setLabel(direction > 0 ? 'Price increased' : 'Price decreased');
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Price motion' }} />
      <View style={styles.intro}>
        <Text variant="label" tone="muted">INTERACTION PREVIEW</Text>
        <Text variant="display">Feel every tick.</Text>
        <Text tone="muted">Sample prices, using the same animation as live markets. No trades or market data are changed.</Text>
      </View>
      <View style={styles.hero}>
        <Text variant="label" tone="muted">BITCOIN · SAMPLE</Text>
        <AnimatedPrice value={value} style={{ fontSize: 38 }} maxWidth={width - 64} testID="motion-price" reduceMotion={quiet} />
        <Text variant="caption" tone="muted" testID="motion-direction">{label}</Text>
      </View>
      <View style={styles.buttons}>
        <Button title="Move down" kind="short" testID="motion-down" onPress={() => move(-1)} style={styles.button} />
        <Button title="Move up" kind="long" testID="motion-up" onPress={() => move(1)} style={styles.button} />
      </View>
      <Button title={playing ? 'Pause sample ticks' : 'Play sample ticks'} kind="secondary" testID="motion-play" onPress={() => setPlaying(p => !p)} />
      <Card title="The details">
        <View style={styles.row}>
          <Text>Compact market price</Text>
          <AnimatedPrice value={value} style={{ ...type.num, fontVariant: ['tabular-nums'] }} reduceMotion={quiet} maxWidth={150} />
        </View>
        <Text variant="caption" tone="muted">Only changed digits move. Green rolls up, red rolls down, then both settle back to white.</Text>
        <View style={styles.row}>
          <Text>Preview reduced motion</Text>
          <Switch testID="motion-reduced" accessibilityLabel="Preview reduced motion" value={quiet} onValueChange={setQuiet}
            trackColor={{ true: colors.accent, false: colors.surfaceRaised }} />
        </View>
        <Text variant="caption" tone="faint">Your iPhone’s Reduce Motion setting also applies. With motion reduced, prices update immediately.</Text>
      </Card>
      <Card title="Check the edges">
        <Button title="Thousands rollover" kind="secondary" testID="motion-rollover" onPress={() => { setPlaying(false); setValue(v => v === 999.99 ? 1000 : 999.99); setLabel('Tap again to cross $1,000'); }} />
        <Button title="Small asset price" kind="secondary" testID="motion-small" onPress={() => { setPlaying(false); setValue(v => v === 0.004405 ? 0.004406 : 0.004405); setLabel('Six decimal places, as Hyperliquid quotes'); }} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 48 },
  intro: { gap: space.sm, paddingVertical: space.sm },
  hero: { padding: space.lg, paddingVertical: space.xl, borderRadius: radius.card, backgroundColor: colors.surface, gap: space.md },
  buttons: { flexDirection: 'row', gap: space.sm },
  button: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
});
