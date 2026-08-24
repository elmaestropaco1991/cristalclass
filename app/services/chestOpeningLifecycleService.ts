export type ChestOpeningLifecycleSnapshot = {
  transitionStarted: boolean;
  rewardRevealed: boolean;
  audioExpected: boolean;
  audioFinished: boolean;
  visualTransitionFinished: boolean;
  finished: boolean;
  cleaned: boolean;
};

export type ChestOpeningLifecycle = {
  reset(audioExpected: boolean): void;
  startVisualTransition(): boolean;
  revealReward(): boolean;
  expectAudio(): void;
  stopWaitingForAudio(): boolean;
  markAudioFinished(): boolean;
  markVisualTransitionFinished(): boolean;
  finish(): boolean;
  cleanup(): void;
  getSnapshot(): ChestOpeningLifecycleSnapshot;
};

const AUDIO_TAIL_SAFETY_PADDING_MS = 1500;
const MIN_AUDIO_TAIL_SAFETY_MS = 2500;
const MAX_AUDIO_TAIL_SAFETY_MS = 15000;

export function createChestOpeningLifecycle(
  initialAudioExpected = false
): ChestOpeningLifecycle {
  let state = createInitialState(initialAudioExpected);

  const canFinish = () => state.visualTransitionFinished
    && (!state.audioExpected || state.audioFinished);

  return {
    reset(audioExpected) {
      state = createInitialState(audioExpected);
    },
    startVisualTransition() {
      if (state.cleaned || state.transitionStarted) return false;
      state.transitionStarted = true;
      return true;
    },
    revealReward() {
      if (state.cleaned || state.rewardRevealed) return false;
      state.rewardRevealed = true;
      return true;
    },
    expectAudio() {
      if (state.cleaned || state.finished) return;
      state.audioExpected = true;
      state.audioFinished = false;
    },
    stopWaitingForAudio() {
      if (state.cleaned || state.finished) return false;
      state.audioExpected = false;
      return canFinish();
    },
    markAudioFinished() {
      if (state.cleaned || state.finished) return false;
      state.audioFinished = true;
      return canFinish();
    },
    markVisualTransitionFinished() {
      if (state.cleaned || state.finished) return false;
      state.visualTransitionFinished = true;
      return canFinish();
    },
    finish() {
      if (state.cleaned || state.finished || !canFinish()) return false;
      state.finished = true;
      return true;
    },
    cleanup() {
      state.cleaned = true;
      state.audioExpected = false;
    },
    getSnapshot() {
      return { ...state };
    },
  };
}

export function shouldEnableChestRewardControls(
  rewardRevealed: boolean,
  audiovisualFlowFinished: boolean
): boolean {
  return rewardRevealed && audiovisualFlowFinished;
}

export function getChestAudioTailSafetyTimeoutMs(
  durationSeconds: number,
  currentTimeSeconds: number
): number {
  const hasReliableTiming = Number.isFinite(durationSeconds)
    && Number.isFinite(currentTimeSeconds)
    && durationSeconds > 0
    && currentTimeSeconds >= 0;
  const remainingMs = hasReliableTiming
    ? Math.max(0, durationSeconds - currentTimeSeconds) * 1000
    : MAX_AUDIO_TAIL_SAFETY_MS - AUDIO_TAIL_SAFETY_PADDING_MS;

  return Math.min(
    MAX_AUDIO_TAIL_SAFETY_MS,
    Math.max(MIN_AUDIO_TAIL_SAFETY_MS, Math.ceil(remainingMs + AUDIO_TAIL_SAFETY_PADDING_MS))
  );
}

function createInitialState(audioExpected: boolean): ChestOpeningLifecycleSnapshot {
  return {
    transitionStarted: false,
    rewardRevealed: false,
    audioExpected,
    audioFinished: false,
    visualTransitionFinished: false,
    finished: false,
    cleaned: false,
  };
}
