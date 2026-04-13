// Sound effects using uploaded MP3 files + Web Audio API fallbacks

let muted = false;
let bgMusicNodes: { osc: OscillatorNode[]; gain: GainNode; _kickInterval?: ReturnType<typeof setInterval> } | null = null;
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

export function setMuted(m: boolean) {
  muted = m;
  if (m) stopBGMusic();
}
export function isMuted() { return muted; }

function noise(ctx: AudioContext, duration: number, gain: number) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * gain;
  return buf;
}

/* ─── Background music — disabled ─── */
export function playBGMusic() {
  // No background music
}

export function stopBGMusic() {
  // No background music to stop
}

/* ─── MP3-based shoot sounds ─── */
export function playShoot(weapon: number = 1) {
  if (muted) return;

  if (weapon === 0) {
    // Fist — synth thud
    const ctx = getCtx();
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx, 0.08, 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 300;
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start();
  } else {
    // Pistol & Rocket — use uploaded MP3
    const audio = new Audio("/sounds/shoot.mp3");
    audio.volume = weapon === 2 ? 0.7 : 0.5;
    if (weapon === 2) {
      audio.playbackRate = 0.6; // deeper for rocket
    }
    audio.play().catch(() => {});
  }
}

/* ─── Pickup sound ─── */
export function playPickup() {
  if (muted) return;
  const audio = new Audio("/sounds/pickup.mp3");
  audio.volume = 0.6;
  audio.play().catch(() => {});
}

export function playHit() {
  if (muted) return;
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(200, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.3, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
  osc.connect(g).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.2);
}

export function playDamage() {
  if (muted) return;
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(400, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.35, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
  osc.connect(g).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.3);
}

export function playStep() {
  if (muted) return;
  const ctx = getCtx();
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx, 0.05, 0.15);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.08, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
  src.connect(g).connect(ctx.destination);
  src.start();
}

export function playWin() {
  if (muted) return;
  stopBGMusic();
  const ctx = getCtx();
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.15);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.3);
    osc.connect(g).connect(ctx.destination);
    osc.start(ctx.currentTime + i * 0.15);
    osc.stop(ctx.currentTime + i * 0.15 + 0.3);
  });
}

export function playGameOver() {
  if (muted) return;
  stopBGMusic();
  const ctx = getCtx();
  const notes = [400, 300, 200, 100];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.2);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.2 + 0.25);
    osc.connect(g).connect(ctx.destination);
    osc.start(ctx.currentTime + i * 0.2);
    osc.stop(ctx.currentTime + i * 0.2 + 0.25);
  });
}
