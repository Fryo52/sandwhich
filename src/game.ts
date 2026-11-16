import { BREAD_H, COLORS, GAP, drawPiece, generateSet, type Cut, type SetData } from './sandwich';
import { sfxClear, sfxGameOver, sfxSlice, sfxSquish } from './audio';

type Phase = 'enter' | 'active' | 'clear' | 'fail';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  max: number;
  rot: number;
  vr: number;
  blob: boolean;
}

interface Popup {
  text: string;
  x: number;
  y: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

interface Layout {
  scale: number;
  ox: number;
  cy: number;
}

export interface GameResult {
  score: number;
  sets: number;
  maxCombo: number;
}

export const START_LIVES = 5;
const ENTER_T = 0.28;
const CLEAR_T = 0.5;
const FAIL_T = 0.85;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function comboMultiplier(combo: number): number {
  return Math.min(3, 1 + Math.floor((combo - 1) / 5) * 0.5);
}

export class Game {
  private ctx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private dpr = 1;

  running = false;
  score = 0;
  lives = START_LIVES;
  combo = 0;
  maxCombo = 0;
  level = 0; // 正解したセット数

  private set: SetData | null = null;
  private phase: Phase = 'enter';
  private phaseT = 0;
  private timeLimit = 5;
  private timeLeft = 5;

  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private slashes: { x: number; life: number }[] = [];
  private trail: { x: number; y: number; t: number }[] = [];
  private stroke: { pts: { x: number; y: number }[]; used: boolean } | null = null;
  private shake = 0;
  private flash = 0;
  private last = 0;

  onGameOver?: (r: GameResult) => void;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d not supported');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindInput();
    requestAnimationFrame((t) => this.loop(t));
  }

  start() {
    this.score = 0;
    this.lives = START_LIVES;
    this.combo = 0;
    this.maxCombo = 0;
    this.level = 0;
    this.particles = [];
    this.popups = [];
    this.slashes = [];
    this.running = true;
    this.nextSet();
  }

  // ---------- 基本 ----------

  private resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
  }

  private loop(t: number) {
    const dt = Math.min(0.05, (t - this.last) / 1000 || 0);
    this.last = t;
    this.update(dt);
    this.draw();
    requestAnimationFrame((tt) => this.loop(tt));
  }

  private nextSet() {
    // パンが画面上で約22px以上になる幅に収める（PCなど広い画面では最大900）
    this.set = generateSet(this.level, Math.min(900, (this.W - 32) / 0.8));
    const cuts = this.set.cuts.length;
    this.timeLimit = Math.max(2.2, 5 - this.level * 0.1) + 0.45 * (cuts - 1);
    this.timeLeft = this.timeLimit;
    this.phase = 'enter';
    this.phaseT = 0;
  }

  private layout(): Layout {
    const s = this.set!;
    const total = s.width + s.cuts.length * GAP;
    const scale = Math.min(2.4, (this.W - 32) / total, (this.H * 0.36) / BREAD_H);
    const open = s.cuts.reduce((a, c) => a + c.open, 0);
    const ox = (this.W - (s.width + open) * scale) / 2;
    return { scale, ox, cy: this.H * 0.5 };
  }

  private cutScreenX(c: Cut, L: Layout): number {
    return L.ox + (c.x + this.set!.pieces[c.ref].off) * L.scale;
  }

  // ---------- 入力 ----------

  private pos(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private bindInput() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      const p = this.pos(e);
      this.stroke = { pts: [p], used: false };
      this.trail.push({ ...p, t: performance.now() });
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.stroke) return;
      const p = this.pos(e);
      this.stroke.pts.push(p);
      this.trail.push({ ...p, t: performance.now() });
      this.checkStroke();
    });
    const end = () => {
      if (this.stroke) this.checkStroke();
      this.stroke = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  /** 縦方向にサンドイッチを横切ったストロークを「切る」操作として扱う */
  private checkStroke() {
    const st = this.stroke;
    if (!st || st.used || !this.running || !this.set || this.phase !== 'active') return;
    const L = this.layout();
    const h = BREAD_H * L.scale;
    let minY = Infinity, maxY = -Infinity;
    for (const p of st.pts) {
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    if (!(minY <= L.cy - h * 0.15 && maxY >= L.cy + h * 0.15)) return;
    st.used = true;

    // 傾きはサンドイッチの高さの範囲内だけで測る（その外でマウスが流れても気にしない）
    // 縦から約60°まで傾いていても「切る」として扱う
    let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
    for (const p of st.pts) {
      if (Math.abs(p.y - L.cy) > h / 2) continue;
      bx0 = Math.min(bx0, p.x);
      bx1 = Math.max(bx1, p.x);
      by0 = Math.min(by0, p.y);
      by1 = Math.max(by1, p.y);
    }
    if (bx1 >= bx0 && bx1 - bx0 > (by1 - by0) * 1.7 + 8) return; // ほぼ横向きのものだけ無視

    // ストロークがサンドイッチの中央線を横切った位置で判定する（斜めでもここが切った場所）
    let x = bx1 >= bx0 ? (bx0 + bx1) / 2 : st.pts[st.pts.length - 1].x;
    for (let i = 1; i < st.pts.length; i++) {
      const a = st.pts[i - 1], b = st.pts[i];
      if ((a.y - L.cy) * (b.y - L.cy) <= 0 && a.y !== b.y) {
        x = a.x + ((L.cy - a.y) / (b.y - a.y)) * (b.x - a.x);
        break;
      }
    }
    this.handleCut(x, L);
  }

  private handleCut(x: number, L: Layout) {
    const s = this.set!;
    const open = s.cuts.reduce((a, c) => a + c.open, 0);
    const left = L.ox, right = L.ox + (s.width + open) * L.scale;
    if (x < left - 8 || x > right + 8) return; // サンドイッチの外は無視

    let best: Cut | null = null;
    let bestD = Infinity;
    for (const c of s.cuts) {
      const d = Math.abs(this.cutScreenX(c, L) - x);
      if (c.done) {
        if (d < Math.max(14, (GAP / 2) * L.scale)) return; // もう切った所はノーカウント
        continue;
      }
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    const tol = best ? Math.max(10, (best.hidden ? 11 : 9) * L.scale) : 0;
    if (best && bestD <= tol) this.success(best, L);
    else this.fail('miss', x, L);
  }

  // ---------- 判定 ----------

  private success(c: Cut, L: Layout) {
    const s = this.set!;
    const x = this.cutScreenX(c, L);
    c.done = true;
    if (c.hidden) {
      const p = s.pieces[c.ref];
      p.falling = true;
      p.vy = -250;
      p.vr = rand(-6, 6);
    }
    sfxSlice();
    this.slashes.push({ x, life: 0.25 });
    for (let i = 0; i < 14; i++) {
      this.particles.push({
        x, y: L.cy + rand(-1, 1) * BREAD_H * L.scale * 0.4,
        vx: rand(-220, 220), vy: rand(-300, 50),
        size: rand(2, 4), color: i % 3 ? COLORS.bread : '#c98a3c',
        life: 0.6, max: 0.6, rot: 0, vr: 0, blob: false,
      });
    }
    this.popup('スパッ', x, L.cy - BREAD_H * L.scale * 0.6 - 10, '#3b2f25', 18);

    if (s.cuts.every((cc) => cc.done)) this.clearSet(L);
  }

  private clearSet(L: Layout) {
    this.level++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const mult = comboMultiplier(this.combo);
    const speed = Math.round((50 * this.timeLeft) / this.timeLimit);
    const gained = Math.round(100 * mult) + speed;
    this.score += gained;
    sfxClear(this.combo);
    this.popup(`+${gained}`, this.W / 2, L.cy + BREAD_H * L.scale * 0.5 + 56, '#e0702b', 30);
    this.phase = 'clear';
    this.phaseT = 0;
  }

  private fail(reason: 'miss' | 'timeout', x: number, L: Layout) {
    const s = this.set!;
    this.combo = 0;
    this.lives--;
    sfxSquish();
    this.shake = 14;
    this.flash = 0.35;
    const kinds = s.pieces.filter((p) => !p.isBread).map((p) => p.kind);
    const colors = kinds.length ? kinds.map((k) => COLORS[k]) : [COLORS.ham];
    colors.push('#fffbe8', '#e8483a'); // マヨとケチャップ
    for (let i = 0; i < 40; i++) {
      this.particles.push({
        x: x + rand(-20, 20), y: L.cy + rand(-30, 30),
        vx: rand(-450, 450), vy: rand(-700, -100),
        size: rand(6, 16), color: colors[i % colors.length],
        life: 1.4, max: 1.4, rot: rand(0, 6), vr: rand(-8, 8), blob: true,
      });
    }
    this.popup(reason === 'timeout' ? '時間切れ！' : 'グチャッ…', this.W / 2, L.cy - BREAD_H * L.scale * 0.6 - 30, '#d1372b', 32);
    this.phase = 'fail';
    this.phaseT = 0;
  }

  private popup(text: string, x: number, y: number, color: string, size: number) {
    this.popups.push({ text, x, y, life: 0.8, max: 0.8, color, size });
  }

  // ---------- 更新 ----------

  private update(dt: number) {
    for (const p of this.particles) {
      p.vy += 1500 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0 && p.y < this.H + 50);
    for (const p of this.popups) {
      p.y -= 40 * dt;
      p.life -= dt;
    }
    this.popups = this.popups.filter((p) => p.life > 0);
    for (const s of this.slashes) s.life -= dt;
    this.slashes = this.slashes.filter((s) => s.life > 0);
    const now = performance.now();
    this.trail = this.trail.filter((p) => now - p.t < 120);
    this.shake = Math.max(0, this.shake - 60 * dt);
    this.flash = Math.max(0, this.flash - dt);

    if (!this.running || !this.set) return;
    const s = this.set;
    for (const c of s.cuts) if (c.done) c.open += (GAP - c.open) * Math.min(1, dt * 18);
    s.pieces.forEach((p, i) => {
      p.off = s.cuts.reduce((a, c) => (c.right <= i ? a + c.open : a), 0);
      if (p.falling) {
        p.vy += 1500 * dt;
        p.dy += p.vy * dt;
        p.rot += p.vr * dt;
      }
    });

    this.phaseT += dt;
    switch (this.phase) {
      case 'enter':
        if (this.phaseT >= ENTER_T) {
          this.phase = 'active';
          this.phaseT = 0;
        }
        break;
      case 'active':
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
          this.timeLeft = 0;
          this.fail('timeout', this.W / 2, this.layout());
        }
        break;
      case 'clear':
        if (this.phaseT >= CLEAR_T) this.nextSet();
        break;
      case 'fail':
        if (this.phaseT >= FAIL_T) {
          if (this.lives <= 0) this.gameOver();
          else this.nextSet();
        }
        break;
    }
  }

  private gameOver() {
    this.running = false;
    this.set = null;
    sfxGameOver();
    this.onGameOver?.({ score: this.score, sets: this.level, maxCombo: this.maxCombo });
  }

  // ---------- 描画 ----------

  private draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(0, 0, this.W, this.H);

    ctx.save();
    if (this.shake > 0) ctx.translate(rand(-1, 1) * this.shake, rand(-1, 1) * this.shake);

    if (this.set) this.drawSet();

    for (const p of this.particles) {
      ctx.globalAlpha = Math.min(1, p.life / p.max * 2);
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.blob) {
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    if (this.set) {
      const L = this.layout();
      const h = BREAD_H * L.scale;
      for (const s of this.slashes) {
        ctx.globalAlpha = s.life / 0.25;
        ctx.strokeStyle = '#3b2f25';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(s.x + 6, L.cy - h * 0.85);
        ctx.lineTo(s.x - 6, L.cy + h * 0.85);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    for (const p of this.popups) {
      ctx.globalAlpha = Math.min(1, (p.life / p.max) * 2);
      ctx.fillStyle = p.color;
      ctx.font = `bold ${p.size}px "Hiragino Maru Gothic ProN", "Yu Gothic UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;

    if (this.trail.length > 1) {
      ctx.strokeStyle = 'rgba(59,47,37,0.45)';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      this.trail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }

    if (this.running) this.drawHud();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(209,55,43,${this.flash * 0.5})`;
      ctx.fillRect(0, 0, this.W, this.H);
    }
  }

  private drawSet() {
    const ctx = this.ctx;
    const s = this.set!;
    const L = this.layout();
    let sx = 0, sy = 0, alpha = 1;
    if (this.phase === 'enter') sx = (1 - easeOut(Math.min(1, this.phaseT / ENTER_T))) * this.W;
    if (this.phase === 'clear') sx = -easeIn(Math.min(1, Math.max(0, this.phaseT - 0.15) / (CLEAR_T - 0.15))) * this.W * 1.2;
    if (this.phase === 'fail') {
      sy = 0.5 * 1600 * this.phaseT * this.phaseT;
      alpha = Math.max(0, 1 - this.phaseT / FAIL_T);
    }
    ctx.globalAlpha = alpha;
    // パン（幅の広いもの）を先に描き、具材をその上に重ねる
    const order = s.pieces.map((_, i) => i).sort((a, b) => Number(s.pieces[b].w >= 28) - Number(s.pieces[a].w >= 28));
    for (const i of order) {
      const p = s.pieces[i];
      const x = L.ox + sx + (p.x + p.off) * L.scale;
      ctx.save();
      ctx.translate(x + (p.w * L.scale) / 2, L.cy + sy + p.dy);
      ctx.rotate(p.rot);
      ctx.scale(L.scale, L.scale);
      ctx.translate(-p.w / 2, 0);
      drawPiece(ctx, p);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // 制限時間バー
    if (this.phase === 'active' || this.phase === 'enter') {
      const bw = Math.min(320, this.W * 0.7);
      const bx = (this.W - bw) / 2;
      const by = L.cy + (BREAD_H * L.scale) / 2 + 24;
      const r = this.timeLeft / this.timeLimit;
      ctx.fillStyle = '#ecdcc4';
      ctx.fillRect(bx, by, bw, 8);
      ctx.fillStyle = r < 0.3 ? '#d1372b' : '#e0702b';
      ctx.fillRect(bx, by, bw * r, 8);
    }
  }

  private drawHud() {
    const ctx = this.ctx;
    const font = (size: number) => `bold ${size}px "Hiragino Maru Gothic ProN", "Yu Gothic UI", sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#3b2f25';
    ctx.textAlign = 'left';
    ctx.font = font(26);
    ctx.fillText(String(this.score), 16, 16);
    ctx.font = font(13);
    ctx.fillStyle = '#8a7a6a';
    ctx.fillText(`SET ${this.level + 1}`, 16, 48);

    ctx.font = font(22);
    const hw = ctx.measureText('♥').width;
    const hx = this.W - 16 - hw * START_LIVES;
    for (let i = 0; i < START_LIVES; i++) {
      ctx.fillStyle = i < this.lives ? '#e8483a' : '#ecdcc4';
      ctx.fillText('♥', hx + hw * i, 16);
    }

    if (this.combo >= 2) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e0702b';
      ctx.font = font(18);
      ctx.fillText(`${this.combo} COMBO ×${comboMultiplier(this.combo + 1)}`, this.W / 2, 64);
    }
  }
}
