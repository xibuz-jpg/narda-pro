import { describe, it, expect } from 'vitest';
import { Player } from './player';
import { CHECKERS_PER_PLAYER } from './geometry';
import { Board } from './board';

describe('Board', () => {
  describe('factories', () => {
    it('empty() has no checkers anywhere', () => {
      const board = Board.empty();
      for (let p = 1; p <= 24; p += 1) expect(board.countAt(p)).toBe(0);
      expect(board.bar(Player.White)).toBe(0);
      expect(board.off(Player.Black)).toBe(0);
    });

    it('initial() is the standard start with 15 checkers each', () => {
      const board = Board.initial();
      expect(board.pointState(24)).toEqual({ owner: Player.White, count: 2 });
      expect(board.pointState(13)).toEqual({ owner: Player.White, count: 5 });
      expect(board.pointState(8)).toEqual({ owner: Player.White, count: 3 });
      expect(board.pointState(6)).toEqual({ owner: Player.White, count: 5 });
      expect(board.pointState(1)).toEqual({ owner: Player.Black, count: 2 });
      expect(board.pointState(12)).toEqual({ owner: Player.Black, count: 5 });
      expect(board.pointState(17)).toEqual({ owner: Player.Black, count: 3 });
      expect(board.pointState(19)).toEqual({ owner: Player.Black, count: 5 });
      expect(board.totalCheckers(Player.White)).toBe(CHECKERS_PER_PLAYER);
      expect(board.totalCheckers(Player.Black)).toBe(CHECKERS_PER_PLAYER);
    });

    it('initial() pip count is the classic 167 for both players', () => {
      const board = Board.initial();
      expect(board.pipCount(Player.White)).toBe(167);
      expect(board.pipCount(Player.Black)).toBe(167);
    });

    it('fromPointMap rejects malformed input', () => {
      expect(() => Board.fromPointMap({ 25: { owner: Player.White, count: 1 } })).toThrow();
      expect(() => Board.fromPointMap({ 5: { owner: Player.White, count: -1 } })).toThrow();
      expect(() => Board.fromPointMap({ 5: { owner: null, count: 2 } })).toThrow();
    });

    it('fromPointMap skips zero-count entries', () => {
      const board = Board.fromPointMap({ 5: { owner: null, count: 0 } });
      expect(board.countAt(5)).toBe(0);
    });
  });

  describe('queries', () => {
    it('canLandOn allows empty, own, and blot points but blocks made points', () => {
      const board = Board.fromPointMap({
        5: { owner: Player.Black, count: 1 }, // blot
        6: { owner: Player.Black, count: 2 }, // made point
        7: { owner: Player.White, count: 1 }, // own
      });
      expect(board.canLandOn(Player.White, 1)).toBe(true); // empty
      expect(board.canLandOn(Player.White, 5)).toBe(true); // blot
      expect(board.canLandOn(Player.White, 6)).toBe(false); // blocked
      expect(board.canLandOn(Player.White, 7)).toBe(true); // own
    });

    it('isBlot detects a single opposing checker only', () => {
      const board = Board.fromPointMap({
        5: { owner: Player.Black, count: 1 },
        6: { owner: Player.Black, count: 2 },
      });
      expect(board.isBlot(Player.White, 5)).toBe(true);
      expect(board.isBlot(Player.White, 6)).toBe(false);
      expect(board.isBlot(Player.Black, 5)).toBe(false); // own checker
    });

    it('hasBorneOffAll is true only at 15 off', () => {
      const board = Board.fromPointMap({}, { off: { [Player.White]: 15 } });
      expect(board.hasBorneOffAll(Player.White)).toBe(true);
      expect(board.hasBorneOffAll(Player.Black)).toBe(false);
    });
  });

  describe('immutability', () => {
    it('mutators return a new board and leave the original intact', () => {
      const before = Board.fromPointMap({ 6: { owner: Player.White, count: 2 } });
      const after = before.addChecker(Player.White, 6);
      expect(before.countAt(6)).toBe(2);
      expect(after.countAt(6)).toBe(3);
      expect(after).not.toBe(before);
    });
  });

  describe('mechanical mutators', () => {
    it('addChecker throws when the point is held by the opponent', () => {
      const board = Board.fromPointMap({ 6: { owner: Player.Black, count: 2 } });
      expect(() => board.addChecker(Player.White, 6)).toThrow();
    });

    it('removeChecker throws when there is nothing to remove', () => {
      const board = Board.empty();
      expect(() => board.removeChecker(Player.White, 6)).toThrow();
    });

    it('hitBlot sends the lone opponent checker to the bar', () => {
      const board = Board.fromPointMap({ 5: { owner: Player.Black, count: 1 } });
      const hit = board.hitBlot(Player.White, 5);
      expect(hit.countAt(5)).toBe(0);
      expect(hit.bar(Player.Black)).toBe(1);
    });

    it('hitBlot throws when there is no blot', () => {
      const board = Board.fromPointMap({ 5: { owner: Player.Black, count: 2 } });
      expect(() => board.hitBlot(Player.White, 5)).toThrow();
    });

    it('enterFromBar moves a checker from bar to the board', () => {
      const board = Board.fromPointMap({}, { bar: { [Player.White]: 1 } });
      const entered = board.enterFromBar(Player.White, 24);
      expect(entered.bar(Player.White)).toBe(0);
      expect(entered.pointState(24)).toEqual({ owner: Player.White, count: 1 });
    });

    it('enterFromBar throws with an empty bar', () => {
      expect(() => Board.empty().enterFromBar(Player.White, 24)).toThrow();
    });

    it('bearOff moves a checker from the board to the off tray', () => {
      const board = Board.fromPointMap({ 3: { owner: Player.White, count: 1 } });
      const off = board.bearOff(Player.White, 3);
      expect(off.countAt(3)).toBe(0);
      expect(off.off(Player.White)).toBe(1);
    });

    it('total checkers are conserved across a hit', () => {
      const board = Board.fromPointMap({
        5: { owner: Player.Black, count: 1 },
        6: { owner: Player.White, count: 1 },
      });
      const next = board.hitBlot(Player.White, 5).addChecker(Player.White, 5);
      expect(next.totalCheckers(Player.White)).toBe(2);
      expect(next.totalCheckers(Player.Black)).toBe(1);
    });
  });

  describe('serialization', () => {
    it('round-trips through a snapshot', () => {
      const board = Board.initial();
      const restored = Board.fromSnapshot(board.toSnapshot());
      expect(restored.equals(board)).toBe(true);
    });

    it('toJSON matches toSnapshot', () => {
      const board = Board.initial();
      expect(board.toJSON()).toEqual(board.toSnapshot());
    });

    it('fromSnapshot rejects wrong-length point arrays', () => {
      expect(() => Board.fromSnapshot({ points: [1, 2, 3], bar: {} as never, off: {} as never })).toThrow();
    });

    it('equals distinguishes different boards', () => {
      expect(Board.initial().equals(Board.empty())).toBe(false);
    });
  });
});
