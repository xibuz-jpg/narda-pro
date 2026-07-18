import { describe, it, expect } from 'vitest';
import { Player } from './player';
import {
  entryPoint,
  pipDistance,
  direction,
  isInHomeBoard,
  isValidPoint,
  isValidDie,
  assertDie,
  assertPoint,
  BAR_PIP,
} from './geometry';

describe('geometry', () => {
  describe('direction', () => {
    it('White moves toward 1, Black toward 24', () => {
      expect(direction(Player.White)).toBe(-1);
      expect(direction(Player.Black)).toBe(1);
    });
  });

  describe('entryPoint', () => {
    it('maps White bar entry to 24..19 for dice 1..6', () => {
      expect(entryPoint(Player.White, 1)).toBe(24);
      expect(entryPoint(Player.White, 6)).toBe(19);
    });

    it('maps Black bar entry to 1..6 for dice 1..6', () => {
      expect(entryPoint(Player.Black, 1)).toBe(1);
      expect(entryPoint(Player.Black, 6)).toBe(6);
    });

    it('rejects invalid dice', () => {
      expect(() => entryPoint(Player.White, 0)).toThrow(RangeError);
      expect(() => entryPoint(Player.White, 7)).toThrow(RangeError);
    });
  });

  describe('pipDistance', () => {
    it('is the point number for White', () => {
      expect(pipDistance(Player.White, 6)).toBe(6);
      expect(pipDistance(Player.White, 1)).toBe(1);
    });

    it('is 25 − point for Black', () => {
      expect(pipDistance(Player.Black, 19)).toBe(6);
      expect(pipDistance(Player.Black, 24)).toBe(1);
    });

    it('bar pip is 25 and equals a maximal entry + travel', () => {
      // Enter with die d on (25-d) for White, then d more pips to bear off = 25.
      expect(BAR_PIP).toBe(25);
      expect(pipDistance(Player.White, entryPoint(Player.White, 6)) + 6).toBe(25);
    });
  });

  describe('home boards', () => {
    it('identifies White and Black home points', () => {
      expect(isInHomeBoard(Player.White, 1)).toBe(true);
      expect(isInHomeBoard(Player.White, 6)).toBe(true);
      expect(isInHomeBoard(Player.White, 7)).toBe(false);
      expect(isInHomeBoard(Player.Black, 24)).toBe(true);
      expect(isInHomeBoard(Player.Black, 19)).toBe(true);
      expect(isInHomeBoard(Player.Black, 18)).toBe(false);
    });
  });

  describe('validators', () => {
    it('validates points and dice ranges', () => {
      expect(isValidPoint(1)).toBe(true);
      expect(isValidPoint(24)).toBe(true);
      expect(isValidPoint(0)).toBe(false);
      expect(isValidPoint(25)).toBe(false);
      expect(isValidPoint(1.5)).toBe(false);
      expect(isValidDie(1)).toBe(true);
      expect(isValidDie(6)).toBe(true);
      expect(isValidDie(0)).toBe(false);
      expect(isValidDie(7)).toBe(false);
    });

    it('assertions throw on invalid input', () => {
      expect(() => assertPoint(0)).toThrow(RangeError);
      expect(() => assertDie(9)).toThrow(RangeError);
      expect(() => assertPoint(12)).not.toThrow();
      expect(() => assertDie(3)).not.toThrow();
    });
  });
});
