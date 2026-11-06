import { ThemeSelector } from '../theme/ThemeSelector';
import { BrandMark } from './BrandMark';

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <BrandMark />
        <div className="app-header__actions">
          <a className="app-header__workspace-link" href="#/patient">Sign in</a>
          <a className="app-header__workspace-link" href="#/demo/doctor">Doctor demo</a>
          <ThemeSelector />
        </div>
      </div>
    </header>
  );
}
