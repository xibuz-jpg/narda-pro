/* Quick correctness checks for the client TurnBuilder. Run: tsx scripts/test-turn-builder.ts */
import { Board, Player, BAR, OFF } from '@narda/game-engine';
import { TurnBuilder } from '../src/game/turn-builder';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

// 1) Start position, 6-5 → must play both dice (lover's leap 24→18→13).
{
  const tb = new TurnBuilder(Board.initial().toSnapshot(), { first: 6, second: 5 }, Player.White);
  check('start 6-5 maxLen is 2', tb.maxLen === 2, String(tb.maxLen));
  const src = tb.sources();
  check('24 is a valid source', src.includes(24));
  const d = tb.destinations(24);
  check('24 has a die-6 move to 18', d.some((m) => m.to === 18 && m.die === 6));
  tb.play(d.find((m) => m.to === 18)!);
  const d2 = tb.destinations(18);
  check('then 18→13 with die 5', d2.some((m) => m.to === 13 && m.die === 5));
  tb.play(d2.find((m) => m.to === 13)!);
  check('turn complete after 2 moves', tb.isComplete && tb.result().length === 2);
}

// 2) Stuck on the bar with both entries blocked → must pass.
{
  const board = Board.fromPointMap(
    { 19: { owner: Player.Black, count: 2 }, 24: { owner: Player.Black, count: 2 } },
    { bar: { [Player.White]: 1 } },
  ).toSnapshot();
  const tb = new TurnBuilder(board, { first: 1, second: 6 }, Player.White);
  check('blocked bar → mustPass', tb.mustPass && tb.maxLen === 0);
  check('no sources when passing', tb.sources().length === 0);
  check('empty result submitted as pass', tb.result().length === 0);
}

// 3) Higher-die rule: White on 13, point 6 blocked, roll 6-1 → only the 6 is allowed.
{
  const board = Board.fromPointMap({
    13: { owner: Player.White, count: 1 },
    6: { owner: Player.Black, count: 2 },
  }).toSnapshot();
  const tb = new TurnBuilder(board, { first: 6, second: 1 }, Player.White);
  check('single-die maxLen is 1', tb.maxLen === 1);
  const dests = tb.destinations(13);
  check('only the higher die (6) is offered', dests.length === 1 && dests[0]!.die === 6, JSON.stringify(dests));
}

// 4) Bearing off + undo.
{
  const board = Board.fromPointMap({
    6: { owner: Player.White, count: 1 },
    5: { owner: Player.White, count: 1 },
  }).toSnapshot();
  const tb = new TurnBuilder(board, { first: 6, second: 5 }, Player.White);
  check('bear-off maxLen is 2', tb.maxLen === 2);
  const off6 = tb.destinations(6).find((m) => m.to === OFF);
  check('point 6 can bear off', !!off6);
  tb.play(off6!);
  check('one move played', tb.result().length === 1);
  tb.undo();
  check('undo restores empty turn', tb.result().length === 0 && tb.maxLen === 2);
}

// 5) BAR source exposure.
{
  const board = Board.fromPointMap({}, { bar: { [Player.White]: 1 } }).toSnapshot();
  const tb = new TurnBuilder(board, { first: 2, second: 4 }, Player.White);
  check('bar is offered as a source', tb.sources().includes(BAR));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
