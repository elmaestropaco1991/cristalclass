import { shouldCloseAfterActionApplication } from "./actionApplicationGuard";
import {
  createReusableInstance,
  createActionSoundLoadCache,
  getActionSoundKind,
  getActionSoundUrl,
  getActionSoundLoadingState,
  playActionSound,
  shouldRequestActionSound,
  usesSynthesizedActionSound,
} from "./actionSoundService";
import { DEFAULT_SOUND_ENABLED, parseSoundEnabled } from "./soundPreferenceService";

export type ActionSoundCheck = { name: string; passed: boolean };

export async function runActionSoundDeterministicChecks(): Promise<readonly ActionSoundCheck[]> {
  let createdInstances = 0;
  const getInstance = createReusableInstance(() => ({ id: ++createdInstances }));
  const firstInstance = getInstance();
  const secondInstance = getInstance();
  const cache = createActionSoundLoadCache<string>();
  let positiveLoadCount = 0;
  let negativeLoadCount = 0;
  const firstPositiveLoad = cache.load("positive", async () => {
    positiveLoadCount += 1;
    return "positive";
  });
  const secondPositiveLoad = cache.load("positive", async () => {
    positiveLoadCount += 1;
    return "positive";
  });
  const negativeLoad = cache.load("negative", async () => {
    negativeLoadCount += 1;
    return "negative";
  });
  const failedCache = createActionSoundLoadCache<string>();
  const failedLoad = failedCache.load("positive", async () => {
    throw new Error("fetch failure");
  });
  const [positiveBuffer, repeatedPositiveBuffer, negativeBuffer, failedBuffer] = await Promise.all([
    firstPositiveLoad,
    secondPositiveLoad,
    negativeLoad,
    failedLoad,
  ]);
  let audioFailureIsSafe = true;

  try {
    playActionSound(1);
  } catch {
    audioFailureIsSafe = false;
  }

  return [
    check("positive points resolve positive sound file", () => getActionSoundUrl(1) === "/sounds/action-positive.wav"),
    check("negative points resolve negative sound file", () => getActionSoundUrl(-1) === "/sounds/action-negative.mp3"),
    check("zero points resolve no sound file", () => getActionSoundUrl(0) === null),
    check("synthesized oscillators are not used", () => !usesSynthesizedActionSound()),
    check("positive sound loads only once", () => positiveBuffer === "positive" && positiveLoadCount === 1),
    check("negative sound loads only once", () => negativeBuffer === "negative" && negativeLoadCount === 1),
    check("simultaneous requests share the same promise", () => firstPositiveLoad === secondPositiveLoad && repeatedPositiveBuffer === "positive"),
    check("sound load state is retained", () => cache.getState("positive") === "ready" && getActionSoundLoadingState("positive") === "idle"),
    check("failed sound loads remain isolated", () => failedBuffer === null && failedCache.getState("positive") === "failed"),
    check("sound defaults to enabled", () => parseSoundEnabled(null) === DEFAULT_SOUND_ENABLED),
    check("stored false hydrates", () => parseSoundEnabled("false") === false),
    check("stored true hydrates", () => parseSoundEnabled("true") === true),
    check("invalid stored values use the default", () => parseSoundEnabled("not-a-boolean") === DEFAULT_SOUND_ENABLED),
    check("muted actions do not request playback", () => !shouldRequestActionSound(1, false, true)),
    check("sound is requested only after a committed result", () => shouldRequestActionSound(1, true, true) && !shouldRequestActionSound(1, true, false)),
    check("errors do not request sound", () => !shouldRequestActionSound(-1, true, false)),
    check("quick and additional actions share the same sign resolver", () => getActionSoundKind(3) === getActionSoundKind(1) && getActionSoundKind(-2) === getActionSoundKind(-1)),
    check("audio failures do not block the successful close path", () => audioFailureIsSafe && shouldCloseAfterActionApplication("committed")),
    check("a persisted preference can be rehydrated", () => parseSoundEnabled(String(false)) === false),
    check("audio instances are reused", () => firstInstance === secondInstance && createdInstances === 1),
    check("sound file routes are stable", () => getActionSoundUrl(1) === "/sounds/action-positive.wav" && getActionSoundUrl(-1) === "/sounds/action-negative.mp3"),
  ];
}

function check(name: string, predicate: () => boolean): ActionSoundCheck {
  try { return { name, passed: predicate() }; } catch { return { name, passed: false }; }
}
