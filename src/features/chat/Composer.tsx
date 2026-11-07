import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { brand } from '../../brand/brand.config';

interface ComposerProps {
  /** Returns true when the message was accepted; the input is cleared only then. */
  onSend: (text: string) => boolean;
  /** A reply is pending: typing stays possible, sending is blocked. */
  isSending: boolean;
  disabled?: boolean;
}

export function Composer({ onSend, isSending, disabled = false }: ComposerProps) {
  const [text, setText] = useState('');
  const inputId = useId();
  const hintId = useId();
  const canSend = text.trim().length > 0 && !isSending && !disabled;

  function submit() {
    if (!canSend) return;
    if (onSend(text.trim())) setText('');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    // Enter that confirms an IME composition (e.g. CJK input) must not send.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    submit();
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <div className="composer__column">
        <div className="composer__row">
          <label htmlFor={inputId} className="visually-hidden">
            Mesaj pentru {brand.assistantName}
          </label>
          <textarea
            id={inputId}
            className="composer__input"
            rows={1}
            maxLength={2000}
            placeholder="Scrieți mesajul dumneavoastră..."
            value={text}
            disabled={disabled}
            aria-describedby={hintId}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="submit"
            className="composer__send"
            disabled={!canSend}
            aria-busy={isSending || undefined}
            aria-label={isSending ? 'Se așteaptă răspunsul' : 'Trimiteți mesajul'}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" focusable="false">
              <path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
            </svg>
            <span className="composer__send-label">Trimite</span>
          </button>
        </div>
        <p id={hintId} className="composer__hint">
          Enter pentru a trimite, Shift+Enter pentru rând nou.
        </p>
      </div>
    </form>
  );
}
