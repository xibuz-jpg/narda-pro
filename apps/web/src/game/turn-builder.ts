import {
  Board,
  applyMove,
  applyMoveLong,
  generateSingleMoves,
  generateSingleMovesLong,
  headPoint,
  BAR,
  Player,
  type BoardSnapshot,
  type Die,
  type GameVariant,
  type Move,
} from '@narda/game-engine';

type MoveGen = (board: Board, player: Player, die: Die) => Move[];
type MoveApply = (board: Board, player: Player, move: Move) => Board;

/**
 * Builds a player's turn one checker-move at a time on the client, using the
 * same engine that validates it on the server — for **either** variant.
 *
 * Only moves that keep a maximum-length turn reachable are offered (so a turn
 * can never be under-played), and in Long Narda the head rule is enforced: at
 * most `maxFromHead` checkers may leave the head across the whole turn.
 */
export class TurnBuilder {
  private readonly initial: Board;
  private readonly player: Player;
  private readonly first: number;
  private readonly second: number;
  private readonly isDouble: boolean;
  private readonly gen: MoveGen;
  private readonly apply: MoveApply;
  private readonly head: number; // head point, or -1 (no head rule)
  private readonly maxFromHead: number;
  readonly maxLen: number;

  private history: Board[];
  private moves: Move[] = [];
  private diceLeft: number[];

  constructor(
    boardSnapshot: BoardSnapshot,
    dice: { first: number; second: number },
    player: Player,
    variant: GameVariant = 'BACKGAMMON',
    maxFromHead = 1,
  ) {
    this.initial = Board.fromSnapshot(boardSnapshot);
    this.player = player;
    this.first = dice.first;
    this.second = dice.second;
    this.isDouble = dice.first === dice.second;
    this.diceLeft = this.isDouble
      ? [dice.first, dice.first, dice.first, dice.first]
      : [dice.first, dice.second];
    this.history = [this.initial];

    const long = variant === 'LONG_NARDA';
    this.gen = long ? generateSingleMovesLong : generateSingleMoves;
    this.apply = long ? applyMoveLong : applyMove;
    this.head = long ? headPoint(player) : -1;
    this.maxFromHead = maxFromHead;

    this.maxLen = this.maxUsable(this.initial, [...this.diceLeft], 0);
  }

  get board(): Board {
    return this.history[this.history.length - 1]!;
  }

  get playedMoves(): readonly Move[] {
    return this.moves;
  }

  get isComplete(): boolean {
    return this.moves.length === this.maxLen;
  }

  get mustPass(): boolean {
    return this.maxLen === 0;
  }

  /** Max dice usable from a board, honouring the head rule via `headUsed`. */
  private maxUsable(board: Board, dice: number[], headUsed: number): number {
    if (dice.length === 0) return 0;
    let best = 0;
    const tried = new Set<number>();
    for (let i = 0; i < dice.length; i += 1) {
      const die = dice[i]!;
      if (tried.has(die)) continue;
      tried.add(die);
      for (const move of this.gen(board, this.player, die as Die)) {
        const nextHead = headUsed + (move.from === this.head ? 1 : 0);
        if (this.head !== -1 && nextHead > this.maxFromHead) continue;
        const rest = [...dice.slice(0, i), ...dice.slice(i + 1)];
        best = Math.max(best, 1 + this.maxUsable(this.apply(board, this.player, move), rest, nextHead));
      }
    }
    return best;
  }

  private headUsed(): number {
    return this.moves.reduce((n, m) => (m.from === this.head ? n + 1 : n), 0);
  }

  /** Single moves from the current board that stay on a maximum-length line. */
  private candidates(): Move[] {
    const need = this.maxLen - this.moves.length;
    if (need <= 0) return [];

    const board = this.board;
    const headUsed = this.headUsed();
    const out: Move[] = [];
    const tried = new Set<number>();
    for (let i = 0; i < this.diceLeft.length; i += 1) {
      const die = this.diceLeft[i]!;
      if (tried.has(die)) continue;
      tried.add(die);
      for (const move of this.gen(board, this.player, die as Die)) {
        const nextHead = headUsed + (move.from === this.head ? 1 : 0);
        if (this.head !== -1 && nextHead > this.maxFromHead) continue;
        const rest = [...this.diceLeft.slice(0, i), ...this.diceLeft.slice(i + 1)];
        if (1 + this.maxUsable(this.apply(board, this.player, move), rest, nextHead) === need) {
          out.push(move);
        }
      }
    }

    if (this.moves.length === 0 && this.maxLen === 1 && !this.isDouble) {
      const high = Math.max(this.first, this.second);
      if (out.some((m) => m.die === high)) return out.filter((m) => m.die === high);
    }
    return out;
  }

  sources(): Array<number | typeof BAR> {
    return [...new Set(this.candidates().map((m) => m.from))];
  }

  destinations(from: number | typeof BAR): Move[] {
    return this.candidates().filter((m) => m.from === from);
  }

  play(move: Move): void {
    this.moves.push(move);
    this.history.push(this.apply(this.board, this.player, move));
    this.diceLeft.splice(this.diceLeft.indexOf(move.die), 1);
  }

  undo(): void {
    const last = this.moves.pop();
    if (!last) return;
    this.history.pop();
    this.diceLeft.push(last.die);
  }

  result(): Move[] {
    return [...this.moves];
  }
}
