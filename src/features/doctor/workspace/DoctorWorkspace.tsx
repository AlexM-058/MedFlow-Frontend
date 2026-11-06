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
import { NotConnectedPanel, SettingsPanel } from './WorkspacePanels';
import './doctor-workspace.css';
import { brand } from '../../../brand/brand.config';

type Section = 'backlog' | 'messages' | 'documents' | 'settings';

const SECTIONS: readonly { id: Section; label: string; title: string; subtitle: string }[] = [
  {
    id: 'backlog',
    label: 'Patient backlog',
    title: 'Patient backlog',
    subtitle: 'Your patients and follow-ups, in one place.',
  },
  {
    id: 'messages',
    label: 'Messages',
    title: 'Messages',
    subtitle: 'Conversations with your patients.',
  },
  {
    id: 'documents',
    label: 'Documents',
    title: 'Documents',
    subtitle: 'Files shared with you by your patients.',
  },
  {
    id: 'settings',
    label: 'Settings',
    title: 'Settings',
    subtitle: 'Appearance and account preferences.',
  },
];

const DATA_STATES: readonly { id: DemoDataState; label: string }[] = [
  { id: 'data', label: 'Data' },
  { id: 'loading', label: 'Loading' },
  { id: 'error', label: 'Error' },
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
    { key: 'all', label: 'All patients', value: counts.all },
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
        Skip to main content
      </a>

      <div className="doctor-workspace-sidebar">
        <div className="doctor-workspace-brand">
          <BrandMark />
          <p className="doctor-eyebrow">Doctor workspace</p>
        </div>

        <div className="doctor-workspace-identity">
          <p className="doctor-workspace-identity__name">{doctor.fullName}</p>
          <p className="doctor-workspace-identity__specialty">{doctor.specialty}</p>
        </div>

        <nav className="doctor-workspace-nav" aria-labelledby={`${id}-nav`}>
          <h2 id={`${id}-nav`} className="doctor-workspace-nav__heading">
            Workspace
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
            Log out
          </button>
          <button
            type="button"
            className="doctor-button doctor-button--ghost doctor-workspace-account__action"
            onClick={onExit}
          >
            Patient demo
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
              <span aria-hidden="true">+</span> Add patient
            </button>
          )}
        </header>

        {section === 'backlog' && (
          <>
            <section aria-labelledby={`${id}-overview`}>
              <h2 id={`${id}-overview`} className="doctor-sr-only">
                Overview
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
                          <span className="doctor-sr-only">Not available</span>
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
              View patients
            </button>

            <div className="doctor-workspace-inline-list">
              <PatientBrowser {...browserProps} layout="responsive" headingLevel={2} />
            </div>

            <details className="doctor-workspace-demo">
              <summary className="doctor-workspace-demo__summary">Demo controls</summary>
              <fieldset className="doctor-workspace-demo__fieldset">
                <legend className="doctor-label">Preview patient list state</legend>
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
                  Local preview only. No data is fetched from a server.
                </p>
              </fieldset>
            </details>
          </>
        )}

        {(section === 'messages' || section === 'documents') && (
          <NotConnectedPanel area={section} />
        )}
        {section === 'settings' && <SettingsPanel doctor={doctor} />}
      </main>

      <DoctorDialog
        open={patientsPanelOpen}
        title="Patients"
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
        title="Add patient"
        description="Not connected in this demo."
        onClose={() => setAddOpen(false)}
      >
        <div className="doctor-workspace-panel">
          <p>
            In the full product you will invite a patient with a QR code or an invitation link.
            The patient joins {brand.productName} and their case is assigned to you once the backend supports
            case assignment.
          </p>
          <div className="doctor-notice doctor-notice--info">
            <p>
              No invitation is created and no patient is added to your list in this demo.
            </p>
          </div>
        </div>
      </DoctorDialog>
    </div>
  );
}
