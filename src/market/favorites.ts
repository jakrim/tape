import { create } from 'zustand';

type FavoritesState = {
  coins: Record<string, true>;
  toggle: (coin: string) => void;
};

export const useFavorites = create<FavoritesState>((set) => ({
  coins: { BTC: true, ETH: true, SOL: true, HYPE: true },
  toggle: (coin) =>
    set((s) => {
      const coins = { ...s.coins };
      if (coins[coin]) delete coins[coin];
      else coins[coin] = true;
      return { coins };
    }),
}));
