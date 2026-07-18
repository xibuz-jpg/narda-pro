import { useMemo, useState } from 'react';
import { Board, Player, type BoardSnapshot } from '@narda/game-engine';
import { GameBoard } from '../components/GameBoard';
import { useUiStore } from '../store/ui.store';

/** A crafted mid-game position exercising points, both bars, and the off tray. */
function midGameSnapshot(): BoardSnapshot {
  return Board.fromPointMap(
    {
      6: { owner: Player.White, count: 5 },
      8: { owner: Player.White, count: 3 },
      13: { owner: Player.White, count: 2 },
      21: { owner: Player.White, count: 1 },
      1: { owner: Player.Black, count: 4 },
      12: { owner: Player.Black, count: 3 },
      17: { owner: Player.Black, count: 2 },
      19: { owner: Player.Black, count: 1 },
    },
    { bar: { [Player.White]: 1, [Player.Black]: 1 }, off: { [Player.White]: 2, [Player.Black]: 3 } },
  ).toSnapshot();
}

/** Developer preview of the board renderer with switchable positions. */
export function BoardPreviewScreen() {
  const go = useUiStore((s) => s.go);
  const [which, setWhich] = useState<'start' | 'mid'>('start');

  const start = useMemo(() => Board.initial().toSnapshot(), []);
  const mid = useMemo(() => midGameSnapshot(), []);
  const board = which === 'start' ? start : mid;

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <button className="text-sm text-slate-400 hover:underline" onClick={() => go('home')}>
          ← Back
        </button>
        <div className="text-sm font-semibold text-slate-300">Board preview</div>
        <div className="w-12" />
      </div>

      <div className="glass overflow-hidden p-2">
        <GameBoard board={board} dice={{ first: 5, second: 3 }} />
      </div>

      <div className="flex justify-center gap-3">
        <button
          className={which === 'start' ? 'btn-primary' : 'btn-ghost'}
          onClick={() => setWhich('start')}
        >
          Start position
        </button>
        <button
          className={which === 'mid' ? 'btn-primary' : 'btn-ghost'}
          onClick={() => setWhich('mid')}
        >
          Mid-game (bar + off)
        </button>
      </div>
    </div>
  );
}
