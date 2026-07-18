import { describe, it, expect } from 'vitest';
import { Player } from './player';
import { Board } from './board';
import { DiceRoll } from './dice';
import { BAR, OFF, type Move } from './move';
import {
  generateTurns,
  validateTurn,
  maxDiceUsable,
  hasAnyLegalMove,
  applyTurn,
} from './turn';

describe('maxDiceUsable & max-usage rule', () => {
  it('requires both dice when both can be played', () => {
    const board = Board.fromPointMap({ 13: { owner: Player.White, count: 1 } });
    const roll = new DiceRoll(3, 5);
    expect(maxDiceUsable(board, Player.White, roll)).toBe(2);
  });

  it('a double allows up to four moves', () => {
    const board = Board.fromPointMap({ 13: { owner: Player.White, count: 1 } });
    const roll = new DiceRoll(2, 2);
    expect(maxDiceUsable(board, Player.White, roll)).toBe(4);
    // 13 → 11 → 9 → 7 → 5
    const turns = generateTurns(board, Player.White, roll);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.resultingBoard.pointState(5)).toEqual({ owner: Player.White, count: 1 });
  });

  it('reports zero when the player is stuck on the bar', () => {
    const board = Board.fromPointMap(
      {
        19: { owner: Player.Black, count: 2 },
        24: { owner: Player.Black, count: 2 },
      },
      { bar: { [Player.White]: 1 } },
    );
    const roll = new DiceRoll(1, 6); // entry points 24 and 19 both blocked
    expect(hasAnyLegalMove(board, Player.White, roll)).toBe(false);
    expect(maxDiceUsable(board, Player.White, roll)).toBe(0);
  });
});

describe('generateTurns', () => {
  it('dedupes orderings that reach the same position', () => {
    // One checker, dice 3 & 5: 13→10→5 and 13→8→5 reach the same point 5.
    const board = Board.fromPointMap({ 13: { owner: Player.White, count: 1 } });
    const turns = generateTurns(board, Player.White, new DiceRoll(3, 5));
    expect(turns).toHaveLength(1);
    expect(turns[0]!.resultingBoard.pointState(5)).toEqual({ owner: Player.White, count: 1 });
    expect(turns[0]!.moves).toHaveLength(2);
  });

  it('lists distinct positions from different checkers', () => {
    const board = Board.fromPointMap({
      13: { owner: Player.White, count: 1 },
      8: { owner: Player.White, count: 1 },
    });
    const turns = generateTurns(board, Player.White, new DiceRoll(3, 5));
    // Multiple genuinely different end positions exist.
    expect(turns.length).toBeGreaterThan(1);
  });

  it('returns a single empty turn when the player must pass', () => {
    const board = Board.fromPointMap(
      {
        19: { owner: Player.Black, count: 2 },
        24: { owner: Player.Black, count: 2 },
      },
      { bar: { [Player.White]: 1 } },
    );
    const turns = generateTurns(board, Player.White, new DiceRoll(1, 6));
    expect(turns).toHaveLength(1);
    expect(turns[0]!.moves).toEqual([]);
  });
});

describe('higher-die rule', () => {
  // White checker on 13; point 6 is blocked by Black. Either die is playable
  // alone (13→12 or 13→7) but neither continuation works, so only one die may
  // be used — and the rules force it to be the higher one (6).
  const board = Board.fromPointMap({
    13: { owner: Player.White, count: 1 },
    6: { owner: Player.Black, count: 2 },
  });
  const roll = new DiceRoll(6, 1);

  it('forces the higher die when only one can be played', () => {
    expect(maxDiceUsable(board, Player.White, roll)).toBe(1);
    const turns = generateTurns(board, Player.White, roll);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.moves[0]).toMatchObject({ from: 13, to: 7, die: 6 });
  });

  it('rejects a turn that plays the lower die instead', () => {
    const lower: Move[] = [{ from: 13, to: 12, die: 1, hits: false }];
    const result = validateTurn(board, Player.White, roll, lower);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/higher die/i);
  });

  it('accepts the turn that plays the higher die', () => {
    const higher: Move[] = [{ from: 13, to: 7, die: 6, hits: false }];
    expect(validateTurn(board, Player.White, roll, higher).valid).toBe(true);
  });
});

describe('validateTurn', () => {
  const board = Board.fromPointMap({ 13: { owner: Player.White, count: 1 } });
  const roll = new DiceRoll(3, 5);

  it('accepts a legal two-die turn in any order', () => {
    const a: Move[] = [
      { from: 13, to: 10, die: 3, hits: false },
      { from: 10, to: 5, die: 5, hits: false },
    ];
    const b: Move[] = [
      { from: 13, to: 8, die: 5, hits: false },
      { from: 8, to: 5, die: 3, hits: false },
    ];
    expect(validateTurn(board, Player.White, roll, a).valid).toBe(true);
    expect(validateTurn(board, Player.White, roll, b).valid).toBe(true);
  });

  it('rejects under-playing the dice', () => {
    const short: Move[] = [{ from: 13, to: 10, die: 3, hits: false }];
    const result = validateTurn(board, Player.White, roll, short);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/must play 2/i);
  });

  it('rejects a die that was not rolled', () => {
    const bad: Move[] = [{ from: 13, to: 7, die: 6, hits: false }];
    expect(validateTurn(board, Player.White, roll, bad).valid).toBe(false);
  });

  it('rejects a mechanically illegal move', () => {
    const blocked = Board.fromPointMap({
      13: { owner: Player.White, count: 1 },
      8: { owner: Player.Black, count: 2 },
    });
    const bad: Move[] = [{ from: 13, to: 8, die: 5, hits: false }];
    expect(validateTurn(blocked, Player.White, new DiceRoll(5, 3), bad).valid).toBe(false);
  });

  it('accepts an empty turn when the player cannot move', () => {
    const stuck = Board.fromPointMap(
      {
        19: { owner: Player.Black, count: 2 },
        24: { owner: Player.Black, count: 2 },
      },
      { bar: { [Player.White]: 1 } },
    );
    expect(validateTurn(stuck, Player.White, new DiceRoll(1, 6), []).valid).toBe(true);
  });

  it('returns the resulting board on success', () => {
    const moves: Move[] = [
      { from: 13, to: 10, die: 3, hits: false },
      { from: 10, to: 5, die: 5, hits: false },
    ];
    const result = validateTurn(board, Player.White, roll, moves);
    expect(result.resultingBoard?.pointState(5)).toEqual({ owner: Player.White, count: 1 });
  });
});

describe('bar re-entry then play', () => {
  it('forces entry first and then continues with the remaining die', () => {
    // White on the bar, roll 2 & 4. Entry on 21 (die 4) then 21→19.
    const board = Board.fromPointMap({}, { bar: { [Player.White]: 1 } });
    const roll = new DiceRoll(2, 4);
    expect(maxDiceUsable(board, Player.White, roll)).toBe(2);
    const moves: Move[] = [
      { from: BAR, to: 21, die: 4, hits: false },
      { from: 21, to: 19, die: 2, hits: false },
    ];
    expect(validateTurn(board, Player.White, roll, moves).valid).toBe(true);
  });
});

describe('applyTurn', () => {
  it('applies a bear-off sequence', () => {
    const board = Board.fromPointMap({
      6: { owner: Player.White, count: 1 },
      5: { owner: Player.White, count: 1 },
    });
    const moves: Move[] = [
      { from: 6, to: OFF, die: 6, hits: false },
      { from: 5, to: OFF, die: 5, hits: false },
    ];
    const next = applyTurn(board, Player.White, moves);
    expect(next.off(Player.White)).toBe(2);
  });
});
