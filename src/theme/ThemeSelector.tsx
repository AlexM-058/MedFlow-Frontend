import { THEME_PREFERENCES, type ThemePreference } from './themeContract';
import { useTheme } from './themeContext';

const LABELS: Record<ThemePreference, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

export function ThemeSelector() {
  const { preference, setPreference } = useTheme();

  return (
    <fieldset className="theme-selector">
      <legend className="visually-hidden">Theme</legend>
      {THEME_PREFERENCES.map((option) => (
        <label key={option} className="theme-selector__option">
          <input
            type="radio"
            name="theme-preference"
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
