import { useCallback, useRef, useState } from 'react';
import type { CareCaseAdapter, DecisionVariants, DoctorFeedback } from '../../care-scenario/contracts';
import { DataSourceBadge } from '../../care-scenario/DataSourceBadge';
import { CaseFeedbackForm } from './CaseFeedbackForm';
import { CaseOriginals } from './CaseOriginals';
import { CaseSummarySection } from './CaseSummarySection';
import { CaseVariants } from './CaseVariants';
import {
  basedOnVariantAfterEdit,
  caseStatusLabel,
  computeCoverage,
  formatDateTime,
  prefillFromVariant,
  validateFeedback,
} from './caseLogic';
import { errorMessage, useResource } from './useResource';
import './doctor-case.css';

/**
 * Doctor's view of one case (M6-M8): derived summary with sources and code-computed
 * coverage next to the originals, optional variants on request, and the doctor's own
 * response. Errors are shown with retry; no fixture fallback.
 */
export function DoctorCasePanel({ adapter, refreshKey = 0 }: { adapter: CareCaseAdapter; refreshKey?: number }) {
  const loadCase = useCallback((signal: AbortSignal) => adapter.getCase(signal), [adapter]);
  const loadSummary = useCallback((signal: AbortSignal) => adapter.getSummary(signal), [adapter]);
  const loadFeedback = useCallback((signal: AbortSignal) => adapter.getFeedback(signal), [adapter]);
  const [careCase, retryCase] = useResource(loadCase, refreshKey);
  const [summary, retrySummary] = useResource(loadSummary, refreshKey);
  const [feedback, retryFeedback] = useResource(loadFeedback, refreshKey);

  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [basedOnVariant, setBasedOnVariant] = useState<number | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ adapter: CareCaseAdapter; feedback: DoctorFeedback } | null>(null);
  const sendingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const goTo = useCallback((targetId: string) => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
    setHighlightedId(targetId);
  }, []);

  function changeDraft(text: string) {
    setDraft(text);
    setBasedOnVariant((current) => basedOnVariantAfterEdit(text, current));
    if (sendError) setSendError(null);
  }

  function startFromVariant(variants: DecisionVariants, index: number) {
    const prefill = prefillFromVariant(variants, index);
    if (!prefill) return;
    if (draft.trim().length > 0 && draft !== prefill.text && !window.confirm('Replace your current draft with this variant?')) {
      return;
    }
    setDraft(prefill.text);
    setBasedOnVariant(prefill.basedOnVariant);
    setSendError(null);
    textareaRef.current?.focus();
  }

  async function send() {
    if (sendingRef.current) return;
    const validation = validateFeedback(draft);
    if (!validation.ok) {
      setSendError(validation.error);
      textareaRef.current?.focus();
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    try {
      const result = await adapter.sendFeedback(validation.value, basedOnVariant);
      setSent({ adapter, feedback: result });
      setDraft('');
      setBasedOnVariant(null);
    } catch (error) {
      setSendError(`Your response was not sent: ${errorMessage(error)}`);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  if (careCase.status === 'loading') {
    return (
      <section className="care-case" aria-busy="true">
        <p className="care-case-card" role="status">Loading the case…</p>
      </section>
    );
  }

  if (careCase.status === 'error') {
    return (
      <section className="care-case">
        <div className="care-case-card">
          <div className="care-case-alert care-case-alert--error" role="alert">
            <p>The case could not be loaded: {careCase.message}</p>
          </div>
          <div className="care-case-actions">
            <button type="button" className="ui-button ui-button--secondary" onClick={retryCase}>
              Try again
            </button>
            <DataSourceBadge source={adapter.source} />
          </div>
        </div>
      </section>
    );
  }

  const data = careCase.data;
  const sentFeedback = sent && sent.adapter === adapter ? sent.feedback : null;
  const existingFeedback = sentFeedback ?? (feedback.status === 'ready' ? feedback.data : null);
  const lookup = { messages: data.messages, documents: data.documents };
  const coverage = summary.status === 'ready' ? computeCoverage(data.messages, summary.data) : null;

  return (
    <section className="care-case" aria-labelledby="care-case-title">
      <header className="care-case-card care-case-header">
        <div className="care-case-header__main">
          <h2 id="care-case-title" className="care-case-header__title">
            {data.patient.fullName}
          </h2>
          <p className="care-case-meta">
            <span className={`care-case-tag care-case-tag--${existingFeedback ? 'answered' : data.status}`}>
              {caseStatusLabel(data.status, existingFeedback !== null)}
            </span>{' '}
            {data.submittedAt ? `Submitted ${formatDateTime(data.submittedAt)}` : 'Not submitted yet'}
          </p>
        </div>
        <DataSourceBadge source={adapter.source} />
      </header>

      <div className="care-case-columns">
        <div className="care-case-column">
          <CaseSummarySection
            summary={summary}
            onRetry={retrySummary}
            lookup={lookup}
            coverage={coverage}
            onGoTo={goTo}
          />

          {adapter.requestVariants && existingFeedback === null && (
            <CaseVariants
              requestVariants={adapter.requestVariants}
              onStartFrom={startFromVariant}
              disabled={sending}
            />
          )}

          {feedback.status === 'loading' && sentFeedback === null && (
            <p className="care-case-card" role="status">Loading your response…</p>
          )}
          {feedback.status === 'error' && sentFeedback === null && (
            <div className="care-case-card">
              <div className="care-case-alert care-case-alert--error" role="alert">
                <p>Your previous response could not be checked: {feedback.message}</p>
              </div>
              <button type="button" className="ui-button ui-button--secondary" onClick={retryFeedback}>
                Try again
              </button>
            </div>
          )}
          {(feedback.status === 'ready' || sentFeedback !== null) && (
            <CaseFeedbackForm
              patientName={data.patient.fullName}
              sent={existingFeedback}
              draft={draft}
              onDraftChange={changeDraft}
              basedOnVariant={basedOnVariant}
              sending={sending}
              error={sendError}
              onSend={send}
              textareaRef={textareaRef}
            />
          )}
        </div>

        <div className="care-case-column">
          <CaseOriginals careCase={data} highlightedId={highlightedId} />
        </div>
      </div>
    </section>
  );
}
