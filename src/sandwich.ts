// サンドイッチ列の生成と描画

export const BREAD_H = 120; // パンの高さ（設計単位）
export const GAP = 26; // 切ったときに開くすき間（設計単位）

const WIDTH: Record<string, number> = {
  bread: 28,
  hashbrown: 28,
  tamagoyaki: 28,
  cheeseblock: 28,
  ham: 10,
  lettuce: 14,
  tomato: 12,
  egg: 14,
  bacon: 9,
  cucumber: 9,
  cheese: 7,
};

export const COLORS: Record<string, string> = {
  bread: '#fbe7c0',
  hashbrown: '#e3b04b',
  tamagoyaki: '#ffd94a',
  cheeseblock: '#ffc93c',
  ham: '#f2a0a8',
  lettuce: '#7cc84a',
  tomato: '#e8483a',
  egg: '#fff3b0',
  bacon: '#c75b46',
  cucumber: '#a8d672',
  cheese: '#ffcc33',
};

const REAL = ['ham', 'lettuce', 'tomato', 'egg', 'bacon', 'cucumber', 'cheese'];
const FAKES = ['hashbrown', 'tamagoyaki', 'cheeseblock'];

export interface Piece {
  kind: string;
  isBread: boolean;
  w: number;
  x: number; // 左端（設計単位）
  off: number; // 切れ目が開いた分のずれ
  seed: number;
  seamCover: boolean; // 切れ目を隠しているレタス
  falling: boolean;
  dy: number; // 落下（画面px）
  vy: number;
  rot: number;
  vr: number;
}

export interface Cut {
  x: number; // 切る位置（設計単位、ずれ適用前）
  right: number; // このインデックス以降のピースが右へずれる
  ref: number; // 位置計算の基準にするピース
  hidden: boolean;
  done: boolean;
  open: number; // 現在開いているすき間
}

export interface SetData {
  pieces: Piece[];
  cuts: Cut[];
  width: number;
}

interface Tok {
  kind: string;
  seam: boolean;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

function sandwichCount(level: number): number {
  if (level < 3) return 2;
  if (level < 8) return randInt(2, 3);
  if (level < 15) return randInt(3, 4);
  return randInt(3, 5);
}

function makeTokens(level: number, allowHidden: boolean): Tok[] {
  const n = sandwichCount(level);
  const fakeP = level < 4 ? 0 : Math.min(0.35, 0.06 * (level - 3));
  const hideP = !allowHidden || level < 6 ? 0 : Math.min(0.5, 0.07 * (level - 5));
  const toks: Tok[] = [];
  for (let s = 0; s < n; s++) {
    if (s > 0 && Math.random() < hideP) toks.push({ kind: 'lettuce', seam: true });
    const breads = Math.random() < 0.5 ? 2 : 3;
    for (let b = 0; b < breads; b++) {
      if (b > 0) {
        const m = level < 5 ? 1 : Math.random() < 0.4 ? 2 : 1;
        for (let f = 0; f < m; f++) {
          toks.push({ kind: Math.random() < fakeP ? pick(FAKES) : pick(REAL), seam: false });
        }
      }
      toks.push({ kind: 'bread', seam: false });
    }
  }
  return toks;
}

/**
 * 見た目から「パン2〜3枚のサンドイッチの並び」として何通りに読めるかを数える。
 * 隠れた切れ目のレタスは本物のレタスと見分けがつかないので、1通りに決まる並びだけを出題する。
 */
export function countParses(toks: Tok[]): number {
  const s = toks.map((t) => (t.kind === 'bread' ? 'B' : t.kind === 'lettuce' ? 'L' : 'F'));
  const n = s.length;
  const memo = new Map<number, number>();

  const afterSandwich = (j: number): number => {
    if (j === n - 1) return 1;
    let t = 0;
    if (s[j + 1] === 'B') t += startAt(j + 1);
    if (s[j + 1] === 'L' && s[j + 2] === 'B') t += startAt(j + 2);
    return t;
  };

  const startAt = (i: number): number => {
    if (s[i] !== 'B') return 0;
    const cached = memo.get(i);
    if (cached !== undefined) return cached;
    let total = 0;
    let j = i;
    for (let breads = 2; breads <= 3; breads++) {
      let k = j + 1;
      if (k >= n || s[k] === 'B') break;
      while (k < n && s[k] !== 'B') k++;
      if (k >= n) break;
      j = k;
      total += afterSandwich(j);
      if (total > 1) break;
    }
    memo.set(i, total);
    return total;
  };

  return startAt(0);
}

function build(toks: Tok[]): SetData {
  const pieces: Piece[] = toks.map((t) => ({
    kind: t.kind,
    isBread: t.kind === 'bread',
    w: WIDTH[t.kind],
    x: 0,
    off: 0,
    seed: Math.random() * 1000,
    seamCover: t.seam,
    falling: false,
    dy: 0,
    vy: 0,
    rot: 0,
    vr: 0,
  }));
  let x = 0;
  for (const p of pieces) {
    p.x = x;
    x += p.w;
  }
  const cuts: Cut[] = [];
  pieces.forEach((p, i) => {
    if (i > 0 && p.isBread && pieces[i - 1].isBread) {
      cuts.push({ x: p.x, right: i, ref: i - 1, hidden: false, done: false, open: 0 });
    }
    if (p.seamCover) {
      cuts.push({ x: p.x + p.w / 2, right: i + 1, ref: i, hidden: true, done: false, open: 0 });
    }
  });
  cuts.sort((a, b) => a.x - b.x);
  return { pieces, cuts, width: x };
}

/** maxWidth: 切れ目が全部開いた状態で収まるべき幅（設計単位）。スマホでパンが小さくなりすぎないようにする */
export function generateSet(level: number, maxWidth = Infinity): SetData {
  for (let attempt = 0; attempt < 120; attempt++) {
    const toks = makeTokens(level, attempt < 100);
    if (countParses(toks) !== 1) continue;
    const s = build(toks);
    if (s.width + s.cuts.length * GAP <= maxWidth) return s;
  }
  return build([
    { kind: 'bread', seam: false },
    { kind: 'ham', seam: false },
    { kind: 'bread', seam: false },
    { kind: 'bread', seam: false },
    { kind: 'lettuce', seam: false },
    { kind: 'bread', seam: false },
  ]);
}

// ---------- 描画 ----------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wavy(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, amp: number, seed: number, freq: number) {
  const steps = 18;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const yy = y + (h * i) / steps;
    const xx = x + Math.sin(seed + i * freq) * amp;
    if (i === 0) ctx.moveTo(xx, yy);
    else ctx.lineTo(xx, yy);
  }
  for (let i = steps; i >= 0; i--) {
    const yy = y + (h * i) / steps;
    const xx = x + w + Math.sin(seed * 1.7 + i * freq) * amp;
    ctx.lineTo(xx, yy);
  }
  ctx.closePath();
}

// 原点はピースの左端・縦中央
export function drawPiece(ctx: CanvasRenderingContext2D, p: Piece) {
  const H = BREAD_H;
  const w = p.w;
  ctx.lineJoin = 'round';
  switch (p.kind) {
    case 'bread': {
      roundRect(ctx, 0, -H / 2, w, H, 9);
      ctx.fillStyle = COLORS.bread;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#c98a3c';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      roundRect(ctx, 5, -H / 2 + 8, 5, H - 16, 3);
      ctx.fill();
      break;
    }
    case 'hashbrown': {
      roundRect(ctx, 0, -H / 2, w, H, 10);
      ctx.fillStyle = COLORS.hashbrown;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#b9822a';
      ctx.stroke();
      ctx.fillStyle = '#b9822a';
      for (let i = 0; i < 9; i++) {
        const yy = -H / 2 + 10 + ((Math.sin(p.seed + i * 3.1) + 1) / 2) * (H - 20);
        const xx = 6 + ((Math.sin(p.seed * 2 + i * 5.3) + 1) / 2) * (w - 12);
        ctx.fillRect(xx, yy, 3, 2);
      }
      break;
    }
    case 'tamagoyaki': {
      roundRect(ctx, 0, -H / 2, w, H, 6);
      ctx.fillStyle = COLORS.tamagoyaki;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#e0a800';
      ctx.stroke();
      ctx.strokeStyle = 'rgba(224,168,0,0.6)';
      ctx.lineWidth = 2;
      for (const xx of [9, 15, 21]) {
        ctx.beginPath();
        ctx.moveTo(xx, -H / 2 + 6);
        ctx.lineTo(xx, H / 2 - 6);
        ctx.stroke();
      }
      break;
    }
    case 'cheeseblock': {
      roundRect(ctx, 0, -H / 2, w, H, 4);
      ctx.fillStyle = COLORS.cheeseblock;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#e3a919';
      ctx.stroke();
      ctx.fillStyle = '#eaa91a';
      for (let i = 0; i < 5; i++) {
        const yy = -H / 2 + 14 + i * 22 + Math.sin(p.seed + i) * 4;
        const xx = 9 + ((Math.sin(p.seed * 3 + i * 2.2) + 1) / 2) * 10;
        ctx.beginPath();
        ctx.arc(xx, yy, 3 + (i % 2), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'ham': {
      const h = H * 0.94;
      wavy(ctx, 0, -h / 2, w, h, 1.2, p.seed, 0.9);
      ctx.fillStyle = COLORS.ham;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#d97a86';
      ctx.stroke();
      break;
    }
    case 'lettuce': {
      const h = H * 1.06;
      wavy(ctx, -3, -h / 2, w + 6, h, 3, p.seed, 1.4);
      ctx.fillStyle = COLORS.lettuce;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#4f9a2a';
      ctx.stroke();
      ctx.strokeStyle = 'rgba(220,255,200,0.7)';
      ctx.beginPath();
      ctx.moveTo(w / 2, -h / 2 + 6);
      ctx.lineTo(w / 2, h / 2 - 6);
      ctx.stroke();
      break;
    }
    case 'tomato': {
      const h = H * 0.82;
      roundRect(ctx, 0, -h / 2, w, h, 5);
      ctx.fillStyle = COLORS.tomato;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#b8302a';
      ctx.stroke();
      ctx.fillStyle = '#ffd36b';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(w / 2, -h / 2 + 14 + i * (h - 28) / 3, 2, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'egg': {
      const h = H * 0.86;
      roundRect(ctx, 0, -h / 2, w, h, 7);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#e8dfc0';
      ctx.stroke();
      roundRect(ctx, 3, -h / 4, w - 6, h / 2, 5);
      ctx.fillStyle = '#ffcf33';
      ctx.fill();
      break;
    }
    case 'bacon': {
      const h = H * 0.98;
      wavy(ctx, 0, -h / 2, w, h, 2, p.seed, 1.1);
      ctx.fillStyle = COLORS.bacon;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#8f3a2b';
      ctx.stroke();
      ctx.strokeStyle = '#f3c9b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w / 2, -h / 2 + 4);
      ctx.lineTo(w / 2, h / 2 - 4);
      ctx.stroke();
      break;
    }
    case 'cucumber': {
      const h = H * 0.8;
      roundRect(ctx, 0, -h / 2, w, h, 4);
      ctx.fillStyle = COLORS.cucumber;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#3f7d22';
      ctx.stroke();
      break;
    }
    case 'cheese': {
      const h = H * 1.03;
      ctx.beginPath();
      ctx.rect(0, -h / 2, w, h);
      ctx.fillStyle = COLORS.cheese;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#e3a919';
      ctx.stroke();
      break;
    }
  }
}
