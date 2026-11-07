import { useId, useState, type FormEvent } from 'react';
import { NOT_PRESENT_ALLOWED, type ReviewFieldState } from './prescriptionReviewLogic';

type ActionError = string | null;

export interface ReviewFieldCardProps {
  field: ReviewFieldState;
  disabled: boolean;
  onConfirm: () => ActionError;
  onEdit: (text: string) => ActionError;
  onNotPresent: () => ActionError;
  onReset: () => void;
}

const NOT_READABLE = 'Ilizibil — introduceți-l de pe rețeta pe hârtie sau întrebați medicul';

/** One extracted field: value, source quote and the patient's explicit decision. */
export function ReviewFieldCard({ field, disabled, onConfirm, onEdit, onNotPresent, onReset }: ReviewFieldCardProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const inputId = `${id}-input`;
  const errorId = `${id}-error`;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { resolution } = field;
  const unreadable = field.extracted === null;
  const canMarkNotPresent = NOT_PRESENT_ALLOWED.has(field.key);

  const startEdit = () => {
    // Prefill only with text that came from the document or from the patient; never a guess.
    setDraft(resolution.kind === 'confirmed' ? resolution.value : (field.extracted ?? ''));
    setError(null);
    setEditing(true);
  };

  const submitEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const failure = onEdit(draft);
    setError(failure);
    if (!failure) setEditing(false);
  };

  const run = (action: () => ActionError) => () => setError(action());

  const state =
    resolution.kind === 'pending' ? (unreadable ? 'unreadable' : 'pending') : resolution.kind;

  return (
    <div className="rx-review-field" data-state={state} role="group" aria-labelledby={labelId}>
      <div className="rx-review-field__head">
        <span id={labelId} className="rx-review-field__label">
          {field.label}
        </span>
        <span className="rx-review-field__status">
          {resolution.kind === 'confirmed'
            ? resolution.edited
              ? 'Corectat de dumneavoastră'
              : 'Confirmat de dumneavoastră'
            : resolution.kind === 'not-present'
              ? 'Nu figurează pe rețetă'
              : unreadable
                ? 'Ilizibil'
                : 'Verificați această valoare'}
        </span>
      </div>

      {resolution.kind === 'confirmed' ? (
        <>
          <p className="rx-review-field__value">{resolution.value}</p>
          {resolution.edited && (
            <p className="rx-review-field__note">
              {field.extracted === null ? 'Cititorul nu a putut citi acest câmp.' : `Cititorul a văzut: „${field.extracted}”`}
            </p>
          )}
        </>
      ) : resolution.kind === 'not-present' ? (
        <p className="rx-review-field__value">Ați confirmat că acest element nu este scris pe rețetă.</p>
      ) : unreadable ? (
        <p className="rx-review-field__unreadable">{NOT_READABLE}</p>
      ) : (
        <p className="rx-review-field__value">{field.extracted}</p>
      )}

      {field.sourceQuote && (
        <p className="rx-review-field__quote">
          Din document: <q>{field.sourceQuote}</q>
        </p>
      )}

      {editing ? (
        <form className="rx-review-field__edit" onSubmit={submitEdit} noValidate>
          <label htmlFor={inputId}>Introduceți {field.label.toLowerCase()} exact așa cum este scris pe rețetă</label>
          <input
            id={inputId}
            className="rx-review-input"
            type="text"
            value={draft}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
          />
          <div className="rx-review-actions">
            <button type="submit" className="ui-button ui-button--primary" disabled={disabled}>
              Salvați corecția
            </button>
            <button
              type="button"
              className="ui-button ui-button--secondary"
              disabled={disabled}
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              Anulați
            </button>
          </div>
        </form>
      ) : (
        <div className="rx-review-actions">
          {resolution.kind === 'pending' ? (
            <>
              {!unreadable && (
                <button type="button" className="ui-button ui-button--primary" disabled={disabled} onClick={run(onConfirm)}>
                  Confirmați
                </button>
              )}
              <button type="button" className="ui-button ui-button--secondary" disabled={disabled} onClick={startEdit}>
                {unreadable ? 'Introduceți' : 'Editați'}
              </button>
              {canMarkNotPresent && (
                <button
                  type="button"
                  className="ui-button ui-button--secondary"
                  disabled={disabled}
                  onClick={run(onNotPresent)}
                >
                  Nu figurează pe rețetă
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              className="ui-button ui-button--secondary"
              disabled={disabled}
              onClick={() => {
                setError(null);
                onReset();
              }}
            >
              Modificați
            </button>
          )}
        </div>
      )}

      {error && (
        <p id={errorId} className="rx-review-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
