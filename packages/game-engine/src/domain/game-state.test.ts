import { describe, it, expect } from 'vitest';
import { Player } from './player';
import { Board } from './board';
import { DiceRoll } from './dice';
import { OFF, type Move } from './move';
import { SeededRandom } from './rng';
import {
  GameState,
  GamePhase,
  IllegalActionError,
  type GameStateSnapshot,
} from './game-state';

/** Builds an in-progress snapshot awaiting a move by `active`. */
function awaitingMove(board: Board, active: Player, dice: DiceRoll): GameStateSnapshot {
  return {
    board: board.toSnapshot(),
    activePlayer: active,
    phase: GamePhase.AwaitingMove,
    dice: dice.toJSON(),
    cube: { value: 1, owner: null },
    pendingDoubler: null,
    result: null,
    config: { useDoublingCube: true, maxCube: 64, jacobyRule: false },
    events: [],
  };
}

const bearOffLast: Move[] = [{ from: 1, to: OFF, die: 1, hits: false }];

describe('GameState — start & turn flow', () => {
  it('startWith puts the starter on move with the opening dice', () => {
    const game = GameState.startWith(Player.White, new DiceRoll(6, 5));
    expect(game.activePlayer).toBe(Player.White);
    expect(game.phase).toBe(GamePhase.AwaitingMove);
    expect(game.dice?.toString()).toBe('6-5');
    expect(game.events[0]).toMatchObject({ type: 'GAME_STARTED', starter: Player.White });
  });

  it('start() uses the opening roll to choose the first player', () => {
    const game = GameState.start(new SeededRandom(1));
    expect([Player.White, Player.Black]).toContain(game.activePlayer);
    expect(game.phase).toBe(GamePhase.AwaitingMove);
  });

  it('plays a turn and hands over to the opponent, who must roll', () => {
    const game = GameState.startWith(Player.White, new DiceRoll(6, 5));
    // Lover's leap: 24→18→13.
    const next = game.playTurn([
      { from: 24, to: 18, die: 6, hits: false },
      { from: 18, to: 13, die: 5, hits: false },
    ]);
    expect(next.activePlayer).toBe(Player.Black);
    expect(next.phase).toBe(GamePhase.AwaitingRoll);
    expect(next.dice).toBeNull();
    expect(next.board.pointState(13)).toEqual({ owner: Player.White, count: 6 });

    const rolled = next.rollWith(new DiceRoll(3, 1));
    expect(rolled.phase).toBe(GamePhase.AwaitingMove);
    expect(rolled.events.at(-1)).toMatchObject({ type: 'ROLLED', player: Player.Black });
  });

  it('rejects rolling while awaiting a move, and moving while awaiting a roll', () => {
    const game = GameState.startWith(Player.White, new DiceRoll(6, 5));
    expect(() => game.roll(new SeededRandom(1))).toThrow(IllegalActionError);
    const afterTurn = game.playTurn([
      { from: 24, to: 18, die: 6, hits: false },
      { from: 18, to: 13, die: 5, hits: false },
    ]);
    expect(() => afterTurn.playTurn([])).toThrow(IllegalActionError);
  });

  it('rejects an illegal turn', () => {
    const game = GameState.startWith(Player.White, new DiceRoll(6, 5));
    expect(() => game.playTurn([{ from: 24, to: 20, die: 4, hits: false }])).toThrow(
      IllegalActionError,
    );
  });
});

describe('GameState — pass when stuck', () => {
  it('detects a forced pass and accepts the empty turn', () => {
    const board = Board.fromPointMap(
      {
        19: { owner: Player.Black, count: 2 },
        24: { owner: Player.Black, count: 2 },
      },
      { bar: { [Player.White]: 1 } },
    );
    const game = GameState.fromSnapshot(awaitingMove(board, Player.White, new DiceRoll(1, 6)));
    expect(game.mustPass()).toBe(true);
    expect(game.legalTurns()).toHaveLength(1);
    const passed = game.playTurn([]);
    expect(passed.activePlayer).toBe(Player.Black);
  });
});

describe('GameState — win scoring', () => {
  const winBoard = (loser: Partial<Record<number, number>>, loserOff = 0, loserBar = 0) =>
    Board.fromPointMap(
      {
        1: { owner: Player.White, count: 1 },
        ...Object.fromEntries(
          Object.entries(loser).map(([p, c]) => [p, { owner: Player.Black, count: c }]),
        ),
      },
      { off: { [Player.White]: 14, [Player.Black]: loserOff }, bar: { [Player.Black]: loserBar } },
    );

  it('scores a single game when the loser has borne off a checker', () => {
    const game = GameState.fromSnapshot(
      awaitingMove(winBoard({ 13: 14 }, 1), Player.White, new DiceRoll(1, 1)),
    );
    const over = game.playTurn(bearOffLast);
    expect(over.phase).toBe(GamePhase.GameOver);
    expect(over.result).toEqual({ winner: Player.White, points: 1, reason: 'SINGLE' });
  });

  it('scores a gammon (2×) when the loser has borne off nothing', () => {
    const game = GameState.fromSnapshot(
      awaitingMove(winBoard({ 13: 15 }, 0), Player.White, new DiceRoll(1, 1)),
    );
    const over = game.playTurn(bearOffLast);
    expect(over.result).toEqual({ winner: Player.White, points: 2, reason: 'GAMMON' });
  });

  it('scores a backgammon (3×) when the loser is trapped in the winner home', () => {
    const game = GameState.fromSnapshot(
      awaitingMove(winBoard({ 13: 14, 3: 1 }, 0), Player.White, new DiceRoll(1, 1)),
    );
    const over = game.playTurn(bearOffLast);
    expect(over.result).toEqual({ winner: Player.White, points: 3, reason: 'BACKGAMMON' });
  });

  it('scores a backgammon when the loser is on the bar', () => {
    const game = GameState.fromSnapshot(
      awaitingMove(winBoard({ 13: 14 }, 0, 1), Player.White, new DiceRoll(1, 1)),
    );
    const over = game.playTurn(bearOffLast);
    expect(over.result?.reason).toBe('BACKGAMMON');
  });

  it('applies the doubled cube value to the score', () => {
    const snap = awaitingMove(winBoard({ 13: 15 }, 0), Player.White, new DiceRoll(1, 1));
    const game = GameState.fromSnapshot({ ...snap, cube: { value: 4, owner: Player.White } });
    const over = game.playTurn(bearOffLast);
    expect(over.result?.points).toBe(8); // 4 × gammon(2)
  });

  it('Jacoby rule reduces an un-cubed gammon to a single', () => {
    const snap = awaitingMove(winBoard({ 13: 15 }, 0), Player.White, new DiceRoll(1, 1));
    const game = GameState.fromSnapshot({
      ...snap,
      config: { useDoublingCube: true, maxCube: 64, jacobyRule: true },
    });
    const over = game.playTurn(bearOffLast);
    expect(over.result).toEqual({ winner: Player.White, points: 1, reason: 'SINGLE' });
  });
});

describe('GameState — doubling cube', () => {
  const awaitingRoll = (): GameState => {
    const snap: GameStateSnapshot = {
      board: Board.initial().toSnapshot(),
      activePlayer: Player.Black,
      phase: GamePhase.AwaitingRoll,
      dice: null,
      cube: { value: 1, owner: null },
      pendingDoubler: null,
      result: null,
      config: { useDoublingCube: true, maxCube: 64, jacobyRule: false },
      events: [],
    };
    return GameState.fromSnapshot(snap);
  };

  it('offers and accepts a double: cube doubles and ownership passes', () => {
    const offered = awaitingRoll().offerDouble();
    expect(offered.phase).toBe(GamePhase.AwaitingDoubleResponse);
    const accepted = offered.respondToDouble(true);
    expect(accepted.cube).toEqual({ value: 2, owner: Player.White });
    expect(accepted.phase).toBe(GamePhase.AwaitingRoll);
    expect(accepted.activePlayer).toBe(Player.Black); // doubler now rolls
  });

  it('offers and declines a double: doubler wins the current value', () => {
    const declined = awaitingRoll().offerDouble().respondToDouble(false);
    expect(declined.phase).toBe(GamePhase.GameOver);
    expect(declined.result).toEqual({
      winner: Player.Black,
      points: 1,
      reason: 'DOUBLE_DECLINED',
    });
  });

  it('cannot double when the cube is owned by the opponent', () => {
    const snap: GameStateSnapshot = {
      ...awaitingRoll().toSnapshot(),
      cube: { value: 2, owner: Player.White },
    };
    const game = GameState.fromSnapshot(snap);
    expect(game.canOfferDouble()).toBe(false);
    expect(() => game.offerDouble()).toThrow(IllegalActionError);
  });

  it('cannot double outside the awaiting-roll phase', () => {
    const game = GameState.startWith(Player.White, new DiceRoll(3, 2));
    expect(game.canOfferDouble()).toBe(false);
  });
});

describe('GameState — resign, forfeit & serialization', () => {
  it('resignation awards the cube value to the opponent', () => {
    const game = GameState.startWith(Player.White, new DiceRoll(3, 2));
    const over = game.resign(Player.White);
    expect(over.result).toEqual({ winner: Player.Black, points: 1, reason: 'RESIGNATION' });
  });

  it('forfeit records the reason and ends the game', () => {
    const game = GameState.startWith(Player.White, new DiceRoll(3, 2));
    const over = game.forfeit(Player.Black, 'TIMEOUT');
    expect(over.result?.winner).toBe(Player.White);
    expect(over.events.some((e) => e.type === 'FORFEITED')).toBe(true);
  });

  it('round-trips through a snapshot with full fidelity', () => {
    const game = GameState.startWith(Player.White, new DiceRoll(6, 5)).playTurn([
      { from: 24, to: 18, die: 6, hits: false },
      { from: 18, to: 13, die: 5, hits: false },
    ]);
    const restored = GameState.fromSnapshot(game.toSnapshot());
    expect(restored.toSnapshot()).toEqual(game.toSnapshot());
    expect(restored.board.equals(game.board)).toBe(true);
  });

  it('records a replayable event log', () => {
    const game = GameState.startWith(Player.White, new DiceRoll(6, 5)).playTurn([
      { from: 24, to: 18, die: 6, hits: false },
      { from: 18, to: 13, die: 5, hits: false },
    ]);
    const types = game.events.map((e) => e.type);
    expect(types).toEqual(['GAME_STARTED', 'TURN_PLAYED']);
  });
});
