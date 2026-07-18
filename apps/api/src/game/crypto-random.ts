import { randomInt } from 'node:crypto';
import type { RandomSource } from '@narda/game-engine';

/**
 * Cryptographically secure {@link RandomSource} for dice.
 *
 * Dice are rolled server-side with a CSPRNG so outcomes are unpredictable and
 * cannot be influenced by the client. Every roll is recorded in the game event
 * log, which is what enables deterministic replay/audit. (A seed-commitment
 * "provable fairness" scheme is layered on in a later hardening pass.)
 */
export class CryptoRandom implements RandomSource {
  nextInt(min: number, max: number): number {
    // randomInt's upper bound is exclusive; make it inclusive.
    return randomInt(min, max + 1);
  }
}

/** Shared instance — CryptoRandom is stateless. */
export const cryptoRandom = new CryptoRandom();
