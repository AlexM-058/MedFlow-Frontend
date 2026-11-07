import { ThemeSelector } from '../../../theme/ThemeSelector';
import type { DoctorProfile } from '../types';

/** Messages and Documents: navigable panels that state plainly they are not connected. */
export function NotConnectedPanel({ area }: { area: 'messages' | 'documents' }) {
  const copy =
    area === 'messages'
      ? {
          what: 'Mesajele securizate cu pacienții dumneavoastră vor apărea aici.',
          later:
            'Mesageria necesită serviciul de conversații din backend și atribuirea cazurilor. În această demonstrație nu sunt stocate sau afișate mesaje.',
        }
      : {
          what: 'Documentele transmise de pacienții dumneavoastră vor apărea aici.',
          later:
            'Stocarea documentelor necesită backend-ul și regulile de consimțământ. În această demonstrație nu sunt stocate, încărcate sau afișate fișiere.',
        };

  return (
    <div className="doctor-workspace-panel">
      <div className="doctor-notice doctor-notice--info">
        <p>
          <strong>Neconectat în această demonstrație.</strong> {copy.what}
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
          Temă
        </h2>
        <p className="doctor-hint">Se aplică doar acestui dispozitiv.</p>
        <ThemeSelector />
      </section>

      <section className="doctor-workspace-panel__card" aria-labelledby="doctor-workspace-profile">
        <h2 id="doctor-workspace-profile" className="doctor-workspace-panel__heading">
          Profil <span className="doctor-demo-tag">Date demo</span>
        </h2>
        <dl className="doctor-workspace-details">
          <div>
            <dt>Nume</dt>
            <dd>{doctor.fullName}</dd>
          </div>
          <div>
            <dt>Specialitate</dt>
            <dd>{doctor.specialty}</dd>
          </div>
          <div>
            <dt>E-mail de serviciu</dt>
            <dd>{doctor.email}</dd>
          </div>
        </dl>
      </section>

      <div className="doctor-notice doctor-notice--info">
        <p>
          <strong>Neconectat în această demonstrație.</strong> Setările de profil, notificări și securitate
          vor fi gestionate de backend. Nimic din această pagină nu este salvat pe un server.
        </p>
      </div>
    </div>
  );
}
