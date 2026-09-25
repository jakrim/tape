// Design tokens. Every color, radius and spacing value in the app comes from here,
// so swapping in a real design system is a one-file change.
// Palette follows PRJX: near-black surfaces, one neon accent, 15px card radius.

export const colors = {
  bg: '#181818',
  surface: '#212121',
  surfaceRaised: '#2A2A2A',
  border: '#2E2E2E',

  text: '#F5F5F5',
  textMuted: '#9CA3AF',
  textFaint: '#6B7280',

  accent: '#46FF04',
  accentPressed: '#28B802',
  onAccent: '#181818',

  // Market direction. Green matches the brand accent; red is tuned to sit next to it.
  up: '#46FF04',
  down: '#FF4D6A',
  upFaint: 'rgba(70, 255, 4, 0.12)',
  downFaint: 'rgba(255, 77, 106, 0.14)',

  warning: '#F5B83D',
  warningFaint: 'rgba(245, 184, 61, 0.14)',
} as const;

export const radius = {
  card: 15,
  control: 10,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

// Type scale. `num` styles use tabular figures so prices don't jitter sideways as digits change.
export const type = {
  display: { fontFamily: fonts.bold, fontSize: 32, letterSpacing: -0.5 },
  title: { fontFamily: fonts.semibold, fontSize: 20, letterSpacing: -0.2 },
  heading: { fontFamily: fonts.semibold, fontSize: 16 },
  body: { fontFamily: fonts.regular, fontSize: 15 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 15 },
  caption: { fontFamily: fonts.regular, fontSize: 12 },
  label: { fontFamily: fonts.medium, fontSize: 12, letterSpacing: 0.3 },
  num: { fontFamily: fonts.medium, fontSize: 15, fontVariant: ['tabular-nums'] as const },
  numSmall: { fontFamily: fonts.regular, fontSize: 12, fontVariant: ['tabular-nums'] as const },
} as const;

export type TypeVariant = keyof typeof type;
