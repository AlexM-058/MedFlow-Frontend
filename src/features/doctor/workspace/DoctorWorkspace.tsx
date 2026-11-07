import { useId, useMemo, useRef, useState } from 'react';
import { BrandMark } from '../../../components/BrandMark';
import type { DoctorWorkspaceProps } from '../contracts';
import { DEMO_NOW, DEMO_PATIENTS } from '../fixtures';
import { DoctorDialog } from '../shared/DoctorDialog';
import type { DoctorPatient, SuggestionTarget } from '../types';
import { SuggestionDialog } from '../suggestions';
import { PatientBrowser, type DemoDataState } from './PatientBrowser';
import { PatientDetailsDialog } from './PatientDetailsDialog';
import { countByStatus, DEFAULT_QUERY, STATUS_LABELS, type PatientQuery } from './patientQuery';
import { SettingsPanel } from './WorkspacePanels';
import './doctor-workspace.css';
import { brand } from '../../../brand/brand.config';

type Section = 'backlog' | 'settings';

const SECTIONS: readonly { id: Section; label: string; title: string; subtitle: string }[] = [
  {
    id: 'backlog',
    label: 'Lista de pacienți',
    title: 'Lista de pacienți',
    subtitle: 'Pacienții și controalele de urmărire, într-un singur loc.',
  },
  {
    id: 'settings',
    label: 'Setări',
    title: 'Setări',
    subtitle: 'Aspect și preferințele contului.',
  },
];

const DATA_STATES: readonly { id: DemoDataState; label: string }[] = [
  { id: 'data', label: 'Date' },
  { id: 'loading', label: 'Se încarcă' },
  { id: 'error', label: 'Eroare' },
];

/**
 * Doctor workspace: patient backlog plus not-connected Messages / Documents / Settings.
 * All data is synthetic and local (DEMO_PATIENTS); nothing is fetched or persisted.
 */
export function DoctorWorkspace({ doctor, onLogout, onExit }: DoctorWorkspaceProps) {
  const id = useId();
  const patients = DEMO_PATIENTS;
  const now = DEMO_NOW;
  const [section, setSection] = useState<Section>('backlog');
  const [query, setQuery] = useState<PatientQuery>(DEFAULT_QUERY);
  const [dataState, setDataState] = useState<DemoDataState>('data');
  const [patientsPanelOpen, setPatientsPanelOpen] = useState(false);
  const [viewing, setViewing] = useState<DoctorPatient | null>(null);
  const [suggestFor, setSuggestFor] = useState<SuggestionTarget | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);

  const counts = useMemo(() => countByStatus(patients), [patients]);
  const current = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0];

  const goTo = (next: Section) => {
    setSection(next);
    // The page title element persists across sections, so focus can move immediately.
    titleRef.current?.focus();
  };

  const suggest = (patient: DoctorPatient) => setSuggestFor({ id: patient.id, name: patient.name });

  const stats = [
    { key: 'all', label: 'Toți pacienții', value: counts.all },
    { key: 'needs-review', label: STATUS_LABELS['needs-review'], value: counts['needs-review'] },
    { key: 'follow-up-due', label: STATUS_LABELS['follow-up-due'], value: counts['follow-up-due'] },
    { key: 'up-to-date', label: STATUS_LABELS['up-to-date'], value: counts['up-to-date'] },
  ] as const;

  const browserProps = {
    patients,
    query,
    onQueryChange: setQuery,
    dataState,
    onRetry: () => setDataState('data'),
    now,
    onView: setViewing,
    onSuggest: suggest,
  };

  return (
    <div className="doctor-workspace">
      <a className="doctor-workspace-skip doctor-button doctor-button--secondary" href={`#${id}-main`}>
        Treceți la conținutul principal
      </a>

      <div className="doctor-workspace-sidebar">
        <div className="doctor-workspace-brand">
          <BrandMark />
          <p className="doctor-eyebrow">Spațiul de lucru al medicului</p>
        </div>

        <div className="doctor-workspace-identity">
          <p className="doctor-workspace-identity__name">{doctor.fullName}</p>
          <p className="doctor-workspace-identity__specialty">{doctor.specialty}</p>
        </div>

        <nav className="doctor-workspace-nav" aria-labelledby={`${id}-nav`}>
          <h2 id={`${id}-nav`} className="doctor-workspace-nav__heading">
            Spațiu de lucru
          </h2>
          <ul className="doctor-workspace-nav__list">
            {SECTIONS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="doctor-button doctor-workspace-nav__button"
                  aria-current={section === item.id ? 'page' : undefined}
                  onClick={() => goTo(item.id)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="doctor-workspace-account">
          <button
            type="button"
            className="doctor-button doctor-button--ghost doctor-workspace-account__action"
            onClick={onLogout}
          >
            Deconectare
          </button>
          <button
            type="button"
            className="doctor-button doctor-button--ghost doctor-workspace-account__action"
            onClick={onExit}
          >
            Demo pacient
          </button>
        </div>
      </div>

      <main id={`${id}-main`} className="doctor-workspace-main" tabIndex={-1}>
        <header className="doctor-workspace-header">
          <div className="doctor-workspace-header__text">
            <h1 ref={titleRef} className="doctor-workspace-title" tabIndex={-1}>
              {current.title}
            </h1>
            <p className="doctor-workspace-subtitle">{current.subtitle}</p>
          </div>
          {section === 'backlog' && (
            <button
              type="button"
              className="doctor-button doctor-button--primary doctor-workspace-add"
              onClick={() => setAddOpen(true)}
            >
              <span aria-hidden="true">+</span> Adăugați pacient
            </button>
          )}
        </header>

        {section === 'backlog' && (
          <>
            <section aria-labelledby={`${id}-overview`}>
              <h2 id={`${id}-overview`} className="doctor-sr-only">
                Prezentare generală
              </h2>
              <dl className="doctor-workspace-stats">
                {stats.map((stat) => (
                  <div key={stat.key} className="doctor-workspace-stat">
                    <dt className="doctor-workspace-stat__label">{stat.label}</dt>
                    <dd className="doctor-workspace-stat__value">
                      {dataState === 'data' ? (
                        stat.value
                      ) : (
                        <>
                          <span aria-hidden="true">–</span>
                          <span className="doctor-sr-only">Indisponibil</span>
                        </>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <button
              type="button"
              className="doctor-button doctor-button--primary doctor-button--block doctor-workspace-open-panel"
              aria-haspopup="dialog"
              onClick={() => setPatientsPanelOpen(true)}
            >
              Vizualizați pacienții
            </button>

            <div className="doctor-workspace-inline-list">
              <PatientBrowser {...browserProps} layout="responsive" headingLevel={2} />
            </div>

            <details className="doctor-workspace-demo">
              <summary className="doctor-workspace-demo__summary">Comenzi demo</summary>
              <fieldset className="doctor-workspace-demo__fieldset">
                <legend className="doctor-label">Previzualizați starea listei de pacienți</legend>
                <div className="doctor-workspace-demo__options">
                  {DATA_STATES.map((option) => (
                    <label key={option.id} className="doctor-workspace-demo__option">
                      <input
                        type="radio"
                        name={`${id}-data-state`}
                        value={option.id}
                        checked={dataState === option.id}
                        onChange={() => setDataState(option.id)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                <p className="doctor-hint">
                  Doar previzualizare locală. Nu se preiau date de pe un server.
                </p>
              </fieldset>
            </details>
          </>
        )}

        {section === 'settings' && <SettingsPanel doctor={doctor} />}
      </main>

      <DoctorDialog
        open={patientsPanelOpen}
        title="Pacienți"
        onClose={() => setPatientsPanelOpen(false)}
        initialFocusRef={panelHeadingRef}
        wide
      >
        <PatientBrowser
          {...browserProps}
          layout="cards"
          headingLevel={3}
          headingRef={panelHeadingRef}
        />
      </DoctorDialog>

      {/* Rendered before SuggestionDialog so "Give suggestions" from the summary closes it first. */}
      <PatientDetailsDialog
        patient={viewing}
        now={now}
        onClose={() => setViewing(null)}
        onSuggest={(patient) => {
          setViewing(null);
          suggest(patient);
        }}
      />

      <SuggestionDialog patient={suggestFor} onClose={() => setSuggestFor(null)} />

      <DoctorDialog
        open={addOpen}
        title="Adăugați pacient"
        description="Neconectat în această demonstrație."
        onClose={() => setAddOpen(false)}
      >
        <div className="doctor-workspace-panel">
          <p>
            În produsul complet veți invita un pacient cu un cod QR sau un link de invitație.
            Pacientul se alătură {brand.productName}, iar cazul său vă este atribuit odată ce backend-ul va susține
            atribuirea cazurilor.
          </p>
          <div className="doctor-notice doctor-notice--info">
            <p>
              În această demonstrație nu este creată nicio invitație și niciun pacient nu este adăugat în lista dumneavoastră.
            </p>
          </div>
        </div>
      </DoctorDialog>
    </div>
  );
}
