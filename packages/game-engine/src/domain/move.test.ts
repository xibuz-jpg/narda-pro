import { describe, it, expect } from 'vitest';
import { Player } from './player';
import { Board } from './board';
import {
  BAR,
  OFF,
  generateSingleMoves,
  applyMove,
  allCheckersInHome,
  isEnter,
  isBearOff,
  type Move,
} from './move';

/** Convenience: sort moves for order-independent comparison. */
const key = (m: Move) => `${String(m.from)}>${String(m.to)}:${m.die}:${m.hits ? 'H' : ''}`;
const norm = (moves: Move[]) => moves.map(key).sort();

describe('generateSingleMoves — bar re-entry (rule 1)', () => {
  it('White enters from the bar on 25 − die', () => {
    const board = Board.fromPointMap({}, { bar: { [Player.White]: 1 } });
    const moves = generateSingleMoves(board, Player.White, 1);
    expect(moves).toEqual([{ from: BAR, to: 24, die: 1, hits: false }]);
    expect(isEnter(moves[0]!)).toBe(true);
  });

  it('Black enters from the bar on the die value', () => {
    const board = Board.fromPointMap({}, { bar: { [Player.Black]: 1 } });
    expect(generateSingleMoves(board, Player.Black, 6)).toEqual([
      { from: BAR, to: 6, die: 6, hits: false },
    ]);
  });

  it('entry is blocked by a made opponent point', () => {
    const board = Board.fromPointMap(
      { 24: { owner: Player.Black, count: 2 } },
      { bar: { [Player.White]: 1 } },
    );
    expect(generateSingleMoves(board, Player.White, 1)).toEqual([]);
  });

  it('entry hits an opponent blot', () => {
    const board = Board.fromPointMap(
      { 24: { owner: Player.Black, count: 1 } },
      { bar: { [Player.White]: 1 } },
    );
    const moves = generateSingleMoves(board, Player.White, 1);
    expect(moves).toEqual([{ from: BAR, to: 24, die: 1, hits: true }]);
  });

  it('while on the bar, no other checker may move', () => {
    // White has a checker on 13 but must enter first; entry point 19 is blocked.
    const board = Board.fromPointMap(
      { 13: { owner: Player.White, count: 2 }, 19: { owner: Player.Black, count: 2 } },
      { bar: { [Player.White]: 1 } },
    );
    expect(generateSingleMoves(board, Player.White, 6)).toEqual([]);
  });
});

describe('generateSingleMoves — ordinary moves (rule 2)', () => {
  it('moves a White checker toward 1', () => {
    const board = Board.fromPointMap({ 13: { owner: Player.White, count: 1 } });
    expect(generateSingleMoves(board, Player.White, 5)).toEqual([
      { from: 13, to: 8, die: 5, hits: false },
    ]);
  });

  it('moves a Black checker toward 24', () => {
    const board = Board.fromPointMap({ 1: { owner: Player.Black, count: 1 } });
    expect(generateSingleMoves(board, Player.Black, 5)).toEqual([
      { from: 1, to: 6, die: 5, hits: false },
    ]);
  });

  it('cannot land on a blocked point', () => {
    const board = Board.fromPointMap({
      13: { owner: Player.White, count: 1 },
      8: { owner: Player.Black, count: 2 },
    });
    expect(generateSingleMoves(board, Player.White, 5)).toEqual([]);
  });

  it('marks a hit when landing on a blot', () => {
    const board = Board.fromPointMap({
      8: { owner: Player.White, count: 1 },
      6: { owner: Player.Black, count: 1 },
    });
    expect(generateSingleMoves(board, Player.White, 2)).toEqual([
      { from: 8, to: 6, die: 2, hits: true },
    ]);
  });

  it('lists every eligible checker for a die', () => {
    const board = Board.fromPointMap({
      13: { owner: Player.White, count: 1 },
      8: { owner: Player.White, count: 1 },
    });
    expect(norm(generateSingleMoves(board, Player.White, 3))).toEqual(
      norm([
        { from: 13, to: 10, die: 3, hits: false },
        { from: 8, to: 5, die: 3, hits: false },
      ]),
    );
  });
});

describe('generateSingleMoves — bearing off (rule 3)', () => {
  it('does not bear off while a checker is outside the home board', () => {
    const board = Board.fromPointMap({
      6: { owner: Player.White, count: 1 },
      13: { owner: Player.White, count: 1 },
    });
    // die 6 cannot bear off (13 is outside); only the ordinary 13→7 move exists.
    expect(generateSingleMoves(board, Player.White, 6)).toEqual([
      { from: 13, to: 7, die: 6, hits: false },
    ]);
  });

  it('bears off with the exact die', () => {
    const board = Board.fromPointMap({
      6: { owner: Player.White, count: 1 },
      3: { owner: Player.White, count: 1 },
    });
    expect(generateSingleMoves(board, Player.White, 6)).toContainEqual({
      from: 6,
      to: OFF,
      die: 6,
      hits: false,
    });
    const off3 = generateSingleMoves(board, Player.White, 3).find(isBearOff);
    expect(off3).toEqual({ from: 3, to: OFF, die: 3, hits: false });
  });

  it('allows an overshoot bear-off only from the farthest point', () => {
    const board = Board.fromPointMap({
      6: { owner: Player.White, count: 1 },
      4: { owner: Player.White, count: 1 },
    });
    // die 6: point 6 bears off exactly; point 4 may NOT overshoot (6 is farther).
    expect(generateSingleMoves(board, Player.White, 6)).toEqual([
      { from: 6, to: OFF, die: 6, hits: false },
    ]);
  });

  it('overshoots from the farthest point when the die exceeds every checker', () => {
    const board = Board.fromPointMap({ 4: { owner: Player.White, count: 1 } });
    // die 6 > pip 4 and nothing is farther, so the checker on 4 bears off.
    expect(generateSingleMoves(board, Player.White, 6)).toEqual([
      { from: 4, to: OFF, die: 6, hits: false },
    ]);
  });

  it('bears off for Black symmetrically', () => {
    const board = Board.fromPointMap({ 19: { owner: Player.Black, count: 1 } });
    expect(generateSingleMoves(board, Player.Black, 6)).toEqual([
      { from: 19, to: OFF, die: 6, hits: false },
    ]);
  });
});

describe('allCheckersInHome', () => {
  it('is false with a checker on the bar', () => {
    const board = Board.fromPointMap(
      { 6: { owner: Player.White, count: 1 } },
      { bar: { [Player.White]: 1 } },
    );
    expect(allCheckersInHome(board, Player.White)).toBe(false);
  });

  it('is true only when all checkers are home', () => {
    expect(
      allCheckersInHome(Board.fromPointMap({ 6: { owner: Player.White, count: 2 } }), Player.White),
    ).toBe(true);
    expect(
      allCheckersInHome(Board.fromPointMap({ 7: { owner: Player.White, count: 1 } }), Player.White),
    ).toBe(false);
  });
});

describe('applyMove', () => {
  it('applies an ordinary move', () => {
    const board = Board.fromPointMap({ 13: { owner: Player.White, count: 1 } });
    const next = applyMove(board, Player.White, { from: 13, to: 8, die: 5, hits: false });
    expect(next.countAt(13)).toBe(0);
    expect(next.pointState(8)).toEqual({ owner: Player.White, count: 1 });
  });

  it('resolves a hit, conserving all 16 checkers', () => {
    const board = Board.fromPointMap({
      8: { owner: Player.White, count: 1 },
      6: { owner: Player.Black, count: 1 },
    });
    const next = applyMove(board, Player.White, { from: 8, to: 6, die: 2, hits: true });
    expect(next.pointState(6)).toEqual({ owner: Player.White, count: 1 });
    expect(next.bar(Player.Black)).toBe(1);
    expect(next.totalCheckers(Player.White)).toBe(1);
    expect(next.totalCheckers(Player.Black)).toBe(1);
  });

  it('applies a bar re-entry', () => {
    const board = Board.fromPointMap({}, { bar: { [Player.White]: 1 } });
    const next = applyMove(board, Player.White, { from: BAR, to: 24, die: 1, hits: false });
    expect(next.bar(Player.White)).toBe(0);
    expect(next.pointState(24)).toEqual({ owner: Player.White, count: 1 });
  });

  it('applies a bear-off', () => {
    const board = Board.fromPointMap({ 6: { owner: Player.White, count: 1 } });
    const next = applyMove(board, Player.White, { from: 6, to: OFF, die: 6, hits: false });
    expect(next.countAt(6)).toBe(0);
    expect(next.off(Player.White)).toBe(1);
  });

  it('resolves a hit even if the move flag is stale (server-authoritative)', () => {
    const board = Board.fromPointMap({
      8: { owner: Player.White, count: 1 },
      6: { owner: Player.Black, count: 1 },
    });
    // hits:false is wrong; applyMove still hits based on real board state.
    const next = applyMove(board, Player.White, { from: 8, to: 6, die: 2, hits: false });
    expect(next.bar(Player.Black)).toBe(1);
  });
});
