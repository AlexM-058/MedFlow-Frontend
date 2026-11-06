import { DEFAULT_THEME_PREFERENCE, THEME_STORAGE_KEY, isThemePreference, type ThemePreference } from './themeContract';

// Storage can throw (private mode, blocked site data); the app must still render.
export function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_THEME_PREFERENCE;
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export function writeStoredPreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Not persisted; the in-memory selection still applies for this session.
  }
}
