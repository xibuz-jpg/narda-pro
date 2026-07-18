import { Player, opponent, isPlayer } from './player';
import {
  POINT_COUNT,
  CHECKERS_PER_PLAYER,
  BAR_PIP,
  pipDistance,
  assertPoint,
} from './geometry';

/** Ownership and checker count on a single point (or tray). */
export interface PointState {
  /** The player occupying the point, or `null` when empty. */
  readonly owner: Player | null;
  /** Number of checkers on the point (0 when empty). */
  readonly count: number;
}

/** Per-player counters for the bar and the borne-off tray. */
export type TrayCounts = Readonly<Record<Player, number>>;

/** Plain, serializable snapshot of a board — the persistence/wire shape. */
export interface BoardSnapshot {
  /**
   * Signed occupancy of points 1..24, stored at array indices 0..23.
   * Positive → White checkers; negative → Black checkers; 0 → empty.
   */
  readonly points: readonly number[];
  readonly bar: TrayCounts;
  readonly off: TrayCounts;
}

const sign = (player: Player): 1 | -1 => (player === Player.White ? 1 : -1);

/**
 * An **immutable** backgammon board.
 *
 * State is stored internally with a compact signed representation (positive =
 * White, negative = Black) which makes occupancy and hit checks trivial, while
 * the public API exposes an explicit {@link PointState} model. Every mutating
 * method returns a *new* `Board`; instances are never modified in place, so a
 * board can be safely shared, cached, and used as a replay checkpoint.
 *
 * `Board` is a pure state container: its mutators enforce only *mechanical*
 * validity (you cannot remove a checker that is not there). Rule legality —
 * whether a move is allowed by backgammon rules — lives in the rules layer.
 */
export class Board {
  /** points[i] holds the signed count for board point (i + 1). */
  private readonly points: readonly number[];
  private readonly barCounts: TrayCounts;
  private readonly offCounts: TrayCounts;

  private constructor(points: readonly number[], bar: TrayCounts, off: TrayCounts) {
    this.points = points;
    this.barCounts = bar;
    this.offCounts = off;
  }

  // ── Factories ────────────────────────────────────────────────────────────

  /** An empty board with all checkers off the field. */
  static empty(): Board {
    return new Board(new Array<number>(POINT_COUNT).fill(0), zeroTray(), zeroTray());
  }

  /**
   * The standard backgammon starting position.
   *
   *   White: 2×24, 5×13, 3×8, 5×6      Black: 2×1, 5×12, 3×17, 5×19
   */
  static initial(): Board {
    return Board.fromPointMap({
      24: { owner: Player.White, count: 2 },
      13: { owner: Player.White, count: 5 },
      8: { owner: Player.White, count: 3 },
      6: { owner: Player.White, count: 5 },
      1: { owner: Player.Black, count: 2 },
      12: { owner: Player.Black, count: 5 },
      17: { owner: Player.Black, count: 3 },
      19: { owner: Player.Black, count: 5 },
    });
  }

  /**
   * The Long Narda (uzun nardi) starting position: all 15 checkers on each
   * player's head — White on point 24, Black on point 12.
   */
  static initialLongNarda(): Board {
    return Board.fromPointMap({
      24: { owner: Player.White, count: 15 },
      12: { owner: Player.Black, count: 15 },
    });
  }

  /**
   * Build a board from a sparse `{ point: PointState }` map (mainly for tests
   * and fixtures). Optionally seed the bar/off trays.
   * @throws {RangeError} on invalid points or negative counts.
   */
  static fromPointMap(
    map: Readonly<Record<number, PointState>>,
    trays?: { bar?: Partial<Record<Player, number>>; off?: Partial<Record<Player, number>> },
  ): Board {
    const points = new Array<number>(POINT_COUNT).fill(0);
    for (const [rawPoint, state] of Object.entries(map)) {
      const point = Number(rawPoint);
      assertPoint(point);
      if (state.count < 0 || !Number.isInteger(state.count)) {
        throw new RangeError(`Invalid checker count ${state.count} at point ${point}`);
      }
      if (state.count === 0) continue;
      if (!isPlayer(state.owner)) {
        throw new RangeError(`Point ${point} has ${state.count} checkers but no owner`);
      }
      points[point - 1] = sign(state.owner) * state.count;
    }
    return new Board(points, buildTray(trays?.bar), buildTray(trays?.off));
  }

  /** Reconstruct a board from a {@link BoardSnapshot}. */
  static fromSnapshot(snapshot: BoardSnapshot): Board {
    if (snapshot.points.length !== POINT_COUNT) {
      throw new RangeError(`Snapshot must have ${POINT_COUNT} points`);
    }
    return new Board(
      [...snapshot.points],
      buildTray(snapshot.bar),
      buildTray(snapshot.off),
    );
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  /** Ownership and count at `point` (1..24). */
  pointState(point: number): PointState {
    assertPoint(point);
    const value = this.points[point - 1] ?? 0;
    if (value === 0) return { owner: null, count: 0 };
    return value > 0
      ? { owner: Player.White, count: value }
      : { owner: Player.Black, count: -value };
  }

  /** The player occupying `point`, or `null` if empty. */
  ownerOf(point: number): Player | null {
    return this.pointState(point).owner;
  }

  /** Checker count on `point`, regardless of owner. */
  countAt(point: number): number {
    return this.pointState(point).count;
  }

  /** Checkers `player` has on the bar. */
  bar(player: Player): number {
    return this.barCounts[player];
  }

  /** Checkers `player` has borne off. */
  off(player: Player): number {
    return this.offCounts[player];
  }

  /** True if `player` has one or more checkers waiting on the bar. */
  hasBarCheckers(player: Player): boolean {
    return this.barCounts[player] > 0;
  }

  /**
   * True if `player` may land on `point` — i.e. it is empty, owned by them, or
   * a lone opponent blot (which would be hit). A point with 2+ opponent
   * checkers is blocked.
   */
  canLandOn(player: Player, point: number): boolean {
    const state = this.pointState(point);
    return state.owner === null || state.owner === player || state.count === 1;
  }

  /** True if `point` is an opponent blot (exactly one opposing checker). */
  isBlot(player: Player, point: number): boolean {
    const state = this.pointState(point);
    return state.owner === opponent(player) && state.count === 1;
  }

  /** Total checkers `player` has on the field, bar, and off (should be 15). */
  totalCheckers(player: Player): number {
    let onBoard = 0;
    for (const value of this.points) {
      if (sign(player) * value > 0) onBoard += Math.abs(value);
    }
    return onBoard + this.barCounts[player] + this.offCounts[player];
  }

  /**
   * Pip count for `player`: the total distance all their checkers must travel
   * to bear off. Lower is better; 0 means fully borne off.
   */
  pipCount(player: Player): number {
    let pips = this.barCounts[player] * BAR_PIP;
    for (let point = 1; point <= POINT_COUNT; point += 1) {
      const value = this.points[point - 1] ?? 0;
      if (sign(player) * value > 0) {
        pips += Math.abs(value) * pipDistance(player, point);
      }
    }
    return pips;
  }

  /** True if every one of `player`'s remaining checkers is borne off. */
  hasBorneOffAll(player: Player): boolean {
    return this.offCounts[player] >= CHECKERS_PER_PLAYER;
  }

  // ── Mechanical mutators (return new boards) ───────────────────────────────

  /**
   * Place one checker of `player` onto `point`.
   * @throws {Error} if the point is blocked (2+ opponent checkers). Hitting a
   *   blot is *not* handled here — callers must resolve hits via {@link hitBlot}
   *   first; this method throws rather than silently overwriting.
   */
  addChecker(player: Player, point: number): Board {
    assertPoint(point);
    const state = this.pointState(point);
    if (state.owner !== null && state.owner !== player) {
      throw new Error(
        `Cannot place ${player} checker on point ${point} occupied by ${state.owner}`,
      );
    }
    const next = [...this.points];
    next[point - 1] = (next[point - 1] ?? 0) + sign(player);
    return new Board(next, this.barCounts, this.offCounts);
  }

  /**
   * Remove one checker of `player` from `point`.
   * @throws {Error} if `player` has no checker there.
   */
  removeChecker(player: Player, point: number): Board {
    assertPoint(point);
    const state = this.pointState(point);
    if (state.owner !== player || state.count < 1) {
      throw new Error(`No ${player} checker to remove from point ${point}`);
    }
    const next = [...this.points];
    next[point - 1] = (next[point - 1] ?? 0) - sign(player);
    return new Board(next, this.barCounts, this.offCounts);
  }

  /**
   * Send the opponent's lone blot on `point` to the bar.
   * @throws {Error} if `point` does not hold exactly one opposing checker.
   */
  hitBlot(player: Player, point: number): Board {
    if (!this.isBlot(player, point)) {
      throw new Error(`No ${opponent(player)} blot to hit on point ${point}`);
    }
    const victim = opponent(player);
    const next = [...this.points];
    next[point - 1] = 0;
    return new Board(next, adjustTray(this.barCounts, victim, +1), this.offCounts);
  }

  /**
   * Move one of `player`'s checkers from the bar onto `point`.
   * @throws {Error} if the bar is empty or the point is blocked.
   */
  enterFromBar(player: Player, point: number): Board {
    if (this.barCounts[player] < 1) {
      throw new Error(`${player} has no checkers on the bar`);
    }
    return this.addChecker(player, point).withTray('bar', adjustTray(this.barCounts, player, -1));
  }

  /**
   * Bear one of `player`'s checkers off `point` into the tray.
   * @throws {Error} if `player` has no checker there.
   */
  bearOff(player: Player, point: number): Board {
    return this.removeChecker(player, point).withTray(
      'off',
      adjustTray(this.offCounts, player, +1),
    );
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  /** Plain serializable snapshot (deep-copied). */
  toSnapshot(): BoardSnapshot {
    return {
      points: [...this.points],
      bar: { ...this.barCounts },
      off: { ...this.offCounts },
    };
  }

  /** JSON representation (delegates to {@link toSnapshot}). */
  toJSON(): BoardSnapshot {
    return this.toSnapshot();
  }

  /** Structural equality against another board. */
  equals(other: Board): boolean {
    return (
      this.points.length === other.points.length &&
      this.points.every((v, i) => v === other.points[i]) &&
      this.barCounts[Player.White] === other.barCounts[Player.White] &&
      this.barCounts[Player.Black] === other.barCounts[Player.Black] &&
      this.offCounts[Player.White] === other.offCounts[Player.White] &&
      this.offCounts[Player.Black] === other.offCounts[Player.Black]
    );
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /** Return a copy with one tray replaced. */
  private withTray(which: 'bar' | 'off', tray: TrayCounts): Board {
    return which === 'bar'
      ? new Board(this.points, tray, this.offCounts)
      : new Board(this.points, this.barCounts, tray);
  }
}

// ── Tray helpers ────────────────────────────────────────────────────────────

function zeroTray(): TrayCounts {
  return { [Player.White]: 0, [Player.Black]: 0 };
}

function buildTray(partial?: Partial<Record<Player, number>>): TrayCounts {
  const white = partial?.[Player.White] ?? 0;
  const black = partial?.[Player.Black] ?? 0;
  if (white < 0 || black < 0 || !Number.isInteger(white) || !Number.isInteger(black)) {
    throw new RangeError('Tray counts must be non-negative integers');
  }
  return { [Player.White]: white, [Player.Black]: black };
}

function adjustTray(tray: TrayCounts, player: Player, delta: number): TrayCounts {
  const value = tray[player] + delta;
  if (value < 0) throw new Error(`Tray for ${player} cannot go negative`);
  return { ...tray, [player]: value };
}
