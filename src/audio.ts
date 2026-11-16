// 効果音はすべて Web Audio で合成する（音声ファイル不要）

let ctx: AudioContext | null = null;
let muted = false;

export function initAudio() {
  // iPhone はマナーモードだと Web の音を消すので、ゲーム音として鳴らすよう指定する
  // （Safari 16.4 以降。消したいときはゲーム内のミュートボタンを使う）
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (nav.audioSession) {
    try {
      nav.audioSession.type = 'playback';
    } catch {
      /* 対応していなければそのまま */
    }
  }
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

export function setMuted(m: boolean) {
  muted = m;
}

export function isMuted() {
  return muted;
}

function ready(): AudioContext | null {
  if (!ctx || muted) return null;
  return ctx;
}

function noise(ac: AudioContext, dur: number): AudioBufferSourceNode {
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  return src;
}

function tone(ac: AudioContext, type: OscillatorType, f0: number, f1: number, t0: number, dur: number, vol: number) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ac.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

/** スパッ！ */
export function sfxSlice() {
  const ac = ready();
  if (!ac) return;
  const t = ac.currentTime;
  const n = noise(ac, 0.14);
  const hp = ac.createBiquadFilter();
  hp.type = 'bandpass';
  hp.frequency.setValueAtTime(7000, t);
  hp.frequency.exponentialRampToValueAtTime(2500, t + 0.12);
  hp.Q.value = 1.2;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.7, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
  n.connect(hp).connect(g).connect(ac.destination);
  n.start(t);
  tone(ac, 'triangle', 2600, 1400, t, 0.09, 0.12);
}

/** グチャッ… */
export function sfxSquish() {
  const ac = ready();
  if (!ac) return;
  const t = ac.currentTime;
  const n = noise(ac, 0.5);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(150, t + 0.45);
  lp.Q.value = 8;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.9, t + 0.02);
  // ぶよぶよ揺らす
  for (let i = 1; i < 8; i++) {
    g.gain.linearRampToValueAtTime(i % 2 ? 0.25 : 0.7, t + i * 0.05);
  }
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  n.connect(lp).connect(g).connect(ac.destination);
  n.start(t);
  tone(ac, 'sine', 220, 50, t, 0.35, 0.35);
}

export function sfxClear(combo: number) {
  const ac = ready();
  if (!ac) return;
  const t = ac.currentTime;
  const base = 660 * Math.pow(1.06, Math.min(combo, 12));
  tone(ac, 'square', base, base, t, 0.07, 0.06);
  tone(ac, 'square', base * 1.5, base * 1.5, t + 0.07, 0.1, 0.06);
}

export function sfxGameOver() {
  const ac = ready();
  if (!ac) return;
  const t = ac.currentTime;
  [440, 370, 311, 220].forEach((f, i) => tone(ac, 'sawtooth', f, f * 0.97, t + i * 0.18, 0.22, 0.08));
}
