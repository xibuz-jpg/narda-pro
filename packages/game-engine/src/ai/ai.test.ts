import { describe, it, expect } from 'vitest';
import { Player } from '../domain/player';
import { Board } from '../domain/board';
import { DiceRoll } from '../domain/dice';
import { SeededRandom } from '../domain/rng';
import { validateTurn } from '../domain/turn';
import { evaluate } from './evaluate';
import { chooseTurn, type AiLevel } from './ai-player';

const LEVELS: AiLevel[] = ['EASY', 'MEDIUM', 'HARD', 'EXPERT', 'GRANDMASTER'];

describe('evaluate', () => {
  it('is symmetric for the starting position', () => {
    const board = Board.initial();
    expect(evaluate(board, Player.White)).toBeCloseTo(evaluate(board, Player.Black), 6);
  });

  it('prefers positions where you have borne off more', () => {
    const ahead = Board.fromPointMap(
      { 2: { owner: Player.White, count: 1 } },
      { off: { [Player.White]: 14, [Player.Black]: 0 } },
    );
    expect(evaluate(ahead, Player.White)).toBeGreaterThan(evaluate(Board.initial(), Player.White));
  });

  it('penalises an exposed blot (equal pip, only shot exposure differs)', () => {
    // Both: White blot on 8; Black has the same pip count (24) in both, but only
    // in `exposed` can a Black checker hit the blot (from 6 with a 2).
    const safe = Board.fromPointMap({
      8: { owner: Player.White, count: 1 },
      13: { owner: Player.Black, count: 2 }, // Black pip 24, no shot at 8
    });
    const exposed = Board.fromPointMap({
      8: { owner: Player.White, count: 1 },
      6: { owner: Player.Black, count: 1 }, // shoots 8 with a 2
      20: { owner: Player.Black, count: 1 }, // Black pip 19 + 5 = 24 (equal)
    });
    expect(evaluate(exposed, Player.White)).toBeLessThan(evaluate(safe, Player.White));
  });
});

describe('chooseTurn', () => {
  it('every level returns a legal turn from the start position', () => {
    const board = Board.initial();
    const roll = new DiceRoll(3, 1);
    for (const level of LEVELS) {
      const turn = chooseTurn(board, Player.White, roll, level, new SeededRandom(7));
      const result = validateTurn(board, Player.White, roll, [...turn.moves]);
      expect(result.valid).toBe(true);
    }
  });

  it('returns an empty turn when the player is stuck on the bar', () => {
    const board = Board.fromPointMap(
      { 19: { owner: Player.Black, count: 2 }, 24: { owner: Player.Black, count: 2 } },
      { bar: { [Player.White]: 1 } },
    );
    const turn = chooseTurn(board, Player.White, new DiceRoll(1, 6), 'HARD', new SeededRandom(1));
    expect(turn.moves).toEqual([]);
  });

  it('a strong AI takes an available hit that gains position', () => {
    // White on 8 can hit a Black blot on 5 with a 3; the alternative wastes the die.
    const board = Board.fromPointMap({
      8: { owner: Player.White, count: 2 },
      13: { owner: Player.White, count: 2 },
      5: { owner: Player.Black, count: 1 },
    });
    const turn = chooseTurn(board, Player.White, new DiceRoll(3, 6), 'HARD', new SeededRandom(3));
    const hits = turn.moves.some((m) => m.hits);
    expect(hits).toBe(true);
  });

  it('is deterministic for a fixed seed', () => {
    const board = Board.initial();
    const roll = new DiceRoll(6, 4);
    const a = chooseTurn(board, Player.White, roll, 'EXPERT', new SeededRandom(42));
    const b = chooseTurn(board, Player.White, roll, 'EXPERT', new SeededRandom(42));
    expect(a.moves).toEqual(b.moves);
  });
});
