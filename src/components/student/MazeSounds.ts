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

/* ─── Background music (Doom-style synth loop) ─── */
export function playBGMusic() {
  if (muted || bgMusicNodes) return;
  const ctx = getCtx();
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.12;
  masterGain.connect(ctx.destination);

  const oscs: OscillatorNode[] = [];

  const bassOsc = ctx.createOscillator();
  bassOsc.type = "sawtooth";
  const bassGain = ctx.createGain();
  bassGain.gain.value = 0.5;

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 4;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 15;
  lfo.connect(lfoGain);
  lfoGain.connect(bassOsc.frequency);

  const bassNotes = [82.4, 98, 110, 123.5, 82.4, 98, 82.4, 73.4];
  const beatDuration = 0.25;
  const patternDuration = bassNotes.length * beatDuration;

  function scheduleBass() {
    const now = ctx.currentTime;
    for (let rep = 0; rep < 200; rep++) {
      const repStart = now + rep * patternDuration;
      bassNotes.forEach((freq, i) => {
        bassOsc.frequency.setValueAtTime(freq, repStart + i * beatDuration);
      });
    }
  }

  bassOsc.connect(bassGain);
  bassGain.connect(masterGain);
  scheduleBass();
  bassOsc.start();
  lfo.start();
  oscs.push(bassOsc, lfo);

  const kickInterval = setInterval(() => {
    if (muted || !bgMusicNodes) { clearInterval(kickInterval); return; }
    const kOsc = ctx.createOscillator();
    kOsc.type = "sine";
    kOsc.frequency.setValueAtTime(150, ctx.currentTime);
    kOsc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.1);
    const kGain = ctx.createGain();
    kGain.gain.setValueAtTime(0.4, ctx.currentTime);
    kGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    kOsc.connect(kGain).connect(masterGain);
    kOsc.start();
    kOsc.stop(ctx.currentTime + 0.15);
  }, 500);

  bgMusicNodes = { osc: oscs, gain: masterGain, _kickInterval: kickInterval };
}

export function stopBGMusic() {
  if (!bgMusicNodes) return;
  try {
    bgMusicNodes.osc.forEach(o => { try { o.stop(); } catch {} });
    bgMusicNodes.gain.disconnect();
    if (bgMusicNodes._kickInterval) clearInterval(bgMusicNodes._kickInterval);
  } catch {}
  bgMusicNodes = null;
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
