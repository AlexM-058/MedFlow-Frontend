import { useCallback, useEffect, useState } from 'react';
import type { CareCaseAdapter } from '../care-scenario/contracts';
import { DataSourceBadge } from '../care-scenario/DataSourceBadge';
import { attributionLabel, buildPatientFeedbackView, type PatientFeedbackView } from './feedbackLogic';
import './patient-feedback.css';

type Loaded =
  | { status: 'ready'; view: PatientFeedbackView }
  | { status: 'error'; message: string };

interface Settled {
  adapter: CareCaseAdapter;
  attempt: number;
  loaded: Loaded;
}

/**
 * Patient's view of the doctor's answer (M8). Reads only getFeedback(): the summary,
 * variants and any AI-generated text are never requested here.
 */
export function PatientFeedbackPanel({ adapter, refreshKey = 0 }: { adapter: CareCaseAdapter; refreshKey?: number }) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    adapter.getFeedback(controller.signal).then(
      (feedback) => {
        if (!controller.signal.aborted) {
          setSettled({ adapter, attempt, loaded: { status: 'ready', view: buildPatientFeedbackView(feedback) } });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          const message = error instanceof Error && error.message ? error.message : 'Cererea a eșuat.';
          setSettled({ adapter, attempt, loaded: { status: 'error', message } });
        }
      },
    );
    return () => controller.abort();
  }, [adapter, attempt, refreshKey]);

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  // Data from a previous adapter (another account) is never shown.
  const sameAdapter = settled !== null && settled.adapter === adapter;
  const loading = !sameAdapter || settled.attempt !== attempt;
  const loaded = sameAdapter ? settled.loaded : null;
  // While refreshing, keep showing the last answer for this adapter.
  const view = loaded?.status === 'ready' ? loaded.view : null;

  return (
    <section className="patient-feedback" aria-labelledby="patient-feedback-title" aria-busy={loading || undefined}>
      <header className="patient-feedback__header">
        <h2 id="patient-feedback-title" className="patient-feedback__title">
          Răspunsul medicului dumneavoastră
        </h2>
        <DataSourceBadge source={adapter.source} />
      </header>

      {loading && loaded === null && <p role="status">Se încarcă…</p>}

      {loaded?.status === 'error' && !loading && (
        <p className="patient-feedback__alert patient-feedback__alert--error" role="alert">
          Răspunsul medicului dumneavoastră nu a putut fi încărcat: {loaded.message}
        </p>
      )}

      {view?.state === 'pending' && (
        <p className="patient-feedback__pending" role="status">
          Încă nu există un răspuns de la medicul dumneavoastră.
        </p>
      )}

      {view?.state === 'answered' && (
        <figure className="patient-feedback__answer">
          <figcaption className="patient-feedback__attribution">
            <strong>{attributionLabel(view.doctorName)}</strong>
          </figcaption>
          <blockquote className="patient-feedback__text">{view.text}</blockquote>
          <p className="patient-feedback__time">
            Trimis <time dateTime={view.createdAt}>{view.timeLabel}</time>
          </p>
        </figure>
      )}

      <div className="patient-feedback__actions">
        <button
          type="button"
          className="ui-button ui-button--secondary"
          onClick={refresh}
          disabled={loading}
          aria-busy={loading || undefined}
        >
          {loading ? 'Se reîmprospătează…' : loaded?.status === 'error' ? 'Încercați din nou' : 'Reîmprospătați'}
        </button>
      </div>
    </section>
  );
}
