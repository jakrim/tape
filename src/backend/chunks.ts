// Keychain / Keystore entries are limited to about 2 KB, and a Supabase session is larger,
// so values are stored as numbered chunks.
export const CHUNK_SIZE = 1800;

export function splitChunks(value: string, size = CHUNK_SIZE): string[] {
  if (value.length === 0) return [''];
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += size) chunks.push(value.slice(i, i + size));
  return chunks;
}
