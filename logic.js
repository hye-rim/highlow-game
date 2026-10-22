'use strict';

// 하이로우: 규칙만 모아 둔 파일 (그리기·입력·소리 없음). 브라우저와 테스트(Node)가 같이 쓴다.
//
// - 카드 한 벌(52장)을 섞어 한 장씩 넘긴다. 지금 카드를 보고 다음 카드가 높을지(▲) 낮을지(▼) 고른다. A 가 가장 낮고 K 가 가장 높다
// - 같은 숫자가 나오면 무승부(점수·하트 그대로, 연속도 그대로)
// - 맞히면 점수: 맞힐 확률이 낮았을수록 크다 (10 ÷ 확률). 연속으로 맞힐수록 배수가 붙는다 (+10%씩, 최대 2배)
// - 틀리면 하트 하나. 하트가 다 없어지거나 카드를 다 넘기면 끝
// - 바꾸기(3번): 지금 카드를 맞히지 않고 다음 카드로 넘긴다
// - 남은 카드는 숨기지 않는다: 이미 나온 카드를 세면 확률을 읽을 수 있다 (쉬움 모드는 확률을 버튼에 보여 준다)
const LOGIC_HIGHLOW = (() => {
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];
const MODES = {
  easy: { name: '쉬움', hearts: 5, swaps: 3, showOdds: true },
  normal: { name: '보통', hearts: 3, swaps: 3, showOdds: false },
};

// 카드: 0~51. rank = c % 13 (0 = A … 12 = K), suit = c / 13
const rankOf = (c) => c % 13;
const suitOf = (c) => Math.floor(c / 13);
const labelOf = (c) => RANKS[rankOf(c)] + SUITS[suitOf(c)];
const isRed = (c) => suitOf(c) === 1 || suitOf(c) === 2;

function rng(seed) {                                     // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function newGame(mode = 'normal', seed = (Math.random() * 2 ** 31) | 0) {
  const rand = rng(seed);
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const cfg = MODES[mode] || MODES.normal;
  const st = {
    mode, seed, cfg, deck, pos: 0, hearts: cfg.hearts, swaps: cfg.swaps, score: 0, streak: 0, bestStreak: 0,
    wins: 0, losses: 0, ties: 0, over: false, history: [],
  };
  return st;
}

const current = (st) => st.deck[st.pos];
const left = (st) => st.deck.length - st.pos - 1;               // 아직 안 나온 카드 수
// 아직 안 나온 카드의 숫자별 장수 (13칸)
function remainingByRank(st) {
  const out = new Array(13).fill(0);
  for (let i = st.pos + 1; i < st.deck.length; i++) out[rankOf(st.deck[i])]++;
  return out;
}
// 다음 카드가 지금보다 높을/낮을/같을 확률
function odds(st) {
  const n = left(st);
  if (!n) return { hi: 0, lo: 0, same: 0 };
  const r = rankOf(current(st)), rem = remainingByRank(st);
  let hi = 0, lo = 0;
  for (let k = 0; k < 13; k++) { if (k > r) hi += rem[k]; else if (k < r) lo += rem[k]; }
  return { hi: hi / n, lo: lo / n, same: rem[r] / n };
}

const MULT_STEP = 0.1, MULT_MAX = 2;
const multOf = (streak) => Math.min(MULT_MAX, 1 + MULT_STEP * streak);
// 맞혔을 때 기본 점수: 확률이 낮을수록 크다 (확률 50% → 20점, 90% → 11점, 10% → 100점)
const baseFor = (p) => (p > 0 ? Math.round(10 / p) : 0);

// 고른다: 'hi' 또는 'lo'. 결과 { card, outcome: 'win'|'lose'|'tie', gain, p } (끝났으면 null)
function guess(st, pick) {
  if (st.over || (pick !== 'hi' && pick !== 'lo') || !left(st)) return null;
  const o = odds(st), p = pick === 'hi' ? o.hi : o.lo;
  const a = rankOf(current(st));
  st.pos++;
  const card = current(st), b = rankOf(card);
  let outcome, gain = 0;
  if (a === b) { outcome = 'tie'; st.ties++; }
  else if ((b > a) === (pick === 'hi')) {
    outcome = 'win';
    gain = Math.round(baseFor(p) * multOf(st.streak));
    st.score += gain; st.streak++; st.wins++;
    st.bestStreak = Math.max(st.bestStreak, st.streak);
  } else {
    outcome = 'lose';
    st.hearts--; st.streak = 0; st.losses++;
  }
  st.history.push({ pick, card, outcome, gain });
  if (st.hearts <= 0 || !left(st)) st.over = true;
  return { card, outcome, gain, p };
}

// 바꾸기: 지금 카드를 넘기고 다음 카드를 새 기준으로 (맞히기 없이). 바꿨으면 true
function swap(st) {
  if (st.over || st.swaps <= 0 || !left(st)) return false;
  st.swaps--;
  st.pos++;
  st.history.push({ pick: 'swap', card: current(st), outcome: 'swap', gain: 0 });
  if (!left(st)) st.over = true;
  return true;
}

// 판이 끝까지 가면(카드를 다 넘기면) 남은 하트 하나당 보너스
const HEART_BONUS = 50;
const finalScore = (st) => st.score + (st.over && st.hearts > 0 && !left(st) ? st.hearts * HEART_BONUS : 0);

// 메달: 확률 높은 쪽을 고르는 봇이 보통 모드에서 평균 약 200점, 상위 5%가 480점쯤이다
const gradeOf = (score) => (score >= 650 ? 3 : score >= 400 ? 2 : score >= 250 ? 1 : 0);   // 0 없음 · 1 동 · 2 은 · 3 금

return { RANKS, SUITS, MODES, MULT_STEP, MULT_MAX, HEART_BONUS, rng, rankOf, suitOf, labelOf, isRed, newGame, current, left, remainingByRank, odds, multOf, baseFor, guess, swap, finalScore, gradeOf };
})();
if (typeof module !== 'undefined') module.exports = LOGIC_HIGHLOW;
