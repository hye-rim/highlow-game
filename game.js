'use strict';

// 하이로우: 화면·입력·소리. 규칙(카드·확률·점수·하트)은 logic.js (LOGIC_HIGHLOW)
(() => {
const L = LOGIC_HIGHLOW;
const $ = (id) => document.getElementById(id);
const INK = '#2b1d52';

// ---------- 저장소 ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
const BEST_KEYS = { easy: 'highlowBestEasy', normal: 'highlowBestNormal' };
const best = { easy: Number(store.get(BEST_KEYS.easy)) || 0, normal: Number(store.get(BEST_KEYS.normal)) || 0 };
const bestAll = () => Math.max(best.easy, best.normal);

// ---------- 소리 ----------
let audio = null;
let muted = store.get('highlowMuted') === '1';
function tone(freq, dur, type = 'sine', vol = 0.09, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + dur);
  } catch (_) {}
}
const seq = (notes, step, type = 'triangle', vol = 0.09) => notes.forEach((f, i) => setTimeout(() => tone(f, step * 0.0009, type, vol), i * step));
const sfx = {
  flip: () => tone(700, 0.05, 'triangle', 0.05, 200),
  win: (streak) => tone(520 + Math.min(streak, 12) * 45, 0.12, 'triangle', 0.1, 220),
  lose: () => tone(220, 0.25, 'sawtooth', 0.06, -90),
  tie: () => tone(440, 0.12, 'sine', 0.07),
  swap: () => tone(600, 0.08, 'square', 0.04, -200),
  over: () => seq([392, 330, 262, 196], 150, 'sawtooth', 0.06),
  medal: () => seq([523, 659, 784, 1047], 90, 'triangle', 0.1),
};
function toggleMute() { muted = !muted; store.set('highlowMuted', muted ? '1' : '0'); $('muteBtn').textContent = muted ? '🔇' : '🔊'; }
$('muteBtn').onclick = (e) => { e.currentTarget.blur(); toggleMute(); };
$('muteBtn').textContent = muted ? '🔇' : '🔊';

// ---------- 상태 ----------
let st = L.newGame('normal', 20241022);
let playing = false, mode = 'normal', busy = false;

// ---------- 그리기 ----------
function cardHtml(c) {
  const r = L.RANKS[L.rankOf(c)], s = L.SUITS[L.suitOf(c)];
  return `<div class="corner">${r}<br>${s}</div><div class="mid">${s}</div><div class="corner br">${r}<br>${s}</div>`;
}
function setCard(el, c, extra = '') {
  el.className = `card ${el.id === 'nextCard' ? 'small ' : ''}${L.isRed(c) ? 'red ' : ''}${extra}`.trim();
  el.innerHTML = cardHtml(c);
}
function setBack(el) { el.className = `card ${el.id === 'nextCard' ? 'small ' : ''}back`; el.innerHTML = ''; }
const pct = (p) => `${Math.round(p * 100)}%`;

function updateHud() {
  $('score').textContent = L.finalScore(st).toLocaleString('ko-KR');
  $('streak').textContent = st.streak;
  $('best').textContent = bestAll().toLocaleString('ko-KR');
}
function render() {
  $('hearts').innerHTML = Array.from({ length: st.cfg.hearts }, (_, i) => `<span class="${i >= st.hearts ? 'lost' : ''}">❤️</span>`).join('');
  const m = L.multOf(st.streak);
  $('mult').textContent = `×${m.toFixed(1)}`;
  $('mult').classList.toggle('off', m === 1);
  $('left').textContent = `🃏 ${L.left(st)}`;
  setCard($('curCard'), L.current(st));
  setBack($('nextCard'));
  const o = L.odds(st), live = playing && !st.over && !busy;
  // 쉬움은 확률과 맞혔을 때 점수를 보여 준다. 보통은 직접 세어야 한다
  const show = (p) => (st.cfg.showOdds ? `${pct(p)} · +${Math.round(L.baseFor(p) * m)}` : '');
  $('hiOdds').textContent = show(o.hi); $('loOdds').textContent = show(o.lo);
  $('hiBtn').disabled = !live || o.hi === 0;
  $('loBtn').disabled = !live || o.lo === 0;
  $('swapBtn').textContent = `🔄 바꾸기 ×${st.swaps}`;
  $('swapBtn').disabled = !live || st.swaps <= 0;
  renderTracker();
  updateHud();
}
// 남은 카드 표 (쉬움만): 숫자마다 아직 안 나온 장수
function renderTracker() {
  if (!st.cfg.showOdds) { $('tracker').innerHTML = ''; return; }
  const rem = L.remainingByRank(st), now = L.rankOf(L.current(st));
  $('tracker').innerHTML = L.RANKS.map((r, i) => `<div class="t${i === now ? ' now' : ''}${rem[i] === 0 ? ' gone' : ''}">${r}<b>${rem[i]}</b></div>`).join('');
}
function say(t) { $('msg').textContent = t; }

// ---------- 행동 ----------
const NAMES = { hi: '높다', lo: '낮다' };
function pick(which) {
  if (!playing || busy || st.over) return;
  const r = L.guess(st, which);
  if (!r) return;
  busy = true;
  sfx.flip();
  setCard($('nextCard'), r.card, `flip ${r.outcome}`);
  $('hiBtn').disabled = $('loBtn').disabled = $('swapBtn').disabled = true;
  if (r.outcome === 'win') { sfx.win(st.streak); say(`${NAMES[which]} 맞았어요! +${r.gain}점${st.streak >= 3 ? ` · ${st.streak}연속` : ''}`); }
  else if (r.outcome === 'lose') { sfx.lose(); say(`아쉬워요! ${L.labelOf(r.card)} 카드가 나왔어요`); }
  else { sfx.tie(); say('같은 숫자! 무승부예요'); }
  updateHud();
  setTimeout(() => {
    busy = false;
    if (st.over) { saveBest(); render(); setCard($('curCard'), L.current(st)); setTimeout(showOver, 600); return; }
    render();
    $('curCard').classList.add('flip');
  }, 700);
}
function doSwap() {
  if (!playing || busy || !L.swap(st)) return;
  sfx.swap();
  say(`🔄 다음 카드로 바꿨어요 (남은 바꾸기 ${st.swaps}번)`);
  render();
  $('curCard').classList.add('flip');
  if (st.over) { saveBest(); setTimeout(showOver, 600); }
}
function saveBest() {
  const s = L.finalScore(st);
  if (s > best[mode]) { best[mode] = s; store.set(BEST_KEYS[mode], String(s)); }
  store.set('highlowBest', String(bestAll()));
}

// ---------- 시작·끝 ----------
function startRun(m) {
  mode = m; st = L.newGame(m); playing = true; busy = false;
  $('overlay').classList.add('hidden');
  say(st.cfg.showOdds ? '아래 표는 아직 안 나온 카드예요' : '나온 카드를 기억하면 유리해요');
  render();
}
const MEDALS = [null, ['동메달', '#d98a4a'], ['은메달', '#c5ccd6'], ['금메달', '#ffd23f']];
function showOver() {
  playing = false;
  const score = L.finalScore(st), med = L.gradeOf(score), m = MEDALS[med];
  const rec = score > 0 && score >= best[mode];
  const allDone = st.hearts > 0;
  $('overlay').innerHTML = `
    <h2>${allDone ? '카드를 다 넘겼어요! 🎉' : '하트를 다 썼어요 😵'}</h2>
    <div class="big">${score.toLocaleString('ko-KR')}</div>
    ${rec ? '<span class="tag">최고 기록!</span>' : ''}
    ${m ? `<p><span class="tag" style="background:${m[1]};color:${INK}">🏅 ${m[0]}</span></p>` : '<p>250점을 넘으면 메달을 받아요</p>'}
    <dl class="stats card2"><dt>맞힘</dt><dd>${st.wins}번</dd><dt>틀림</dt><dd>${st.losses}번</dd><dt>최고 연속</dt><dd>${st.bestStreak}</dd>${allDone ? `<dt>남은 하트</dt><dd>+${st.hearts * L.HEART_BONUS}</dd>` : ''}<dt>모드</dt><dd>${L.MODES[mode].name}</dd></dl>
    <div class="col"><button id="againBtn">다시 하기</button><button id="homeBtn" class="sub">모드 바꾸기</button></div>`;
  $('overlay').classList.remove('hidden');
  $('againBtn').onclick = (e) => { e.currentTarget.blur(); startRun(mode); };
  $('homeBtn').onclick = (e) => { e.currentTarget.blur(); showTitle(); };
  sfx.over();
  if (med) setTimeout(sfx.medal, 700);
}
function showTitle() {
  playing = false;
  st = L.newGame('normal', 20241022); render(); say('');
  $('overlay').innerHTML = `
    <h1>하이로우</h1>
    <p>다음 카드가 지금보다 <b>높을지 ▲</b> <b>낮을지 ▼</b> 맞혀요<br>A 가 가장 낮고 K 가 가장 높아요 · 같으면 무승부</p>
    <p style="font-size:12.5px">맞힐 확률이 낮은 쪽을 맞힐수록 점수가 커요<br>연속으로 맞히면 배수가 올라가요 (최대 ×2)<br>🔄 바꾸기 3번 · 52장을 다 넘기면 남은 하트도 점수!</p>
    <div class="col"><button id="easyBtn">쉬움<small>하트 5개 · 확률과 남은 카드 표시${best.easy ? ' · 최고 ' + best.easy.toLocaleString('ko-KR') : ''}</small></button><button id="normalBtn" class="sub">보통 · 하트 3개 · 직접 세기${best.normal ? ' · 최고 ' + best.normal.toLocaleString('ko-KR') : ''}</button></div>
    <p style="font-size:12px;opacity:.85">PC: ↑ 높다 · ↓ 낮다 · Space 바꾸기 · M 소리</p>`;
  $('overlay').classList.remove('hidden');
  $('easyBtn').onclick = (e) => { e.currentTarget.blur(); startRun('easy'); };
  $('normalBtn').onclick = (e) => { e.currentTarget.blur(); startRun('normal'); };
}

$('hiBtn').onclick = (e) => { e.currentTarget.blur(); pick('hi'); };
$('loBtn').onclick = (e) => { e.currentTarget.blur(); pick('lo'); };
$('swapBtn').onclick = (e) => { e.currentTarget.blur(); doSwap(); };

// ---------- 키보드 (PC) ----------
addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); pick('hi'); }
  else if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); pick('lo'); }
  else if (e.code === 'Space') { e.preventDefault(); doSwap(); }
  else if (e.code === 'KeyM') toggleMute();
});

showTitle();

/* @test-hooks:start */
window.__hl = { get st() { return st; }, pick, doSwap, startRun, get playing() { return playing; }, get busy() { return busy; } };
/* @test-hooks:end */
})();
