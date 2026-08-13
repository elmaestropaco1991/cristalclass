export type ActionSoundKind = "positive" | "negative";
export type ActionSoundLoadingState = "idle" | "loading" | "ready" | "failed";

export const ACTION_SOUND_URLS: Record<ActionSoundKind, string> = {
  positive: "/sounds/action-positive.wav",
  negative: "/sounds/action-negative.mp3",
};

const DEFERRED_PLAYBACK_WINDOW_MS = 700;
const INTERRUPT_FADE_SECONDS = 0.035;
const MIN_GAIN = 0.0001;

type AudioGraph = {
  compressor: DynamicsCompressorNode;
  master: GainNode;
};

type ActivePlayback = {
  gain: GainNode;
  source: AudioBufferSourceNode;
};

let audioGraph: AudioGraph | null = null;
let activePlayback: ActivePlayback | null = null;
const actionSoundBuffers = createActionSoundLoadCache<AudioBuffer>();
const getReusableAudioContext = createReusableInstance(createBrowserAudioContext);

export function getActionSoundKind(points: number): ActionSoundKind | null {
  if (points > 0) return "positive";
  if (points < 0) return "negative";
  return null;
}

export function getActionSoundUrl(points: number): string | null {
  const soundKind = getActionSoundKind(points);
  return soundKind ? ACTION_SOUND_URLS[soundKind] : null;
}

export function shouldRequestActionSound(
  points: number,
  soundEnabled: boolean,
  wasCommitted: boolean
): boolean {
  return soundEnabled && wasCommitted && getActionSoundKind(points) !== null;
}

/** Starts loading local files without producing audible audio. */
export function preloadActionSounds(): void {
  const context = getAudioContext();
  if (!context) return;

  void loadActionSoundBuffer(context, "positive");
  void loadActionSoundBuffer(context, "negative");
}

/** Unlocks the singleton Web Audio context during a direct user gesture without emitting sound. */
export function prepareActionAudio(): void {
  const context = getAudioContext();
  if (!context) return;

  try {
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    preloadActionSounds();
  } catch {
    // Audio is intentionally best-effort and never affects action persistence.
  }
}

export function playActionSound(points: number): void {
  const soundKind = getActionSoundKind(points);
  const context = getAudioContext();
  if (!soundKind || !context) return;

  const requestedAt = Date.now();
  void loadActionSoundBuffer(context, soundKind).then((buffer) => {
    if (!buffer || Date.now() - requestedAt > DEFERRED_PLAYBACK_WINDOW_MS) return;

    try {
      playDecodedSound(context, buffer);
    } catch {
      // Audio is intentionally best-effort and never affects action persistence.
    }
  });
}

export function playPositiveActionSound(): void {
  playActionSound(1);
}

export function playNegativeActionSound(): void {
  playActionSound(-1);
}

export function getActionSoundLoadingState(kind: ActionSoundKind): ActionSoundLoadingState {
  return actionSoundBuffers.getState(kind);
}

/** Documents the explicit removal of audible synthesized fallback sounds. */
export function usesSynthesizedActionSound(): false {
  return false;
}

export function createReusableInstance<T>(create: () => T): () => T {
  let initialized = false;
  let instance: T;

  return () => {
    if (!initialized) {
      instance = create();
      initialized = true;
    }
    return instance;
  };
}

export function createActionSoundLoadCache<T>() {
  const loads = new Map<ActionSoundKind, Promise<T | null>>();
  const states = new Map<ActionSoundKind, ActionSoundLoadingState>();

  return {
    getState(kind: ActionSoundKind): ActionSoundLoadingState {
      return states.get(kind) ?? "idle";
    },
    load(kind: ActionSoundKind, load: () => Promise<T>): Promise<T | null> {
      const existingLoad = loads.get(kind);
      if (existingLoad) return existingLoad;

      states.set(kind, "loading");
      const pendingLoad = Promise.resolve()
        .then(load)
        .then((value) => {
          states.set(kind, "ready");
          return value;
        })
        .catch(() => {
          states.set(kind, "failed");
          return null;
        });
      loads.set(kind, pendingLoad);
      return pendingLoad;
    },
  };
}

function getAudioContext(): AudioContext | null {
  return getReusableAudioContext();
}

function createBrowserAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AudioContextConstructor = window.AudioContext;
    return AudioContextConstructor ? new AudioContextConstructor() : null;
  } catch {
    return null;
  }
}

function loadActionSoundBuffer(
  context: AudioContext,
  kind: ActionSoundKind
): Promise<AudioBuffer | null> {
  return actionSoundBuffers.load(kind, async () => {
    const response = await fetch(ACTION_SOUND_URLS[kind]);
    if (!response.ok) throw new Error("Unable to load action sound.");
    return context.decodeAudioData(await response.arrayBuffer());
  });
}

function getAudioGraph(context: AudioContext): AudioGraph {
  if (audioGraph) return audioGraph;

  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  master.gain.value = 0.9;
  compressor.threshold.value = -12;
  compressor.knee.value = 12;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.12;
  master.connect(compressor);
  compressor.connect(context.destination);
  audioGraph = { compressor, master };
  return audioGraph;
}

function playDecodedSound(context: AudioContext, buffer: AudioBuffer): void {
  const graph = getAudioGraph(context);
  stopCurrentPlayback(context);

  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  gain.gain.value = 1;
  source.connect(gain);
  gain.connect(graph.master);

  const playback = { gain, source };
  activePlayback = playback;
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
    if (activePlayback === playback) activePlayback = null;
  };
  source.start();
}

function stopCurrentPlayback(context: AudioContext): void {
  const playback = activePlayback;
  if (!playback) return;

  const fadeEnd = context.currentTime + INTERRUPT_FADE_SECONDS;
  activePlayback = null;
  playback.gain.gain.cancelScheduledValues(context.currentTime);
  playback.gain.gain.setValueAtTime(Math.max(playback.gain.gain.value, MIN_GAIN), context.currentTime);
  playback.gain.gain.exponentialRampToValueAtTime(MIN_GAIN, fadeEnd);

  try {
    playback.source.stop(fadeEnd + 0.005);
  } catch {
    // The previous source may have ended between action requests.
  }
}
