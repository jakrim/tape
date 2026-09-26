import { create } from 'zustand';

import { supabase, useBackend } from '@/backend/session';

type FavoritesState = {
  coins: Record<string, true>;
  toggle: (coin: string) => void;
};

const DEFAULTS = ['BTC', 'ETH', 'SOL', 'HYPE'];

function toMap(list: string[]): Record<string, true> {
  return Object.fromEntries(list.map((c) => [c, true as const]));
}

/**
 * Favorites update locally first, then persist to the backend when signed in. Optimistic
 * updates are fine for a watchlist; order state is never handled this way.
 */
export const useFavorites = create<FavoritesState>((set, get) => ({
  coins: toMap(DEFAULTS),
  toggle: (coin) => {
    const had = Boolean(get().coins[coin]);
    const coins = { ...get().coins };
    if (had) delete coins[coin];
    else coins[coin] = true;
    set({ coins });
    // If the backend write fails, undo the local change so the star reflects what was saved.
    persist(coin, !had).catch(() =>
      set((s) => {
        const undo = { ...s.coins };
        if (had) undo[coin] = true;
        else delete undo[coin];
        return { coins: undo };
      }),
    );
  },
}));

async function persist(coin: string, add: boolean) {
  if (!supabase || useBackend.getState().status !== 'signed-in') return;
  const { error } = add
    ? await supabase.from('watchlist').upsert({ coin })
    : await supabase.from('watchlist').delete().eq('coin', coin);
  if (error) throw error;
}

/** After sign-in: load the saved watchlist, or save the current one if this wallet has none yet. */
export async function syncFavorites() {
  if (!supabase) return;
  const { data, error } = await supabase.from('watchlist').select('coin');
  if (error) return;
  if (data.length > 0) {
    useFavorites.setState({ coins: toMap(data.map((r) => r.coin)) });
  } else {
    await supabase.from('watchlist').insert(Object.keys(useFavorites.getState().coins).map((coin) => ({ coin })));
  }
}
