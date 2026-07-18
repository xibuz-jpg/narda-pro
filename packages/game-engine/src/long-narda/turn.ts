import { Player } from '../domain/player';
import { Board } from '../domain/board';
import { asDie, type DiceRoll } from '../domain/dice';
import { type Move } from '../domain/move';
import type { Turn, TurnValidation } from '../domain/turn';
import { generateSingleMovesLong, applyMoveLong } from './move';
import { headPoint } from './geometry';

/**
 * Turn generation and validation for Long Narda. Mirrors the backgammon turn
 * logic (use the maximum number of dice, higher-die rule) but adds the
 * **head rule**: at most `maxFromHead` checkers may leave the head in one turn
 * (normally 1; two on the opening roll of 3-3/4-4/6-6).
 */

/**
 * Enumerates complete move sequences, pruning any move that would exceed the
 * head allowance *during* the search. Pruning mid-search (rather than filtering
 * afterward) is essential: a branch whose only continuation is an illegal
 * second head-move must stop early and count as a shorter legal turn, otherwise
 * the maximum-dice rule would wrongly reject the whole roll.
 */
function enumerate(
  board: Board,
  player: Player,
  dice: readonly number[],
  head: number,
  maxFromHead: number,
  headUsed: number,
): Move[][] {
  const results: Move[][] = [];
  const tried = new Set<number>();
  let extended = false;

  for (let i = 0; i < dice.length; i += 1) {
    const die = dice[i]!;
    if (tried.has(die)) continue;
    tried.add(die);
    for (const move of generateSingleMovesLong(board, player, asDie(die))) {
      const nextHead = headUsed + (move.from === head ? 1 : 0);
      if (nextHead > maxFromHead) continue;
      extended = true;
      const nextBoard = applyMoveLong(board, player, move);
      const rest = [...dice.slice(0, i), ...dice.slice(i + 1)];
      for (const tail of enumerate(nextBoard, player, rest, head, maxFromHead, nextHead)) {
        results.push([move, ...tail]);
      }
    }
  }
  if (!extended) results.push([]);
  return results;
}

function headCount(moves: readonly Move[], head: number): number {
  return moves.reduce((n, m) => (m.from === head ? n + 1 : n), 0);
}

/** Maximal head-legal sequences for a roll, plus that maximum length. */
function maximal(
  board: Board,
  player: Player,
  roll: DiceRoll,
  maxFromHead: number,
): { maxLen: number; sequences: Move[][] } {
  const head = headPoint(player);
  const legal = enumerate(board, player, roll.dice, head, maxFromHead, 0);
  const maxLen = legal.reduce((max, seq) => Math.max(max, seq.length), 0);
  let sequences = legal.filter((seq) => seq.length === maxLen);

  if (maxLen === 1 && !roll.isDouble) {
    const high = Math.max(roll.first, roll.second);
    if (sequences.some((seq) => seq[0]!.die === high)) {
      sequences = sequences.filter((seq) => seq[0]!.die === high);
    }
  }
  return { maxLen, sequences };
}

export function applyTurnLong(board: Board, player: Player, moves: readonly Move[]): Board {
  return moves.reduce((current, move) => applyMoveLong(current, player, move), board);
}

export function maxDiceUsableLong(
  board: Board,
  player: Player,
  roll: DiceRoll,
  maxFromHead: number,
): number {
  return maximal(board, player, roll, maxFromHead).maxLen;
}

export function generateTurnsLong(
  board: Board,
  player: Player,
  roll: DiceRoll,
  maxFromHead: number,
): Turn[] {
  const { sequences } = maximal(board, player, roll, maxFromHead);
  const byPosition = new Map<string, Turn>();
  for (const moves of sequences) {
    const resultingBoard = applyTurnLong(board, player, moves);
    const key = JSON.stringify(resultingBoard.toSnapshot());
    if (!byPosition.has(key)) byPosition.set(key, { moves, resultingBoard });
  }
  return [...byPosition.values()];
}

export function validateTurnLong(
  board: Board,
  player: Player,
  roll: DiceRoll,
  moves: readonly Move[],
  maxFromHead: number,
): TurnValidation {
  const maxLen = maxDiceUsableLong(board, player, roll, maxFromHead);
  const head = headPoint(player);

  let cursor = board;
  const remainingDice: number[] = [...roll.dice];

  for (const move of moves) {
    const dieIndex = remainingDice.indexOf(move.die);
    if (dieIndex === -1) {
      return { valid: false, reason: `Die ${move.die} is not available`, maxDiceUsable: maxLen };
    }
    const legal = generateSingleMovesLong(cursor, player, asDie(move.die)).find(
      (candidate) => candidate.from === move.from && candidate.to === move.to,
    );
    if (!legal) {
      return {
        valid: false,
        reason: `Illegal move ${String(move.from)}→${String(move.to)}`,
        maxDiceUsable: maxLen,
      };
    }
    remainingDice.splice(dieIndex, 1);
    cursor = applyMoveLong(cursor, player, legal);
  }

  if (headCount(moves, head) > maxFromHead) {
    return { valid: false, reason: 'Only one checker may leave the head', maxDiceUsable: maxLen };
  }
  if (moves.length !== maxLen) {
    return {
      valid: false,
      reason: `Must play ${maxLen} ${maxLen === 1 ? 'die' : 'dice'}`,
      maxDiceUsable: maxLen,
    };
  }
  if (maxLen === 1 && !roll.isDouble) {
    const high = asDie(Math.max(roll.first, roll.second));
    const highPlayable = generateSingleMovesLong(board, player, high).length > 0;
    if (highPlayable && moves[0]!.die !== high) {
      return { valid: false, reason: 'Must play the higher die', maxDiceUsable: maxLen };
    }
  }

  return { valid: true, resultingBoard: cursor, maxDiceUsable: maxLen };
}

/** Head-rule allowance: 2 on the opening roll of 3-3/4-4/6-6, otherwise 1. */
export function maxFromHeadFor(roll: DiceRoll, isOpeningTurn: boolean): number {
  if (isOpeningTurn && roll.isDouble && (roll.first === 3 || roll.first === 4 || roll.first === 6)) {
    return 2;
  }
  return 1;
}
