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

export function Text({ variant = 'body', tone = 'default', style, ...rest }: Props) {
  return <RNText {...rest} style={[type[variant], { color: tones[tone] }, style]} />;
}
