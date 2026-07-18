import { useEffect, useMemo, useState } from 'react';
import { GamePhase, Player, opponent, type Move } from '@narda/game-engine';
import { useGameStore } from '../store/game.store';
import { useAuthStore } from '../store/auth.store';
import { GameBoard } from '../components/GameBoard';
import { TurnBuilder } from '../game/turn-builder';
import { queryClient } from '../lib/queryClient';
import { useT, type Translate } from '../i18n/i18n';
import type { BoardTarget } from '../game/board/BoardRenderer';

/** Delay before the dice auto-roll on your turn (ms). */
const AUTO_ROLL_MS = 1000;

export function GameScreen() {
  const { status, view, error, roll, submitMoves, double, respondDouble, resign, cancelSearch, leave } =
    useGameStore();
  const myId = useAuthStore((s) => s.user?.id);
  const t = useT();

  const myColor = useMemo<Player | null>(() => {
    if (!view || !myId) return null;
    if (view.players[Player.White].userId === myId) return Player.White;
    if (view.players[Player.Black].userId === myId) return Player.Black;
    return null;
  }, [view, myId]);

  const isMyTurn = !!view && myColor === view.activePlayer;
  const phase = view?.phase;

  // Client-side turn builder, rebuilt whenever a fresh move-state arrives.
  // It lives in state (not a ref) so setting it re-renders and `tb` stays live.
  const [tb, setTb] = useState<TurnBuilder | null>(null);
  const [selected, setSelected] = useState<number | 'bar' | null>(null);
  const [, bump] = useState(0);
  const rerender = () => bump((n) => n + 1);
  // Board orientation: portrait (vertical) by default so the board runs the full
  // height of a phone screen — far taller than the letter-boxed landscape fit.
  // Toggleable to landscape via the corner button.
  const [portrait, setPortrait] = useState(true);

  // Reserve thin strips for the floating controls (top: leave / timer /
  // orientation row; bottom: turn banner + action buttons) so the board sits
  // *between* them and — in portrait — runs tall right up to those edges.
  const TOP_CTRL = 58;
  const BOT_CTRL = 92;

  useEffect(() => {
    setTb(
      view && myColor && isMyTurn && phase === GamePhase.AwaitingMove && view.dice
        ? new TurnBuilder(view.board, view.dice, myColor, view.variant, view.maxFromHead)
        : null,
    );
    setSelected(null);
  }, [view?.board, view?.dice, phase, isMyTurn, myColor, view]);

  // Auto-roll: on our turn the dice throw themselves after a short beat (no
  // roll button). The delay lets the player register that it's their turn and
  // see the dice tumble before they move.
  useEffect(() => {
    if (isMyTurn && phase === GamePhase.AwaitingRoll) {
      const id = setTimeout(() => roll(), AUTO_ROLL_MS);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [isMyTurn, phase, roll]);

  // Refresh the cached profile (stats/ELO) once the game finishes.
  useEffect(() => {
    if (view?.result) void queryClient.invalidateQueries({ queryKey: ['profile'] });
  }, [view?.result]);

  if (status === 'searching') {
    return (
      <Centered>
        <div className="text-xl font-semibold">{t('game.finding')}</div>
        <div className="mt-2 text-slate-400">{t('game.matchingSkill')}</div>
        <button className="btn-ghost mt-8" onClick={cancelSearch}>
          {t('game.cancel')}
        </button>
      </Centered>
    );
  }
  if (status === 'connecting') return <Centered>{t('game.joining')}</Centered>;
  if (status === 'error') {
    return (
      <Centered>
        <div className="text-red-400">{error ?? 'Error'}</div>
        <button className="btn-ghost mt-6" onClick={leave}>
          {t('game.back')}
        </button>
      </Centered>
    );
  }
  if (!view || !myColor) return <Centered>{t('game.loading')}</Centered>;

  const displayBoard = tb ? tb.board.toSnapshot() : view.board;

  const highlights =
    tb && isMyTurn
      ? selected === null
        ? { sources: tb.sources() as BoardTarget[] }
        : { selected, destinations: tb.moveOptions(selected).map((o) => o.to) as BoardTarget[] }
      : {};

  const isSource = (t: BoardTarget): t is number | 'bar' => t !== 'off' && tb!.sources().includes(t);

  const onTarget = (target: BoardTarget) => {
    if (!tb || !isMyTurn || phase !== GamePhase.AwaitingMove) return;
    if (selected === null) {
      if (isSource(target)) setSelected(target);
      return;
    }
    // A tapped destination may be one die (a step) or several chained onto the
    // same checker (played all at once).
    const option = tb.moveOptions(selected).find((o) => o.to === target);
    if (option) {
      option.moves.forEach((m) => tb.play(m));
      setSelected(null);
      if (tb.isComplete) {
        submitMoves(tb.result());
      } else {
        rerender();
      }
      return;
    }
    // Tapped elsewhere: reselect a source or clear.
    setSelected(isSource(target) ? target : null);
  };

  const undo = () => {
    tb?.undo();
    setSelected(null);
    rerender();
  };

  const banner = turnBanner(t, view, myColor, isMyTurn);
  const canRespondDouble =
    phase === GamePhase.AwaitingDoubleResponse &&
    view.pendingDoubler !== null &&
    myColor === opponent(view.pendingDoubler);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-night-900">
      {/* Board sits between the top controls and the bottom banner; in portrait
          it runs tall to fill that whole strip. */}
      <div
        className="absolute left-0 right-0"
        style={{ top: `${TOP_CTRL}px`, bottom: `${BOT_CTRL}px` }}
      >
        <GameBoard
          board={displayBoard}
          dice={view.dice}
          highlights={highlights}
          onTargetClick={onTarget}
          activePlayer={view.activePlayer}
          flip={myColor === Player.White}
          rotated={portrait}
          fit
          className="h-full w-full"
        />
      </div>

      {/* Leave (floating top-left). */}
      <button
        className="absolute left-3 top-3 z-20 rounded-lg bg-black/45 px-3 py-1.5 text-sm text-white backdrop-blur-sm"
        onClick={leave}
      >
        ← {t('game.leave')}
      </button>

      {/* Orientation toggle (floating top-right) — prominent. */}
      <button
        className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-base font-bold text-night-900 shadow-lg"
        onClick={() => setPortrait((p) => !p)}
      >
        <span className="text-xl leading-none">{portrait ? '⬌' : '⬍'}</span>
        {portrait ? t('game.landscape') : t('game.portrait')}
      </button>

      {/* Countdown clock — small, in the top-centre control row. */}
      {view.clock && !view.result && <GameClock clock={view.clock} isMyTurn={isMyTurn} />}

      {/* Bottom overlay: turn banner + actions. */}
      <div className="absolute inset-x-0 bottom-3 z-20 flex flex-col items-center gap-2 px-3">
        <div className="rounded-full bg-black/50 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
          {banner}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {isMyTurn && phase === GamePhase.AwaitingRoll && view.variant !== 'LONG_NARDA' && (
            <button className="btn-ghost" onClick={double}>
              {t('game.double')}
            </button>
          )}

          {isMyTurn && phase === GamePhase.AwaitingMove && tb && (
            <>
              {tb.mustPass ? (
                <button className="btn-primary" onClick={() => submitMoves([] as Move[])}>
                  {t('game.pass')}
                </button>
              ) : (
                <button className="btn-ghost" onClick={undo} disabled={tb.playedMoves.length === 0}>
                  {t('game.undo')}
                </button>
              )}
            </>
          )}

          {canRespondDouble && (
            <>
              <button className="btn-primary" onClick={() => respondDouble(true)}>
                {t('game.acceptDouble')}
              </button>
              <button className="btn-ghost" onClick={() => respondDouble(false)}>
                {t('game.decline')}
              </button>
            </>
          )}

          {!view.result && (
            <button
              className="rounded-lg bg-black/45 px-3 py-1.5 text-sm text-white backdrop-blur-sm"
              onClick={resign}
            >
              {t('game.resign')}
            </button>
          )}
        </div>
      </div>

      {view.result && (
        <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-night-900/80 p-6">
          <div className="anim-pop glass w-full max-w-sm p-8 text-center">
            <div className="text-3xl font-bold">
              {view.result.winner === myColor ? t('game.youWin') : t('game.defeat')}
            </div>
            <div className="mt-2 text-slate-400">
              {t(`reason.${view.result.reason}`)} · {view.result.points} {t('game.points')}
            </div>
            <button className="btn-primary mt-6 w-full" onClick={leave}>
              {t('game.backToLobby')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A small centred countdown. Each move has a 10-second grace (shown as plain
 * seconds); once it runs out the player's reserve bank counts down as M:SS in
 * red. It always reflects the active player's clock.
 */
function GameClock({
  clock,
  isMyTurn,
}: {
  clock: { at: number; reserve: number };
  isMyTurn: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, clock.at - now);
  const grace = Math.max(0, remaining - clock.reserve); // the per-move 10s
  let text: string;
  let urgent: boolean;
  if (grace > 0) {
    text = String(Math.ceil(grace / 1000));
    urgent = grace <= 5000;
  } else {
    const s = Math.ceil(remaining / 1000);
    text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    urgent = true;
  }

  const tone = urgent
    ? 'bg-red-600/75 text-white'
    : isMyTurn
      ? 'bg-accent/80 text-night-900'
      : 'bg-black/55 text-white';
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2">
      <div className={`rounded-full px-3 py-1.5 text-base font-bold tabular-nums shadow-lg backdrop-blur-sm ${tone}`}>
        {text}
      </div>
    </div>
  );
}

function turnBanner(
  t: Translate,
  view: { phase: GamePhase; pendingDoubler: Player | null },
  myColor: Player,
  isMyTurn: boolean,
): string {
  if (view.phase === GamePhase.GameOver) return t('game.gameOver');
  if (view.phase === GamePhase.AwaitingDoubleResponse) {
    return view.pendingDoubler === myColor
      ? t('game.waitingResponse')
      : t('game.youWereDoubled');
  }
  if (!isMyTurn) return t('game.opponentTurn');
  return view.phase === GamePhase.AwaitingRoll ? t('game.rolling') : t('game.yourTurnMove');
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
      {children}
    </div>
  );
}
