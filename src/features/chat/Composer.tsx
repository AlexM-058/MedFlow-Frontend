import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';

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
            Message to MedFlow Assistant
          </label>
          <textarea
            id={inputId}
            className="composer__input"
            rows={1}
            maxLength={2000}
            placeholder="Write a message…"
            value={text}
            disabled={disabled}
            aria-describedby={hintId}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button type="submit" className="composer__send" disabled={!canSend}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" focusable="false">
              <path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
            </svg>
            <span>Send</span>
          </button>
        </div>
        <p id={hintId} className="composer__hint">
          Enter to send, Shift+Enter for a new line.
        </p>
      </div>
    </form>
  );
}
