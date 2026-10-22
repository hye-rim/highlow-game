'use strict';
// 하이로우 규칙 시험. 실행: node test/logic.test.js
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

// 덱을 원하는 순서로 바꾼다 (앞에서부터 나오는 카드). 나머지는 남은 카드를 그대로 뒤에 붙인다
function rig(st, cards) {
  const rest = st.deck.filter((c) => !cards.includes(c));
  st.deck = [...cards, ...rest];
  st.pos = 0;
}
const card = (rank, suit = 0) => suit * 13 + rank;   // rank: 0 = A … 12 = K

test('a shuffled deck has all 52 cards once; the same seed gives the same deck', () => {
  for (let s = 1; s <= 50; s++) {
    const st = L.newGame('normal', s);
    assert.deepStrictEqual([...st.deck].sort((a, b) => a - b), Array.from({ length: 52 }, (_, i) => i));
  }
  assert.deepStrictEqual(L.newGame('normal', 7).deck, L.newGame('normal', 7).deck);
  assert.notDeepStrictEqual(L.newGame('normal', 7).deck, L.newGame('normal', 8).deck);
  assert.strictEqual(L.labelOf(card(0, 0)), 'A♠');
  assert.strictEqual(L.labelOf(card(12, 1)), 'K♥');
  assert.ok(L.isRed(card(5, 2)) && !L.isRed(card(5, 3)));
});

test('odds come from the cards that are still left', () => {
  const st = L.newGame('normal', 1);
  rig(st, [card(6)]);                                   // 7 이 나와 있다
  const o = L.odds(st);
  assert.ok(Math.abs(o.hi - 24 / 51) < 1e-12);          // 8~K 6종 × 4장
  assert.ok(Math.abs(o.lo - 24 / 51) < 1e-12);
  assert.ok(Math.abs(o.same - 3 / 51) < 1e-12);
  rig(st, [card(0)]);                                   // A: 낮은 카드는 없다
  assert.strictEqual(L.odds(st).lo, 0);
  assert.ok(Math.abs(L.odds(st).hi - 48 / 51) < 1e-12);
  const rem = L.remainingByRank(st);
  assert.strictEqual(rem.reduce((a, b) => a + b, 0), 51);
  assert.strictEqual(rem[0], 3);
});

test('a right guess scores 10 / probability with a growing streak bonus; ties change nothing', () => {
  const st = L.newGame('normal', 2);
  rig(st, [card(6), card(9), card(11), card(11, 1), card(2)]);
  let r = L.guess(st, 'hi');                            // 7 → 10
  assert.strictEqual(r.outcome, 'win');
  assert.strictEqual(r.gain, Math.round(10 / r.p));
  assert.strictEqual(st.streak, 1);
  const before = st.score;
  r = L.guess(st, 'hi');                                // 10 → Q
  assert.strictEqual(r.gain, Math.round(Math.round(10 / r.p) * 1.1), 'streak 1 → ×1.1');
  r = L.guess(st, 'lo');                                // Q → Q
  assert.strictEqual(r.outcome, 'tie');
  assert.strictEqual(st.streak, 2, 'a tie keeps the streak');
  assert.ok(st.score > before);
  r = L.guess(st, 'hi');                                // Q → 3
  assert.strictEqual(r.outcome, 'lose');
  assert.strictEqual(st.hearts, 2);
  assert.strictEqual(st.streak, 0);
  assert.strictEqual(L.multOf(100), L.MULT_MAX);
});

test('risky guesses pay more than safe ones', () => {
  assert.ok(L.baseFor(0.1) > L.baseFor(0.5) && L.baseFor(0.5) > L.baseFor(0.95));
  assert.strictEqual(L.baseFor(0.5), 20);
  assert.strictEqual(L.baseFor(0), 0);
});

test('swaps: three per game, they move to the next card without a guess', () => {
  const st = L.newGame('normal', 3);
  const second = st.deck[1];
  assert.ok(L.swap(st));
  assert.strictEqual(L.current(st), second);
  assert.strictEqual(st.score, 0);
  assert.ok(L.swap(st) && L.swap(st));
  assert.ok(!L.swap(st), 'no swaps left');
  assert.strictEqual(st.swaps, 0);
});

test('the game ends when the hearts run out', () => {
  const st = L.newGame('normal', 4);
  rig(st, [card(12), card(0), card(12, 1), card(0, 1)]); // K→A→K→A, 계속 거꾸로 고르면
  L.guess(st, 'hi'); L.guess(st, 'lo'); L.guess(st, 'hi');
  assert.strictEqual(st.hearts, 0);
  assert.ok(st.over);
  assert.strictEqual(L.guess(st, 'lo'), null);
  assert.ok(!L.swap(st));
  assert.strictEqual(L.finalScore(st), st.score, 'no heart bonus when you run out');
});

test('going through all 52 cards ends the game with a bonus for every heart left', () => {
  const st = L.newGame('easy', 5);
  assert.strictEqual(st.hearts, 5);
  st.hearts = 1e9;                                      // 끝까지 가 보려고 하트를 넉넉히
  let n = 0;
  while (!st.over) { const o = L.odds(st); L.guess(st, o.hi >= o.lo ? 'hi' : 'lo'); n++; }
  assert.strictEqual(n, 51);
  assert.strictEqual(L.left(st), 0);
  st.hearts = 2;
  assert.strictEqual(L.finalScore(st), st.score + 2 * L.HEART_BONUS);
});

test('playing the better side beats guessing at random, and medals are reachable but not free', () => {
  const play = (mode, seed, smart) => {
    const st = L.newGame(mode, seed), r = L.rng(seed + 99);
    while (!st.over) {
      const o = L.odds(st);
      if (smart && Math.max(o.hi, o.lo) < 0.6 && st.swaps > 0) { L.swap(st); continue; }
      L.guess(st, smart ? (o.hi >= o.lo ? 'hi' : 'lo') : (r() < 0.5 ? 'hi' : 'lo'));
    }
    return L.finalScore(st);
  };
  const avg = (mode, smart) => { let s = 0; for (let i = 1; i <= 400; i++) s += play(mode, i, smart); return s / 400; };
  const smart = avg('normal', true), random = avg('normal', false);
  assert.ok(smart > random * 2, `smart ${smart.toFixed(0)} vs random ${random.toFixed(0)}`);
  assert.ok(avg('easy', true) > smart, 'easy (more hearts) scores more');
  assert.strictEqual(L.gradeOf(smart), 0, 'an average good game is not a medal yet');
  let golds = 0;
  for (let i = 1; i <= 400; i++) if (L.gradeOf(play('easy', i, true)) === 3) golds++;
  assert.ok(golds > 0 && golds < 80, 'gold is rare but possible: ' + golds);
});
