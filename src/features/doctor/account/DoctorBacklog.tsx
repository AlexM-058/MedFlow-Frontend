import { useEffect, useId, useMemo, useState } from 'react';
import type { ConnectionRequest } from '../../../auth/contracts';
import { caseApi, type CaseRecord } from '../../../lib/caseApi';
import type { Drafts } from '../../cases/CaseInbox';
import {
  buildBacklog,
  countByFilter,
  filterBacklog,
  formatActivity,
  STATE_LABELS,
  type BacklogFilter,
  type BacklogRow,
} from './backlogLogic';
import { PatientDossier } from './PatientDossier';
import './doctor-backlog.css';

const REFRESH_MS = 30_000;
const PAGE_SIZE = 50;
const EMPTY_DRAFTS: Drafts = { message: '', feedback: '' };

const FILTERS: readonly { id: BacklogFilter; label: string }[] = [
  { id: 'all', label: 'Toți' },
  { id: 'needs_review', label: 'De revăzut' },
  { id: 'new', label: 'Noi' },
  { id: 'up_to_date', label: 'La zi' },
];

export interface DoctorBacklogProps {
  token: string | null;
  /** Connection requests of this doctor; only the accepted ones become patients. */
  requests: readonly ConnectionRequest[];
  requestsPhase: 'loading' | 'ready' | 'error';
  onShowQr: () => void;
}

/**
 * The doctor's patient backlog: connected patients (from accepted connection requests) joined with
 * their newest case (state and last message come from the Backend). It never shows sample data.
 */
export function DoctorBacklog({ token, requests, requestsPhase, onShowQr }: DoctorBacklogProps) {
  const titleId = useId();
  const searchId = useId();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ revision: number; cases?: CaseRecord[]; error?: string } | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<BacklogFilter>('all');
  const [openRow, setOpenRow] = useState<BacklogRow | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Drafts>>({});

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    caseApi.listCases(token, 0, controller.signal).then(
      (cases) => { if (!controller.signal.aborted) setResult({ revision, cases }); },
      (failure: unknown) => {
        if (controller.signal.aborted) return;
        // Keep the last good list on screen; only say that the refresh failed.
        setResult((current) => ({ revision, cases: current?.cases, error: failure instanceof Error ? failure.message : 'Pacienții nu au putut fi încărcați.' }));
      },
    );
    return () => controller.abort();
  }, [token, revision]);

  useEffect(() => {
    if (openRow) return;
    const timer = window.setInterval(() => { if (!document.hidden) setRevision((value) => value + 1); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [openRow]);

  const cases = result?.cases ?? null;
  const loading = result === null || result.revision !== revision;
  const rows = useMemo(() => buildBacklog(requests, cases), [requests, cases]);
  const counts = countByFilter(rows);
  const visible = filterBacklog(rows, query, filter);

  if (openRow?.caseId) {
    const caseId = openRow.caseId;
    return (
      <section className="backlog-detail" aria-label={`Pacient ${openRow.patientName}`}>
        <div className="backlog-detail__head">
          <button type="button" className="doctor-button doctor-button--secondary" onClick={() => { setOpenRow(null); setRevision((value) => value + 1); }}>
            ← Înapoi la pacienți
          </button>
          <h2>{openRow.patientName}</h2>
        </div>
        {token && (
          <PatientDossier
            token={token}
            caseId={caseId}
            drafts={drafts[caseId] ?? EMPTY_DRAFTS}
            changeDraft={(kind, text) => setDrafts((current) => ({ ...current, [caseId]: { ...(current[caseId] ?? EMPTY_DRAFTS), [kind]: text } }))}
          />
        )}
      </section>
    );
  }

  const nothingYet = rows.length === 0 && !loading && requestsPhase !== 'loading';

  return (
    <section className="backlog" aria-labelledby={titleId}>
      <header className="backlog__head">
        <div>
          <h2 id={titleId}>Pacienții mei</h2>
          <p>Pacienții conectați. Cei care așteaptă răspuns apar primii.</p>
        </div>
        <button type="button" className="doctor-button doctor-button--secondary" onClick={() => setRevision((value) => value + 1)} disabled={loading} aria-busy={loading}>
          {loading ? 'Se reîmprospătează…' : 'Reîmprospătați'}
        </button>
      </header>

      {result?.error && <p className="doctor-notice doctor-notice--error" role="alert">{result.error} Starea pacienților poate fi neactualizată.</p>}
      {requestsPhase === 'error' && <p className="doctor-notice doctor-notice--error" role="alert">Lista pacienților conectați nu a putut fi încărcată. Se afișează doar pacienții cu dosar deschis.</p>}

      {nothingYet ? (
        <div className="backlog__empty">
          <p>Nu aveți încă pacienți conectați.</p>
          <p>Afișați codul QR și cereți pacientului să îl scaneze. După ce acceptați cererea, apare aici.</p>
          <button type="button" className="doctor-button doctor-button--primary" onClick={onShowQr}>Afișați codul QR</button>
        </div>
      ) : (
        <>
          <div className="backlog__filters" role="group" aria-label="Filtrați pacienții după stare">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="backlog__filter"
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
              >
                <span className="backlog__filter-count">{counts[item.id]}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          <div className="backlog__search">
            <label htmlFor={searchId}>Căutați un pacient după nume</label>
            <input id={searchId} type="search" className="doctor-input" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
          </div>

          {loading && rows.length === 0 ? <p role="status">Se încarcă pacienții…</p> : visible.length === 0 ? (
            <p role="status">Niciun pacient nu corespunde căutării sau filtrului.</p>
          ) : (
            <table className="backlog__table">
              <caption className="doctor-sr-only">Pacienții dumneavoastră</caption>
              <thead>
                <tr>
                  <th scope="col">Pacient</th>
                  <th scope="col">Stare</th>
                  <th scope="col">Ultimul mesaj</th>
                  <th scope="col">Ultima activitate</th>
                  <th scope="col"><span className="doctor-sr-only">Acțiuni</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.patientId}>
                    <th scope="row" data-label="Pacient">{row.patientName}</th>
                    <td data-label="Stare"><span className={`backlog-state backlog-state--${row.state}`}>{STATE_LABELS[row.state]}</span></td>
                    <td data-label="Ultimul mesaj" className="backlog__message">
                      {row.lastMessage ? <><strong>{row.lastMessage.fromPatient ? 'Pacient: ' : 'Dvs.: '}</strong>{row.lastMessage.text}</> : <span className="backlog__muted">—</span>}
                    </td>
                    <td data-label="Ultima activitate">{formatActivity(row.lastActivityAt)}</td>
                    <td data-label="">
                      {row.caseId ? (
                        <button type="button" className="doctor-button doctor-button--primary" onClick={() => setOpenRow(row)} aria-label={`Deschideți dosarul pacientului ${row.patientName}`}>Deschideți</button>
                      ) : (
                        <span className="backlog__muted">Așteaptă primul mesaj</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {cases !== null && cases.length >= PAGE_SIZE && <p className="backlog__muted">Se afișează primele {PAGE_SIZE} dosare.</p>}
        </>
      )}
    </section>
  );
}
