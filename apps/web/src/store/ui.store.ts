import { create } from 'zustand';

export type Screen = 'home' | 'boardPreview' | 'game';

interface UiState {
  screen: Screen;
  matchId: string | null;
  go: (screen: Screen, matchId?: string | null) => void;
}

/** Lightweight client-side navigation (replaced by a router in a later step). */
export const useUiStore = create<UiState>((set) => ({
  screen: 'home',
  matchId: null,
  go: (screen, matchId = null) => set({ screen, matchId }),
}));
