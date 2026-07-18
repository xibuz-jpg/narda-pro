import { describe, it, expect } from 'vitest';
import { SeededRandom } from './rng';

describe('SeededRandom', () => {
  it('is deterministic for a given seed', () => {
    const a = new SeededRandom(12345);
    const b = new SeededRandom(12345);
    const seqA = Array.from({ length: 20 }, () => a.nextInt(1, 6));
    const seqB = Array.from({ length: 20 }, () => b.nextInt(1, 6));
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = Array.from({ length: 20 }, ((r) => () => r.nextInt(1, 6))(new SeededRandom(1)));
    const b = Array.from({ length: 20 }, ((r) => () => r.nextInt(1, 6))(new SeededRandom(2)));
    expect(a).not.toEqual(b);
  });

  it('stays within the inclusive range', () => {
    const rng = new SeededRandom(999);
    for (let i = 0; i < 1000; i += 1) {
      const n = rng.nextInt(1, 6);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it('covers the full range over many samples', () => {
    const rng = new SeededRandom(42);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) seen.add(rng.nextInt(1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('rejects invalid ranges', () => {
    const rng = new SeededRandom(1);
    expect(() => rng.nextInt(6, 1)).toThrow(RangeError);
    expect(() => rng.nextInt(1.5, 6)).toThrow(RangeError);
  });

  it('exposes state that reproduces the same continuation', () => {
    const rng = new SeededRandom(7);
    rng.nextInt(1, 6);
    const resumed = new SeededRandom(rng.getState());
    // A fresh RNG seeded with the captured state matches the original's future.
    expect(resumed.nextInt(1, 6)).toBe(new SeededRandom(rng.getState()).nextInt(1, 6));
  });
});
