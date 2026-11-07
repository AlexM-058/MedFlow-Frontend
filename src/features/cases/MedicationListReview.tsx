import { useEffect, useMemo, useState } from 'react';
import { caseApi, type CaseDocumentRecord } from '../../lib/caseApi';
import { buildReviews, isRowReady, mergeMedications, pendingDocuments, type RowDecision } from './mergedReview';

function errorText(error: unknown) { return error instanceof Error ? error.message : 'Verificarea nu a putut fi salvată.'; }

/**
 * One list of medicines for the whole file (no duplicates across sheets): the patient compares each row with the
 * paper prescriptions, then confirms it or corrects it once. Only checked rows count. A sheet is saved as reviewed
 * only when all its medicines were checked; the server verifies every review against what the reader extracted.
 */
export function MedicationListReview({ caseId, token, refreshKey, onSaved }: { caseId: string; token: string; refreshKey: number; onSaved: () => void }) {
  const [documents, setDocuments] = useState<CaseDocumentRecord[]>([]);
  const [decisions, setDecisions] = useState<Record<string, RowDecision | undefined>>({});
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

  const rows = useMemo(() => mergeMedications(documents), [documents]);
  const pending = useMemo(() => pendingDocuments(documents), [documents]);
  if (rows.length === 0 && status.kind !== 'done' && status.kind !== 'error') return null;

  function decisionFor(key: string): RowDecision {
    const row = rows.find((entry) => entry.key === key);
    return decisions[key] ?? { confirmed: false, name: row?.name ?? '', dose: row?.dose ?? '', frequency: row?.frequency ?? '' };
  }
  function change(key: string, patch: Partial<RowDecision>) {
    setDecisions((current) => ({ ...current, [key]: { ...decisionFor(key), ...patch } }));
  }

  const effective = Object.fromEntries(rows.map((row) => [row.key, decisionFor(row.key)]));
  const ready = rows.filter((row) => isRowReady(effective[row.key])).length;

  async function save() {
    const { reviews, skipped } = buildReviews(documents, rows, effective, new Date().toISOString());
    setStatus({ kind: 'saving', text: `Se salvează 0 din ${reviews.length} foi…` });
    let saved = 0;
    try {
      for (const review of reviews) {
        await caseApi.reviewDocument(token, caseId, review.documentId, review.fields);
        saved += 1;
        setStatus({ kind: 'saving', text: `Se salvează ${saved} din ${reviews.length} foi…` });
      }
      setStatus({
        kind: 'done',
        text: `${saved} foi confirmate.${skipped.length ? ` ${skipped.length} foi rămân neconfirmate, pentru că au medicamente nebifate.` : ''}`,
      });
      setDecisions({});
      setReload((value) => value + 1);
      onSaved();
    } catch (error) {
      setStatus({ kind: 'error', text: `${errorText(error)} ${saved} foi au fost salvate; puteți relua.` });
      setReload((value) => value + 1);
      onSaved();
    }
  }

  return (
    <section className="case-inbox__merged" aria-label="Medicamentele din dosar">
      {rows.length > 0 && (
        <>
          <h4>Medicamentele din dosar</h4>
          <p>
            Am citit {pending.length} foi neconfirmate și am unit medicamentele care se repetă. Comparați fiecare rând cu rețeta de hârtie,
            corectați ce e greșit și bifați „Confirm”. Un câmp care n-a putut fi citit trebuie completat de dumneavoastră.
          </p>
          <ul>
            {rows.map((row) => {
              const decision = effective[row.key] ?? decisionFor(row.key);
              return (
                <li key={row.key}>
                  <fieldset disabled={status.kind === 'saving'}>
                    <legend>{row.name ?? 'Medicament necitit'} · apare pe {row.occurrences.length} {row.occurrences.length === 1 ? 'foaie' : 'foi'}</legend>
                    <label>Medicament <input value={decision.name} onChange={(event) => change(row.key, { name: event.target.value, confirmed: false })} /></label>
                    <label>Doză <input value={decision.dose} onChange={(event) => change(row.key, { dose: event.target.value, confirmed: false })} /></label>
                    <label>Frecvență <input value={decision.frequency} onChange={(event) => change(row.key, { frequency: event.target.value, confirmed: false })} /></label>
                    <label>
                      <input type="checkbox" checked={decision.confirmed} disabled={!decision.name.trim() || !decision.dose.trim() || !decision.frequency.trim()}
                        onChange={(event) => change(row.key, { confirmed: event.target.checked })} /> Confirm
                    </label>
                  </fieldset>
                </li>
              );
            })}
          </ul>
          <button type="button" className="ui-button ui-button--primary" disabled={ready === 0 || status.kind === 'saving'} onClick={() => void save()}>
            Salvați medicamentele confirmate ({ready} din {rows.length})
          </button>
        </>
      )}
      {status.text && <p role={status.kind === 'error' ? 'alert' : 'status'}>{status.text}</p>}
    </section>
  );
}
