import * as SecureStore from 'expo-secure-store';

import { splitChunks } from './chunks';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// SecureStore keys allow letters, numbers, ".", "-" and "_".
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

async function count(key: string): Promise<number> {
  return Number((await SecureStore.getItemAsync(`${safe(key)}.n`, OPTIONS)) ?? 0);
}

/** Supabase auth storage backed by the Keychain / Keystore, chunked to fit its size limit. */
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const n = await count(key);
    if (n === 0) return null;
    const parts = await Promise.all(Array.from({ length: n }, (_, i) => SecureStore.getItemAsync(`${safe(key)}.${i}`, OPTIONS)));
    return parts.some((p) => p === null) ? null : parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const before = await count(key);
    const chunks = splitChunks(value);
    await Promise.all(chunks.map((c, i) => SecureStore.setItemAsync(`${safe(key)}.${i}`, c, OPTIONS)));
    await SecureStore.setItemAsync(`${safe(key)}.n`, String(chunks.length), OPTIONS);
    for (let i = chunks.length; i < before; i++) await SecureStore.deleteItemAsync(`${safe(key)}.${i}`, OPTIONS);
  },
  async removeItem(key: string): Promise<void> {
    const n = await count(key);
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${safe(key)}.${i}`, OPTIONS);
    await SecureStore.deleteItemAsync(`${safe(key)}.n`, OPTIONS);
  },
};
