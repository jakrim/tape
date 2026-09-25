import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { colors, radius, space } from './theme';

type Props<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  // Optional per-option selected color (e.g. green for Long, red for Short).
  activeColor?: (value: T) => string;
  size?: 'sm' | 'md';
};

export function Segmented<T extends string>({ options, value, onChange, activeColor, size = 'md' }: Props<T>) {
  return (
    <View style={styles.track}>
      {options.map((opt) => {
        const selected = opt.value === value;
        const bg = selected ? (activeColor?.(opt.value) ?? colors.surfaceRaised) : 'transparent';
        const darkText = selected && bg === colors.up;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              Haptics.selectionAsync();
              onChange(opt.value);
            }}
            style={[styles.item, size === 'sm' && styles.itemSm, { backgroundColor: bg }]}>
            <Text variant="label" tone={darkText ? 'onAccent' : selected ? 'default' : 'muted'}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    padding: 3,
    gap: 3,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    borderRadius: radius.control - 3,
    paddingHorizontal: space.sm,
  },
  itemSm: { height: 28 },
});
