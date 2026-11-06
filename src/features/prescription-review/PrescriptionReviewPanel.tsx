import { useEffect, useId, useRef, useState } from 'react';
import type {
  ConfirmedMedication,
  ExtractedDocument,
  LocalDocument,
  PrescriptionAdapter,
} from '../care-scenario/contracts';
import { DataSourceBadge } from '../care-scenario/DataSourceBadge';
import { DocumentScanner, revokeScannedDocumentUri } from '../document-scanner';
import {
  buildReviewFields,
  canConfirm,
  confirmField,
  editField,
  markNotPresent,
  medicationCount,
  missingFields,
  resetField,
  toReviewedFields,
  type ActionResult,
  type ReviewFieldState,
} from './prescriptionReviewLogic';
import { ReviewFieldCard } from './ReviewFieldCard';
import './prescription-review.css';

export interface PrescriptionReviewPanelProps {
  adapter: PrescriptionAdapter;
  onConfirmed?: (medications: ConfirmedMedication[]) => void;
}

type Step =
  | { kind: 'scan' }
  | { kind: 'extracting' }
  | { kind: 'extract-error'; message: string }
  | { kind: 'review' }
  | { kind: 'saved'; medications: ConfirmedMedication[] };

const STEPS = [
  { key: 'scan', label: 'Scan' },
  { key: 'review', label: 'Review' },
  { key: 'confirm', label: 'Confirm' },
] as const;

function stepIndex(step: Step): number {
  if (step.kind === 'review') return 1;
  if (step.kind === 'saved') return 2;
  return 0;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() !== '' ? error.message : fallback;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function medicationTitle(index: number, total: number): string {
  return total > 1 ? `Medication ${index + 1}` : 'Medication';
}

/** Scan → review every extracted field → confirm. Nothing is filled in from assumptions. */
export function PrescriptionReviewPanel({ adapter, onConfirmed }: PrescriptionReviewPanelProps) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const missingId = `${uid}-missing`;
  const [step, setStep] = useState<Step>({ kind: 'scan' });
  const [document, setDocument] = useState<LocalDocument | null>(null);
  const [extracted, setExtracted] = useState<ExtractedDocument | null>(null);
  const [fields, setFields] = useState<ReviewFieldState[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const documentRef = useRef<LocalDocument | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const savingRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const lastStepRef = useRef<Step['kind'] | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
      revokeScannedDocumentUri(documentRef.current);
      documentRef.current = null;
    };
  }, []);

  // Move focus to the new step's heading (not on first render, so loading never steals focus).
  useEffect(() => {
    if (lastStepRef.current !== null && lastStepRef.current !== step.kind) headingRef.current?.focus();
    lastStepRef.current = step.kind;
  }, [step.kind]);

  const replaceDocument = (next: LocalDocument | null) => {
    if (documentRef.current && documentRef.current !== next) revokeScannedDocumentUri(documentRef.current);
    documentRef.current = next;
    setDocument(next);
  };

  const runExtract = async (target: LocalDocument) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStep({ kind: 'extracting' });
    setExtracted(null);
    setFields([]);
    setSaveError(null);
    try {
      const result = await adapter.extract(target, controller.signal);
      if (controller.signal.aborted || !mountedRef.current) return;
      setExtracted(result);
      setFields(buildReviewFields(result));
      setStep({ kind: 'review' });
    } catch (error) {
      if (controller.signal.aborted || !mountedRef.current) return;
      // The local document stays; no fixture data is substituted.
      setStep({ kind: 'extract-error', message: errorMessage(error, 'The document could not be read.') });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const handleScanned = (scanned: LocalDocument) => {
    replaceDocument(scanned);
    void runExtract(scanned);
  };

  const scanAnother = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    replaceDocument(null);
    setExtracted(null);
    setFields([]);
    setSaveError(null);
    setStep({ kind: 'scan' });
  };

  const apply = (result: ActionResult): string | null => {
    if (!result.ok) return result.error;
    setFields(result.fields);
    return null;
  };

  const handleSave = async () => {
    if (savingRef.current || !extracted || !canConfirm(fields)) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const medications = await adapter.saveReview(extracted.id, toReviewedFields(fields));
      if (!mountedRef.current) return;
      setStep({ kind: 'saved', medications });
      // The original preview is no longer shown; release the local object URL.
      replaceDocument(null);
      onConfirmed?.(medications);
    } catch (error) {
      if (!mountedRef.current) return;
      setSaveError(errorMessage(error, 'Your review could not be saved.'));
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  };

  const current = stepIndex(step);
  const missing = missingFields(fields);
  const ready = canConfirm(fields);
  const total = medicationCount(fields);

  return (
    <section className="rx-review" aria-labelledby={titleId}>
      <header className="rx-review-header">
        <div className="rx-review-header__title">
          <h2 id={titleId}>Prescription review</h2>
          <DataSourceBadge source={adapter.source} />
        </div>
        <p className="rx-review-muted">
          You copy your existing prescription. Nothing here changes your treatment; ask your doctor if anything is
          unclear.
        </p>
        <ol className="rx-review-steps">
          {STEPS.map((item, index) => (
            <li
              key={item.key}
              className="rx-review-steps__item"
              data-status={index < current ? 'done' : index === current ? 'current' : 'todo'}
              aria-current={index === current ? 'step' : undefined}
            >
              <span className="rx-review-steps__number" aria-hidden="true">
                {index + 1}
              </span>
              {item.label}
            </li>
          ))}
        </ol>
      </header>

      {step.kind === 'scan' && (
        <div className="rx-review-step">
          <h3 ref={headingRef} tabIndex={-1} className="rx-review-step__title">
            Step 1: Scan your prescription
          </h3>
          <p className="rx-review-note">Demo: use only a synthetic printed prescription, never a real one.</p>
          <DocumentScanner title="Scan prescription" onConfirm={handleScanned} />
        </div>
      )}

      {(step.kind === 'extracting' || step.kind === 'extract-error') && (
        <div className="rx-review-step">
          <h3 ref={headingRef} tabIndex={-1} className="rx-review-step__title">
            Step 1: Reading your prescription
          </h3>
          <div className="rx-review-layout">
            {document && <OriginalPreview document={document} />}
            <div className="rx-review-column">
              {step.kind === 'extracting' ? (
                <p className="rx-review-pending" role="status" aria-busy="true">
                  Reading the document…
                </p>
              ) : (
                <>
                  <div className="rx-review-error-box" role="alert">
                    <p className="rx-review-error-box__title">The document could not be read.</p>
                    <p>{step.message}</p>
                    <p>Your scan is still on this device. Nothing was filled in for you.</p>
                  </div>
                  <div className="rx-review-actions">
                    {document && (
                      <button
                        type="button"
                        className="ui-button ui-button--primary"
                        onClick={() => void runExtract(document)}
                      >
                        Try again
                      </button>
                    )}
                    <button type="button" className="ui-button ui-button--secondary" onClick={scanAnother}>
                      Scan another
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {step.kind === 'review' && extracted && (
        <div className="rx-review-step">
          <h3 ref={headingRef} tabIndex={-1} className="rx-review-step__title">
            Step 2: Check each field against the paper
          </h3>
          <div className="rx-review-layout">
            {document && <OriginalPreview document={document} />}
            <div className="rx-review-column">
              {extracted.documentType !== 'prescription' && (
                <p className="rx-review-warning-box">
                  This document was read as “{extracted.documentType.replace('_', ' ')}”, not as a prescription.
                  Check it carefully.
                </p>
              )}

              {extracted.warnings.length > 0 && (
                <div className="rx-review-warning-box">
                  <p className="rx-review-warning-box__title">Notes from the document reader</p>
                  <ul>
                    {extracted.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {extracted.dates.length > 0 && (
                <div className="rx-review-card">
                  <h4>Dates on the document</h4>
                  <dl className="rx-review-dates">
                    {extracted.dates.map((date, index) => (
                      <div key={index}>
                        <dt>{date.label ?? 'Date (label not readable)'}</dt>
                        <dd>{date.value ?? 'Not readable'}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {total === 0 ? (
                <div className="rx-review-warning-box" role="alert">
                  <p className="rx-review-warning-box__title">No medication was found on this document.</p>
                  <p>Scan it again or ask your doctor. Nothing was filled in for you.</p>
                </div>
              ) : (
                Array.from({ length: total }, (_, index) => (
                  <section key={index} className="rx-review-card" aria-labelledby={`${uid}-med-${index}`}>
                    <h4 id={`${uid}-med-${index}`}>{medicationTitle(index, total)}</h4>
                    <div className="rx-review-fields">
                      {fields
                        .filter((field) => field.medicationIndex === index)
                        .map((field) => (
                          <ReviewFieldCard
                            key={field.path}
                            field={field}
                            disabled={saving}
                            onConfirm={() => apply(confirmField(fields, field.path, new Date().toISOString()))}
                            onEdit={(text) => apply(editField(fields, field.path, text, new Date().toISOString()))}
                            onNotPresent={() => apply(markNotPresent(fields, field.path, new Date().toISOString()))}
                            onReset={() => void apply(resetField(fields, field.path))}
                          />
                        ))}
                    </div>
                  </section>
                ))
              )}

              <div className="rx-review-card rx-review-submit">
                {missing.length > 0 && (
                  <div id={missingId} className="rx-review-missing">
                    <p className="rx-review-missing__title">Still needed before you can confirm:</p>
                    <ul>
                      {missing.map((item) => (
                        <li key={item.path}>
                          {total > 1 ? `${medicationTitle(item.medicationIndex, total)} · ` : ''}
                          {item.label}:{' '}
                          {item.reason === 'not-readable'
                            ? 'not readable, type it from the paper or ask your doctor'
                            : 'not confirmed yet'}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {saveError && (
                  <div className="rx-review-error-box" role="alert">
                    <p className="rx-review-error-box__title">Your review was not saved.</p>
                    <p>{saveError}</p>
                    <p>Your answers are kept. You can try again.</p>
                  </div>
                )}
                <div className="rx-review-actions">
                  <button
                    type="button"
                    className="ui-button ui-button--primary"
                    disabled={!ready || saving}
                    aria-busy={saving || undefined}
                    aria-describedby={missing.length > 0 ? missingId : undefined}
                    onClick={() => void handleSave()}
                  >
                    {saving ? 'Saving…' : saveError ? 'Try saving again' : 'Confirm prescription'}
                  </button>
                  <button type="button" className="ui-button ui-button--secondary" disabled={saving} onClick={scanAnother}>
                    Scan another
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {step.kind === 'saved' && (
        <div className="rx-review-step">
          <h3 ref={headingRef} tabIndex={-1} className="rx-review-step__title">
            Step 3: Prescription confirmed
          </h3>
          {step.medications.length === 0 ? (
            <p className="rx-review-warning-box" role="status">
              The review was saved, but no medication was returned as confirmed.
            </p>
          ) : (
            <ul className="rx-review-confirmed">
              {step.medications.map((medication) => (
                <li key={medication.id} className="rx-review-card">
                  <h4>{medication.name}</h4>
                  <dl className="rx-review-dates">
                    <div>
                      <dt>Dose</dt>
                      <dd>{medication.doseText}</dd>
                    </div>
                    <div>
                      <dt>Instruction (as prescribed)</dt>
                      <dd>{medication.instructionOriginal}</dd>
                    </div>
                    <div>
                      <dt>Duration</dt>
                      <dd>{medication.durationText ?? 'Not on the prescription'}</dd>
                    </div>
                  </dl>
                  <p className="rx-review-muted">Confirmed by you · {formatTime(medication.confirmedAt)}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="rx-review-muted">Reminder times are chosen separately; they never change the instruction.</p>
          <div className="rx-review-actions">
            <button type="button" className="ui-button ui-button--secondary" onClick={scanAnother}>
              Scan another prescription
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function OriginalPreview({ document }: { document: LocalDocument }) {
  return (
    <figure className="rx-review-original">
      {document.mimeType.startsWith('image/') ? (
        <img className="rx-review-original__image" src={document.uri} alt="Your scanned prescription (original)" />
      ) : (
        <div className="rx-review-original__pdf">PDF ready — preview not shown</div>
      )}
      <figcaption className="rx-review-muted">Original: {document.fileName}</figcaption>
    </figure>
  );
}
