import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import { caseApi } from '../../lib/caseApi';
import type { ContextItem, ContextKind } from '../care-scenario/contracts';
import { declareItem, KIND_EXAMPLES, KIND_LABELS, KINDS, MAX_ITEM_LENGTH, validItemText } from './declareItem';

/**
 * A round "+" button, always within reach, that opens a small window to add health data in three taps: choose what
 * (Alergie / Afecțiune / Medicament), write it in your own words, "Adăugați". What is added is saved and confirmed by
 * the patient in the same step, and the window lists what is already there. It replaces the long panel that used to
 * sit on the page. `raised` lifts the button above a message box at the bottom of the screen.
 */
export function AddHealthData({ token, raised = false }: { token: string; raised?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`fab${raised ? ' fab--raised' : ''}`} aria-label="Adăugați date medicale" title="Adăugați date medicale" onClick={() => setOpen(true)}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <Modal open={open} title="Adăugați date medicale" onClose={() => setOpen(false)}>
        <AddForm token={token} />
      </Modal>
    </>
  );
}

function AddForm({ token }: { token: string }) {
  const [kind, setKind] = useState<ContextKind | null>(null);
  const [text, setText] = useState('');
  const [items, setItems] = useState<ContextItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    caseApi.loadContext(token, controller.signal).then(
      (loaded) => { if (!controller.signal.aborted) setItems(loaded); },
      () => { /* the list is a convenience: adding still works */ },
    );
    return () => controller.abort();
  }, [token]);

  useEffect(() => { if (kind) input.current?.focus(); }, [kind]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!kind || saving) return;
    if (validItemText(text) === null) { setMessage({ kind: 'error', text: `Scrieți ce doriți să adăugați (cel mult ${MAX_ITEM_LENGTH} de caractere).` }); return; }
    setSaving(true);
    setMessage(null);
    try {
      const result = await declareItem(
        { add: (itemKind, value) => caseApi.addContext(token, itemKind, value), confirm: (id) => caseApi.updateContext(token, id, 'confirm') },
        kind,
        text,
      );
      setItems((current) => [result.item, ...current.filter((entry) => entry.id !== result.item.id)]);
      setText('');
      setMessage(result.confirmed
        ? { kind: 'ok', text: `Adăugat: ${KIND_LABELS[kind].toLowerCase()} „${result.item.text}”.` }
        : { kind: 'warn', text: 'Salvat, dar nu a putut fi confirmat acum. Îl puteți adăuga din nou mai târziu.' });
      input.current?.focus();
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Nu s-a putut salva. Textul a rămas în câmp; încercați din nou.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="add-data">
      <div className="add-data__kinds" role="group" aria-label="Ce adăugați?">
        {KINDS.map((option) => (
          <button key={option} type="button" className={`ui-button ${kind === option ? 'ui-button--primary' : 'ui-button--secondary'}`} aria-pressed={kind === option}
            onClick={() => { setKind(option); setMessage(null); }}>
            {KIND_LABELS[option]}
          </button>
        ))}
      </div>

      {kind === null ? (
        <p className="step__hint">Alegeți ce doriți să adăugați.</p>
      ) : (
        <form className="add-data__form" onSubmit={(event) => void submit(event)}>
          <label htmlFor="add-data-text">{KIND_LABELS[kind]}</label>
          <input id="add-data-text" ref={input} value={text} maxLength={MAX_ITEM_LENGTH} autoComplete="off" disabled={saving}
            placeholder={KIND_EXAMPLES[kind]} onChange={(event) => setText(event.target.value)} />
          <button type="submit" className="ui-button ui-button--primary" disabled={saving || text.trim() === ''}>
            {saving ? 'Se adaugă…' : 'Adăugați'}
          </button>
        </form>
      )}

      {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={`add-data__message add-data__message--${message.kind}`}>{message.text}</p>}

      {items.length > 0 && (
        <section aria-label="Deja adăugate">
          <h3 className="add-data__list-title">Deja adăugate</h3>
          <ul className="add-data__items">
            {items.map((entry) => (
              <li key={entry.id}>
                <span className="add-data__tag">{KIND_LABELS[entry.kind]}</span>
                <span>{entry.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="step__hint">Scrieți cu propriile cuvinte. Medicul vede ce adăugați.</p>
    </div>
  );
}
