import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from './Text';
import { colors, radius, space } from './theme';

export function Card({ title, children, style }: { title?: string; children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.card, style]}>
      {title ? (
        <Text variant="label" tone="faint" style={styles.title}>
          {title.toUpperCase()}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function Row({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' | 'muted' | 'warning' }) {
  return (
    <View style={styles.row}>
      <Text tone="muted">{label}</Text>
      <Text variant="num" tone={tone}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: space.lg, gap: space.sm },
  title: { marginBottom: space.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 26 },
});
