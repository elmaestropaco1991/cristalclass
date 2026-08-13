import { useState } from "react";
import { loadSoundEnabled, saveSoundEnabled } from "../services/soundPreferenceService";

export function useSoundPreference() {
  const [soundEnabled, setSoundEnabledState] = useState(() => loadSoundEnabled());

  const setSoundEnabled = (enabled: boolean) => {
    saveSoundEnabled(enabled);
    setSoundEnabledState(enabled);
  };

  return { soundEnabled, setSoundEnabled, toggleSound: () => setSoundEnabled(!soundEnabled) };
}
