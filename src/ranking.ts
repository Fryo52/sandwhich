// ランキング：Supabase（環境変数があれば）／なければブラウザ内に保存

export interface Entry {
  name: string;
  score: number;
  sets: number;
  created_at?: string;
}

export const MAX_NAME = 12;
export const MAX_PER_SET = 350; // 100 × 最大倍率3 + スピードボーナス50（サーバー側と同じ値）
const LIMIT = 100;

// 末尾に /rest/v1/ まで付けて貼られても動くようにする
const SB_URL = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1$/, '');
const SB_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

export const online = Boolean(SB_URL && SB_KEY);

function headers(): Record<string, string> {
  const h: Record<string, string> = { apikey: SB_KEY, 'Content-Type': 'application/json' };
  // 旧形式の anon key（JWT）のときだけ Authorization も付ける
  if (SB_KEY.startsWith('eyJ')) h.Authorization = `Bearer ${SB_KEY}`;
  return h;
}

const NG_WORDS = [
  'fuck', 'shit', 'bitch', 'porn', 'sex',
  'ちんこ', 'ちんぽ', 'まんこ', 'うんこ', 'セックス',
  '死ね', 'しね', '殺す', 'ころす', 'きちがい', 'ガイジ',
];

export function checkName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.normalize('NFKC').trim();
  const len = [...name].length;
  if (len === 0) return { ok: false, error: 'なまえを入れてね' };
  if (len > MAX_NAME) return { ok: false, error: `${MAX_NAME}文字までだよ` };
  const flat = name.toLowerCase().replace(/[\s._\-・]/g, '');
  const kata = flat.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  if (NG_WORDS.some((w) => flat.includes(w) || kata.includes(w))) {
    return { ok: false, error: 'その名前は使えないよ' };
  }
  return { ok: true, name };
}

// ---------- ローカル保存（Supabase未設定時） ----------
const LOCAL_KEY = 'sandwhich.localRanking';

function loadLocal(): Entry[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const list = raw ? (JSON.parse(raw) as Entry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveLocal(list: Entry[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch {
    /* 保存できなくてもゲームは続ける */
  }
}

// ---------- API ----------
export async function fetchRanking(): Promise<Entry[]> {
  if (!online) {
    return loadLocal().sort((a, b) => b.score - a.score).slice(0, LIMIT);
  }
  const url = `${SB_URL}/rest/v1/scores?select=name,score,sets,created_at&order=score.desc,created_at.asc&limit=${LIMIT}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`ranking fetch failed: ${res.status}`);
  return (await res.json()) as Entry[];
}

export async function submitScore(name: string, score: number, sets: number): Promise<void> {
  if (!online) {
    const list = loadLocal();
    list.push({ name, score, sets, created_at: new Date().toISOString() });
    list.sort((a, b) => b.score - a.score);
    saveLocal(list.slice(0, LIMIT));
    return;
  }
  const res = await fetch(`${SB_URL}/rest/v1/rpc/submit_score`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ p_name: name, p_score: score, p_sets: sets }),
  });
  if (!res.ok) throw new Error(`submit failed: ${res.status}`);
}
