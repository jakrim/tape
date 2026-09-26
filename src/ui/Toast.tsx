import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { haptic } from './haptics';
import { Text } from './Text';
import { colors, radius, space } from './theme';

type Toast = { id: number; title: string; body?: string; tone: 'up' | 'down' | 'default' };

const useToast = create<{ toast: Toast | null }>(() => ({ toast: null }));
let nextId = 1;

/** Shows a banner at the top of the screen. Success and error toasts come with their haptic. */
export function showToast(t: Omit<Toast, 'id'>) {
  useToast.setState({ toast: { ...t, id: nextId++ } });
  if (t.tone === 'up') haptic('success');
  if (t.tone === 'down') haptic('error');
}

const VISIBLE_MS = 4_000;

export function ToastHost() {
  const toast = useToast((s) => s.toast);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => useToast.setState({ toast: null }), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  const accent = toast.tone === 'up' ? colors.up : toast.tone === 'down' ? colors.down : colors.textMuted;
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + space.sm }]}>
      <Animated.View key={toast.id} entering={FadeInUp.springify().damping(18)} exiting={FadeOutUp.duration(180)}>
        <Pressable
          testID="toast"
          accessibilityRole="alert"
          onPress={() => useToast.setState({ toast: null })}
          style={[styles.toast, { borderColor: accent }]}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <View style={styles.text}>
            <Text variant="bodyStrong">{toast.title}</Text>
            {toast.body ? (
              <Text variant="caption" tone="muted">
                {toast.body}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: space.lg, right: space.lg, zIndex: 100 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { flex: 1, gap: 2 },
});
