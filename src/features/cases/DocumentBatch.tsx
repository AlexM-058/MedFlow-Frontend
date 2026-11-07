import { useEffect, useId, useRef, useState } from 'react';
import { caseApi } from '../../lib/caseApi';
import { ArchiveError, extractRar, isRarFile } from './archive';
import { countFindings, describeReading, readFindings } from './findings';
import {
  BATCH_MAX_FILES,
  createBatch,
  retryable,
  runBatch,
  summarizeBatch,
  type BatchItem,
  type BatchStop,
} from './batchUpload';
import { loadRarWasm } from './rarWasm';
import './batch.css';

const STATUS_TEXT: Record<BatchItem['status'], string> = {
  pending: 'În așteptare',
  reading: 'Se citește…',
  done: 'Citit',
  failed: 'Nu a putut fi citit',
};

const STOP_TEXT: Record<Exclude<BatchStop, null>, string> = {
  session: 'Sesiunea a expirat. Autentificați-vă din nou, apoi reluați foile rămase.',
  unavailable: 'Serviciul de citire nu răspunde. Foile rămase nu au fost trimise; încercați din nou mai târziu.',
  cancelled: 'Citirea a fost oprită. Puteți relua foile rămase.',
};

/**
 * Many sheets at once (a whole medical file): they are sent ONE AT A TIME with progress, a failing sheet never
 * stops the others and can be retried. The photos stay on this device; the server keeps only what it read.
 * Nothing counts as confirmed here: the patient verifies the medicines afterwards.
 */
export function DocumentBatch({ caseId, token, onFinished }: { caseId: string; token: string; onFinished: () => void }) {
  const inputId = useId();
  const cameraId = useId();
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [stopped, setStopped] = useState<BatchStop>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function start(batch: BatchItem[]) {
    const current = new AbortController();
    controller.current = current;
    setRunning(true);
    setStopped(null);
    const result = await runBatch(
      batch,
      async (file, signal) => {
        const document = await caseApi.uploadDocument(token, caseId, file, 'prescription', signal);
        // Say what was found on the sheet, so a sheet that gave nothing is never shown as a plain success.
        const findings = readFindings(document.extractedData);
        return { id: document.id, note: describeReading(findings), empty: countFindings(findings) === 0 };
      },
      setItems,
      current.signal,
    );
    setStopped(result.stopped);
    setRunning(false);
    onFinished();
  }

  /** Photos and PDFs go in as they are; a .rar is opened here in the browser (nothing is uploaded or saved). */
  async function choose(files: FileList | null) {
    const picked = files ? Array.from(files) : [];
    if (picked.length === 0) return;
    setPreparing(true);
    const documents: File[] = [];
    const rejected: { name: string; reason: string }[] = [];
    for (const file of picked) {
      if (!isRarFile(file)) { documents.push(file); continue; }
      try {
        const opened = await extractRar(await file.arrayBuffer(), await loadRarWasm());
        documents.push(...opened.files);
        rejected.push(...opened.skipped.map((entry) => ({ name: `${file.name} › ${entry.name}`, reason: entry.reason })));
      } catch (error) {
        rejected.push({ name: file.name, reason: error instanceof ArchiveError ? error.message : 'Arhiva nu a putut fi deschisă.' });
      }
    }
    const batch = createBatch(documents, rejected);
    setItems(batch);
    setPreparing(false);
    if (batch.some((item) => item.status === 'pending')) void start(batch);
    else setStopped(null);
  }

  const stats = summarizeBatch(items);
  const left = stats.pending + stats.reading;

  const percent = stats.total === 0 ? 0 : Math.round(((stats.done + stats.failed) / stats.total) * 100);
  const locked = running || preparing;
  const sheetState = (item: BatchItem) => (item.status === 'done' && item.empty ? 'empty' : item.status);
  const SYMBOL: Record<string, string> = { done: '✓', empty: '!', failed: '!', pending: '•', reading: '' };

  return (
    <section className="batch" aria-label="Încărcare documente">
      <div className="batch__choices">
        <label htmlFor={inputId} className={`batch__tile${locked ? ' batch__tile--disabled' : ''}`}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" />
          </svg>
          <span>Încărcați document</span>
        </label>
        <label htmlFor={cameraId} className={`batch__tile${locked ? ' batch__tile--disabled' : ''}`}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" />
          </svg>
          <span>Cameră</span>
        </label>
      </div>
      <input id={cameraId} type="file" accept="image/jpeg,image/png" capture="environment" disabled={locked}
        className="doctor-sr-only" onChange={(event) => { const chosen = event.target.files; void choose(chosen); event.target.value = ''; }} />
      <input id={inputId} type="file" multiple accept="image/jpeg,image/png,application/pdf,.rar,application/vnd.rar,application/x-rar-compressed" disabled={locked}
        className="doctor-sr-only" onChange={(event) => { const chosen = event.target.files; void choose(chosen); event.target.value = ''; }} />
      <p className="batch__hint">Mai multe deodată: JPG, PNG, PDF sau o arhivă RAR (cel mult {BATCH_MAX_FILES} fișiere).</p>
      {preparing && <p className="batch__status" role="status">Se deschid arhivele…</p>}

      {items.length > 0 && (
        <div className="batch__result">
          <div className="batch__progress">
            <div className="batch__bar" role="progressbar" aria-label="Progres citire" aria-valuemin={0} aria-valuemax={stats.total} aria-valuenow={stats.done + stats.failed}>
              <span style={{ width: `${percent}%` }} />
            </div>
            <p className="batch__status" role="status" aria-live="polite">
              {running
                ? `Se citește foaia ${Math.min(stats.done + stats.failed + 1, stats.total)} din ${stats.total}…`
                : `Gata: ${stats.done} din ${stats.total} citite${stats.failed ? `, ${stats.failed} cu probleme` : ''}.`}
            </p>
          </div>

          {!running && stats.empty > 0 && (
            <p className="batch__alert" role="alert">
              {stats.empty === 1 ? 'O foaie a fost citită, dar fără date.' : `${stats.empty} foi au fost citite, dar fără date.`} Încercați o poză mai clară, cu toată foaia în cadru și lumină bună.
            </p>
          )}
          {!running && stopped && <p className="batch__alert" role="alert">{STOP_TEXT[stopped]}</p>}

          <details className="batch__details" open={stats.failed > 0 || stats.empty > 0 || undefined}>
            <summary>Detalii pe foi ({stats.total})</summary>
            <ol className="batch__sheets" aria-label="Foile încărcate">
              {items.map((item) => {
                const state = sheetState(item);
                return (
                  <li key={item.id} className={`batch__sheet batch__sheet--${state}`}>
                    <span className="batch__icon" aria-hidden="true">{SYMBOL[state]}</span>
                    <span className="batch__sheet-body">
                      <strong className="batch__name">{item.name}</strong>
                      <span className="visually-hidden">: {STATUS_TEXT[item.status]}.</span>
                      {item.note && item.status === 'done' && <span className="batch__note">{item.note}</span>}
                      {item.message && item.status === 'failed' && <span className="batch__note" role="alert">{item.message}</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          </details>

          {running && <button type="button" className="ui-button ui-button--secondary" onClick={() => controller.current?.abort()}>Opriți citirea</button>}
          {!running && (stats.failed > 0 || left > 0) && (
            <button type="button" className="ui-button ui-button--primary" onClick={() => void start(retryable(items))}>
              {left > 0 ? 'Reluați foile rămase' : 'Reîncercați foile cu probleme'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
