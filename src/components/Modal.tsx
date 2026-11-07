import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * A pop-up built on the native <dialog>: it traps the focus, closes with Escape and gives the page behind it back
 * to the user afterwards. On a phone it fills the screen, on a larger screen it is a centered card. Its content is
 * mounted only while it is open, so a camera or a file reader never keeps running behind a closed window.
 */
export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => { if (event.target === dialog.current) onClose(); }}
    >
      <div className="modal__sheet">
        <header className="modal__head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="modal__close" aria-label="Închideți" onClick={onClose}>✕</button>
        </header>
        <div className="modal__body">{open && children}</div>
      </div>
    </dialog>
  );
}
