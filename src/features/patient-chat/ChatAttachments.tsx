import { useEffect, useId, useRef, useState } from 'react';

export function ChatAttachments({ onOpenHealthData, onOpenDocuments }: { onOpenHealthData: () => void; onOpenDocuments?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const optionsId = useId();

  useEffect(() => {
    if (!expanded) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setExpanded(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setExpanded(false);
      trigger.current?.focus();
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [expanded]);

  return (
    <>
      <div className="chat-attachments" ref={container} onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false);
      }}>
        <button ref={trigger} type="button" className="chat-attachments__trigger" aria-label="Adăugați în conversație"
          title="Adăugați" aria-expanded={expanded} aria-controls={optionsId} onClick={() => setExpanded((value) => !value)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <div id={optionsId} className="chat-attachments__options" hidden={!expanded} role="group" aria-label="Adăugați în conversație">
          {onOpenDocuments && <button type="button" onClick={() => { setExpanded(false); onOpenDocuments(); }}>Documente medicale</button>}
          <button type="button" onClick={() => { setExpanded(false); trigger.current?.focus(); onOpenHealthData(); }}>Alergii, afecțiuni sau medicamente</button>
        </div>
      </div>
    </>
  );
}
