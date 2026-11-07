import { AccountMenu } from './AccountMenu';
import { BrandMark } from './BrandMark';

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <BrandMark />
        <div className="app-header__actions">
          {/* Demo routes (#/demo/patient, /doctor, /scan, /care) stay reachable by URL for the team but are intentionally not linked here. */}
          <a className="app-header__workspace-link" href="#/patient">Autentificare</a>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
