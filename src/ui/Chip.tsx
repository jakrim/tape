import { Pressable, StyleSheet } from 'react-native';

import { Text } from './Text';
import { colors, radius, space } from './theme';

type Props = { label: string; selected?: boolean; onPress?: () => void };

export function Chip({ label, selected, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.selected]}>
      <Text variant="label" tone={selected ? 'default' : 'muted'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: space.md,
    height: 30,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: 'transparent',
  },
  selected: { backgroundColor: colors.surfaceRaised },
});
