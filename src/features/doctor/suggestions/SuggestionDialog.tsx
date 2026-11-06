import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { SuggestionDialogProps } from '../contracts';
import type { SuggestionTarget } from '../types';
import { DoctorDialog } from '../shared/DoctorDialog';
import { SUGGESTION_PHOTO_RULE, acceptAttribute, formatFileSize } from '../shared/files';
import {
  SUGGESTION_MESSAGE_MAX,
  describeMessageLength,
  hasSuggestionErrors,
  validateSuggestion,
  validateSuggestionMessage,
  validateSuggestionPhoto,
  type SuggestionErrors,
} from './suggestionValidation';
import './doctor-suggestions.css';

/** Simulated round trip. Nothing leaves the browser. */
const DEMO_SEND_DELAY_MS = 800;

type Phase = 'editing' | 'sending' | 'error' | 'success';

interface SelectedPhoto {
  file: File;
  /** Object URL for the local preview; always revoked when replaced or discarded. */
  url: string;
}

/**
 * Doctor-written suggestion for one patient. Demo only: the draft and photo stay
 * in memory, are never uploaded, stored or logged, and are discarded on close.
 */
export function SuggestionDialog({ patient, onClose }: SuggestionDialogProps) {
  if (!patient) return null;
  // Keyed by patient: a new patient (or reopening) always starts from a clean draft,
  // and unmounting on close revokes the preview URL and clears timers.
  return <SuggestionDialogSession key={patient.id} patient={patient} onClose={onClose} />;
}

interface SessionProps {
  patient: SuggestionTarget;
  onClose: () => void;
}

function SuggestionDialogSession({ patient, onClose }: SessionProps) {
  const [message, setMessage] = useState('');
  const [photo, setPhoto] = useState<SelectedPhoto | null>(null);
  const [errors, setErrors] = useState<SuggestionErrors>({});
  const [phase, setPhase] = useState<Phase>('editing');
  const [simulateError, setSimulateError] = useState(false);

  const messageRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendButtonRef = useRef<HTMLButtonElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const photoUrlRef = useRef<string | null>(null);
  const sendingRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const ids = {
    message: useId(),
    messageHint: useId(),
    messageCount: useId(),
    messageError: useId(),
    photoInput: useId(),
    photoHint: useId(),
    photoError: useId(),
    simulate: useId(),
  };

  // Unmount (dialog closed or patient changed): drop the preview URL and pending send.
  useEffect(() => {
    return () => {
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
      photoUrlRef.current = null;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      sendingRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (phase === 'success') successRef.current?.focus();
  }, [phase]);

  const sending = phase === 'sending';
  const messageInvalid = Boolean(errors.message);
  const photoInvalid = Boolean(errors.photo);

  function replacePhoto(next: SelectedPhoto | null) {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    photoUrlRef.current = next?.url ?? null;
    setPhoto(next);
  }

  function resetFileInput() {
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function leaveErrorPhase() {
    if (phase === 'error') setPhase('editing');
  }

  function handleMessageChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const next = event.target.value;
    setMessage(next);
    leaveErrorPhase();
    // Once an error is shown, update it live so it disappears when fixed.
    if (errors.message) {
      setErrors((current) => ({ ...current, message: validateSuggestionMessage(next) ?? undefined }));
    }
  }

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    leaveErrorPhase();
    if (!file) return;
    const problem = validateSuggestionPhoto(file);
    if (problem) {
      // Keep any previously accepted photo; never preview the rejected file.
      setErrors((current) => ({ ...current, photo: problem }));
      resetFileInput();
      return;
    }
    setErrors((current) => ({ ...current, photo: undefined }));
    replacePhoto({ file, url: URL.createObjectURL(file) });
    resetFileInput();
  }

  function handleRemovePhoto() {
    replacePhoto(null);
    setErrors((current) => ({ ...current, photo: undefined }));
    leaveErrorPhase();
    resetFileInput();
    fileInputRef.current?.focus();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sendingRef.current || phase === 'success') return;

    const nextErrors = validateSuggestion({ message, photo: photo?.file ?? null });
    setErrors(nextErrors);
    if (hasSuggestionErrors(nextErrors)) {
      setPhase('editing');
      if (nextErrors.message) messageRef.current?.focus();
      else fileInputRef.current?.focus();
      return;
    }

    sendingRef.current = true;
    setPhase('sending');
    const shouldFail = simulateError;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      sendingRef.current = false;
      if (shouldFail) {
        setPhase('error');
        sendButtonRef.current?.focus();
        return;
      }
      // Draft is discarded on the (demo) success; nothing was transmitted.
      replacePhoto(null);
      setMessage('');
      setPhase('success');
    }, DEMO_SEND_DELAY_MS);
  }

  const description = (
    <>
      Patient: {patient.name} <span className="doctor-suggestion-id">· ID {patient.id}</span>
    </>
  );

  const statusText =
    phase === 'sending'
      ? `Sending suggestion to ${patient.name} (demo)…`
      : phase === 'success'
        ? `Demo only: this suggestion was not sent to ${patient.name} and was not saved.`
        : '';

  const formId = `${ids.message}-form`;

  const footer =
    phase === 'success' ? (
      <button type="button" className="doctor-button doctor-button--primary" onClick={onClose}>
        Close
      </button>
    ) : (
      <>
        <button type="button" className="doctor-button doctor-button--secondary" onClick={onClose} disabled={sending}>
          Cancel
        </button>
        <button
          ref={sendButtonRef}
          type="submit"
          form={formId}
          className="doctor-button doctor-button--primary"
          aria-busy={sending ? 'true' : undefined}
          aria-disabled={sending ? 'true' : undefined}
        >
          {sending ? 'Sending…' : phase === 'error' ? 'Try sending again' : 'Send suggestion'}
        </button>
      </>
    );

  return (
    <DoctorDialog
      open
      title="Give suggestions"
      description={description}
      onClose={onClose}
      preventClose={sending}
      initialFocusRef={messageRef}
      footer={footer}
    >
      <div className="doctor-suggestion">
        {/* Persistent live region so the sending and success states are announced. */}
        <p role="status" className="doctor-sr-only">
          {statusText}
        </p>

        <div className="doctor-notice doctor-notice--info doctor-suggestion-demo">
          <span className="doctor-demo-tag">Demo</span>
          <span>Demo only — nothing is sent to the patient.</span>
        </div>

        {phase === 'success' ? (
          <div ref={successRef} tabIndex={-1} className="doctor-notice doctor-notice--success doctor-suggestion-result">
            <h3 className="doctor-suggestion-result__title">Suggestion not sent (demo)</h3>
            <p>
              Demo only: this suggestion was not sent to {patient.name} and was not saved. The message and any
              photo were discarded from this screen.
            </p>
          </div>
        ) : (
          <form id={formId} className="doctor-suggestion-form" noValidate onSubmit={handleSubmit}>
            <div className="doctor-field">
              <label className="doctor-label" htmlFor={ids.message}>
                Message to {patient.name} <span className="doctor-suggestion-required">(required)</span>
              </label>
              <p id={ids.messageHint} className="doctor-hint">
                Write the suggestion yourself. MedFlow does not generate medical advice.
              </p>
              <textarea
                ref={messageRef}
                id={ids.message}
                className="doctor-input doctor-suggestion-message"
                value={message}
                onChange={handleMessageChange}
                rows={6}
                required
                aria-required="true"
                aria-invalid={messageInvalid ? 'true' : undefined}
                aria-describedby={[ids.messageHint, ids.messageCount, messageInvalid ? ids.messageError : '']
                  .filter(Boolean)
                  .join(' ')}
                disabled={sending}
                autoComplete="off"
                spellCheck
              />
              <p
                id={ids.messageCount}
                className={`doctor-hint doctor-suggestion-count${
                  message.trim().length > SUGGESTION_MESSAGE_MAX ? ' doctor-suggestion-count--over' : ''
                }`}
              >
                {describeMessageLength(message)}
              </p>
              {messageInvalid && (
                <p id={ids.messageError} className="doctor-field-error">
                  {errors.message}
                </p>
              )}
            </div>

            <div className="doctor-field doctor-suggestion-photo">
              <span className="doctor-label">
                Photo <span className="doctor-suggestion-required">(optional)</span>
              </span>
              <p id={ids.photoHint} className="doctor-hint">
                {SUGGESTION_PHOTO_RULE.label}, up to {formatFileSize(SUGGESTION_PHOTO_RULE.maxBytes)}. Kept on this
                device only.
              </p>

              {photo && (
                <figure className="doctor-suggestion-preview">
                  <img
                    className="doctor-suggestion-preview__image"
                    src={photo.url}
                    alt={`Selected photo preview: ${photo.file.name}`}
                  />
                  <figcaption className="doctor-suggestion-preview__meta">
                    <span className="doctor-suggestion-preview__name">{photo.file.name}</span>
                    <span className="doctor-hint">{formatFileSize(photo.file.size)}</span>
                  </figcaption>
                </figure>
              )}

              <div className="doctor-suggestion-photo__actions">
                <input
                  ref={fileInputRef}
                  id={ids.photoInput}
                  type="file"
                  className="doctor-sr-only doctor-suggestion-file-input"
                  accept={acceptAttribute(SUGGESTION_PHOTO_RULE)}
                  onChange={handlePhotoChange}
                  disabled={sending}
                  aria-invalid={photoInvalid ? 'true' : undefined}
                  aria-describedby={[ids.photoHint, photoInvalid ? ids.photoError : ''].filter(Boolean).join(' ')}
                />
                <label
                  htmlFor={ids.photoInput}
                  className="doctor-button doctor-button--secondary doctor-suggestion-file-label"
                  aria-disabled={sending ? 'true' : undefined}
                >
                  {photo ? 'Replace photo' : 'Add photo'}
                </label>
                {photo && (
                  <button
                    type="button"
                    className="doctor-button doctor-button--ghost"
                    onClick={handleRemovePhoto}
                    disabled={sending}
                  >
                    Remove photo
                    <span className="doctor-sr-only"> {photo.file.name}</span>
                  </button>
                )}
              </div>
              {photoInvalid && (
                <p id={ids.photoError} className="doctor-field-error">
                  {errors.photo}
                </p>
              )}
            </div>

            <div className="doctor-suggestion-simulate">
              <input
                id={ids.simulate}
                type="checkbox"
                className="doctor-suggestion-simulate__box"
                checked={simulateError}
                onChange={(event) => setSimulateError(event.target.checked)}
                disabled={sending}
              />
              <label htmlFor={ids.simulate}>
                Simulate a send error <span className="doctor-demo-tag">Demo</span>
              </label>
            </div>

            {phase === 'error' && (
              <div role="alert" className="doctor-notice doctor-notice--error">
                The suggestion could not be sent (simulated error). Your message and photo are kept — try sending
                again.
              </div>
            )}
          </form>
        )}
      </div>
    </DoctorDialog>
  );
}
