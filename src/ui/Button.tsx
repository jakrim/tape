import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { Text } from './Text';
import { colors, radius, space } from './theme';

type Kind = 'primary' | 'secondary' | 'long' | 'short';

const fills: Record<Kind, { bg: string; fg: 'onAccent' | 'default' }> = {
  primary: { bg: colors.accent, fg: 'onAccent' },
  secondary: { bg: colors.surfaceRaised, fg: 'default' },
  long: { bg: colors.up, fg: 'onAccent' },
  short: { bg: colors.down, fg: 'default' },
};

type Props = {
  title: string;
  onPress: () => void;
  kind?: Kind;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  testID?: string;
};

export function Button({ title, onPress, kind = 'primary', disabled, loading, style, testID }: Props) {
  const fill = fills[kind];
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      disabled={inactive}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: fill.bg, opacity: inactive ? 0.4 : pressed ? 0.8 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fill.fg === 'onAccent' ? colors.onAccent : colors.text} />
      ) : (
        <Text variant="heading" tone={fill.fg}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
});
