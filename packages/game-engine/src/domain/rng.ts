/**
 * Randomness abstraction for the engine.
 *
 * The engine never reaches for global randomness directly; every source of
 * chance (dice) is injected as a {@link RandomSource}. This keeps the engine
 * pure and, crucially, makes games **reproducible**:
 *
 *   • In production the server injects a CSPRNG-backed source and commits a
 *     hash of the seed *before* the game, revealing it afterwards so players
 *     can verify the dice were not manipulated (provable fairness).
 *   • In tests we inject a {@link SeededRandom} to get deterministic rolls.
 */
export interface RandomSource {
  /**
   * Returns a uniformly distributed integer in the inclusive range
   * `[min, max]`.
   */
  nextInt(min: number, max: number): number;
}

/**
 * A fast, deterministic PRNG (mulberry32). Given the same 32-bit seed it always
 * produces the same sequence — ideal for reproducible games, replays, and the
 * seed-commitment fairness scheme. **Not** cryptographically secure; production
 * dice should seed this from, or be replaced by, a CSPRNG source.
 */
export class SeededRandom implements RandomSource {
  private state: number;

  constructor(seed: number) {
    // Normalize to an unsigned 32-bit integer.
    this.state = seed >>> 0;
  }

  /** Returns the next float in [0, 1). */
  next(): number {
    // mulberry32
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Invalid range [${min}, ${max}]`);
    }
    const span = max - min + 1;
    return min + Math.floor(this.next() * span);
  }

  /** Current internal state — snapshot it to resume an identical sequence. */
  getState(): number {
    return this.state;
  }
}
