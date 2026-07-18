import { Player, opponent } from './player';
import { homeBoard } from './geometry';
import { Board, type BoardSnapshot } from './board';
import { DiceRoll, rollDice, rollOpening, type Die } from './dice';
import type { RandomSource } from './rng';
import type { Move } from './move';
import { validateTurn, generateTurns, maxDiceUsable, type Turn } from './turn';
import {
  validateTurnLong,
  generateTurnsLong,
  maxDiceUsableLong,
  maxFromHeadFor,
} from '../long-narda/turn';

/** The phase of play — which action the engine is waiting for. */
export enum GamePhase {
  /** Active player must roll the dice (or offer a double first). */
  AwaitingRoll = 'AWAITING_ROLL',
  /** Dice are rolled; active player must submit their moves. */
  AwaitingMove = 'AWAITING_MOVE',
  /** A double was offered; the opponent must accept or decline. */
  AwaitingDoubleResponse = 'AWAITING_DOUBLE_RESPONSE',
  /** The game is finished. */
  GameOver = 'GAME_OVER',
}

/** Why a game ended, driving the scoring multiplier. */
export type GameEndReason =
  | 'SINGLE'
  | 'GAMMON'
  | 'BACKGAMMON'
  | 'DOUBLE_DECLINED'
  | 'RESIGNATION'
  | 'FORFEIT';

/** Why a player forfeited (surfaced by the server, not the game itself). */
export type ForfeitReason = 'TIMEOUT' | 'ABANDONED' | 'DISCONNECTED';

/** The final outcome of a game. */
export interface GameResult {
  readonly winner: Player;
  readonly points: number;
  readonly reason: GameEndReason;
}

/** The doubling cube state. `owner: null` means it is centered. */
export interface DoublingCube {
  readonly value: number;
  readonly owner: Player | null;
}

/** Which set of rules the game runs under. */
export type GameVariant = 'BACKGAMMON' | 'LONG_NARDA';

/** Tunable rules for a game. */
export interface GameConfig {
  /** Rule set: standard backgammon or Long Narda (uzun nardi). */
  readonly variant: GameVariant;
  /** Enable the doubling cube (default true; forced off for Long Narda). */
  readonly useDoublingCube: boolean;
  /** Maximum cube value; doubling stops here (default 64). */
  readonly maxCube: number;
  /**
   * Jacoby rule: gammons/backgammons count as a single game until the cube has
   * been turned. Common in money play (default false).
   */
  readonly jacobyRule: boolean;
}

const DEFAULT_CONFIG: GameConfig = {
  variant: 'BACKGAMMON',
  useDoublingCube: true,
  maxCube: 64,
  jacobyRule: false,
};

type DiceRollJSON = { readonly first: Die; readonly second: Die };

/** An ordered, replayable record of everything that happened in a game. */
export type GameEvent =
  | { readonly type: 'GAME_STARTED'; readonly starter: Player; readonly roll: DiceRollJSON }
  | { readonly type: 'ROLLED'; readonly player: Player; readonly roll: DiceRollJSON }
  | {
      readonly type: 'TURN_PLAYED';
      readonly player: Player;
      readonly roll: DiceRollJSON;
      readonly moves: readonly Move[];
    }
  | { readonly type: 'DOUBLE_OFFERED'; readonly player: Player }
  | { readonly type: 'DOUBLE_ACCEPTED'; readonly player: Player; readonly cubeValue: number }
  | { readonly type: 'DOUBLE_DECLINED'; readonly player: Player }
  | { readonly type: 'RESIGNED'; readonly player: Player }
  | { readonly type: 'FORFEITED'; readonly player: Player; readonly reason: ForfeitReason }
  | { readonly type: 'GAME_ENDED'; readonly result: GameResult };

/** Fully serializable game snapshot — the persistence and reconnect shape. */
export interface GameStateSnapshot {
  readonly board: BoardSnapshot;
  readonly activePlayer: Player;
  readonly phase: GamePhase;
  readonly dice: DiceRollJSON | null;
  readonly cube: DoublingCube;
  readonly pendingDoubler: Player | null;
  readonly result: GameResult | null;
  readonly config: GameConfig;
  readonly events: readonly GameEvent[];
}

/** Thrown when an action is not legal in the current phase or violates a rule. */
export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}

interface GameStateFields {
  readonly board: Board;
  readonly activePlayer: Player;
  readonly phase: GamePhase;
  readonly dice: DiceRoll | null;
  readonly cube: DoublingCube;
  readonly pendingDoubler: Player | null;
  readonly result: GameResult | null;
  readonly config: GameConfig;
  readonly events: readonly GameEvent[];
}

/**
 * The **immutable** game state machine — the single authority over a game's
 * progression. Every transition (`roll`, `playTurn`, `offerDouble`, …) returns
 * a *new* `GameState`, so the server can persist each state, replay from the
 * event log, and resume a game after a disconnect with total fidelity.
 *
 * Illegal actions throw {@link IllegalActionError} rather than mutating; the
 * server translates these into protocol errors.
 */
export class GameState {
  readonly board: Board;
  readonly activePlayer: Player;
  readonly phase: GamePhase;
  readonly dice: DiceRoll | null;
  readonly cube: DoublingCube;
  readonly pendingDoubler: Player | null;
  readonly result: GameResult | null;
  readonly config: GameConfig;
  readonly events: readonly GameEvent[];

  private constructor(fields: GameStateFields) {
    this.board = fields.board;
    this.activePlayer = fields.activePlayer;
    this.phase = fields.phase;
    this.dice = fields.dice;
    this.cube = fields.cube;
    this.pendingDoubler = fields.pendingDoubler;
    this.result = fields.result;
    this.config = fields.config;
    this.events = fields.events;
  }

  // ── Factories ────────────────────────────────────────────────────────────

  /** Starts a new game, rolling the opening to decide who moves first. */
  static start(rng: RandomSource, config: Partial<GameConfig> = {}): GameState {
    const merged = { ...DEFAULT_CONFIG, ...config };
    const opening = rollOpening(rng);
    // Long Narda: the opening picks the starter, who then rolls a fresh pair
    // (which may be doubles). Backgammon uses the two opening dice as the move.
    const dice =
      merged.variant === 'LONG_NARDA'
        ? rollDice(rng)
        : new DiceRoll(opening.white, opening.black);
    return GameState.startWith(opening.starter, dice, config);
  }

  /**
   * Starts a new game from a known opening — deterministic, used for resuming a
   * scripted opening and in tests. The starter plays the opening dice; there is
   * no separate first roll.
   */
  static startWith(
    starter: Player,
    opening: DiceRoll,
    config: Partial<GameConfig> = {},
  ): GameState {
    const merged = { ...DEFAULT_CONFIG, ...config };
    const board = merged.variant === 'LONG_NARDA' ? Board.initialLongNarda() : Board.initial();
    return new GameState({
      board,
      activePlayer: starter,
      phase: GamePhase.AwaitingMove,
      dice: opening,
      cube: { value: 1, owner: null },
      pendingDoubler: null,
      result: null,
      config: merged,
      events: [{ type: 'GAME_STARTED', starter, roll: opening.toJSON() }],
    });
  }

  /** Restores a game from a snapshot (reconnect / load from storage). */
  static fromSnapshot(snapshot: GameStateSnapshot): GameState {
    return new GameState({
      board: Board.fromSnapshot(snapshot.board),
      activePlayer: snapshot.activePlayer,
      phase: snapshot.phase,
      dice: snapshot.dice ? new DiceRoll(snapshot.dice.first, snapshot.dice.second) : null,
      cube: { ...snapshot.cube },
      pendingDoubler: snapshot.pendingDoubler,
      result: snapshot.result,
      config: { ...snapshot.config },
      events: [...snapshot.events],
    });
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  /** Whether the game has finished. */
  get isOver(): boolean {
    return this.phase === GamePhase.GameOver;
  }

  /** The opponent of the active player. */
  get inactivePlayer(): Player {
    return opponent(this.activePlayer);
  }

  /** True if the active player may offer a double right now. */
  canOfferDouble(): boolean {
    return (
      this.config.useDoublingCube &&
      this.phase === GamePhase.AwaitingRoll &&
      this.cube.value < this.config.maxCube &&
      (this.cube.owner === null || this.cube.owner === this.activePlayer)
    );
  }

  /** True if the active player has rolled but has no legal move (must pass). */
  mustPass(): boolean {
    if (this.phase !== GamePhase.AwaitingMove || this.dice === null) return false;
    return this.maxDiceUsableNow() === 0;
  }

  /** All legal turns for the active player, or `[]` if not awaiting a move. */
  legalTurns(): Turn[] {
    if (this.phase !== GamePhase.AwaitingMove || this.dice === null) return [];
    if (this.config.variant === 'LONG_NARDA') {
      return generateTurnsLong(this.board, this.activePlayer, this.dice, this.currentMaxFromHead());
    }
    return generateTurns(this.board, this.activePlayer, this.dice);
  }

  // ── Transitions ──────────────────────────────────────────────────────────

  /** Rolls the dice for the active player. */
  roll(rng: RandomSource): GameState {
    this.expectPhase(GamePhase.AwaitingRoll, 'roll');
    return this.rollWith(rollDice(rng));
  }

  /** Sets the active player's dice to a known roll (deterministic / tests). */
  rollWith(dice: DiceRoll): GameState {
    this.expectPhase(GamePhase.AwaitingRoll, 'roll');
    return this.with({
      phase: GamePhase.AwaitingMove,
      dice,
      events: [...this.events, { type: 'ROLLED', player: this.activePlayer, roll: dice.toJSON() }],
    });
  }

  /**
   * Plays the active player's full turn. `moves` may be in any legal order; an
   * empty array is the forced pass when no move is possible. The turn is
   * validated authoritatively; an illegal turn throws {@link IllegalActionError}.
   */
  playTurn(moves: readonly Move[]): GameState {
    this.expectPhase(GamePhase.AwaitingMove, 'playTurn');
    const dice = this.dice!;
    const validation =
      this.config.variant === 'LONG_NARDA'
        ? validateTurnLong(this.board, this.activePlayer, dice, moves, this.currentMaxFromHead())
        : validateTurn(this.board, this.activePlayer, dice, moves);
    if (!validation.valid) {
      throw new IllegalActionError(validation.reason ?? 'Illegal turn');
    }
    const board = validation.resultingBoard!;
    const played: GameEvent = {
      type: 'TURN_PLAYED',
      player: this.activePlayer,
      roll: dice.toJSON(),
      moves: [...moves],
    };

    // Win check: the active player just bore off their last checker.
    if (board.hasBorneOffAll(this.activePlayer)) {
      const result = this.scoreWin(board, this.activePlayer);
      return this.with({
        board,
        dice: null,
        phase: GamePhase.GameOver,
        result,
        events: [...this.events, played, { type: 'GAME_ENDED', result }],
      });
    }

    // Otherwise, hand the turn to the opponent, who must roll.
    return this.with({
      board,
      dice: null,
      activePlayer: this.inactivePlayer,
      phase: GamePhase.AwaitingRoll,
      events: [...this.events, played],
    });
  }

  /** Offers a double from the active player. */
  offerDouble(): GameState {
    if (!this.canOfferDouble()) {
      throw new IllegalActionError('Cannot offer a double now');
    }
    return this.with({
      phase: GamePhase.AwaitingDoubleResponse,
      pendingDoubler: this.activePlayer,
      events: [...this.events, { type: 'DOUBLE_OFFERED', player: this.activePlayer }],
    });
  }

  /**
   * The opponent's response to a double. `accept: true` doubles the cube and
   * passes ownership to the accepter; `false` ends the game with the doubler
   * winning the current cube value.
   */
  respondToDouble(accept: boolean): GameState {
    this.expectPhase(GamePhase.AwaitingDoubleResponse, 'respondToDouble');
    const doubler = this.pendingDoubler!;
    const responder = opponent(doubler);

    if (!accept) {
      const result: GameResult = {
        winner: doubler,
        points: this.cube.value,
        reason: 'DOUBLE_DECLINED',
      };
      return this.with({
        phase: GamePhase.GameOver,
        pendingDoubler: null,
        result,
        events: [
          ...this.events,
          { type: 'DOUBLE_DECLINED', player: responder },
          { type: 'GAME_ENDED', result },
        ],
      });
    }

    const cube: DoublingCube = { value: this.cube.value * 2, owner: responder };
    return this.with({
      phase: GamePhase.AwaitingRoll,
      pendingDoubler: null,
      cube,
      events: [
        ...this.events,
        { type: 'DOUBLE_ACCEPTED', player: responder, cubeValue: cube.value },
      ],
    });
  }

  /** A player resigns; the opponent wins the current cube value. */
  resign(player: Player): GameState {
    this.expectNotOver('resign');
    const result: GameResult = {
      winner: opponent(player),
      points: this.cube.value,
      reason: 'RESIGNATION',
    };
    return this.with({
      phase: GamePhase.GameOver,
      result,
      events: [...this.events, { type: 'RESIGNED', player }, { type: 'GAME_ENDED', result }],
    });
  }

  /** A player forfeits (timeout / abandonment); the opponent wins. */
  forfeit(player: Player, reason: ForfeitReason): GameState {
    this.expectNotOver('forfeit');
    const result: GameResult = {
      winner: opponent(player),
      points: this.cube.value,
      reason: 'FORFEIT',
    };
    return this.with({
      phase: GamePhase.GameOver,
      result,
      events: [
        ...this.events,
        { type: 'FORFEITED', player, reason },
        { type: 'GAME_ENDED', result },
      ],
    });
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  toSnapshot(): GameStateSnapshot {
    return {
      board: this.board.toSnapshot(),
      activePlayer: this.activePlayer,
      phase: this.phase,
      dice: this.dice ? this.dice.toJSON() : null,
      cube: { ...this.cube },
      pendingDoubler: this.pendingDoubler,
      result: this.result,
      config: { ...this.config },
      events: [...this.events],
    };
  }

  toJSON(): GameStateSnapshot {
    return this.toSnapshot();
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private get isOpeningTurn(): boolean {
    return !this.events.some((event) => event.type === 'TURN_PLAYED');
  }

  private currentMaxFromHead(): number {
    return this.dice ? maxFromHeadFor(this.dice, this.isOpeningTurn) : 1;
  }

  private maxDiceUsableNow(): number {
    if (this.dice === null) return 0;
    return this.config.variant === 'LONG_NARDA'
      ? maxDiceUsableLong(this.board, this.activePlayer, this.dice, this.currentMaxFromHead())
      : maxDiceUsable(this.board, this.activePlayer, this.dice);
  }

  /** Computes the win result, applying gammon/backgammon and Jacoby scoring. */
  private scoreWin(board: Board, winner: Player): GameResult {
    const loser = opponent(winner);

    // Long Narda: "mars" (opponent bore off nothing) doubles; no cube/backgammon.
    if (this.config.variant === 'LONG_NARDA') {
      const mars = board.off(loser) === 0;
      return { winner, points: mars ? 2 : 1, reason: mars ? 'GAMMON' : 'SINGLE' };
    }

    let multiplier: 1 | 2 | 3;
    let reason: GameEndReason;

    if (board.off(loser) > 0) {
      multiplier = 1;
      reason = 'SINGLE';
    } else {
      // Loser bore off nothing → gammon, or backgammon if they still have a
      // checker on the bar or trapped in the winner's home board.
      const trapped =
        board.hasBarCheckers(loser) ||
        homeBoard(winner).some((point) => board.ownerOf(point) === loser);
      multiplier = trapped ? 3 : 2;
      reason = trapped ? 'BACKGAMMON' : 'GAMMON';
    }

    // Jacoby: gammons/backgammons only count once the cube has been turned.
    if (this.config.jacobyRule && this.cube.value === 1 && multiplier > 1) {
      multiplier = 1;
      reason = 'SINGLE';
    }

    return { winner, points: this.cube.value * multiplier, reason };
  }

  private with(patch: Partial<GameStateFields>): GameState {
    return new GameState({
      board: patch.board ?? this.board,
      activePlayer: patch.activePlayer ?? this.activePlayer,
      phase: patch.phase ?? this.phase,
      dice: patch.dice !== undefined ? patch.dice : this.dice,
      cube: patch.cube ?? this.cube,
      pendingDoubler:
        patch.pendingDoubler !== undefined ? patch.pendingDoubler : this.pendingDoubler,
      result: patch.result !== undefined ? patch.result : this.result,
      config: patch.config ?? this.config,
      events: patch.events ?? this.events,
    });
  }

  private expectPhase(phase: GamePhase, action: string): void {
    if (this.phase !== phase) {
      throw new IllegalActionError(`Cannot ${action} while in phase ${this.phase}`);
    }
  }

  private expectNotOver(action: string): void {
    if (this.isOver) {
      throw new IllegalActionError(`Cannot ${action}; the game is over`);
    }
  }
}
