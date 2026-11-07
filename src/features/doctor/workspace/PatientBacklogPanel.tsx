import { useId, useMemo, useRef, useState } from 'react';
import { brand } from '../../../brand/brand.config';
import { DEMO_NOW, DEMO_PATIENTS } from '../fixtures';
import { DoctorDialog } from '../shared/DoctorDialog';
import { SuggestionDialog } from '../suggestions';
import type { DoctorPatient, SuggestionTarget } from '../types';
import { PatientBrowser, type DemoDataState } from './PatientBrowser';
import { PatientDetailsDialog } from './PatientDetailsDialog';
import { countByStatus, DEFAULT_QUERY, STATUS_LABELS, type PatientQuery } from './patientQuery';

export interface PatientBacklogPanelProps {
  patients?: readonly DoctorPatient[];
  showDemoControls?: boolean;
  headingLevel?: 2 | 3;
}

const DATA_STATES: readonly { id: DemoDataState; label: string }[] = [
  { id: 'data', label: 'Date' },
  { id: 'loading', label: 'Se încarcă' },
  { id: 'error', label: 'Eroare' },
];

/**
 * Reusable Patient Backlog panel with search, status filters, sort, stats,
 * and AI summary inspection for patients needing review.
 */
export function PatientBacklogPanel({
  patients = DEMO_PATIENTS,
  showDemoControls = false,
  headingLevel = 2,
}: PatientBacklogPanelProps) {
  const id = useId();
  const now = DEMO_NOW;
  const [query, setQuery] = useState<PatientQuery>(DEFAULT_QUERY);
  const [dataState, setDataState] = useState<DemoDataState>('data');
  const [patientsPanelOpen, setPatientsPanelOpen] = useState(false);
  const [viewing, setViewing] = useState<DoctorPatient | null>(null);
  const [suggestFor, setSuggestFor] = useState<SuggestionTarget | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);

  const counts = useMemo(() => countByStatus(patients), [patients]);

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
    <section className="doctor-account-panel doctor-backlog-container" aria-labelledby={`${id}-backlog-title`}>
      <div className="doctor-workspace-header">
        <div className="doctor-workspace-header__text">
          <h2 id={`${id}-backlog-title`} className="doctor-workspace-title">
            Lista de pacienți
          </h2>
          <p className="doctor-workspace-subtitle">
            Pacienții dumneavoastră și cazurile cu sumar AI recepționat.
          </p>
        </div>
        <button
          type="button"
          className="doctor-button doctor-button--primary doctor-workspace-add"
          onClick={() => setAddOpen(true)}
        >
          <span aria-hidden="true">+</span> Adăugați pacient
        </button>
      </div>

      <section aria-labelledby={`${id}-overview`}>
        <h3 id={`${id}-overview`} className="doctor-sr-only">
          Prezentare generală
        </h3>
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
        <PatientBrowser {...browserProps} layout="responsive" headingLevel={headingLevel} />
      </div>

      {showDemoControls && (
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
      )}

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
        description="Invitație pacient."
        onClose={() => setAddOpen(false)}
      >
        <div className="doctor-workspace-panel">
          <p>
            Pentru a adăuga un pacient nou în {brand.productName}, folosiți secțiunea <strong>Cod QR de conectare</strong> pentru a-i oferi codul de conectare rapid.
          </p>
          <div className="doctor-notice doctor-notice--info">
            <p>
              După ce pacientul scanează QR-ul sau deschide linkul și trimite cererea, aceasta va apărea în tabul <strong>Cereri de conectare</strong>.
            </p>
          </div>
        </div>
      </DoctorDialog>
    </section>
  );
}
