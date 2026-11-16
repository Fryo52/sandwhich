// 称号の定義と、手に入れた称号の記録（この端末のブラウザに保存）

export interface TitleDef {
  min: number; // この点数以上で手に入る
  name: string;
}

export const TITLES: TitleDef[] = [
  { min: 0, name: '駆け出しサンドウィッチマン' },
  { min: 500, name: '見習いサンドウィッチマン' },
  { min: 1500, name: '一人前サンドウィッチマン' },
  { min: 3000, name: 'ベテランサンドウィッチマン' },
  { min: 5000, name: '達人サンドウィッチマン' },
  { min: 8000, name: '伝説のサンドウィッチマン' },
  { min: 9000, name: 'カットはもういいぜ' },
];

/** 点数に応じた称号（結果画面とXシェアで共通） */
export function rankTitle(score: number): string {
  let name = TITLES[0].name;
  for (const t of TITLES) if (score >= t.min) name = t.name;
  return name;
}

const KEY = 'sandwhich.titles';

/** 称号名 → 初めて手に入れた日時（ISO文字列） */
export type Collection = Record<string, string>;

export function loadCollection(): Collection {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? (JSON.parse(raw) as unknown) : {};
    return data && typeof data === 'object' ? (data as Collection) : {};
  } catch {
    return {};
  }
}

/**
 * 今回の点数にちょうど当てはまる称号1つだけを記録する（下の称号はまとめて手に入らない）。
 * はじめて手に入れたときは true を返す。
 */
export function unlockTitle(score: number): boolean {
  const name = rankTitle(score);
  const col = loadCollection();
  if (col[name]) return false;
  col[name] = new Date().toISOString();
  try {
    localStorage.setItem(KEY, JSON.stringify(col));
  } catch {
    /* 保存できなくてもゲームは続ける */
  }
  return true;
}
