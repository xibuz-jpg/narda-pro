/**
 * Sound effects for the game. Two short recorded samples (dice roll + checker
 * move) are streamed through the Web Audio API for low-latency, overlap-safe
 * playback. The samples live in `public/sounds/` so they ship with the Mini App
 * and work offline (and inside Telegram). The AudioContext is created lazily and
 * resumed on first use (browsers start it suspended until a user gesture).
 */

const SOURCES = {
  dice: '/sounds/dice.mp3',
  checker: '/sounds/checker.mp3',
} as const;
type SoundName = keyof typeof SOURCES;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

const buffers: Partial<Record<SoundName, AudioBuffer>> = {};
const loading = new Set<SoundName>();
// The most recent checker source, so rapid moves replace rather than pile up.
let lastChecker: AudioBufferSourceNode | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);
    preload();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

async function load(name: SoundName): Promise<void> {
  if (buffers[name] || loading.has(name) || !ctx) return;
  loading.add(name);
  try {
    const res = await fetch(SOURCES[name]);
    const arr = await res.arrayBuffer();
    buffers[name] = await ctx.decodeAudioData(arr);
  } catch {
    /* leave unloaded — playback becomes a silent no-op */
  } finally {
    loading.delete(name);
  }
}

function preload(): void {
  void load('dice');
  void load('checker');
}

function play(name: SoundName, replacePrev = false): void {
  if (muted) return;
  const ac = audio();
  if (!ac || !master) return;
  const buf = buffers[name];
  if (!buf) {
    void load(name); // not decoded yet — warm it for next time
    return;
  }
  if (replacePrev && lastChecker) {
    try {
      lastChecker.stop();
    } catch {
      /* already stopped */
    }
    lastChecker = null;
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.connect(master);
  src.start();
  if (name === 'checker') {
    lastChecker = src;
    src.onended = () => {
      if (lastChecker === src) lastChecker = null;
    };
  }
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

/** Dice thrown onto the board. */
export function playDiceSound(): void {
  play('dice');
}

/** A checker set down onto the board (rapid moves replace the previous sample). */
export function playCheckerSound(): void {
  play('checker', true);
}
