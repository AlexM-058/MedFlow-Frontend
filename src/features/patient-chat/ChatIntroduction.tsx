import { useState } from 'react';
import { Modal } from '../../components/Modal';

const NOTICE_KEY = 'medflow.chat-introduction.v1';
let dismissedInMemory = false;

function shouldShowIntroduction(): boolean {
  if (dismissedInMemory) return false;
  try { return window.localStorage.getItem(NOTICE_KEY) !== 'seen'; }
  catch { return true; }
}

/** Stores only a display preference, never medical data or account identifiers. */
export function ChatIntroduction() {
  const [open, setOpen] = useState(shouldShowIntroduction);

  function dismiss() {
    dismissedInMemory = true;
    try { window.localStorage.setItem(NOTICE_KEY, 'seen'); }
    catch { /* Keep the preference for this page lifetime when storage is unavailable. */ }
    setOpen(false);
  }

  return (
    <Modal open={open} title="Înainte de a începe" onClose={dismiss}>
      <div className="patient-chat__introduction">
        <p>Aceasta este o demonstrație. Folosiți doar date fictive.</p>
        <p>Asistentul AI vă ajută să organizați informațiile pentru conversația cu medicul. Nu oferă sfaturi medicale, diagnostice sau tratamente și poate genera răspunsuri greșite.</p>
        <p>Dacă apar recomandări medicale, ignorați-le și nu luați decizii privind sănătatea pe baza lor.</p>
        <p>Platforma nu evaluează starea de sănătate și nu monitorizează urgențe. Mesajele din demonstrație nu sunt instrucțiuni pentru situații reale.</p>
        <button type="button" className="ui-button ui-button--primary" onClick={dismiss}>Am înțeles</button>
      </div>
    </Modal>
  );
}
