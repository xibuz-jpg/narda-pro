/**
 * Tiny procedural sound effects via the Web Audio API — no asset files, so they
 * stay bundle-free and work offline (and inside Telegram). All sounds are
 * synthesized on the fly; a shared, lazily-created AudioContext is resumed on
 * first use (browsers start it suspended until a user gesture).
 */

let ctx: AudioContext | null = null;
let muted = false;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

/** One sharp bone/wood clack — a filtered noise transient with a short body. */
function clack(ac: AudioContext, at: number, gain: number, freq: number): void {
  const dur = 0.07;
  const frames = Math.floor(ac.sampleRate * dur);
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    const t = i / frames;
    data[i] = (Math.random() * 2 - 1) * Math.exp(-24 * t);
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 1.3;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, at);
  src.connect(bp).connect(g).connect(ac.destination);
  src.start(at);
  src.stop(at + dur);
}

/**
 * Two dice being shaken and thrown: a quick flurry of clacks (the shake in the
 * hand / tumble) resolving into two firmer landing knocks on the board.
 */
export function playDiceSound(): void {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const now = ac.currentTime;
  // Shake/tumble — several light clacks close together.
  const shakes = [0, 0.035, 0.07, 0.105, 0.15, 0.2];
  for (const t of shakes) {
    clack(ac, now + t, 0.1 + Math.random() * 0.06, 1600 + Math.random() * 1600);
  }
  // Two dice landing.
  clack(ac, now + 0.32, 0.3, 1400 + Math.random() * 600);
  clack(ac, now + 0.4, 0.24, 1700 + Math.random() * 600);
}

/** A crisp wooden "tock" — a checker knocked down onto the board. */
export function playCheckerSound(): void {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const now = ac.currentTime;

  // Bright click transient.
  clack(ac, now, 0.22, 2600);

  // Low wooden thump under it for body.
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(230, now);
  osc.frequency.exponentialRampToValueAtTime(95, now + 0.08);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.2, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.13);
}
