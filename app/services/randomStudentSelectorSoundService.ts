export type RandomSelectorSoundKind = "tick" | "selected";

type ActiveTone = {
  oscillator: OscillatorNode;
  gain: GainNode;
};

let audioContext: AudioContext | null = null;
const activeTones = new Set<ActiveTone>();

export function shouldPlayRandomSelectorSound(
  soundEnabled: boolean,
  interactionStarted: boolean
): boolean {
  return soundEnabled && interactionStarted;
}

/** Unlocks Web Audio from the direct teacher gesture without emitting a tone. */
export function prepareRandomSelectorAudio(soundEnabled: boolean): void {
  if (!soundEnabled) return;
  const context = getAudioContext();
  if (!context) return;
  if (context.state === "suspended") void context.resume().catch(() => undefined);
}

export function playRandomSelectorSound(
  kind: RandomSelectorSoundKind,
  soundEnabled: boolean,
  progress = 0
): void {
  if (!shouldPlayRandomSelectorSound(soundEnabled, true)) return;
  const context = getAudioContext();
  if (!context || context.state === "suspended") return;

  try {
    if (kind === "selected") {
      playTone(context, 659.25, 0.16, 0.045, 0);
      playTone(context, 880, 0.24, 0.035, 0.06);
      return;
    }

    const boundedProgress = Math.min(Math.max(progress, 0), 1);
    playTone(context, 470 + boundedProgress * 190, 0.055, 0.018, 0);
  } catch {
    // Selector audio is decorative and never changes the selected student.
  }
}

export function stopRandomSelectorSounds(): void {
  for (const tone of activeTones) {
    try {
      tone.oscillator.stop();
    } catch {
      // A short tone may already have finished.
    }
    tone.oscillator.disconnect();
    tone.gain.disconnect();
  }
  activeTones.clear();
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioContext) return audioContext;

  try {
    audioContext = new window.AudioContext();
    return audioContext;
  } catch {
    return null;
  }
}

function playTone(
  context: AudioContext,
  frequency: number,
  duration: number,
  volume: number,
  delay: number
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const startAt = context.currentTime + delay;
  const stopAt = startAt + duration;
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
  oscillator.connect(gain);
  gain.connect(context.destination);

  const tone = { oscillator, gain };
  activeTones.add(tone);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
    activeTones.delete(tone);
  };
  oscillator.start(startAt);
  oscillator.stop(stopAt + 0.01);
}
