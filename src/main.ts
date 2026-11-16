import { Game, type GameResult } from './game';
import { initAudio, isMuted, setMuted } from './audio';
import { checkName, fetchRanking, online, submitScore, type Entry } from './ranking';
import { TITLES, loadCollection, rankTitle, unlockTitle } from './titles';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const screens = {
  title: $('screen-title'),
  result: $('screen-result'),
  ranking: $('screen-ranking'),
  titles: $('screen-titles'),
};
type ScreenName = keyof typeof screens;

let current: ScreenName | null = null;
function show(name: ScreenName | null) {
  current = name;
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== name);
}

const game = new Game($<HTMLCanvasElement>('game'));
let lastResult: GameResult | null = null;
let submitted = false;
let highlight: { name: string; score: number } | null = null;

const NAME_KEY = 'sandwhich.name';
const MUTE_KEY = 'sandwhich.muted';

function startGame() {
  initAudio();
  show(null);
  game.start();
}

// ---------- タイトル ----------
$('btn-start').addEventListener('click', startGame);
$('btn-ranking').addEventListener('click', () => openRanking());

// ---------- 結果 ----------
const nameInput = $<HTMLInputElement>('input-name');
const submitBtn = $<HTMLButtonElement>('btn-submit');
const submitMsg = $('submit-msg');

try {
  nameInput.value = localStorage.getItem(NAME_KEY) ?? '';
} catch {
  /* noop */
}

function setMsg(text: string, error = false) {
  submitMsg.textContent = text;
  submitMsg.classList.toggle('error', error);
}

game.onGameOver = (r) => {
  lastResult = r;
  submitted = false;
  const title = rankTitle(r.score);
  const isNew = unlockTitle(r.score);
  $('result-score').textContent = String(r.score);
  $('result-title').textContent = title;
  $('result-new').classList.toggle('hidden', !isNew);
  $('result-detail').textContent = `${r.sets}セット成功 ／ 最大${r.maxCombo}コンボ`;
  submitBtn.disabled = r.score <= 0;
  setMsg(r.score <= 0 ? '0点は投稿できないよ' : '');
  setTimeout(() => show('result'), 600);
};

$('form-submit').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!lastResult || submitted) return;
  const v = checkName(nameInput.value);
  if (!v.ok) {
    setMsg(v.error, true);
    return;
  }
  submitBtn.disabled = true;
  setMsg('投稿中…');
  try {
    await submitScore(v.name, lastResult.score, lastResult.sets);
    submitted = true;
    try {
      localStorage.setItem(NAME_KEY, v.name);
    } catch {
      /* noop */
    }
    highlight = { name: v.name, score: lastResult.score };
    setMsg('投稿したよ！');
    openRanking();
  } catch (err) {
    console.error(err);
    submitBtn.disabled = false;
    setMsg('投稿に失敗しました。もう一度ためしてね', true);
  }
});

// ---------- Xでシェア ----------
$('btn-share').addEventListener('click', () => {
  if (!lastResult) return;
  const r = lastResult;
  const text = [
    `SandWhich? で ${r.score}点！（${r.sets}セット成功・最大${r.maxCombo}コンボ）`,
    `称号：${rankTitle(r.score)}`,
    'あなたはパンの切れ目を見抜ける？',
    '#SandWhich',
  ].join('\n');
  const url = location.origin + location.pathname;
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  window.open(intent, '_blank', 'noopener');
});

$('btn-retry').addEventListener('click', startGame);
$('btn-result-ranking').addEventListener('click', () => openRanking());

// ---------- ランキング ----------
const list = $('ranking-list');

function renderRanking(entries: Entry[]) {
  list.replaceChildren();
  if (entries.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'まだだれも投稿していません';
    list.append(li);
    return;
  }
  let marked = false;
  entries.forEach((e, i) => {
    const li = document.createElement('li');
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `${i + 1}位`;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = e.name;
    const score = document.createElement('span');
    score.className = 'score';
    score.textContent = String(e.score);
    li.append(rank, name, score);
    if (!marked && highlight && e.name === highlight.name && e.score === highlight.score) {
      li.classList.add('me');
      marked = true;
      requestAnimationFrame(() => li.scrollIntoView({ block: 'center' }));
    }
    list.append(li);
  });
}

async function openRanking() {
  show('ranking');
  $('ranking-mode').textContent = online ? '総合 TOP100' : '総合 TOP100（この端末のみ）';
  list.replaceChildren();
  const loading = document.createElement('li');
  loading.className = 'empty';
  loading.textContent = '読み込み中…';
  list.append(loading);
  try {
    renderRanking(await fetchRanking());
  } catch (err) {
    console.error(err);
    loading.textContent = 'ランキングを読み込めませんでした';
  }
}

$('btn-back').addEventListener('click', () => show(lastResult && !submitted ? 'result' : 'title'));

// ---------- 称号一覧 ----------
const titleList = $('titles-list');
let titlesBackTo: ScreenName = 'title';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function openTitles() {
  titlesBackTo = current === 'result' ? 'result' : 'title';
  const col = loadCollection();
  const got = TITLES.filter((t) => col[t.name]).length;
  $('titles-count').textContent = `${got} / ${TITLES.length} 個`;
  titleList.replaceChildren();
  for (const t of TITLES) {
    const date = col[t.name];
    const li = document.createElement('li');
    li.classList.toggle('locked', !date);
    const name = document.createElement('span');
    name.className = 'title-name';
    name.textContent = date ? t.name : '？？？';
    const cond = document.createElement('span');
    cond.className = 'title-cond';
    cond.textContent = date ? `${formatDate(date)} 獲得` : t.min === 0 ? '1回遊ぶと解放' : `${t.min}点以上で解放`;
    li.append(name, cond);
    titleList.append(li);
  }
  show('titles');
}

$('btn-titles').addEventListener('click', openTitles);
$('btn-result-titles').addEventListener('click', openTitles);
$('btn-titles-back').addEventListener('click', () => show(titlesBackTo));

// ---------- ミュート ----------
const muteBtn = $<HTMLButtonElement>('btn-mute');
function applyMute(m: boolean) {
  setMuted(m);
  muteBtn.classList.toggle('muted', m);
  muteBtn.setAttribute('aria-label', m ? '音を出す' : '音を消す');
}
try {
  applyMute(localStorage.getItem(MUTE_KEY) === '1');
} catch {
  applyMute(false);
}
muteBtn.addEventListener('click', () => {
  const m = !isMuted();
  applyMute(m);
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* noop */
  }
});

show('title');
