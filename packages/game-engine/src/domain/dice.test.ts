import { describe, it, expect } from 'vitest';
import { Player } from './player';
import { DiceRoll, asDie, rollDie, rollDice, rollOpening } from './dice';
import { SeededRandom } from './rng';

describe('DiceRoll', () => {
  it('exposes two faces for a non-double', () => {
    const roll = new DiceRoll(3, 5);
    expect(roll.isDouble).toBe(false);
    expect(roll.dice).toEqual([3, 5]);
  });

  it('grants four moves for a double', () => {
    const roll = new DiceRoll(4, 4);
    expect(roll.isDouble).toBe(true);
    expect(roll.dice).toEqual([4, 4, 4, 4]);
  });

  it('serializes and stringifies', () => {
    const roll = new DiceRoll(2, 6);
    expect(roll.toJSON()).toEqual({ first: 2, second: 6 });
    expect(roll.toString()).toBe('2-6');
  });

  it('rejects invalid faces', () => {
    expect(() => new DiceRoll(0 as never, 3)).toThrow(RangeError);
    expect(() => new DiceRoll(3, 7 as never)).toThrow(RangeError);
  });
});

describe('asDie', () => {
  it('accepts 1..6 and rejects others', () => {
    expect(asDie(1)).toBe(1);
    expect(asDie(6)).toBe(6);
    expect(() => asDie(0)).toThrow(RangeError);
    expect(() => asDie(7)).toThrow(RangeError);
  });
});

describe('rolling', () => {
  it('rollDie is deterministic under a seeded source', () => {
    expect(rollDie(new SeededRandom(1))).toBe(rollDie(new SeededRandom(1)));
  });

  it('rollDice returns two valid faces', () => {
    const roll = rollDice(new SeededRandom(123));
    expect(roll.first).toBeGreaterThanOrEqual(1);
    expect(roll.first).toBeLessThanOrEqual(6);
    expect(roll.second).toBeGreaterThanOrEqual(1);
    expect(roll.second).toBeLessThanOrEqual(6);
  });

  it('rollOpening never ties and picks the higher die as starter', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const opening = rollOpening(new SeededRandom(seed));
      expect(opening.white).not.toBe(opening.black);
      const expected = opening.white > opening.black ? Player.White : Player.Black;
      expect(opening.starter).toBe(expected);
    }
  });
});
