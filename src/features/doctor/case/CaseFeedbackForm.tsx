import { useId, type FormEvent, type RefObject } from 'react';
import type { DoctorFeedback } from '../../care-scenario/contracts';
import { characterCountLabel, FEEDBACK_MAX_LENGTH, formatDateTime } from './caseLogic';

interface Props {
  patientName: string;
  sent: DoctorFeedback | null;
  draft: string;
  onDraftChange: (text: string) => void;
  basedOnVariant: number | null;
  sending: boolean;
  /** Send or validation error; the draft is kept. */
  error: string | null;
  onSend: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

/** The doctor's own response. Sent only by the explicit "Send as my response" action. */
export function CaseFeedbackForm({
  patientName,
  sent,
  draft,
  onDraftChange,
  basedOnVariant,
  sending,
  error,
  onSend,
  textareaRef,
}: Props) {
  const fieldId = useId();
  const countId = useId();
  const errorId = useId();

  if (sent) {
    return (
      <section className="care-case-card" aria-labelledby="care-case-feedback-title">
        <h3 id="care-case-feedback-title" className="care-case-card__title">
          Your response
        </h3>
        <p className="care-case-alert care-case-alert--success" role="status">
          Sent to {patientName} on {formatDateTime(sent.createdAt)}.
        </p>
        <p className="care-case-meta">
          {sent.doctor.fullName}
          {sent.basedOnVariant !== null && `, started from decision-support variant ${sent.basedOnVariant + 1} and edited by you`}
        </p>
        <blockquote className="care-case-sent care-case-verbatim">{sent.text}</blockquote>
      </section>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSend();
  }

  const showError = error !== null;

  return (
    <section className="care-case-card" aria-labelledby="care-case-feedback-title">
      <h3 id="care-case-feedback-title" className="care-case-card__title">
        Your response to {patientName}
      </h3>
      <form className="care-case-form" onSubmit={submit} noValidate>
        <label htmlFor={fieldId} className="care-case-label">
          Response (required)
        </label>
        {basedOnVariant !== null && (
          <p className="care-case-hint">
            Prefilled from decision-support variant {basedOnVariant + 1}. Edit it; it is sent as your own words.
          </p>
        )}
        <textarea
          id={fieldId}
          ref={textareaRef}
          className="care-case-textarea"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          maxLength={FEEDBACK_MAX_LENGTH}
          rows={6}
          required
          aria-required="true"
          aria-invalid={showError || undefined}
          aria-describedby={showError ? `${countId} ${errorId}` : countId}
          readOnly={sending}
        />
        <p id={countId} className="care-case-hint">
          {characterCountLabel(draft)}
        </p>
        {showError && (
          <p id={errorId} className="care-case-alert care-case-alert--error" role="alert">
            {error} Your text is kept.
          </p>
        )}
        <div className="care-case-actions">
          <button
            type="submit"
            className="ui-button ui-button--primary"
            disabled={sending}
            aria-busy={sending || undefined}
          >
            {sending ? 'Sending…' : 'Send as my response'}
          </button>
        </div>
      </form>
    </section>
  );
}
