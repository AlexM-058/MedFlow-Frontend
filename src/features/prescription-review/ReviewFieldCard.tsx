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

const NOT_READABLE = 'Not readable — type it from the paper prescription or ask your doctor';

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
              ? 'Corrected by you'
              : 'Confirmed by you'
            : resolution.kind === 'not-present'
              ? 'Not on the prescription'
              : unreadable
                ? 'Not readable'
                : 'Check this value'}
        </span>
      </div>

      {resolution.kind === 'confirmed' ? (
        <>
          <p className="rx-review-field__value">{resolution.value}</p>
          {resolution.edited && (
            <p className="rx-review-field__note">
              {field.extracted === null ? 'The reader could not read this field.' : `The reader saw: “${field.extracted}”`}
            </p>
          )}
        </>
      ) : resolution.kind === 'not-present' ? (
        <p className="rx-review-field__value">You confirmed this is not written on the prescription.</p>
      ) : unreadable ? (
        <p className="rx-review-field__unreadable">{NOT_READABLE}</p>
      ) : (
        <p className="rx-review-field__value">{field.extracted}</p>
      )}

      {field.sourceQuote && (
        <p className="rx-review-field__quote">
          From the document: <q>{field.sourceQuote}</q>
        </p>
      )}

      {editing ? (
        <form className="rx-review-field__edit" onSubmit={submitEdit} noValidate>
          <label htmlFor={inputId}>Type the {field.label.toLowerCase()} exactly as written on the prescription</label>
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
              Save my correction
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
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="rx-review-actions">
          {resolution.kind === 'pending' ? (
            <>
              {!unreadable && (
                <button type="button" className="ui-button ui-button--primary" disabled={disabled} onClick={run(onConfirm)}>
                  Confirm
                </button>
              )}
              <button type="button" className="ui-button ui-button--secondary" disabled={disabled} onClick={startEdit}>
                {unreadable ? 'Type it' : 'Edit'}
              </button>
              {canMarkNotPresent && (
                <button
                  type="button"
                  className="ui-button ui-button--secondary"
                  disabled={disabled}
                  onClick={run(onNotPresent)}
                >
                  Not on the prescription
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
              Change
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
