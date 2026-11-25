/**
 * Lightweight Web Audio synthesizer for crisp educational game & flashcard feedback.
 * Gracefully no-ops when muted or when AudioContext is unavailable.
 */

let sharedAudioCtx: AudioContext | null = null;
let isMuted = false;

function getAudioContext(): AudioContext | null {
  if (isMuted || typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {
      // ignore autoplay restriction before first gesture
    });
  }
  return sharedAudioCtx;
}

export function setSoundMuted(muted: boolean): void {
  isMuted = muted;
}

export function getSoundMuted(): boolean {
  return isMuted;
}

function playTone(
  freq: number,
  durationSec: number,
  type: OscillatorType = 'sine',
  gainPeak = 0.08,
  delaySec = 0
): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime + delaySec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationSec + 0.02);
}

export function playFlipSound(): void {
  playTone(460, 0.08, 'triangle', 0.05, 0);
  playTone(620, 0.07, 'sine', 0.04, 0.03);
}

export function playCorrectSound(combo = 1): void {
  const semitoneBoost = Math.min(combo - 1, 6) * 35;
  playTone(523.25 + semitoneBoost, 0.12, 'triangle', 0.08, 0);
  playTone(659.25 + semitoneBoost, 0.16, 'triangle', 0.09, 0.07);
}

export function playWrongSound(): void {
  playTone(210, 0.16, 'sawtooth', 0.05, 0);
  playTone(165, 0.2, 'sawtooth', 0.05, 0.09);
}

export function playTickSound(): void {
  playTone(880, 0.04, 'sine', 0.035, 0);
}

export function playVictorySound(): void {
  playTone(523.25, 0.14, 'triangle', 0.08, 0);
  playTone(659.25, 0.14, 'triangle', 0.08, 0.09);
  playTone(783.99, 0.16, 'triangle', 0.09, 0.18);
  playTone(1046.5, 0.32, 'triangle', 0.1, 0.27);
}
