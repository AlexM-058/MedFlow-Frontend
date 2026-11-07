import { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import type { PatientSuggestionPanelProps } from './types';
import './patient-suggestions.css';

const MOBILE_QUERY = '(max-width: 47.999rem)';

function subscribeToViewport(callback: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}

function getMobileSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ro-RO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Bucharest',
  }).format(date);
}

/** Read-only synthetic doctor content, separate from the AI conversation. */
export function PatientSuggestionPanel({ suggestion, onClose }: PatientSuggestionPanelProps) {
  const isMobile = useSyncExternalStore(subscribeToViewport, getMobileSnapshot, () => false);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const demoId = useId();
  const dateLabel = formatDate(suggestion.createdAt);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const trigger = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
      // This read-only mobile dialog has one interactive element: its close button.
      if (isMobile && event.key === 'Tab') {
        event.preventDefault();
        closeRef.current?.focus();
      }
    }

    function keepMobileFocus(event: FocusEvent) {
      if (isMobile && event.target instanceof Node && !panel?.contains(event.target)) {
        closeRef.current?.focus();
      }
    }

    panel.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', keepMobileFocus);
    if (isMobile && !panel.contains(document.activeElement)) closeRef.current?.focus();
    return () => {
      panel.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', keepMobileFocus);
    };
  }, [isMobile]);

  return (
    <section
      ref={panelRef}
      className="patient-suggestion-panel"
      role={isMobile ? 'dialog' : 'region'}
      aria-modal={isMobile ? true : undefined}
      aria-labelledby={titleId}
      aria-describedby={demoId}
      data-suggestion-id={suggestion.id}
    >
      <div className="patient-suggestion-panel__header">
        <span className="patient-suggestion-panel__eyebrow">Echipa medicală</span>
        <button
          ref={closeRef}
          className="ui-button ui-button--secondary patient-suggestion-panel__close"
          type="button"
          onClick={onClose}
          aria-label="Închideți sugestia medicului"
        >
          <span>Închideți</span>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>

      <div className="patient-suggestion-panel__scroll">
        <article className="patient-suggestion-card">
          <span className="patient-suggestion-card__eyebrow">Echipa medicală</span>
          <h2 id={titleId} className="patient-suggestion-card__title">Sugestia medicului</h2>
          <p className="patient-suggestion-card__text">{suggestion.text}</p>
          <footer className="patient-suggestion-card__footer">
            <span>{suggestion.doctorName}</span>
            {dateLabel && <time dateTime={suggestion.createdAt}>{dateLabel}</time>}
          </footer>
        </article>

        <p id={demoId} className="patient-suggestion-panel__demo" role="note">
          <strong>Sugestie demo.</strong> Acesta este un exemplu fictiv, nu un mesaj primit
          de la un medic. Nu se oferă sfaturi medicale sau tratament.
        </p>
      </div>
    </section>
  );
}
