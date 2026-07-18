import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import type { AiLevel, Move } from '@narda/game-engine';
import { useAuthStore } from './auth.store';
import { api } from '../lib/api';
import type { GameView } from '../game/types';

// Empty → same origin (production build served by the backend).
const WS_URL = (import.meta.env.VITE_WS_URL as string) || '';

type Ack = { ok: boolean; error?: string; view?: GameView };

export type GameStatus = 'idle' | 'searching' | 'inviting' | 'connecting' | 'playing' | 'error';

interface GameStoreState {
  status: GameStatus;
  matchId: string | null;
  view: GameView | null;
  online: string[];
  error: string | null;
  /** The share code while hosting a friend invite (status === 'inviting'). */
  inviteCode: string | null;

  findMatch: (mode: 'CASUAL' | 'RANKED') => void;
  playAi: (level: AiLevel) => void;
  createFriendGame: () => void;
  joinFriendByCode: (code: string) => void;
  cancelSearch: () => void;
  connectToGame: (matchId: string) => void;
  roll: () => void;
  submitMoves: (moves: Move[]) => void;
  double: () => void;
  respondDouble: (accept: boolean) => void;
  resign: () => void;
  leave: () => void;
}

// Sockets live outside the store (non-serializable).
let mmSocket: Socket | null = null;
let gameSocket: Socket | null = null;

const authHeader = () => ({ token: useAuthStore.getState().accessToken });

function teardown(): void {
  mmSocket?.disconnect();
  gameSocket?.disconnect();
  mmSocket = null;
  gameSocket = null;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  status: 'idle',
  matchId: null,
  view: null,
  online: [],
  error: null,
  inviteCode: null,

  findMatch: (mode) => {
    teardown();
    set({ status: 'searching', error: null, view: null, matchId: null });
    mmSocket = io(`${WS_URL}/matchmaking`, {
      auth: authHeader(),
      transports: ['websocket'],
      forceNew: true,
    });
    mmSocket.on('connect_error', () => set({ status: 'error', error: 'Connection failed' }));
    mmSocket.on('matchmaking:found', (payload: { matchId: string }) => {
      get().connectToGame(payload.matchId);
    });
    mmSocket.emit('matchmaking:join', { mode }, (ack: Ack) => {
      if (!ack.ok) set({ status: 'error', error: ack.error ?? 'Matchmaking failed' });
    });
  },

  playAi: (level) => {
    teardown();
    set({ status: 'connecting', error: null, view: null, matchId: null });
    api
      .createAiGame(level)
      .then((view) => get().connectToGame(view.matchId))
      .catch((err) =>
        set({ status: 'error', error: err instanceof Error ? err.message : 'Failed to start' }),
      );
  },

  // Host a private game: reserve an invite code, then park on the matchmaking
  // socket waiting for the friend to redeem it (delivered as matchmaking:found).
  createFriendGame: () => {
    teardown();
    set({ status: 'connecting', error: null, view: null, matchId: null, inviteCode: null });
    api
      .createInvite()
      .then(({ code }) => {
        mmSocket = io(`${WS_URL}/matchmaking`, {
          auth: authHeader(),
          transports: ['websocket'],
          forceNew: true,
        });
        mmSocket.on('connect_error', () => set({ status: 'error', error: 'Connection failed' }));
        mmSocket.on('matchmaking:found', (payload: { matchId: string }) => {
          get().connectToGame(payload.matchId);
        });
        mmSocket.emit('invite:wait', {}, (ack: Ack) => {
          if (ack.ok) set({ status: 'inviting', inviteCode: code });
          else set({ status: 'error', error: ack.error ?? 'Failed to create invite' });
        });
      })
      .catch((err) =>
        set({ status: 'error', error: err instanceof Error ? err.message : 'Failed to create invite' }),
      );
  },

  // Redeem a friend's code: creates the match server-side, then join it.
  joinFriendByCode: (code) => {
    teardown();
    set({ status: 'connecting', error: null, view: null, matchId: null, inviteCode: null });
    api
      .acceptInvite(code)
      .then((view) => get().connectToGame(view.matchId))
      .catch((err) =>
        set({ status: 'error', error: err instanceof Error ? err.message : 'Failed to join' }),
      );
  },

  cancelSearch: () => {
    mmSocket?.emit('matchmaking:leave', {});
    const code = get().inviteCode;
    if (code) void api.cancelInvite(code).catch(() => undefined);
    teardown();
    set({ status: 'idle', error: null, inviteCode: null });
  },

  connectToGame: (matchId) => {
    mmSocket?.disconnect();
    mmSocket = null;
    set({ status: 'connecting', matchId });

    gameSocket = io(`${WS_URL}/game`, {
      auth: authHeader(),
      transports: ['websocket'],
      forceNew: true,
    });
    gameSocket.on('connect_error', () => set({ status: 'error', error: 'Connection failed' }));
    gameSocket.on('game:state', (view: GameView) => set({ view, status: 'playing' }));
    gameSocket.on('game:presence', (p: { online: string[] }) => set({ online: p.online }));
    gameSocket.on('game:ended', () => {
      /* result already delivered via game:state */
    });
    gameSocket.emit('game:join', { matchId }, (ack: Ack) => {
      if (ack.ok && ack.view) set({ view: ack.view, status: 'playing' });
      else set({ status: 'error', error: ack.error ?? 'Failed to join game' });
    });
  },

  roll: () => gameSocket?.emit('game:roll', { matchId: get().matchId }),
  submitMoves: (moves) => gameSocket?.emit('game:move', { matchId: get().matchId, moves }),
  double: () => gameSocket?.emit('game:double', { matchId: get().matchId }),
  respondDouble: (accept) =>
    gameSocket?.emit('game:double-response', { matchId: get().matchId, accept }),
  resign: () => gameSocket?.emit('game:resign', { matchId: get().matchId }),

  leave: () => {
    teardown();
    set({ status: 'idle', matchId: null, view: null, online: [], error: null, inviteCode: null });
  },
}));
