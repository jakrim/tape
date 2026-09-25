import { StyleSheet, View } from 'react-native';

import { useConnection } from '@/market/clients';
import { useAgeSeconds, useIsLive } from '@/market/freshness';

import { Text } from './Text';
import { colors, radius, space } from './theme';

type Props = { updatedAt: number | null; staleAfterMs: number };

/**
 * Tells the user exactly how current the numbers on screen are.
 * Live = socket connected and this stream updated recently. Anything else says why it isn't.
 */
export function LiveBadge({ updatedAt, staleAfterMs }: Props) {
  const status = useConnection((s) => s.status);
  const live = useIsLive(updatedAt, staleAfterMs);
  const age = useAgeSeconds(updatedAt);

  let label = 'Live';
  if (status === 'connecting' && updatedAt === null) label = 'Connecting';
  else if (status === 'reconnecting') label = 'Reconnecting';
  else if (!live) label = age === null ? 'Waiting for data' : `Delayed ${age}s`;

  return (
    <View
      testID="live-badge"
      accessibilityLabel={`Market data: ${label}`}
      style={[styles.badge, { backgroundColor: live ? colors.upFaint : colors.warningFaint }]}>
      <View style={[styles.dot, { backgroundColor: live ? colors.up : colors.warning }]} />
      <Text variant="label" tone={live ? 'up' : 'warning'}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
    height: 24,
    borderRadius: radius.pill,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
