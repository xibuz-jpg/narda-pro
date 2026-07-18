/**
 * @narda/game-engine — public API.
 *
 * A pure, deterministic, server-authoritative backgammon (narda) engine.
 * No I/O, no framework dependencies: safe to reuse on the server and in tests.
 */

export { Player, opponent, isPlayer } from './domain/player';

export {
  POINT_COUNT,
  CHECKERS_PER_PLAYER,
  BAR_PIP,
  homeBoard,
  direction,
  entryPoint,
  pipDistance,
  isInHomeBoard,
  isValidPoint,
  isValidDie,
  assertPoint,
  assertDie,
} from './domain/geometry';

export { Board } from './domain/board';
export type { PointState, TrayCounts, BoardSnapshot } from './domain/board';

export type { RandomSource } from './domain/rng';
export { SeededRandom } from './domain/rng';

export { DiceRoll, asDie, rollDie, rollDice, rollOpening } from './domain/dice';
export type { Die, OpeningRoll } from './domain/dice';

export {
  BAR,
  OFF,
  isEnter,
  isBearOff,
  allCheckersInHome,
  generateSingleMoves,
  applyMove,
} from './domain/move';
export type { Move, MoveFrom, MoveTo, Bar, Off } from './domain/move';

export {
  applyTurn,
  maxDiceUsable,
  hasAnyLegalMove,
  generateTurns,
  validateTurn,
} from './domain/turn';
export type { Turn, TurnValidation } from './domain/turn';

export { evaluate } from './ai/evaluate';
export { chooseTurn, chooseTurnFor } from './ai/ai-player';
export type { AiLevel } from './ai/ai-player';
export { evaluateLong } from './long-narda/evaluate';

export { GameState, GamePhase, IllegalActionError } from './domain/game-state';
export type {
  GameResult,
  GameEndReason,
  ForfeitReason,
  DoublingCube,
  GameConfig,
  GameVariant,
  GameEvent,
  GameStateSnapshot,
} from './domain/game-state';

// ── Long Narda (uzun nardi) variant ──────────────────────────────────────────
export { pipToOff, pointAtPip, headPoint, HEAD_PIP } from './long-narda/geometry';
export { generateSingleMovesLong, applyMoveLong, allCheckersHome } from './long-narda/move';
export {
  generateTurnsLong,
  validateTurnLong,
  maxDiceUsableLong,
  applyTurnLong,
  maxFromHeadFor,
} from './long-narda/turn';
