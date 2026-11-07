import { useEffect, useId, useRef } from 'react';
import { THEME_PREFERENCES, type ThemePreference } from './themeContract';
import { useTheme } from './themeContext';

const LABELS: Record<ThemePreference, string> = {
  light: 'Luminos',
  dark: 'Întunecat',
  system: 'Sistem',
};

/** The three theme choices as a radio group. Used by the theme selector and by the account menu. */
export function ThemeOptions() {
  const { preference, setPreference } = useTheme();
  const groupName = useId();
  return (
    <fieldset className="theme-selector__options">
      <legend className="visually-hidden">Aspect</legend>
      <p className="theme-selector__heading" aria-hidden="true">Aspect</p>
      {THEME_PREFERENCES.map((option) => (
        <label key={option} className="theme-selector__option">
          <input
            type="radio"
            name={`theme-preference-${groupName}`}
            value={option}
            checked={preference === option}
            onChange={() => setPreference(option)}
            className="theme-selector__input visually-hidden"
          />
          <span className="theme-selector__label">{LABELS[option]}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function ThemeSelector() {
  const { preference } = useTheme();
  const panel = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target)) panel.current?.removeAttribute('open');
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);

  return (
    <details className="theme-selector" ref={panel} onKeyDown={(event) => {
      if (event.key === 'Escape' && panel.current?.open) {
        event.preventDefault();
        event.stopPropagation();
        panel.current.open = false;
        panel.current.querySelector('summary')?.focus();
      }
    }}>
      <summary className="theme-selector__trigger" aria-label={`Aspect: ${LABELS[preference]}`} title="Aspect">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" />
        </svg>
      </summary>
      <div className="theme-selector__panel">
        <ThemeOptions />
      </div>
    </details>
  );
}
