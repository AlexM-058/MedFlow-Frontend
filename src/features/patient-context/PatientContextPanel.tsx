import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { ContextItem, ContextKind, PatientContextAdapter } from '../care-scenario/contracts';
import { DataSourceBadge } from '../care-scenario/DataSourceBadge';
import {
  canConfirm,
  canMarkUnknown,
  CONTEXT_GROUPS,
  describeConfirmation,
  describeSource,
  groupItems,
  MAX_ITEM_LENGTH,
  statusLabel,
  upsertItem,
  validateItemText,
  type ContextGroup,
} from './contextLogic';
import './patient-context.css';

type ViewState =
  | { adapter: PatientContextAdapter; attempt: number; status: 'ready'; items: ContextItem[] }
  | { adapter: PatientContextAdapter; attempt: number; status: 'error' };

/** False after unmount, so late results never touch the screen. */
function useAliveRef() {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return alive;
}

/**
 * Allergies, conditions and current medication, each with its source and confirmation.
 * Statuses (including conflicts) come from the adapter; this panel never infers them.
 * A load error shows the error and a retry, never fixture data.
 */
export function PatientContextPanel({ adapter }: { adapter: PatientContextAdapter }) {
  const headingId = useId();
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<ViewState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    adapter.load(controller.signal).then(
      (items) => {
        if (!controller.signal.aborted) setView({ adapter, attempt, status: 'ready', items });
      },
      () => {
        if (!controller.signal.aborted) setView({ adapter, attempt, status: 'error' });
      },
    );
    return () => controller.abort();
  }, [adapter, attempt]);

  // A result for another adapter or an older attempt is still loading from the user's point of view.
  const current = view && view.adapter === adapter && view.attempt === attempt ? view : null;

  async function apply(operation: Promise<ContextItem>) {
    const from = adapter;
    const item = await operation;
    setView((prev) =>
      prev && prev.adapter === from && prev.status === 'ready' ? { ...prev, items: upsertItem(prev.items, item) } : prev,
    );
  }

  const groups = current?.status === 'ready' ? groupItems(current.items) : null;

  return (
    <section className="patient-context" aria-labelledby={headingId}>
      <header className="patient-context-header">
        <h2 id={headingId} className="patient-context-title">
          Your health information
        </h2>
        <DataSourceBadge source={adapter.source} />
      </header>
      <p className="patient-context-intro">
        Check each item. If you are not sure, choose “I don’t know”: your doctor will see it as unknown.
      </p>

      {current === null && (
        <p className="patient-context-status" role="status">
          Loading your health information…
        </p>
      )}

      {current?.status === 'error' && (
        <div className="patient-context-error" role="alert">
          <p>Could not load your health information. Nothing was changed.</p>
          <button type="button" className="ui-button ui-button--secondary" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}

      {groups &&
        CONTEXT_GROUPS.map((group) => (
          <ContextGroupSection
            key={group.kind}
            group={group}
            items={groups[group.kind]}
            onAdd={(kind, text) => apply(adapter.add(kind, text))}
            onConfirm={(id) => apply(adapter.confirm(id))}
            onMarkUnknown={(id) => apply(adapter.markUnknown(id))}
          />
        ))}
    </section>
  );
}

interface GroupProps {
  group: ContextGroup;
  items: ContextItem[];
  onAdd: (kind: ContextKind, text: string) => Promise<void>;
  onConfirm: (id: string) => Promise<void>;
  onMarkUnknown: (id: string) => Promise<void>;
}

function ContextGroupSection({ group, items, onAdd, onConfirm, onMarkUnknown }: GroupProps) {
  const headingId = useId();
  return (
    <section className="patient-context-group" aria-labelledby={headingId}>
      <h3 id={headingId} className="patient-context-group-title">
        {group.title}
      </h3>
      {items.length === 0 ? (
        <p className="patient-context-empty">{group.emptyText}</p>
      ) : (
        <ul className="patient-context-list">
          {items.map((item) => (
            <ContextItemRow key={item.id} item={item} onConfirm={onConfirm} onMarkUnknown={onMarkUnknown} />
          ))}
        </ul>
      )}
      <AddItemForm group={group} onAdd={onAdd} />
    </section>
  );
}

type ItemAction = 'confirm' | 'unknown';

const PENDING_LABEL: Record<ItemAction, string> = { confirm: 'Confirming…', unknown: 'Saving…' };
const ERROR_TEXT: Record<ItemAction, string> = {
  confirm: 'Could not confirm this item. Nothing was changed.',
  unknown: 'Could not save “I don’t know”. Nothing was changed.',
};

interface ItemRowProps {
  item: ContextItem;
  onConfirm: (id: string) => Promise<void>;
  onMarkUnknown: (id: string) => Promise<void>;
}

function ContextItemRow({ item, onConfirm, onMarkUnknown }: ItemRowProps) {
  const alive = useAliveRef();
  const busy = useRef(false);
  const [pending, setPending] = useState<ItemAction | null>(null);
  const [failed, setFailed] = useState<ItemAction | null>(null);
  const source = describeSource(item.source);
  const status = item.confirmation.status;

  async function run(action: ItemAction) {
    // Double-click guard: state updates are asynchronous, the ref is not.
    if (busy.current) return;
    busy.current = true;
    setPending(action);
    setFailed(null);
    try {
      await (action === 'confirm' ? onConfirm(item.id) : onMarkUnknown(item.id));
    } catch {
      if (alive.current) setFailed(action);
    } finally {
      busy.current = false;
      if (alive.current) setPending(null);
    }
  }

  const showConfirm = canConfirm(item);
  const showUnknown = canMarkUnknown(item);

  return (
    <li className={`patient-context-item${status === 'conflict' ? ' patient-context-item--conflict' : ''}`}>
      <div className="patient-context-item-head">
        <p className="patient-context-item-text">{item.text}</p>
        <span className={`patient-context-chip patient-context-chip--${status}`}>{statusLabel(status)}</span>
      </div>

      <p className="patient-context-meta">{source.label}</p>
      {source.quote && <blockquote className="patient-context-quote">“{source.quote}”</blockquote>}
      {status !== 'conflict' && <p className="patient-context-meta">{describeConfirmation(item.confirmation)}</p>}

      {status === 'conflict' && (
        <div className="patient-context-conflict">
          {item.note && <p className="patient-context-note">{item.note}</p>}
          <p className="patient-context-conflict-action">
            Needs your doctor. Do not change your treatment on your own; your doctor will review this.
          </p>
        </div>
      )}

      {(showConfirm || showUnknown) && (
        <div className="patient-context-actions">
          {showConfirm && (
            <button
              type="button"
              className="ui-button ui-button--primary"
              disabled={pending !== null}
              aria-busy={pending === 'confirm' || undefined}
              onClick={() => run('confirm')}
            >
              {pending === 'confirm' ? PENDING_LABEL.confirm : 'Confirm'}
            </button>
          )}
          {showUnknown && (
            <button
              type="button"
              className="ui-button ui-button--secondary"
              disabled={pending !== null}
              aria-busy={pending === 'unknown' || undefined}
              onClick={() => run('unknown')}
            >
              {pending === 'unknown' ? PENDING_LABEL.unknown : 'I don’t know'}
            </button>
          )}
        </div>
      )}

      {failed && (
        <div className="patient-context-error" role="alert">
          <p>{ERROR_TEXT[failed]}</p>
          <button
            type="button"
            className="ui-button ui-button--secondary"
            disabled={pending !== null}
            onClick={() => run(failed)}
          >
            Try again
          </button>
        </div>
      )}
    </li>
  );
}

function AddItemForm({ group, onAdd }: { group: ContextGroup; onAdd: GroupProps['onAdd'] }) {
  const alive = useAliveRef();
  const busy = useRef(false);
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const result = validateItemText(text);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      await onAdd(group.kind, result.text);
      if (alive.current) setText('');
    } catch {
      // The typed text stays in the field, so pressing Add again retries.
      if (alive.current) setError('Could not add this. Your text is kept; try again.');
    } finally {
      busy.current = false;
      if (alive.current) setSaving(false);
    }
  }

  return (
    <form className="patient-context-add" onSubmit={handleSubmit} noValidate>
      <label htmlFor={inputId} className="patient-context-add-label">
        {group.addLabel}
      </label>
      <div className="patient-context-add-row">
        <input
          id={inputId}
          className="patient-context-input"
          type="text"
          value={text}
          maxLength={MAX_ITEM_LENGTH}
          aria-required="true"
          aria-invalid={error !== null || undefined}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="ui-button ui-button--secondary" disabled={saving} aria-busy={saving || undefined}>
          {saving ? 'Adding…' : 'Add'}
        </button>
      </div>
      <p id={hintId} className="patient-context-hint">
        Required, up to {MAX_ITEM_LENGTH} characters. Write it in your own words.
      </p>
      {error && (
        <p id={errorId} className="patient-context-field-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
