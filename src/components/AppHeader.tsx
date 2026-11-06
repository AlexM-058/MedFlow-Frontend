import { ThemeSelector } from '../theme/ThemeSelector';
import { BrandMark } from './BrandMark';

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <BrandMark />
        <div className="app-header__actions">
          <a className="app-header__workspace-link" href="#/patient">Autentificare</a>
          <a className="app-header__workspace-link" href="#/demo/care">Scenariu de îngrijire</a>
          <a className="app-header__workspace-link" href="#/demo/scan">Scanare document</a>
          <a className="app-header__workspace-link" href="#/demo/doctor">Demo medic</a>
          <ThemeSelector />
        </div>
      </div>
    </header>
  );
}
