import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';
import { create } from 'zustand';

// One native listener for the app, rather than one listener per visible price digit or row.
export const useMotionPreference = create<{ reduced: boolean | null }>(() => ({ reduced: null }));

export function useSystemMotionPreference() {
  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', reduced => {
      receivedEvent = true;
      useMotionPreference.setState({ reduced });
    });
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (active && !receivedEvent) useMotionPreference.setState({ reduced });
    }).catch(() => {});
    return () => { active = false; subscription.remove(); };
  }, []);
}
