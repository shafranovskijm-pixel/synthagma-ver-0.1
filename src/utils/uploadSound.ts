/**
 * Synthesize a short pleasant "ding" sound using Web Audio API.
 * No external file required. Respects user mute preference (localStorage).
 */
const MUTE_KEY = "uploads:soundMuted";

export const isUploadSoundMuted = (): boolean => {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
};

export const setUploadSoundMuted = (muted: boolean) => {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
};

export const playUploadCompleteSound = (variant: "success" | "error" = "success") => {
  if (isUploadSoundMuted()) return;
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx: AudioContext = new AudioCtx();

    const now = ctx.currentTime;
    const notes =
      variant === "success"
        ? [
            { freq: 880, t: 0, dur: 0.15 },
            { freq: 1320, t: 0.12, dur: 0.22 },
          ]
        : [
            { freq: 320, t: 0, dur: 0.18 },
            { freq: 240, t: 0.16, dur: 0.25 },
          ];

    notes.forEach(({ freq, t, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + t);
      gain.gain.linearRampToValueAtTime(0.18, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + dur + 0.05);
    });

    setTimeout(() => ctx.close().catch(() => {}), 700);
  } catch {
    /* ignore audio errors */
  }
};
