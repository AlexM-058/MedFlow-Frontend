import { ThemeSelector } from '../../../theme/ThemeSelector';
import type { DoctorProfile } from '../types';

/** Messages and Documents: navigable panels that state plainly they are not connected. */
export function NotConnectedPanel({ area }: { area: 'messages' | 'documents' }) {
  const copy =
    area === 'messages'
      ? {
          what: 'Secure messages with your patients will appear here.',
          later:
            'Messaging needs the backend conversation service and case assignment. No messages are stored or shown in this demo.',
        }
      : {
          what: 'Documents shared by your patients will appear here.',
          later:
            'Document storage needs the backend and consent rules. No files are stored, uploaded or shown in this demo.',
        };

  return (
    <div className="doctor-workspace-panel">
      <div className="doctor-notice doctor-notice--info">
        <p>
          <strong>Not connected in this demo.</strong> {copy.what}
        </p>
      </div>
      <p className="doctor-workspace-panel__text">{copy.later}</p>
    </div>
  );
}

export function SettingsPanel({ doctor }: { doctor: DoctorProfile }) {
  return (
    <div className="doctor-workspace-panel">
      <section className="doctor-workspace-panel__card" aria-labelledby="doctor-workspace-theme">
        <h2 id="doctor-workspace-theme" className="doctor-workspace-panel__heading">
          Theme
        </h2>
        <p className="doctor-hint">Applies to this device only.</p>
        <ThemeSelector />
      </section>

      <section className="doctor-workspace-panel__card" aria-labelledby="doctor-workspace-profile">
        <h2 id="doctor-workspace-profile" className="doctor-workspace-panel__heading">
          Profile <span className="doctor-demo-tag">Demo data</span>
        </h2>
        <dl className="doctor-workspace-details">
          <div>
            <dt>Name</dt>
            <dd>{doctor.fullName}</dd>
          </div>
          <div>
            <dt>Specialty</dt>
            <dd>{doctor.specialty}</dd>
          </div>
          <div>
            <dt>Work email</dt>
            <dd>{doctor.email}</dd>
          </div>
        </dl>
      </section>

      <div className="doctor-notice doctor-notice--info">
        <p>
          <strong>Not connected in this demo.</strong> Profile, notification and security settings
          will be managed by the backend. Nothing on this page is saved to a server.
        </p>
      </div>
    </div>
  );
}
