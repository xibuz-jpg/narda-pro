import { GamePhase, Player } from '@narda/game-engine';
import { useGameStore } from '../store/game.store';
import { useAuthStore } from '../store/auth.store';
import { TurnBuilder } from '../game/turn-builder';
import type { GameView } from '../game/types';

/**
 * Dev-only test harness: lets an automated check drive the client through a full
 * game (roll + play a legal turn on each of our turns) via `window.__nardaAutoLoop`.
 * Exercises the real socket store + TurnBuilder + server, without a UI driver.
 * Tree-shaken out of production builds.
 */
export function installDevAutoPlay(): void {
  if (!import.meta.env.DEV) return;

  const myColor = (view: GameView): Player | null => {
    const id = useAuthStore.getState().user?.id;
    if (!id) return null;
    if (view.players[Player.White].userId === id) return Player.White;
    if (view.players[Player.Black].userId === id) return Player.Black;
    return null;
  };

  const step = (): void => {
    const store = useGameStore.getState();
    const view = store.view;
    if (!view || view.result) return;
    const color = myColor(view);
    if (color !== view.activePlayer) return;

    if (view.phase === GamePhase.AwaitingRoll) {
      store.roll();
      return;
    }
    if (view.phase === GamePhase.AwaitingMove && view.dice && color) {
      const tb = new TurnBuilder(view.board, view.dice, color, view.variant, view.maxFromHead);
      while (!tb.isComplete && !tb.mustPass) {
        const source = tb.sources()[0];
        if (source === undefined) break;
        const dest = tb.destinations(source)[0];
        if (!dest) break;
        tb.play(dest);
      }
      store.submitMoves(tb.result());
    }
  };

  const w = window as unknown as Record<string, unknown>;
  let timer: ReturnType<typeof setInterval> | null = null;
  w.__nardaAutoLoop = () => {
    if (timer) clearInterval(timer);
    let lastSig = '';
    timer = setInterval(() => {
      const view = useGameStore.getState().view;
      if (!view || view.result) {
        if (view?.result && timer) {
          clearInterval(timer);
          timer = null;
        }
        return;
      }
      if (myColor(view) !== view.activePlayer) return;
      // Act at most once per distinct state (prevents double roll/submit races).
      const sig = `${view.phase}|${JSON.stringify(view.dice)}|${JSON.stringify(view.board.points)}|${JSON.stringify(view.board.off)}`;
      if (sig === lastSig) return;
      lastSig = sig;
      step();
    }, 400);
    return 'auto-loop on';
  };
  w.__nardaGameState = () => {
    const v = useGameStore.getState().view;
    if (!v) return null;
    const stacks: Record<number, string> = {};
    v.board.points.forEach((val, i) => {
      if (val !== 0) stacks[i + 1] = `${val > 0 ? 'W' : 'B'}${Math.abs(val)}`;
    });
    return {
      phase: v.phase,
      active: v.activePlayer,
      variant: v.variant,
      result: v.result,
      off: v.board.off,
      stacks,
    };
  };

  // Simulates real taps (source → destination) to verify tap-to-move works.
  w.__nardaTapTest = async () => {
    const sleep = (m: number) => new Promise((r) => setTimeout(r, m));
    const win = window as unknown as { __nardaBoardRenderer?: { screenCenterOf(t: unknown): { x: number; y: number } } };
    const R = win.__nardaBoardRenderer;
    const canvas = document.querySelector('canvas');
    const view = useGameStore.getState().view;
    if (!R || !canvas || !view || !view.dice) return 'not ready';
    const color = myColor(view);
    if (color !== view.activePlayer || view.phase !== GamePhase.AwaitingMove) return 'not my move';

    const tb = new TurnBuilder(view.board, view.dice, color);
    const rect = canvas.getBoundingClientRect();
    const tap = (t: unknown) => {
      const c = R.screenCenterOf(t);
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', { clientX: rect.left + c.x, clientY: rect.top + c.y, bubbles: true }),
      );
    };

    const before = JSON.stringify(useGameStore.getState().view?.board);
    const taps: string[] = [];
    // Play the whole turn via taps (GameScreen's builder tracks in lockstep).
    while (!tb.isComplete && !tb.mustPass) {
      const s = tb.sources()[0];
      if (s === undefined) break;
      const move = tb.destinations(s)[0];
      if (!move) break;
      tap(s);
      await sleep(160);
      tap(move.to);
      await sleep(160);
      taps.push(`${s}->${String(move.to)}`);
      tb.play(move);
    }
    await sleep(300);
    const after = JSON.stringify(useGameStore.getState().view?.board);
    return JSON.stringify({ maxLen: tb.maxLen, taps, submittedViaTaps: before !== after });
  };
}
