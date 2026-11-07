import { useEffect, useMemo, useState } from 'react';
import { caseApi, type CaseDocumentRecord } from '../../lib/caseApi';
import { buildReviews, isRowReady, mergeMedications, pendingDocuments, type RowDecision } from './mergedReview';

function errorText(error: unknown) { return error instanceof Error ? error.message : 'Verificarea nu a putut fi salvată.'; }

/**
 * One list of medicines for the whole file (no duplicates across sheets). Each row is one line: the patient marks it
 * "Corect" or opens "Corectez" to fix it. "Toate sunt corecte" marks every complete row at once. In update mode the
 * rows already confirmed are listed too, with what was confirmed, so they can be corrected. A sheet is saved as
 * reviewed only when all its medicines were confirmed; the server verifies every review against what the reader extracted.
 */
export function MedicationListReview({ caseId, token, refreshKey, onSaved, mode = 'pending' }: {
  caseId: string;
  token: string;
  refreshKey: number;
  onSaved: () => void;
  /** pending: only sheets not confirmed yet. update: also the confirmed ones, to correct them. */
  mode?: 'pending' | 'update';
}) {
  const includeReviewed = mode === 'update';
  const [documents, setDocuments] = useState<CaseDocumentRecord[]>([]);
  const [decisions, setDecisions] = useState<Record<string, RowDecision | undefined>>({});
  const [open, setOpen] = useState<Record<string, boolean | undefined>>({});
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'done' | 'error'; text?: string }>({ kind: 'idle' });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    caseApi.listDocuments(token, caseId, controller.signal).then(
      (list) => { if (!controller.signal.aborted) setDocuments(list); },
      (error) => { if (!controller.signal.aborted) setStatus({ kind: 'error', text: errorText(error) }); },
    );
    return () => controller.abort();
  }, [token, caseId, refreshKey, reload]);

  const rows = useMemo(() => mergeMedications(documents, { includeReviewed }), [documents, includeReviewed]);
  const pending = useMemo(() => pendingDocuments(documents), [documents]);

  function decisionFor(key: string): RowDecision {
    const row = rows.find((entry) => entry.key === key);
    return decisions[key] ?? { confirmed: false, name: row?.name ?? '', dose: row?.dose ?? '', frequency: row?.frequency ?? '' };
  }
  function change(key: string, patch: Partial<RowDecision>) {
    setDecisions((current) => ({ ...current, [key]: { ...decisionFor(key), ...patch } }));
  }

  const effective = Object.fromEntries(rows.map((row) => [row.key, decisionFor(row.key)]));
  const complete = (decision: RowDecision) => !!decision.name.trim() && !!decision.dose.trim() && !!decision.frequency.trim();
  const ready = rows.filter((row) => isRowReady(effective[row.key])).length;
  const completeRows = rows.filter((row) => complete(effective[row.key] as RowDecision));

  function confirmAll() {
    setDecisions((current) => ({
      ...current,
      ...Object.fromEntries(completeRows.map((row) => [row.key, { ...decisionFor(row.key), confirmed: true }])),
    }));
  }

  async function save() {
    if (status.kind === 'saving') return;
    const { reviews, skipped } = buildReviews(documents, rows, effective, new Date().toISOString(), { includeReviewed });
    if (reviews.length === 0) {
      setStatus({ kind: 'error', text: 'Verificați toate medicamentele de pe cel puțin o foaie înainte de a o adăuga în dosar.' });
      return;
    }
    setStatus({ kind: 'saving', text: `Se salvează 0 din ${reviews.length}…` });
    let saved = 0;
    try {
      for (const review of reviews) {
        await caseApi.reviewDocument(token, caseId, review.documentId, review.fields);
        saved += 1;
        setStatus({ kind: 'saving', text: `Se salvează ${saved} din ${reviews.length}…` });
      }
      setStatus({
        kind: 'done',
        text: `Adăugat în dosar: ${saved} foi confirmate.${skipped.length ? ` ${skipped.length} foi rămân neconfirmate, pentru că au medicamente nebifate.` : ''}`,
      });
      setDecisions({});
      setOpen({});
      setReload((value) => value + 1);
      onSaved();
    } catch (error) {
      setStatus({ kind: 'error', text: `${errorText(error)} ${saved} foi au fost salvate; puteți relua.` });
      setReload((value) => value + 1);
      onSaved();
    }
  }

  if (rows.length === 0) {
    if (status.text) return <p role={status.kind === 'error' ? 'alert' : 'status'}>{status.text}</p>;
    return mode === 'update' ? <p role="status">Nu există încă medicamente de actualizat. Încărcați mai întâi documente.</p> : null;
  }

  return (
    <section className="med-list" aria-label="Medicamentele din dosar">
      <h3>{mode === 'update' ? 'Actualizați medicamentele' : 'Verificați medicamentele'}</h3>
      <p className="step__hint">
        {mode === 'pending' && pending.length > 0 ? `Am citit ${pending.length} foi. ` : ''}Comparați cu rețeta de hârtie; unele medicamente apar pe mai multe foi.
      </p>
      <button type="button" className="ui-button ui-button--secondary" disabled={status.kind === 'saving' || completeRows.length === 0} onClick={confirmAll}>
        Toate sunt corecte
      </button>
      <ul className="med-list__rows">
        {rows.map((row) => {
          const decision = effective[row.key] ?? decisionFor(row.key);
          const incomplete = !complete(decision);
          const editing = open[row.key] === true || incomplete;
          return (
            <li key={row.key} className="med-list__row" data-confirmed={decision.confirmed || undefined}>
              <div className="med-list__summary">
                <strong>{decision.name.trim() || 'Medicament necitit'}</strong>
                <span>{[decision.dose.trim(), decision.frequency.trim()].filter(Boolean).join(' · ') || 'completați mai jos'}</span>
                <small>pe {row.occurrences.length} {row.occurrences.length === 1 ? 'foaie' : 'foi'}</small>
              </div>
              {editing && (
                <div className="med-list__fields">
                  <label>Medicament <input value={decision.name} disabled={status.kind === 'saving'} onChange={(event) => change(row.key, { name: event.target.value, confirmed: false })} /></label>
                  <label>Doză <input value={decision.dose} disabled={status.kind === 'saving'} onChange={(event) => change(row.key, { dose: event.target.value, confirmed: false })} /></label>
                  <label>Frecvență <input value={decision.frequency} disabled={status.kind === 'saving'} onChange={(event) => change(row.key, { frequency: event.target.value, confirmed: false })} /></label>
                </div>
              )}
              <div className="med-list__actions">
                <button type="button" className={`ui-button ${decision.confirmed ? 'ui-button--primary' : 'ui-button--secondary'}`} aria-pressed={decision.confirmed}
                  disabled={incomplete || status.kind === 'saving'} onClick={() => change(row.key, { confirmed: !decision.confirmed })}>
                  {decision.confirmed ? 'Corect ✓' : 'Corect'}
                </button>
                {!incomplete && (
                  <button type="button" className="ui-button ui-button--secondary" aria-expanded={editing} disabled={status.kind === 'saving'}
                    onClick={() => setOpen((current) => ({ ...current, [row.key]: !editing }))}>
                    {editing ? 'Închideți' : 'Corectez'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="step__hint">Medicamentele verificate intră în tratamentul din dosar după salvare.</p>
      <button type="button" className="ui-button ui-button--primary" disabled={ready === 0 || status.kind === 'saving'} onClick={() => void save()}>
        {status.kind === 'saving' ? 'Se salvează…' : mode === 'update' ? 'Salvați modificările' : 'Adaugă în dosar'} ({ready} din {rows.length})
      </button>
      {status.text && <p role={status.kind === 'error' ? 'alert' : 'status'}>{status.text}</p>}
    </section>
  );
}
