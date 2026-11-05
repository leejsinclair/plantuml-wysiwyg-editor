// Interface mode: "simple" (the default) hides the outline, source and preview regions; "advanced" shows them.
// Remembered per browser in localStorage (read synchronously so the first render is already in the right mode).
import { useCallback, useState } from 'react';

export type UiMode = 'simple' | 'advanced';
export const MODE_KEY = 'plantuml-editor.mode';

export function readMode(): UiMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'advanced' ? 'advanced' : 'simple';
  } catch {
    return 'simple';
  }
}

export function useUiMode(): [UiMode, (mode: UiMode) => void] {
  const [mode, setMode] = useState<UiMode>(readMode);
  const set = useCallback((next: UiMode) => {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* Not remembered this time; the mode still changes. */
    }
  }, []);
  return [mode, set];
}
