const SOUND_ENABLED_STORAGE_KEY = "cristalclass_sound_enabled";

export const DEFAULT_SOUND_ENABLED = true;

export function parseSoundEnabled(value: string | null): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return DEFAULT_SOUND_ENABLED;
}

export function loadSoundEnabled(): boolean {
  if (typeof window === "undefined") return DEFAULT_SOUND_ENABLED;
  return parseSoundEnabled(localStorage.getItem(SOUND_ENABLED_STORAGE_KEY));
}

export function saveSoundEnabled(soundEnabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SOUND_ENABLED_STORAGE_KEY, String(soundEnabled));
}
