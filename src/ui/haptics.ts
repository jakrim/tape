import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { create } from 'zustand';

/**
 * One vocabulary of haptics for the whole app, so the same action always feels the same.
 * - select: changing a tab, chip, segment or interval
 * - tap: primary buttons
 * - tick: scrubbing the chart, one per candle (rate-limited)
 * - detent: a slider crossing a marked stop (25%, 50%, leverage steps)
 * - toggleOn / toggleOff: favorites and switches
 * - success / error: an order filled or rejected, a wallet created
 * Android uses the system haptic constants (crisp on any motor, no vibrate permission);
 * iOS uses UIKit's feedback generators.
 */
export type HapticKind = 'select' | 'tap' | 'tick' | 'detent' | 'toggleOn' | 'toggleOff' | 'success' | 'error';

export const useHapticsSetting = create(() => ({ enabled: true }));

const ANDROID: Record<HapticKind, Haptics.AndroidHaptics> = {
  select: Haptics.AndroidHaptics.Segment_Tick,
  tap: Haptics.AndroidHaptics.Virtual_Key,
  tick: Haptics.AndroidHaptics.Segment_Frequent_Tick,
  detent: Haptics.AndroidHaptics.Segment_Tick,
  toggleOn: Haptics.AndroidHaptics.Toggle_On,
  toggleOff: Haptics.AndroidHaptics.Toggle_Off,
  success: Haptics.AndroidHaptics.Confirm,
  error: Haptics.AndroidHaptics.Reject,
};

const TICK_MIN_GAP_MS = 35;
let lastTick = 0;

export function haptic(kind: HapticKind) {
  if (!useHapticsSetting.getState().enabled) return;
  if (kind === 'tick') {
    // A fast scrub crosses many candles; more than ~30 ticks a second feels like buzzing.
    const now = Date.now();
    if (now - lastTick < TICK_MIN_GAP_MS) return;
    lastTick = now;
  }
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(ANDROID[kind]).catch(() => {});
    return;
  }
  switch (kind) {
    case 'select':
    case 'tick':
    case 'detent':
      Haptics.selectionAsync().catch(() => {});
      break;
    case 'tap':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      break;
    case 'toggleOn':
    case 'toggleOff':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
      break;
    case 'success':
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      break;
    case 'error':
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      break;
  }
}
