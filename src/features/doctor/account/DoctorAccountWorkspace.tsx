import { useId, useRef, useState } from 'react';
import { useAuth } from '../../../auth/authContext';
import type { AccountProfile } from '../../../auth/contracts';
import { ConnectionQrPanel } from './ConnectionQrPanel';
import { ConnectionRequestsPanel } from './ConnectionRequestsPanel';
import { useConnectionRequests } from './useConnectionRequests';
import { PatientBacklogPanel } from '../workspace/PatientBacklogPanel';
import '../doctor.css';
import '../workspace/doctor-workspace.css';
import './doctor-account.css';
import { brand } from '../../../brand/brand.config';

export interface DoctorAccountWorkspaceProps {
  /** Server profile from /me; the app shell mounts this only for role 'doctor'. */
  profile: AccountProfile;
  onExit: () => void;
}

type Section = 'requests' | 'qr' | 'patients';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'requests', label: 'Cereri de conectare' },
  { id: 'qr', label: 'Cod QR de conectare' },
  { id: 'patients', label: 'Pacienți' },
];

/**
 * Real doctor workspace backed by the account API. Never falls back to demo
 * fixtures: failures show errors and retry, not sample data.
 */
export function DoctorAccountWorkspace({ profile, onExit }: DoctorAccountWorkspaceProps) {
  const { session, signOut } = useAuth();
  const token = session?.access_token ?? null;
  const requests = useConnectionRequests(token);
  const [section, setSection] = useState<Section>('requests');
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const pendingCount = requests.state.requests.filter((request) => request.status === 'pending').length;

  function select(next: Section) {
    setSection(next);
    headingRef.current?.focus();
  }

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await signOut();
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Deconectarea nu a reușit. Vă rugăm să încercați din nou.');
      setSigningOut(false);
    }
  }

  return (
    <div className="doctor-app doctor-account">
      <header className="doctor-account-header">
        <div className="doctor-account-identity">
          <p className="doctor-eyebrow">Spațiul de lucru al medicului</p>
          <h1 ref={headingRef} tabIndex={-1} className="doctor-account-identity__name">
            {profile.fullName}
          </h1>
          <p className="doctor-account-identity__email">{profile.email}</p>
          <p className="doctor-account-verified">Rol de medic verificat de {brand.productName}</p>
        </div>
        <div className="doctor-account-actions doctor-account-header__actions">
          <button type="button" className="doctor-button doctor-button--secondary" onClick={onExit}>
            Zona pentru pacienți
          </button>
          <button type="button" className="doctor-button doctor-button--secondary" onClick={() => void handleSignOut()} disabled={signingOut} aria-busy={signingOut}>
            {signingOut ? 'Se deconectează…' : 'Deconectare'}
          </button>
        </div>
        {signOutError && (
          <p className="doctor-notice doctor-notice--error doctor-account-header__error" role="alert">
            {signOutError}
          </p>
        )}
      </header>

      <nav className="doctor-account-nav" aria-labelledby={`${id}-nav`}>
        <h2 id={`${id}-nav`} className="doctor-sr-only">
          Secțiunile spațiului de lucru
        </h2>
        <ul className="doctor-account-nav__list">
          {SECTIONS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`doctor-button ${section === item.id ? 'doctor-button--primary' : 'doctor-button--secondary'} doctor-account-nav__button`}
                aria-current={section === item.id ? 'page' : undefined}
                onClick={() => select(item.id)}
              >
                {item.label}
                {item.id === 'requests' && pendingCount > 0 && (
                  <span className="doctor-account-count">
                    {pendingCount}
                    <span className="doctor-sr-only"> în așteptare</span>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="doctor-account-content">
        {section === 'requests' && (
          <ConnectionRequestsPanel
            state={requests.state}
            mutations={requests.mutations}
            onRefresh={() => void requests.refresh()}
            onAct={(request, action) => void requests.act(request, action)}
          />
        )}
        {section === 'qr' && <ConnectionQrPanel token={token} />}
        {section === 'patients' && <PatientBacklogPanel />}
      </div>
    </div>
  );
}
