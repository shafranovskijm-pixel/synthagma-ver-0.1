// Programmatic sound effects using Web Audio API — no external files needed

let audioCtx: AudioContext | null = null;
let muted = false;
let bgMusicNodes: { osc: OscillatorNode[]; gain: GainNode } | null = null;

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

  // Bass line — E minor pentatonic riff, looping
  const bassOsc = ctx.createOscillator();
  bassOsc.type = "sawtooth";
  const bassGain = ctx.createGain();
  bassGain.gain.value = 0.5;

  // LFO for wobble
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 4;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 15;
  lfo.connect(lfoGain);
  lfoGain.connect(bassOsc.frequency);

  // Bass note pattern: E2, G2, A2, B2 repeating
  const bassNotes = [82.4, 98, 110, 123.5, 82.4, 98, 82.4, 73.4];
  const beatDuration = 0.25; // 120 BPM = 0.5s per beat, 0.25 per eighth note
  const patternDuration = bassNotes.length * beatDuration;

  // Schedule bass pattern repeating
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

  // Kick drum simulation — periodic noise bursts
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

  bgMusicNodes = { osc: oscs, gain: masterGain };
  // Store interval for cleanup
  (bgMusicNodes as any)._kickInterval = kickInterval;
}

export function stopBGMusic() {
  if (!bgMusicNodes) return;
  try {
    bgMusicNodes.osc.forEach(o => { try { o.stop(); } catch {} });
    bgMusicNodes.gain.disconnect();
    if ((bgMusicNodes as any)._kickInterval) clearInterval((bgMusicNodes as any)._kickInterval);
  } catch {}
  bgMusicNodes = null;
}

/* ─── Weapon-specific shoot sounds ─── */
export function playShoot(weapon: number = 1) {
  if (muted) return;
  const ctx = getCtx();

  if (weapon === 0) {
    // Fist — low thud
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
  } else if (weapon === 1) {
    // Pistol — sharp noise burst
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx, 0.12, 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
    src.connect(g).connect(ctx.destination);
    src.start();
  } else {
    // Rocket launcher — long explosion
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx, 0.4, 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(100, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.3);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.25, ctx.currentTime);
    og.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    src.connect(g).connect(ctx.destination);
    osc.connect(og).connect(ctx.destination);
    src.start();
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  }
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
