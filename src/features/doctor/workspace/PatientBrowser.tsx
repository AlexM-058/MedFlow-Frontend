import { useId, useMemo, useRef, type RefObject } from 'react';
import type { DoctorPatient } from '../types';
import { formatFollowUp, formatLastContact } from '../format';
import {
  DEFAULT_QUERY,
  isFiltered,
  queryPatients,
  SORT_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  type PatientQuery,
  type PatientSort,
  type StatusFilter,
} from './patientQuery';
import { StatusBadge } from './StatusBadge';

export type DemoDataState = 'data' | 'loading' | 'error';

export interface PatientBrowserProps {
  patients: readonly DoctorPatient[];
  query: PatientQuery;
  onQueryChange: (query: PatientQuery) => void;
  dataState: DemoDataState;
  onRetry: () => void;
  now: Date;
  /** 'responsive': table on wide screens, cards below. 'cards': always cards (mobile panel). */
  layout: 'responsive' | 'cards';
  headingLevel: 2 | 3;
  onView: (patient: DoctorPatient) => void;
  onSuggest: (patient: DoctorPatient) => void;
  /** Optional ref to the "All patients" heading (focusable with tabIndex -1). */
  headingRef?: RefObject<HTMLHeadingElement | null>;
}

const SORTS: readonly PatientSort[] = ['recent', 'oldest', 'follow-up'];

/** Search, filters, sort and the patient list with data / loading / error / no-results states. */
export function PatientBrowser({
  patients,
  query,
  onQueryChange,
  dataState,
  onRetry,
  now,
  layout,
  headingLevel,
  onView,
  onSuggest,
  headingRef,
}: PatientBrowserProps) {
  const id = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const ownHeadingRef = useRef<HTMLHeadingElement>(null);
  const listHeadingRef = headingRef ?? ownHeadingRef;
  const results = useMemo(() => queryPatients(patients, query), [patients, query]);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const ItemHeading = headingLevel === 2 ? 'h3' : 'h4';
  const total = patients.length;
  const filtered = isFiltered(query);

  const clearFilters = () => {
    onQueryChange({ ...DEFAULT_QUERY, sort: query.sort });
    searchRef.current?.focus();
  };

  const retry = () => {
    onRetry();
    listHeadingRef.current?.focus();
  };

  const headingText =
    dataState === 'data' ? `Toți pacienții (${results.length})` : 'Toți pacienții';

  return (
    <section className="doctor-workspace-browser" aria-labelledby={`${id}-heading`}>
      <div className="doctor-workspace-toolbar" role="search" aria-label="Pacienți">
        <div className="doctor-field doctor-workspace-toolbar__search">
          <label className="doctor-label" htmlFor={`${id}-search`}>
            Căutare
          </label>
          <input
            ref={searchRef}
            id={`${id}-search`}
            className="doctor-input doctor-workspace-search"
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Căutați după numele sau ID-ul pacientului"
            value={query.search}
            onChange={(event) => onQueryChange({ ...query, search: event.target.value })}
          />
        </div>
        <div className="doctor-field">
          <label className="doctor-label" htmlFor={`${id}-status`}>
            Stare
          </label>
          <select
            id={`${id}-status`}
            className="doctor-input doctor-workspace-select"
            value={query.status}
            onChange={(event) =>
              onQueryChange({ ...query, status: event.target.value as StatusFilter })
            }
          >
            <option value="all">Toate stările</option>
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="doctor-field">
          <label className="doctor-label" htmlFor={`${id}-sort`}>
            Sortare după
          </label>
          <select
            id={`${id}-sort`}
            className="doctor-input doctor-workspace-select"
            value={query.sort}
            onChange={(event) =>
              onQueryChange({ ...query, sort: event.target.value as PatientSort })
            }
          >
            {SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Heading
        ref={listHeadingRef}
        id={`${id}-heading`}
        className="doctor-workspace-list-heading"
        tabIndex={-1}
      >
        {headingText}
      </Heading>

      {dataState === 'loading' && (
        <div className="doctor-workspace-loading" role="status">
          <p>Se încarcă pacienții…</p>
          <ul className="doctor-workspace-skeleton" aria-hidden="true">
            {[0, 1, 2, 3].map((row) => (
              <li key={row} className="doctor-workspace-skeleton__row" />
            ))}
          </ul>
        </div>
      )}

      {dataState === 'error' && (
        <div className="doctor-notice doctor-notice--error doctor-workspace-state" role="alert">
          <p>
            <strong>Pacienții nu au putut fi încărcați.</strong> Aceasta este o previzualizare demo a unei erori; nu a fost
            făcută nicio cerere.
          </p>
          <button type="button" className="doctor-button doctor-button--secondary" onClick={retry}>
            Încercați din nou
          </button>
        </div>
      )}

      {dataState === 'data' && results.length === 0 && (
        <div className="doctor-workspace-empty">
          <p className="doctor-workspace-empty__title">Niciun pacient nu corespunde filtrelor.</p>
          <p className="doctor-hint">Încercați alt nume sau alt ID ori afișați toate stările.</p>
          <button
            type="button"
            className="doctor-button doctor-button--secondary"
            onClick={clearFilters}
          >
            Ștergeți filtrele
          </button>
        </div>
      )}

      {dataState === 'data' && results.length > 0 && (
        <>
          {layout === 'responsive' && (
            <div className="doctor-workspace-table-wrap">
              <table className="doctor-workspace-table">
                <caption className="doctor-sr-only">
                  {`${headingText}, sortat după ${SORT_LABELS[query.sort].toLowerCase()}`}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Pacient</th>
                    <th scope="col">Stare</th>
                    <th scope="col">Ultimul contact</th>
                    <th scope="col">Următorul control</th>
                    <th scope="col">Acțiuni</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((patient) => (
                    <tr key={patient.id}>
                      <th scope="row">
                        <div className="doctor-workspace-patient-cell">
                          <span className="doctor-workspace-patient-name">{patient.name}</span>
                          <div className="doctor-workspace-patient-id-row">
                            <span className="doctor-workspace-patient-id">{patient.id}</span>
                            {patient.aiSummary && (
                              <span className="doctor-ai-pill" title="Sumar AI recepționat">
                                Sumar AI
                              </span>
                            )}
                          </div>
                        </div>
                      </th>
                      <td>
                        <StatusBadge status={patient.status} />
                      </td>
                      <td>
                        <time dateTime={patient.lastContactAt} className="doctor-workspace-time">
                          {formatLastContact(patient.lastContactAt, now)}
                        </time>
                      </td>
                      <td>
                        <time dateTime={patient.nextFollowUpOn} className="doctor-workspace-time">
                          {formatFollowUp(patient.nextFollowUpOn, now)}
                        </time>
                      </td>
                      <td>
                        <div className="doctor-workspace-row-actions">
                          <button
                            type="button"
                            className={`doctor-workspace-row-action ${patient.aiSummary ? 'doctor-workspace-row-action--primary' : 'doctor-workspace-row-action--subtle'}`}
                            onClick={() => onView(patient)}
                          >
                            {patient.aiSummary ? 'Vezi sumar AI' : 'Vizualizați pacientul'}
                            <span className="doctor-sr-only">: {patient.name}</span>
                          </button>
                          <button
                            type="button"
                            className="doctor-workspace-row-action doctor-workspace-row-action--subtle"
                            onClick={() => onSuggest(patient)}
                          >
                            Sugestii
                            <span className="doctor-sr-only"> pentru {patient.name}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <ul
            className={`doctor-workspace-cards${
              layout === 'responsive' ? ' doctor-workspace-cards--responsive' : ''
            }`}
            aria-labelledby={`${id}-heading`}
          >
            {results.map((patient) => (
              <li key={patient.id} className="doctor-workspace-card">
                <div className="doctor-workspace-card__main">
                  <div className="doctor-workspace-card__title-row">
                    <ItemHeading className="doctor-workspace-card__name">
                      {patient.name}
                    </ItemHeading>
                    <span className="doctor-workspace-patient-id">{patient.id}</span>
                    {patient.aiSummary && (
                      <span className="doctor-ai-pill" title="Sumar AI recepționat">
                        Sumar AI
                      </span>
                    )}
                  </div>
                  <div className="doctor-workspace-card__facts">
                    <span>
                      Ultimul contact:{' '}
                      <time dateTime={patient.lastContactAt}>
                        {formatLastContact(patient.lastContactAt, now)}
                      </time>
                    </span>
                    <span aria-hidden="true" className="doctor-workspace-dot">·</span>
                    <span>
                      Follow-up:{' '}
                      <time dateTime={patient.nextFollowUpOn}>
                        {formatFollowUp(patient.nextFollowUpOn, now)}
                      </time>
                    </span>
                  </div>
                </div>
                <div className="doctor-workspace-card__status">
                  <StatusBadge status={patient.status} />
                </div>
                <div className="doctor-workspace-card__actions">
                  <button
                    type="button"
                    className={`doctor-workspace-row-action ${patient.aiSummary ? 'doctor-workspace-row-action--primary' : 'doctor-workspace-row-action--subtle'}`}
                    onClick={() => onView(patient)}
                  >
                    {patient.aiSummary ? 'Vezi sumar AI' : 'Vizualizați pacientul'}
                    <span className="doctor-sr-only">: {patient.name}</span>
                  </button>
                  <button
                    type="button"
                    className="doctor-workspace-row-action doctor-workspace-row-action--subtle"
                    onClick={() => onSuggest(patient)}
                  >
                    Sugestii<span className="doctor-sr-only"> pentru {patient.name}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="doctor-workspace-list-footer">
        <p role="status">
          {dataState !== 'data'
            ? ''
            : !filtered && results.length === total
              ? `Se afișează toți cei ${total} pacienți`
              : `Se afișează ${results.length} din ${total} pacienți`}
        </p>
        <p className="doctor-workspace-sample">Date de probă ale pacienților</p>
      </div>
    </section>
  );
}
