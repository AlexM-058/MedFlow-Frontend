import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { IntakeAdapter } from '../care-scenario/contracts';
import { DataSourceBadge } from '../care-scenario/DataSourceBadge';
import {
  addPending,
  applyResult,
  createClientMessageId,
  deliveryLabel,
  entriesFromHistory,
  setDelivery,
  shouldSendOnKey,
  type ChatEntry,
} from './intakeLogic';
import './intake-chat.css';

const MAX_MESSAGE_LENGTH = 2000;

type ViewState =
  | { adapter: IntakeAdapter; attempt: number; status: 'ready'; entries: ChatEntry[] }
  | { adapter: IntakeAdapter; attempt: number; status: 'error' };

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : timeFormat.format(date);
}

/**
 * Collection-only chat with the assistant. The patient's message is never dropped:
 * it stays visible while sending and after a failure, and retries reuse its
 * clientMessageId. A red flag comes from a fixed rule and replaces the assistant reply.
 */
export function IntakeChatPanel({ adapter }: { adapter: IntakeAdapter }) {
  const headingId = useId();
  const inputId = useId();
  const hintId = useId();
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<ViewState | null>(null);
  const [text, setText] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const alive = useRef(true);
  const logRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    adapter.load(controller.signal).then(
      (messages) => {
        if (!controller.signal.aborted) {
          setView({ adapter, attempt, status: 'ready', entries: entriesFromHistory(messages) });
        }
      },
      () => {
        if (!controller.signal.aborted) setView({ adapter, attempt, status: 'error' });
      },
    );
    return () => controller.abort();
  }, [adapter, attempt]);

  const current = view && view.adapter === adapter && view.attempt === attempt ? view : null;
  const entries = current?.status === 'ready' ? current.entries : null;
  const entryCount = entries?.length ?? 0;
  const lastEntry = entries?.[entryCount - 1];

  // Keep the newest message in view.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [entryCount, lastEntry?.delivery]);

  function updateEntries(from: IntakeAdapter, change: (entries: ChatEntry[]) => ChatEntry[]) {
    setView((prev) =>
      prev && prev.adapter === from && prev.status === 'ready' ? { ...prev, entries: change(prev.entries) } : prev,
    );
  }

  async function send(messageText: string, clientMessageId: string) {
    if (sendingRef.current) return;
    sendingRef.current = true;
    const from = adapter;
    setSendingId(clientMessageId);
    updateEntries(from, (list) => addPending(list, messageText, clientMessageId, new Date().toISOString()));
    try {
      const result = await from.send(messageText, clientMessageId);
      if (alive.current) updateEntries(from, (list) => applyResult(list, clientMessageId, result));
    } catch {
      // The message stays on screen as "Not sent" with a retry that reuses its id.
      if (alive.current) updateEntries(from, (list) => setDelivery(list, clientMessageId, 'failed'));
    } finally {
      sendingRef.current = false;
      if (alive.current) setSendingId(null);
    }
  }

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || sendingRef.current || !entries) return;
    // Generated once here; a retry passes the same id again.
    const clientMessageId = createClientMessageId();
    setText('');
    void send(trimmed, clientMessageId);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const sends = shouldSendOnKey({
      key: event.key,
      shiftKey: event.shiftKey,
      isComposing: event.nativeEvent.isComposing,
      keyCode: event.keyCode,
    });
    if (!sends) return;
    event.preventDefault();
    submit();
  }

  const isSending = sendingId !== null;
  const canSend = entries !== null && text.trim().length > 0 && !isSending;

  return (
    <section className="intake-chat" aria-labelledby={headingId}>
      <header className="intake-chat-header">
        <h2 id={headingId} className="intake-chat-title">
          Spuneți-ne cum vă simțiți
        </h2>
        <DataSourceBadge source={adapter.source} />
      </header>

      <p className="intake-chat-banner">
        Vorbiți cu un asistent AI care colectează informații pentru medicul dumneavoastră. Nu pune diagnostice și nu
        prescrie tratamente. Răspunsul final vine de la medicul dumneavoastră.
      </p>

      {current === null && (
        <p className="intake-chat-status" role="status">
          Se încarcă conversația…
        </p>
      )}

      {current?.status === 'error' && (
        <div className="intake-chat-error" role="alert">
          <p>Conversația nu a putut fi încărcată.</p>
          <button type="button" className="ui-button ui-button--secondary" onClick={() => setAttempt((n) => n + 1)}>
            Încercați din nou
          </button>
        </div>
      )}

      {entries && (
        <ol ref={logRef} className="intake-chat-log" role="log" aria-live="polite" aria-label="Conversație" tabIndex={0}>
          {entries.length === 0 && (
            <li className="intake-chat-empty">Niciun mesaj încă. Descrieți ce simțiți cu propriile cuvinte.</li>
          )}
          {entries.map((entry) => (
            <ChatEntryView
              key={entry.key}
              entry={entry}
              assistantName={adapter.assistantName}
              retryDisabled={isSending}
              onRetry={() => void send(entry.message.text, entry.message.clientMessageId ?? entry.key)}
            />
          ))}
        </ol>
      )}

      <form className="intake-chat-composer" onSubmit={handleSubmit}>
        <label htmlFor={inputId} className="intake-chat-label">
          Mesajul dumneavoastră
        </label>
        <div className="intake-chat-composer-row">
          <textarea
            id={inputId}
            className="intake-chat-input"
            rows={2}
            maxLength={MAX_MESSAGE_LENGTH}
            value={text}
            disabled={entries === null}
            aria-describedby={hintId}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="submit"
            className="ui-button ui-button--primary"
            disabled={!canSend}
            aria-busy={isSending || undefined}
          >
            {isSending ? 'Se trimite…' : 'Trimiteți'}
          </button>
        </div>
        <p id={hintId} className="intake-chat-hint">
          Enter pentru a trimite, Shift+Enter pentru o linie nouă.
        </p>
      </form>
    </section>
  );
}

interface EntryProps {
  entry: ChatEntry;
  assistantName: string;
  retryDisabled: boolean;
  onRetry: () => void;
}

function ChatEntryView({ entry, assistantName, retryDisabled, onRetry }: EntryProps) {
  const { message, delivery } = entry;
  const status = message.role === 'patient' ? deliveryLabel(delivery) : null;
  const author = message.role === 'patient' ? 'Dumneavoastră' : message.role === 'assistant' ? assistantName : 'Notificare';
  const time = formatTime(message.createdAt);

  return (
    <li className={`intake-chat-entry intake-chat-entry--${message.role}`}>
      <div className={`intake-chat-bubble intake-chat-bubble--${message.role}`}>
        <p className="intake-chat-author">
          {author}
          {time && <span className="intake-chat-time"> · {time}</span>}
        </p>
        <p className="intake-chat-text">{message.text}</p>
      </div>

      {status && (
        <p className={`intake-chat-delivery intake-chat-delivery--${delivery}`}>
          {status}
          {delivery === 'failed' && (
            <>
              {' — '}
              <button type="button" className="ui-button ui-button--secondary" disabled={retryDisabled} onClick={onRetry}>
                Reîncercați
              </button>
            </>
          )}
        </p>
      )}

      {entry.partialError && (
        <p className="intake-chat-notice" role="status">
          Mesajul dumneavoastră a fost salvat, dar asistentul nu a putut răspunde.
        </p>
      )}

      {entry.redFlag && (
        <div className="intake-chat-redflag" role="alert">
          <p className="intake-chat-redflag-title">Posibilă urgență</p>
          <p className="intake-chat-redflag-text">{entry.redFlag.message}</p>
          <a className="ui-button ui-button--danger intake-chat-call" href="tel:112">
            Sunați la 112
          </a>
        </div>
      )}
    </li>
  );
}
