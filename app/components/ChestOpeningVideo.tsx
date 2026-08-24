"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  createChestOpeningLifecycle,
  getChestAudioTailSafetyTimeoutMs,
} from "../services/chestOpeningLifecycleService";

const CHEST_OPENING_VIDEO_SRC = "/assets/chests/chest-opening.mp4";
const CHEST_OPENING_AUDIO_SRC = "/assets/chests/cristalclass-chest-opening-audio.mp3";
const CHEST_AUDIO_VOLUME = 0.9;
const MAX_SYNC_DRIFT_SECONDS = 0.15;
const FLASH_IN_DURATION_MS = 300;
const FLASH_PEAK_DURATION_MS = 120;
const FLASH_OUT_DURATION_MS = 600;

type Phase = "video" | "flash-in" | "flash-peak" | "flash-out" | "audio-tail";

type Props = {
  isOpen: boolean;
  soundEnabled: boolean;
  onSoundEnabledChange: (enabled: boolean) => void;
  onReveal: () => void;
  onFinished: () => void;
};

export type ChestOpeningVideoHandle = {
  startPlayback: () => void;
};

let hasPreloadedChestOpeningMedia = false;

export function preloadChestOpeningVideo(): void {
  if (hasPreloadedChestOpeningMedia || typeof document === "undefined") return;

  hasPreloadedChestOpeningMedia = true;
  appendMediaPreload(CHEST_OPENING_VIDEO_SRC, "video", "video/mp4");
  appendMediaPreload(CHEST_OPENING_AUDIO_SRC, "audio", "audio/mpeg");
}

const ChestOpeningVideo = forwardRef<ChestOpeningVideoHandle, Props>(function ChestOpeningVideo(
  { isOpen, soundEnabled, onSoundEnabledChange, onReveal, onFinished },
  ref
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const lifecycleRef = useRef(createChestOpeningLifecycle(soundEnabled));
  const audioSafetyTimerRef = useRef<number | null>(null);
  const [phase, setPhase] = useState<Phase>("video");
  const [showSkip, setShowSkip] = useState(false);
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);

  const clearAudioSafetyTimer = useCallback(() => {
    if (audioSafetyTimerRef.current === null) return;
    window.clearTimeout(audioSafetyTimerRef.current);
    audioSafetyTimerRef.current = null;
  }, []);

  const resetMedia = useCallback(() => {
    const video = videoRef.current;
    const audio = audioRef.current;

    if (video) {
      video.pause();
      video.currentTime = 0;
    }

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    clearAudioSafetyTimer();
  }, [clearAudioSafetyTimer]);

  const pauseAudio = useCallback((mute?: boolean) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    if (typeof mute === "boolean") {
      audio.muted = mute;
      audio.defaultMuted = mute;
    }
  }, []);

  const synchronizeAudio = useCallback((force = false) => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;

    audio.playbackRate = video.playbackRate;
    if (force || Math.abs(audio.currentTime - video.currentTime) > MAX_SYNC_DRIFT_SECONDS) {
      audio.currentTime = video.currentTime;
    }
  }, []);

  const finishIfReady = useCallback(() => {
    if (!lifecycleRef.current.finish()) return;
    clearAudioSafetyTimer();
    onFinished();
  }, [clearAudioSafetyTimer, onFinished]);

  const reportAudioFailure = useCallback((error: unknown) => {
    const audio = audioRef.current;
    if (!audio || lifecycleRef.current.getSnapshot().cleaned) return;

    audio.pause();
    setAudioPlaybackBlocked(true);
    lifecycleRef.current.stopWaitingForAudio();
    finishIfReady();

    if (process.env.NODE_ENV === "development") {
      console.warn({
        name: getErrorName(error),
        paused: audio.paused,
        muted: audio.muted,
        volume: audio.volume,
        currentTime: audio.currentTime,
        hasCurrentSrc: Boolean(audio.currentSrc),
        soundEnabled,
      });
    }
  }, [finishIfReady, soundEnabled]);

  const playAudioFromCurrentGesture = useCallback((updateGlobalPreference: boolean) => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;

    lifecycleRef.current.expectAudio();
    synchronizeAudio(true);
    audio.defaultMuted = false;
    audio.muted = false;
    audio.volume = CHEST_AUDIO_VOLUME;

    let playback: Promise<void>;
    try {
      playback = audio.play();
    } catch (error) {
      reportAudioFailure(error);
      return;
    }

    if (updateGlobalPreference) onSoundEnabledChange(true);

    void playback.then(
      () => {
        if (audio.paused || audio.muted || audio.volume <= 0 || !audio.currentSrc) {
          reportAudioFailure({ name: "NotPlayingError" });
          return;
        }

        setAudioPlaybackBlocked(false);
      },
      reportAudioFailure
    );
  }, [onSoundEnabledChange, reportAudioFailure, synchronizeAudio]);

  const startTransition = useCallback(() => {
    if (!lifecycleRef.current.startVisualTransition()) return;

    videoRef.current?.pause();
    setPhase("flash-in");

    const audio = audioRef.current;
    if (lifecycleRef.current.getSnapshot().audioExpected && audio) {
      clearAudioSafetyTimer();
      audioSafetyTimerRef.current = window.setTimeout(() => {
        audio.pause();
        lifecycleRef.current.stopWaitingForAudio();
        finishIfReady();
      }, getChestAudioTailSafetyTimeoutMs(audio.duration, audio.currentTime));
    }
  }, [clearAudioSafetyTimer, finishIfReady]);

  const startPlayback = useCallback(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) {
      lifecycleRef.current.reset(false);
      startTransition();
      return;
    }

    lifecycleRef.current.reset(soundEnabled);
    setPhase("video");
    setShowSkip(false);
    setAudioPlaybackBlocked(false);
    resetMedia();

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      lifecycleRef.current.stopWaitingForAudio();
      startTransition();
      return;
    }

    video.defaultMuted = true;
    video.muted = true;
    video.volume = 0;
    audio.defaultMuted = !soundEnabled;
    audio.muted = !soundEnabled;
    audio.volume = CHEST_AUDIO_VOLUME;

    let videoPlayback: Promise<void>;
    try {
      videoPlayback = video.play();
    } catch {
      lifecycleRef.current.stopWaitingForAudio();
      startTransition();
      return;
    }

    if (soundEnabled) playAudioFromCurrentGesture(false);

    void videoPlayback.catch(() => startTransition());
  }, [playAudioFromCurrentGesture, resetMedia, soundEnabled, startTransition]);

  const disableSound = useCallback(() => {
    pauseAudio(true);
    setAudioPlaybackBlocked(false);
    lifecycleRef.current.stopWaitingForAudio();
    finishIfReady();
    onSoundEnabledChange(false);
  }, [finishIfReady, onSoundEnabledChange, pauseAudio]);

  const handleAudioEnded = useCallback(() => {
    clearAudioSafetyTimer();
    lifecycleRef.current.markAudioFinished();
    finishIfReady();
  }, [clearAudioSafetyTimer, finishIfReady]);

  const skipAnimation = useCallback(() => {
    pauseAudio();
    lifecycleRef.current.stopWaitingForAudio();
    startTransition();
  }, [pauseAudio, startTransition]);

  useImperativeHandle(ref, () => ({ startPlayback }), [startPlayback]);

  useEffect(() => {
    if (!isOpen || phase !== "flash-in") return;

    const peakTimer = window.setTimeout(() => {
      setPhase("flash-peak");

      if (lifecycleRef.current.revealReward()) {
        onReveal();
      }
    }, FLASH_IN_DURATION_MS);

    return () => window.clearTimeout(peakTimer);
  }, [isOpen, onReveal, phase]);

  useEffect(() => {
    if (!isOpen || phase !== "flash-peak") return;

    const fadeTimer = window.setTimeout(() => setPhase("flash-out"), FLASH_PEAK_DURATION_MS);
    return () => window.clearTimeout(fadeTimer);
  }, [isOpen, phase]);

  useEffect(() => {
    if (!isOpen || phase !== "flash-out") return;

    const finishTimer = window.setTimeout(() => {
      setPhase("audio-tail");
      lifecycleRef.current.markVisualTransitionFinished();
      finishIfReady();
    }, FLASH_OUT_DURATION_MS);
    return () => window.clearTimeout(finishTimer);
  }, [finishIfReady, isOpen, phase]);

  useEffect(() => {
    if (!isOpen || phase !== "video") return;

    const skipTimer = window.setTimeout(() => setShowSkip(true), 2000);
    return () => window.clearTimeout(skipTimer);
  }, [isOpen, phase]);

  useEffect(() => {
    if (soundEnabled) return;
    pauseAudio(true);
    lifecycleRef.current.stopWaitingForAudio();
    finishIfReady();
  }, [finishIfReady, pauseAudio, soundEnabled]);

  useEffect(() => {
    if (!isOpen) resetMedia();
  }, [isOpen, resetMedia]);

  useEffect(() => () => {
    lifecycleRef.current.cleanup();
    resetMedia();
  }, [resetMedia]);

  const isFlashing = phase !== "video";
  const isSoundActive = soundEnabled && !audioPlaybackBlocked;

  return (
    <section
      role={isOpen ? "dialog" : undefined}
      aria-modal={isOpen || undefined}
      aria-label={isOpen ? "Apertura del cofre" : undefined}
      aria-busy={isOpen || undefined}
      onClick={(event) => event.stopPropagation()}
      className={`fixed inset-0 z-[90] h-screen w-screen overflow-hidden bg-[#020b1d] h-[100dvh] transition-opacity motion-reduce:transition-none ${
        isOpen ? "block" : "hidden"
      } ${phase === "flash-out" || phase === "audio-tail" ? "opacity-0 duration-[600ms]" : "opacity-100"}`}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        preload="auto"
        onEnded={startTransition}
        onError={() => {
          if (isOpen) startTransition();
        }}
        onAbort={() => {
          if (isOpen) startTransition();
        }}
        onStalled={() => {
          if (isOpen) startTransition();
        }}
        onSeeking={() => synchronizeAudio(true)}
        onTimeUpdate={() => synchronizeAudio(false)}
        onRateChange={() => synchronizeAudio(false)}
        className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-300 motion-reduce:hidden ${
          isFlashing ? "opacity-0" : "opacity-100"
        }`}
      >
        <source src={CHEST_OPENING_VIDEO_SRC} type="video/mp4" />
      </video>

      <audio
        ref={audioRef}
        preload="auto"
        aria-hidden="true"
        onEnded={handleAudioEnded}
        onError={() => {
          if (isOpen) reportAudioFailure({ name: "AudioMediaError" });
        }}
        onAbort={() => {
          if (isOpen) reportAudioFailure({ name: "AudioAbortError" });
        }}
      >
        <source src={CHEST_OPENING_AUDIO_SRC} type="audio/mpeg" />
      </audio>

      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,1)_0%,rgba(226,251,255,.98)_24%,rgba(74,226,255,.88)_54%,rgba(5,59,126,.92)_100%)] transition-opacity motion-reduce:transition-none ${
          phase === "video" || phase === "audio-tail" ? "opacity-0" : phase === "flash-out" ? "opacity-0 duration-[600ms]" : "opacity-100 duration-300"
        }`}
      />

      {phase === "video" && (
        <button
          type="button"
          onClick={isSoundActive
            ? disableSound
            : () => playAudioFromCurrentGesture(true)}
          aria-pressed={isSoundActive}
          className="absolute right-[max(1.5rem,env(safe-area-inset-right))] top-[max(1.5rem,env(safe-area-inset-top))] flex h-10 w-40 items-center justify-center rounded-full border border-cyan-100/70 bg-slate-950/65 px-4 text-sm font-black text-white backdrop-blur-sm transition hover:bg-slate-900 focus-visible:outline-4 focus-visible:outline-cyan-200 focus-visible:outline-offset-2"
        >
          {isSoundActive ? "Silenciar" : "Activar sonido"}
        </button>
      )}

      {showSkip && phase === "video" && (
        <button
          type="button"
          onClick={skipAnimation}
          aria-label="Omitir animación de apertura del cofre"
          className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-[max(1.5rem,env(safe-area-inset-right))] rounded-full border border-cyan-100/80 bg-slate-950/70 px-5 py-2.5 text-sm font-black text-white shadow-lg backdrop-blur-sm transition hover:bg-slate-900 focus-visible:outline-4 focus-visible:outline-cyan-200 focus-visible:outline-offset-2"
        >
          Omitir
        </button>
      )}
    </section>
  );
});

ChestOpeningVideo.displayName = "ChestOpeningVideo";

export default ChestOpeningVideo;

function appendMediaPreload(
  href: string,
  as: "audio" | "video",
  type: "audio/mpeg" | "video/mp4"
): void {
  const preload = document.createElement("link");
  preload.rel = "preload";
  preload.as = as;
  preload.href = href;
  preload.type = type;
  document.head.appendChild(preload);
}

function getErrorName(error: unknown): string {
  if (error instanceof DOMException || error instanceof Error) return error.name;
  if (typeof error === "object" && error !== null && "name" in error) {
    return String(error.name);
  }
  return "UnknownError";
}
