import { useRef, useState } from 'react';
import type { DecisionVariants } from '../../care-scenario/contracts';
import { formatDateTime } from './caseLogic';
import { errorMessage } from './useResource';

type VariantsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: DecisionVariants }
  | { status: 'error'; message: string };

interface Props {
  requestVariants: () => Promise<DecisionVariants>;
  /** Prefills the editable feedback text only; never sends anything. */
  onStartFrom: (variants: DecisionVariants, index: number) => void;
  disabled: boolean;
}

const PERMANENT_LABEL = 'Suport decizional generat de AI, nu un diagnostic. Decideți dumneavoastră.';

/** Optional, doctor-only. Requested explicitly; never loaded automatically. */
export function CaseVariants({ requestVariants, onStartFrom, disabled }: Props) {
  const [state, setState] = useState<VariantsState>({ status: 'idle' });
  const pending = useRef(false);

  async function generate() {
    if (pending.current) return;
    pending.current = true;
    setState({ status: 'loading' });
    try {
      setState({ status: 'ready', data: await requestVariants() });
    } catch (error) {
      setState({ status: 'error', message: errorMessage(error) });
    } finally {
      pending.current = false;
    }
  }

  const loading = state.status === 'loading';

  return (
    <section className="care-case-card" aria-labelledby="care-case-variants-title">
      <h3 id="care-case-variants-title" className="care-case-card__title">
        Variante de suport decizional (opțional)
      </h3>
      <p className="care-case-alert care-case-alert--info">
        <strong>{PERMANENT_LABEL}</strong>
      </p>

      {state.status !== 'ready' && (
        <button
          type="button"
          className="ui-button ui-button--secondary"
          onClick={generate}
          disabled={loading}
          aria-busy={loading || undefined}
        >
          {loading ? 'Se generează…' : state.status === 'error' ? 'Încercați din nou' : 'Generați variante de suport decizional'}
        </button>
      )}

      {state.status === 'error' && (
        <p className="care-case-alert care-case-alert--error" role="alert">
          Variantele nu au putut fi generate: {state.message}
        </p>
      )}

      {state.status === 'ready' && (
        <>
          <p className="care-case-hint">
            {state.data.generatedBy === 'ai' ? 'Generat de AI' : 'Variante demonstrative (sintetice)'},{' '}
            {formatDateTime(state.data.createdAt)}. Vizibile doar pentru dumneavoastră; nu sunt afișate niciodată pacientului.
          </p>
          <ol className="care-case-variants">
            {state.data.options.map((option, index) => (
              <li key={index} className="care-case-variant">
                <h4 className="care-case-subtitle">Varianta {index + 1}</h4>
                <p className="care-case-verbatim">{option.option}</p>
                <dl className="care-case-fields">
                  <dt>Raționament</dt>
                  <dd>{option.reasoning}</dd>
                  <dt>Grad de încredere</dt>
                  <dd>{option.confidence}</dd>
                  <dt>Cum se confirmă</dt>
                  <dd>{option.confirmationPath}</dd>
                </dl>
                <button
                  type="button"
                  className="ui-button ui-button--secondary"
                  onClick={() => onStartFrom(state.data, index)}
                  disabled={disabled}
                >
                  Pornește de la această variantă
                </button>
              </li>
            ))}
          </ol>
          <h4 className="care-case-subtitle">Informații lipsă</h4>
          {state.data.missingInformation.length === 0 ? (
            <p className="care-case-hint">Nimic listat.</p>
          ) : (
            <ul className="care-case-plain-list">
              {state.data.missingInformation.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          )}
          <h4 className="care-case-subtitle">Contradicții</h4>
          {state.data.contradictions.length === 0 ? (
            <p className="care-case-hint">Nimic listat.</p>
          ) : (
            <ul className="care-case-plain-list">
              {state.data.contradictions.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
