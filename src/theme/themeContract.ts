// Single source of truth for theme persistence. Imported by the React app
// (ThemeProvider) and by vite.config.ts, which inlines the pre-paint script
// into index.html so the first paint already uses the stored theme.
// Keep this file free of DOM/Node types: it is type-checked by both projects.

export const THEME_STORAGE_KEY = 'medflow.theme-preference';

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = 'light' | 'dark';

/** Used when nothing valid is stored (first visit, cleared or blocked storage). */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

/**
 * Inline script for <head>. Mirrors readStoredPreference + resolveTheme with
 * the same key, valid values and fallback, so pre-paint and React agree.
 */
export function buildPrePaintThemeScript(): string {
  const key = JSON.stringify(THEME_STORAGE_KEY);
  const valid = JSON.stringify(THEME_PREFERENCES);
  const fallback = JSON.stringify(DEFAULT_THEME_PREFERENCE);
  const query = JSON.stringify(DARK_SCHEME_QUERY);
  return `(function(){var p=${fallback};try{var s=localStorage.getItem(${key});if(${valid}.indexOf(s)!==-1)p=s;}catch(e){}var d=false;try{d=window.matchMedia(${query}).matches;}catch(e){}var t=p==='system'?(d?'dark':'light'):p;var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t;})();`;
}
