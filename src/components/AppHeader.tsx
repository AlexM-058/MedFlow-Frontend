import { ThemeSelector } from '../theme/ThemeSelector';
import { BrandMark } from './BrandMark';

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <BrandMark />
        <ThemeSelector />
      </div>
    </header>
  );
}
