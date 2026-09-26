import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Sentry } from '@/lib/monitoring';
import { useStreamLifecycle } from '@/market/clients';
import { useMarketsFeed } from '@/market/markets';
import { colors } from '@/ui/theme';
import { StressOverlay } from '@/ui/StressOverlay';
import { ToastHost } from '@/ui/Toast';
import { WalletProvider } from '@/wallet/WalletProvider';

SplashScreen.preventAutoHideAsync();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bg,
    primary: colors.accent,
    text: colors.text,
    border: colors.border,
  },
};

function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  useMarketsFeed();
  useStreamLifecycle();

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ThemeProvider value={navTheme}>
        <WalletProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.bg },
              headerTintColor: colors.text,
              headerShadowVisible: false,
              headerBackButtonDisplayMode: 'minimal',
              contentStyle: { backgroundColor: colors.bg },
            }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="market/[coin]" options={{ title: '' }} />
            <Stack.Screen
              name="deposit"
              options={{
                presentation: 'formSheet',
                headerShown: false,
                sheetAllowedDetents: [0.8],
                sheetGrabberVisible: true,
                sheetCornerRadius: 24,
                contentStyle: { backgroundColor: colors.bg },
              }}
            />
            <Stack.Screen
              name="order"
              options={{
                presentation: 'formSheet',
                headerShown: false,
                sheetAllowedDetents: [0.92],
                sheetGrabberVisible: true,
                sheetCornerRadius: 24,
                contentStyle: { backgroundColor: colors.bg },
              }}
            />
          </Stack>
          <StressOverlay />
          <ToastHost />
        </WalletProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
