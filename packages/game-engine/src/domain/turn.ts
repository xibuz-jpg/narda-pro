import { Player } from './player';
import { Board } from './board';
import { asDie, type Die, type DiceRoll } from './dice';
import { generateSingleMoves, applyMove, type Move } from './move';

/**
 * A complete, legal turn: the ordered sequence of single-die moves a player
 * makes, together with the board that results from playing them.
 */
export interface Turn {
  readonly moves: readonly Move[];
  readonly resultingBoard: Board;
}

/** Outcome of validating a client-submitted turn. */
export interface TurnValidation {
  /** Whether the submitted moves form a legal, maximal turn. */
  readonly valid: boolean;
  /** Human-readable reason when `valid` is false. */
  readonly reason?: string;
  /** The board after applying the moves — present only when valid. */
  readonly resultingBoard?: Board;
  /** The maximum number of dice that can legally be played from this position. */
  readonly maxDiceUsable: number;
}

/**
 * Depth-first enumeration of every complete move sequence playable from
 * `board` with the given multiset of `dice`.
 *
 * A sequence is "complete" when no dice remain or no further legal move exists.
 * At each level we try each *distinct* die value once — this both covers both
 * orderings for a mixed roll (a-then-b and b-then-a) and collapses the
 * otherwise-identical permutations of a double (a-a-a-a) into a single branch,
 * keeping the search tractable.
 */
function enumerateSequences(board: Board, player: Player, dice: readonly Die[]): Move[][] {
  const results: Move[][] = [];
  const triedValues = new Set<number>();
  let extended = false;

  for (let i = 0; i < dice.length; i += 1) {
    const die = dice[i]!;
    if (triedValues.has(die)) continue;
    triedValues.add(die);

    for (const move of generateSingleMoves(board, player, die)) {
      extended = true;
      const nextBoard = applyMove(board, player, move);
      const remaining = [...dice.slice(0, i), ...dice.slice(i + 1)];
      for (const tail of enumerateSequences(nextBoard, player, remaining)) {
        results.push([move, ...tail]);
      }
    }
  }

  // Leaf: nothing could be played from here — a valid (possibly empty) endpoint.
  if (!extended) results.push([]);
  return results;
}

/** The set of maximal legal sequences plus that maximum length. */
function maximalSequences(
  board: Board,
  player: Player,
  roll: DiceRoll,
): { maxLen: number; sequences: Move[][] } {
  const all = enumerateSequences(board, player, roll.dice);
  const maxLen = all.reduce((max, seq) => Math.max(max, seq.length), 0);
  let sequences = all.filter((seq) => seq.length === maxLen);

  // Higher-die rule: if exactly one die can be played and the two faces differ,
  // the *higher* face must be the one played (when it is playable at all).
  if (maxLen === 1 && !roll.isDouble) {
    const high = Math.max(roll.first, roll.second);
    if (sequences.some((seq) => seq[0]!.die === high)) {
      sequences = sequences.filter((seq) => seq[0]!.die === high);
    }
  }

  return { maxLen, sequences };
}

/** Applies a whole turn's moves to a board, returning the resulting board. */
export function applyTurn(board: Board, player: Player, moves: readonly Move[]): Board {
  return moves.reduce((current, move) => applyMove(current, player, move), board);
}

/**
 * The maximum number of dice `player` can legally play from `board` with
 * `roll`. Used to enforce the "must use as many dice as possible" rule.
 */
export function maxDiceUsable(board: Board, player: Player, roll: DiceRoll): number {
  return maximalSequences(board, player, roll).maxLen;
}

/** True if `player` has at least one legal move with `roll`. */
export function hasAnyLegalMove(board: Board, player: Player, roll: DiceRoll): boolean {
  return maxDiceUsable(board, player, roll) > 0;
}

/**
 * Generates every distinct legal turn for `player`, deduplicated by the
 * resulting board position (different move orders that reach the same position
 * collapse to one turn). This is the move menu for the AI and the UI.
 *
 * When no move is possible the result is a single turn with no moves — the
 * player is forced to pass ("dances").
 */
export function generateTurns(board: Board, player: Player, roll: DiceRoll): Turn[] {
  const { sequences } = maximalSequences(board, player, roll);
  const byPosition = new Map<string, Turn>();

  for (const moves of sequences) {
    const resultingBoard = applyTurn(board, player, moves);
    const key = JSON.stringify(resultingBoard.toSnapshot());
    if (!byPosition.has(key)) {
      byPosition.set(key, { moves, resultingBoard });
    }
  }

  return [...byPosition.values()];
}

/**
 * Validates a client-submitted turn against the authoritative board — the
 * server-side gate that makes cheating impossible.
 *
 * A turn is valid when:
 *   1. every move is legal in sequence (and consumes an available die);
 *   2. it plays the maximum number of dice possible (no under-playing);
 *   3. it respects the higher-die rule when only one die is playable.
 *
 * Move order does not matter — any legal ordering that satisfies the rules is
 * accepted. Hits are re-derived from board state, so a doctored `hits` flag is
 * irrelevant.
 */
export function validateTurn(
  board: Board,
  player: Player,
  roll: DiceRoll,
  moves: readonly Move[],
): TurnValidation {
  const maxLen = maxDiceUsable(board, player, roll);

  let cursor = board;
  const remainingDice: number[] = [...roll.dice];

  for (const move of moves) {
    const dieIndex = remainingDice.indexOf(move.die);
    if (dieIndex === -1) {
      return { valid: false, reason: `Die ${move.die} is not available`, maxDiceUsable: maxLen };
    }

    const legal = generateSingleMoves(cursor, player, move.die).find(
      (candidate) => candidate.from === move.from && candidate.to === move.to,
    );
    if (!legal) {
      return {
        valid: false,
        reason: `Illegal move ${String(move.from)}→${String(move.to)} with die ${move.die}`,
        maxDiceUsable: maxLen,
      };
    }

    remainingDice.splice(dieIndex, 1);
    cursor = applyMove(cursor, player, legal);
  }

  if (moves.length !== maxLen) {
    return {
      valid: false,
      reason: `Must play ${maxLen} ${maxLen === 1 ? 'die' : 'dice'}, played ${moves.length}`,
      maxDiceUsable: maxLen,
    };
  }

  if (maxLen === 1 && !roll.isDouble) {
    const high = asDie(Math.max(roll.first, roll.second));
    const highPlayable = generateSingleMoves(board, player, high).length > 0;
    if (highPlayable && moves[0]!.die !== high) {
      return { valid: false, reason: 'Must play the higher die', maxDiceUsable: maxLen };
    }
  }

  return { valid: true, resultingBoard: cursor, maxDiceUsable: maxLen };
}
