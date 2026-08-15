"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

const CHEST_OPENING_VIDEO_SRC = "/assets/chests/chest-opening.mp4";
const CHEST_OPENING_AUDIO_SRC = "/assets/chests/cristalclass-chest-opening-audio.mp3";
const CHEST_AUDIO_VOLUME = 0.9;
const MAX_SYNC_DRIFT_SECONDS = 0.15;
const FLASH_IN_DURATION_MS = 300;
const FLASH_PEAK_DURATION_MS = 120;
const FLASH_OUT_DURATION_MS = 600;

type Phase = "video" | "flash-in" | "flash-peak" | "flash-out";

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
  const transitionStartedRef = useRef(false);
  const revealNotifiedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("video");
  const [showSkip, setShowSkip] = useState(false);
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);

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
  }, []);

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

  const reportAudioFailure = useCallback((error: unknown) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    setAudioPlaybackBlocked(true);

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
  }, [soundEnabled]);

  const playAudioFromCurrentGesture = useCallback((updateGlobalPreference: boolean) => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;

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
    if (transitionStartedRef.current) return;

    transitionStartedRef.current = true;
    resetMedia();
    setPhase("flash-in");
  }, [resetMedia]);

  const startPlayback = useCallback(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) {
      startTransition();
      return;
    }

    transitionStartedRef.current = false;
    revealNotifiedRef.current = false;
    setPhase("video");
    setShowSkip(false);
    setAudioPlaybackBlocked(false);
    resetMedia();

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
      startTransition();
      return;
    }

    if (soundEnabled) playAudioFromCurrentGesture(false);

    void videoPlayback.catch(() => startTransition());
  }, [playAudioFromCurrentGesture, resetMedia, soundEnabled, startTransition]);

  const disableSound = useCallback(() => {
    pauseAudio(true);
    setAudioPlaybackBlocked(false);
    onSoundEnabledChange(false);
  }, [onSoundEnabledChange, pauseAudio]);

  useImperativeHandle(ref, () => ({ startPlayback }), [startPlayback]);

  useEffect(() => {
    if (!isOpen || phase !== "flash-in") return;

    const peakTimer = window.setTimeout(() => {
      setPhase("flash-peak");

      if (!revealNotifiedRef.current) {
        revealNotifiedRef.current = true;
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

    const finishTimer = window.setTimeout(onFinished, FLASH_OUT_DURATION_MS);
    return () => window.clearTimeout(finishTimer);
  }, [isOpen, onFinished, phase]);

  useEffect(() => {
    if (!isOpen || phase !== "video") return;

    const skipTimer = window.setTimeout(() => setShowSkip(true), 2000);
    return () => window.clearTimeout(skipTimer);
  }, [isOpen, phase]);

  useEffect(() => {
    if (!soundEnabled) pauseAudio(true);
  }, [pauseAudio, soundEnabled]);

  useEffect(() => {
    if (!isOpen) resetMedia();
  }, [isOpen, resetMedia]);

  useEffect(() => resetMedia, [resetMedia]);

  const isFlashing = phase !== "video";
  const isSoundActive = soundEnabled && !audioPlaybackBlocked;

  return (
    <section
      role={isOpen ? "dialog" : undefined}
      aria-modal={isOpen || undefined}
      aria-label={isOpen ? "Apertura del cofre" : undefined}
      aria-busy={isOpen && (phase === "video" || phase === "flash-in")}
      onClick={(event) => event.stopPropagation()}
      className={`fixed inset-0 z-[90] h-screen w-screen overflow-hidden bg-[#020b1d] h-[100dvh] transition-opacity motion-reduce:transition-none ${
        isOpen ? "block" : "hidden"
      } ${phase === "flash-out" ? "opacity-0 duration-[600ms]" : "opacity-100"}`}
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
        onPause={() => pauseAudio()}
        onSeeking={() => synchronizeAudio(true)}
        onTimeUpdate={() => synchronizeAudio(false)}
        onRateChange={() => synchronizeAudio(false)}
        className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-300 motion-reduce:hidden ${
          isFlashing ? "opacity-0" : "opacity-100"
        }`}
      >
        <source src={CHEST_OPENING_VIDEO_SRC} type="video/mp4" />
      </video>

      <audio ref={audioRef} preload="auto" aria-hidden="true">
        <source src={CHEST_OPENING_AUDIO_SRC} type="audio/mpeg" />
      </audio>

      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,1)_0%,rgba(226,251,255,.98)_24%,rgba(74,226,255,.88)_54%,rgba(5,59,126,.92)_100%)] transition-opacity motion-reduce:transition-none ${
          phase === "video" ? "opacity-0" : phase === "flash-out" ? "opacity-0 duration-[600ms]" : "opacity-100 duration-300"
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
          onClick={startTransition}
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
