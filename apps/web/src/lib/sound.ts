/**
 * Tiny procedural sound effects via the Web Audio API — no asset files, so they
 * stay bundle-free and work offline (and inside Telegram). All sounds are
 * synthesized on the fly; a shared, lazily-created AudioContext is resumed on
 * first use (browsers start it suspended until a user gesture).
 *
 * The dice/checker sounds model real wood-on-wood narda: a bright noise
 * transient (the sharp "tak") layered with a short damped resonant body (the
 * hollow wooden knock), tuned to the ~3 kHz clack of the reference set.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    // A shared master bus keeps overlapping clacks from clipping.
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
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

/**
 * One wood clack = a sharp filtered-noise transient (the surface "tak") plus a
 * short damped resonant tone (the hollow body of the die/checker). `bright`
 * biases it toward the crisp high end; `body` sets the woody resonance pitch.
 */
function woodClack(
  ac: AudioContext,
  at: number,
  gain: number,
  opts: { bright?: number; body?: number; decay?: number } = {},
): void {
  const dest = master ?? ac.destination;
  const bright = opts.bright ?? 3000;
  const body = opts.body ?? 900;
  const decay = opts.decay ?? 26;

  // 1) Noise transient — the sharp contact "tak".
  const dur = 0.06;
  const frames = Math.floor(ac.sampleRate * dur);
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    const t = i / frames;
    data[i] = (Math.random() * 2 - 1) * Math.exp(-decay * t);
  }
  const noise = ac.createBufferSource();
  noise.buffer = buffer;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = bright;
  bp.Q.value = 1.1;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(gain, at);
  noise.connect(bp).connect(ng).connect(dest);
  noise.start(at);
  noise.stop(at + dur);

  // 2) Damped resonant body — the hollow wooden knock under the transient.
  const osc = ac.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(body * 1.7, at);
  osc.frequency.exponentialRampToValueAtTime(body, at + 0.05);
  const og = ac.createGain();
  og.gain.setValueAtTime(0.0001, at);
  og.gain.exponentialRampToValueAtTime(gain * 0.5, at + 0.004);
  og.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
  osc.connect(og).connect(dest);
  osc.start(at);
  osc.stop(at + 0.1);
}

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

/**
 * Two dice thrown onto the board: a quick tumble of light clacks (the dice
 * rolling and knocking each other) that resolves into two firmer landing
 * knocks. Timing/pitch are jittered so no two rolls sound identical.
 */
export function playDiceSound(): void {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const now = ac.currentTime + 0.01;

  // Tumble — 5 clacks, accelerating then easing, bright and light.
  const tumble = [0, 0.05, 0.095, 0.135, 0.185];
  tumble.forEach((t, i) => {
    woodClack(ac, now + t + rnd(-0.008, 0.008), rnd(0.09, 0.16), {
      bright: rnd(2800, 3800),
      body: rnd(850, 1300),
      decay: 30 + i * 2,
    });
  });
  // Two dice settling onto the wood — firmer, lower, a beat apart.
  woodClack(ac, now + 0.29, rnd(0.3, 0.38), { bright: rnd(2400, 2900), body: rnd(600, 780), decay: 20 });
  woodClack(ac, now + 0.4, rnd(0.26, 0.34), { bright: rnd(2600, 3100), body: rnd(680, 850), decay: 22 });
}

/** A crisp wooden "tak" — a checker set down onto the board. */
export function playCheckerSound(): void {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  const now = ac.currentTime + 0.005;
  woodClack(ac, now, rnd(0.26, 0.34), { bright: rnd(2700, 3200), body: rnd(560, 720), decay: 22 });
}
