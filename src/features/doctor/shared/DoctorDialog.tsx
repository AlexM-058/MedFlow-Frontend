import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';

export interface DoctorDialogProps {
  open: boolean;
  title: string;
  /** Optional short text under the title, linked via aria-describedby. */
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Action buttons, rendered in a footer that stays visible while the body scrolls. */
  footer?: ReactNode;
  /** Element to focus on open; defaults to the first focusable control in the body. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Block Escape and the close button, e.g. while sending. */
  preventClose?: boolean;
  wide?: boolean;
  closeLabel?: string;
}

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Modal built on native <dialog>.showModal(): the rest of the page is inert
 * (focus is contained), Escape closes, and focus returns to the trigger.
 */
export function DoctorDialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  initialFocusRef,
  preventClose = false,
  wide = false,
  closeLabel = 'Close',
}: DoctorDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  // Latest props for the native `close` handler (declared first so it runs before the open effect).
  const latest = useRef({ open, preventClose, onClose });
  useEffect(() => {
    latest.current = { open, preventClose, onClose };
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      const active = document.activeElement;
      returnFocusRef.current = active instanceof HTMLElement ? active : null;
      dialog.showModal();
      const target = initialFocusRef?.current ?? bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }

    if (!open) {
      const trigger = returnFocusRef.current;
      returnFocusRef.current = null;
      if (trigger?.isConnected) trigger.focus();
    }
  }, [open, initialFocusRef]);

  // Closing on unmount while open must still restore focus.
  useEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      if (dialog?.open) dialog.close();
      const trigger = returnFocusRef.current;
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={`doctor-dialog${wide ? ' doctor-dialog--wide' : ''}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        // Escape: keep React as the source of truth for `open`.
        event.preventDefault();
        if (!preventClose) onClose();
      }}
      onKeyDown={(event) => {
        // Keep Tab cycling inside the dialog instead of leaving to the browser UI.
        if (event.key !== 'Tab') return;
        const dialog = dialogRef.current;
        if (!dialog) return;
        const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
        if (items.length === 0) {
          event.preventDefault();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const current = document.activeElement;
        if (event.shiftKey && (current === first || !dialog.contains(current))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && current === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onClose={() => {
        // Browsers may close a modal natively without a cancel event (e.g. repeated
        // Escape without user activation). Keep React state in sync with the DOM.
        const current = latest.current;
        if (!current.open) return;
        if (current.preventClose) dialogRef.current?.showModal();
        else current.onClose();
      }}
    >
      <div className="doctor-dialog__header">
        <div>
          <h2 id={titleId} className="doctor-dialog__title">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="doctor-dialog__description">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          className="doctor-button doctor-button--secondary"
          onClick={onClose}
          disabled={preventClose}
        >
          {closeLabel}
        </button>
      </div>
      <div ref={bodyRef} className="doctor-dialog__body">
        {children}
      </div>
      {footer && <div className="doctor-dialog__footer">{footer}</div>}
    </dialog>
  );
}
