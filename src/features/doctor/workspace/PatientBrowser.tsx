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
    dataState === 'data' ? `All patients (${results.length})` : 'All patients';

  return (
    <section className="doctor-workspace-browser" aria-labelledby={`${id}-heading`}>
      <div className="doctor-workspace-toolbar" role="search" aria-label="Patients">
        <div className="doctor-field doctor-workspace-toolbar__search">
          <label className="doctor-label" htmlFor={`${id}-search`}>
            Search
          </label>
          <input
            ref={searchRef}
            id={`${id}-search`}
            className="doctor-input doctor-workspace-search"
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search by patient name or ID"
            value={query.search}
            onChange={(event) => onQueryChange({ ...query, search: event.target.value })}
          />
        </div>
        <div className="doctor-field">
          <label className="doctor-label" htmlFor={`${id}-status`}>
            Status
          </label>
          <select
            id={`${id}-status`}
            className="doctor-input doctor-workspace-select"
            value={query.status}
            onChange={(event) =>
              onQueryChange({ ...query, status: event.target.value as StatusFilter })
            }
          >
            <option value="all">All statuses</option>
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="doctor-field">
          <label className="doctor-label" htmlFor={`${id}-sort`}>
            Sort by
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
          <p>Loading patients…</p>
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
            <strong>Patients could not be loaded.</strong> This is a demo error preview; no request
            was made.
          </p>
          <button type="button" className="doctor-button doctor-button--secondary" onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {dataState === 'data' && results.length === 0 && (
        <div className="doctor-workspace-empty">
          <p className="doctor-workspace-empty__title">No patients match your filters.</p>
          <p className="doctor-hint">Try another name or ID, or show all statuses.</p>
          <button
            type="button"
            className="doctor-button doctor-button--secondary"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        </div>
      )}

      {dataState === 'data' && results.length > 0 && (
        <>
          {layout === 'responsive' && (
            <div className="doctor-workspace-table-wrap">
              <table className="doctor-workspace-table">
                <caption className="doctor-sr-only">
                  {`${headingText}, sorted by ${SORT_LABELS[query.sort].toLowerCase()}`}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Patient</th>
                    <th scope="col">Status</th>
                    <th scope="col">Last contact</th>
                    <th scope="col">Next follow-up</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((patient) => (
                    <tr key={patient.id}>
                      <th scope="row">
                        <span className="doctor-workspace-patient-name">{patient.name}</span>
                        <span className="doctor-workspace-patient-id">{patient.id}</span>
                      </th>
                      <td>
                        <StatusBadge status={patient.status} />
                      </td>
                      <td>
                        <time dateTime={patient.lastContactAt}>
                          {formatLastContact(patient.lastContactAt, now)}
                        </time>
                      </td>
                      <td>
                        <time dateTime={patient.nextFollowUpOn}>
                          {formatFollowUp(patient.nextFollowUpOn, now)}
                        </time>
                      </td>
                      <td>
                        <div className="doctor-workspace-row-actions">
                          <button
                            type="button"
                            className="doctor-button doctor-button--ghost doctor-workspace-row-action"
                            onClick={() => onView(patient)}
                          >
                            View patient<span className="doctor-sr-only">: {patient.name}</span>
                          </button>
                          <button
                            type="button"
                            className="doctor-button doctor-button--ghost doctor-workspace-row-action"
                            onClick={() => onSuggest(patient)}
                          >
                            Give suggestions
                            <span className="doctor-sr-only"> to {patient.name}</span>
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
                <ItemHeading className="doctor-workspace-card__name">{patient.name}</ItemHeading>
                <p className="doctor-workspace-patient-id">{patient.id}</p>
                <p>
                  <StatusBadge status={patient.status} />
                </p>
                <dl className="doctor-workspace-card__facts">
                  <div>
                    <dt>Last contact:</dt>
                    <dd>
                      <time dateTime={patient.lastContactAt}>
                        {formatLastContact(patient.lastContactAt, now)}
                      </time>
                    </dd>
                  </div>
                  <div>
                    <dt>Next follow-up:</dt>
                    <dd>
                      <time dateTime={patient.nextFollowUpOn}>
                        {formatFollowUp(patient.nextFollowUpOn, now)}
                      </time>
                    </dd>
                  </div>
                </dl>
                <div className="doctor-workspace-card__actions">
                  <button
                    type="button"
                    className="doctor-button doctor-button--primary"
                    onClick={() => onView(patient)}
                  >
                    View patient<span className="doctor-sr-only">: {patient.name}</span>
                  </button>
                  <button
                    type="button"
                    className="doctor-button doctor-button--secondary"
                    onClick={() => onSuggest(patient)}
                  >
                    Give suggestions<span className="doctor-sr-only"> to {patient.name}</span>
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
              ? `Showing all ${total} patients`
              : `Showing ${results.length} of ${total} patients`}
        </p>
        <p className="doctor-workspace-sample">Sample patient data</p>
      </div>
    </section>
  );
}
