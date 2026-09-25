import * as SecureStore from 'expo-secure-store';
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

// Keys live in the iOS Keychain / Android Keystore-backed storage, readable only while the
// device is unlocked and never included in backups or migrated to another device.
const KEY_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function loadKey(name: string): Promise<PrivateKeyAccount | null> {
  const pk = await SecureStore.getItemAsync(name, KEY_OPTIONS);
  return pk ? privateKeyToAccount(pk as `0x${string}`) : null;
}

export async function createKey(name: string): Promise<PrivateKeyAccount> {
  const pk = generatePrivateKey();
  await SecureStore.setItemAsync(name, pk, KEY_OPTIONS);
  return privateKeyToAccount(pk);
}

export async function deleteKey(name: string): Promise<void> {
  await SecureStore.deleteItemAsync(name, KEY_OPTIONS);
}

// SecureStore keys may only contain letters, numbers, ".", "-" and "_".
export const keyNames = {
  deviceOwner: 'tape.owner.device',
  agent: (network: string, owner: string) => `tape.agent.${network}.${owner.toLowerCase()}`,
};
