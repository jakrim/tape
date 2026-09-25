// Polyfills must load before any wallet or signing code (order per Privy's Expo guide).
import 'fast-text-encoding';
import 'react-native-get-random-values';
import '@ethersproject/shims';
import 'expo-router/entry';
