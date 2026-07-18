import { describe, it, expect } from 'vitest';
import { Player } from '../domain/player';
import { Board } from '../domain/board';
import { DiceRoll } from '../domain/dice';
import { OFF, type Move } from '../domain/move';
import { CHECKERS_PER_PLAYER } from '../domain/geometry';
import { SeededRandom } from '../domain/rng';
import { GameState, GamePhase } from '../domain/game-state';
import { chooseTurnFor } from '../ai/ai-player';
import { pipToOff, pointAtPip, headPoint, isInHome } from './geometry';
import { generateSingleMovesLong } from './move';
import {
  generateTurnsLong,
  validateTurnLong,
  maxDiceUsableLong,
  maxFromHeadFor,
} from './turn';

describe('Long Narda geometry', () => {
  it('heads are 24 (White) and 12 (Black), each 24 pips out', () => {
    expect(headPoint(Player.White)).toBe(24);
    expect(headPoint(Player.Black)).toBe(12);
    expect(pipToOff(Player.White, 24)).toBe(24);
    expect(pipToOff(Player.Black, 12)).toBe(24);
  });

  it('pip and point are inverse for both players', () => {
    for (let p = 1; p <= 24; p += 1) {
      expect(pointAtPip(Player.White, pipToOff(Player.White, p))).toBe(p);
      expect(pointAtPip(Player.Black, pipToOff(Player.Black, p))).toBe(p);
    }
  });

  it('home boards are 1–6 (White) and 13–18 (Black)', () => {
    expect([1, 2, 3, 4, 5, 6].every((p) => isInHome(Player.White, p))).toBe(true);
    expect(isInHome(Player.White, 7)).toBe(false);
    expect([13, 14, 15, 16, 17, 18].every((p) => isInHome(Player.Black, p))).toBe(true);
    expect(isInHome(Player.Black, 12)).toBe(false);
  });
});

describe('Long Narda starting position', () => {
  it('has all 15 checkers on each head', () => {
    const board = Board.initialLongNarda();
    expect(board.pointState(24)).toEqual({ owner: Player.White, count: 15 });
    expect(board.pointState(12)).toEqual({ owner: Player.Black, count: 15 });
    expect(board.totalCheckers(Player.White)).toBe(CHECKERS_PER_PLAYER);
    expect(board.totalCheckers(Player.Black)).toBe(CHECKERS_PER_PLAYER);
  });
});

describe('Long Narda single moves', () => {
  it('moves along the pip track (White 24→21 with a 3)', () => {
    const board = Board.initialLongNarda();
    expect(generateSingleMovesLong(board, Player.White, 3)).toContainEqual({
      from: 24,
      to: 21,
      die: 3,
      hits: false,
    });
  });

  it('Black moves 12→9 with a 3', () => {
    const board = Board.initialLongNarda();
    expect(generateSingleMovesLong(board, Player.Black, 3)).toContainEqual({
      from: 12,
      to: 9,
      die: 3,
      hits: false,
    });
  });

  it('never hits — a single opponent checker BLOCKS the point', () => {
    const board = Board.fromPointMap({
      8: { owner: Player.White, count: 1 },
      6: { owner: Player.Black, count: 1 }, // would be a hit in backgammon
    });
    // White 8 with a 2 → target pip 6 = point 6, blocked by the lone Black checker.
    expect(generateSingleMovesLong(board, Player.White, 2)).toEqual([]);
  });

  it('can stack on a point it already owns', () => {
    const board = Board.fromPointMap({
      8: { owner: Player.White, count: 1 },
      6: { owner: Player.White, count: 2 },
    });
    expect(generateSingleMovesLong(board, Player.White, 2)).toContainEqual({
      from: 8,
      to: 6,
      die: 2,
      hits: false,
    });
  });

  it('bears off from home with the exact die', () => {
    const board = Board.fromPointMap({ 3: { owner: Player.White, count: 1 } });
    expect(generateSingleMovesLong(board, Player.White, 3)).toContainEqual({
      from: 3,
      to: OFF,
      die: 3,
      hits: false,
    });
  });
});

describe('Long Narda head rule', () => {
  it('opening doubles 6-6/4-4/3-3 allow two off the head, else one', () => {
    expect(maxFromHeadFor(new DiceRoll(6, 6), true)).toBe(2);
    expect(maxFromHeadFor(new DiceRoll(4, 4), true)).toBe(2);
    expect(maxFromHeadFor(new DiceRoll(3, 3), true)).toBe(2);
    expect(maxFromHeadFor(new DiceRoll(5, 5), true)).toBe(1);
    expect(maxFromHeadFor(new DiceRoll(6, 6), false)).toBe(1);
    expect(maxFromHeadFor(new DiceRoll(3, 5), true)).toBe(1);
  });

  it('rejects moving two checkers off the head when only one is allowed', () => {
    const board = Board.initialLongNarda();
    const roll = new DiceRoll(3, 5);
    const twoFromHead: Move[] = [
      { from: 24, to: 21, die: 3, hits: false },
      { from: 24, to: 19, die: 5, hits: false },
    ];
    expect(validateTurnLong(board, Player.White, roll, twoFromHead, 1).valid).toBe(false);
  });

  it('accepts one checker using both dice off the head', () => {
    const board = Board.initialLongNarda();
    const roll = new DiceRoll(3, 5);
    const oneChecker: Move[] = [
      { from: 24, to: 21, die: 3, hits: false },
      { from: 21, to: 16, die: 5, hits: false },
    ];
    const result = validateTurnLong(board, Player.White, roll, oneChecker, 1);
    expect(result.valid).toBe(true);
  });

  it('generated turns never move more than one checker off the head', () => {
    const board = Board.initialLongNarda();
    const roll = new DiceRoll(3, 5);
    const turns = generateTurnsLong(board, Player.White, roll, 1);
    expect(turns.length).toBeGreaterThan(0);
    for (const turn of turns) {
      const fromHead = turn.moves.filter((m) => m.from === 24).length;
      expect(fromHead).toBeLessThanOrEqual(1);
    }
    expect(maxDiceUsableLong(board, Player.White, roll, 1)).toBe(2);
  });

  it('plays one die when the second could only come from the head again', () => {
    // White has one checker off the head on 24; its only advance (24→18) then
    // hits a wall — the 5-continuation 18→13 is blocked by Black, so the only
    // way to use a second die is a SECOND head checker, which the head rule
    // forbids. The maximum usable is therefore 1 (play the higher die 6), NOT 0.
    const board = Board.fromPointMap({
      1: { owner: Player.White, count: 10 },
      24: { owner: Player.White, count: 5 },
      13: { owner: Player.Black, count: 4 },
    });
    const roll = new DiceRoll(6, 5);
    expect(maxDiceUsableLong(board, Player.White, roll, 1)).toBe(1);
    const turns = generateTurnsLong(board, Player.White, roll, 1);
    expect(turns.length).toBeGreaterThan(0);
    for (const turn of turns) {
      expect(turn.moves).toHaveLength(1);
      expect(turn.moves[0]!.die).toBe(6); // higher-die rule
    }
    // A forced pass must be rejected — a legal one-die play exists.
    expect(validateTurnLong(board, Player.White, roll, [], 1).valid).toBe(false);
  });

  it('opening 6-6 lets two checkers leave the head', () => {
    const board = Board.initialLongNarda();
    const roll = new DiceRoll(6, 6);
    const turns = generateTurnsLong(board, Player.White, roll, 2); // opening allowance
    const twoOffHead = turns.some((t) => t.moves.filter((m) => m.from === 24).length === 2);
    expect(twoOffHead).toBe(true);
  });
});

describe('Long Narda game (GameState integration)', () => {
  it('starts on the two heads and reports the LONG_NARDA variant', () => {
    const game = GameState.start(new SeededRandom(1), {
      variant: 'LONG_NARDA',
      useDoublingCube: false,
    });
    expect(game.config.variant).toBe('LONG_NARDA');
    expect(game.board.pointState(24)).toEqual({ owner: Player.White, count: 15 });
    expect(game.board.pointState(12)).toEqual({ owner: Player.Black, count: 15 });
    // The engine picks each legal turn from its variant-aware generator.
    if (game.phase === GamePhase.AwaitingMove) {
      const turns = game.legalTurns();
      expect(turns.length).toBeGreaterThan(0);
    }
  });

  it('plays a full seeded game to a valid mars/single finish', () => {
    const rng = new SeededRandom(20260715);
    let game = GameState.start(rng, { variant: 'LONG_NARDA', useDoublingCube: false });
    let guard = 0;
    while (!game.isOver && guard++ < 10000) {
      if (game.phase === GamePhase.AwaitingRoll) {
        game = game.roll(rng);
        continue;
      }
      const turn = chooseTurnFor(game, 'HARD', rng);
      game = game.playTurn([...turn.moves]);
    }
    expect(game.isOver).toBe(true);
    const result = game.result!;
    expect(['SINGLE', 'GAMMON']).toContain(result.reason);

    const loser = result.winner === Player.White ? Player.Black : Player.White;
    const loserOff = game.board.toSnapshot().off[loser];
    if (result.reason === 'GAMMON') {
      // Mars: the loser bore nothing off, worth 2 points.
      expect(loserOff).toBe(0);
      expect(result.points).toBe(2);
    } else {
      expect(loserOff).toBeGreaterThan(0);
      expect(result.points).toBe(1);
    }
  });
});
