import { Text as RNText, type TextProps } from 'react-native';

import { colors, type, type TypeVariant } from './theme';

const tones = {
  default: colors.text,
  muted: colors.textMuted,
  faint: colors.textFaint,
  accent: colors.accent,
  up: colors.up,
  down: colors.down,
  warning: colors.warning,
  onAccent: colors.onAccent,
} as const;

export type Tone = keyof typeof tones;

type Props = TextProps & { variant?: TypeVariant; tone?: Tone };

// Large accessibility text sizes still scale, but dense number columns (order book, prices) are
// capped so rows don't overflow.
const MAX_SCALE_NUMERIC = 1.3;
const MAX_SCALE_TEXT = 1.6;

export function Text({ variant = 'body', tone = 'default', style, ...rest }: Props) {
  const numeric = variant === 'num' || variant === 'numSmall' || variant === 'display';
  return (
    <RNText
      maxFontSizeMultiplier={numeric ? MAX_SCALE_NUMERIC : MAX_SCALE_TEXT}
      {...rest}
      style={[type[variant], { color: tones[tone] }, style]}
    />
  );
}
