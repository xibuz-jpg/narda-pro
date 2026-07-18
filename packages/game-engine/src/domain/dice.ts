import { Player } from './player';
import { MIN_DIE, MAX_DIE, assertDie } from './geometry';
import type { RandomSource } from './rng';

/** A single die face, 1..6. */
export type Die = 1 | 2 | 3 | 4 | 5 | 6;

/** Narrow a number to a {@link Die}, throwing if out of range. */
export function asDie(value: number): Die {
  assertDie(value);
  return value as Die;
}

/**
 * An immutable value object for a rolled pair of dice.
 *
 * A double (both faces equal) grants **four** moves of that value, per the
 * standard rules; otherwise the two distinct faces each grant one move.
 */
export class DiceRoll {
  readonly first: Die;
  readonly second: Die;

  constructor(first: Die, second: Die) {
    assertDie(first);
    assertDie(second);
    this.first = first;
    this.second = second;
  }

  /** True when both dice show the same face. */
  get isDouble(): boolean {
    return this.first === this.second;
  }

  /**
   * The die faces available to play this turn: four copies for a double,
   * otherwise the two faces. Order is not significant to the rules but is
   * preserved for display.
   */
  get dice(): readonly Die[] {
    return this.isDouble
      ? [this.first, this.first, this.first, this.first]
      : [this.first, this.second];
  }

  /** Serializable form. */
  toJSON(): { first: Die; second: Die } {
    return { first: this.first, second: this.second };
  }

  toString(): string {
    return `${this.first}-${this.second}`;
  }
}

/** Rolls a single fair die using the injected source. */
export function rollDie(rng: RandomSource): Die {
  return asDie(rng.nextInt(MIN_DIE, MAX_DIE));
}

/** Rolls a pair of dice. */
export function rollDice(rng: RandomSource): DiceRoll {
  return new DiceRoll(rollDie(rng), rollDie(rng));
}

/** The outcome of the opening roll that decides who moves first. */
export interface OpeningRoll {
  readonly white: Die;
  readonly black: Die;
  /** The player who plays first (higher single die). */
  readonly starter: Player;
}

/**
 * Performs the opening roll: each player rolls one die and the higher goes
 * first, using both dice as the opening turn. Ties are re-rolled, so the result
 * is never a double.
 */
export function rollOpening(rng: RandomSource): OpeningRoll {
  let white = rollDie(rng);
  let black = rollDie(rng);
  while (white === black) {
    white = rollDie(rng);
    black = rollDie(rng);
  }
  return {
    white,
    black,
    starter: white > black ? Player.White : Player.Black,
  };
}
