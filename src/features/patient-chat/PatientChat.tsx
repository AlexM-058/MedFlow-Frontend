import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/authContext';
import { caseApi, type CaseMessageRecord } from '../../lib/caseApi';
import {
  chooseCase,
  MAX_MESSAGE_LENGTH,
  mergeMessages,
  orderMessages,
  SENDER_LABELS,
  senderKind,
  validDraft,
} from './chatLogic';
import './patient-chat.css';

const REFRESH_MS = 15_000;

type Setup = { phase: 'loading' } | { phase: 'ready'; caseId: string } | { phase: 'error'; message: string };

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/**
 * The patient's real conversation. Every message is saved in the case, so the doctor sees it; the
 * assistant (a local AI model) only asks collection questions and never diagnoses or prescribes.
 * A message is saved before the assistant is asked: if the assistant is unavailable, nothing the
 * patient wrote is lost and the doctor still receives it.
 */
export function PatientChat() {
  const { session, profile } = useAuth();
  const token = session?.access_token ?? null;
  const doctors = profile?.activeDoctors ?? [];
  const doctorKey = doctors.map((doctor) => doctor.id).join(',');
  const [setup, setSetup] = useState<Setup>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [messages, setMessages] = useState<CaseMessageRecord[]>([]);
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState<'saving' | 'asking' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [assistantNote, setAssistantNote] = useState<string | null>(null);
  const [finishedNote, setFinishedNote] = useState<string | null>(null);
  const busy = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const caseId = setup.phase === 'ready' ? setup.caseId : null;

  // Find the conversation with the connected doctor, or open it. Nothing else is shown until this is ready.
  useEffect(() => {
    if (!token || doctorKey === '') return;
    const controller = new AbortController();
    const connected = doctorKey.split(',');
    (async () => {
      try {
        const cases = await caseApi.listCases(token, 0, controller.signal);
        const existing = chooseCase(cases, connected);
        const opened = existing ?? await caseApi.createCase(token, connected[0], controller.signal);
        if (!controller.signal.aborted) setSetup({ phase: 'ready', caseId: opened.id });
      } catch (error) {
        if (!controller.signal.aborted) setSetup({ phase: 'error', message: errorText(error, 'Conversația nu a putut fi pornită.') });
      }
    })();
    return () => controller.abort();
  }, [token, doctorKey, attempt]);

  // Load and keep the saved messages fresh (the doctor may write too).
  useEffect(() => {
    if (!token || !caseId) return;
    const controller = new AbortController();
    caseApi.listMessages(token, caseId, 0, controller.signal).then(
      (loaded) => { if (!controller.signal.aborted) setMessages((current) => mergeMessages(current, loaded)); },
      () => { /* Keep what is on screen; the next refresh tries again. */ },
    );
    return () => controller.abort();
  }, [token, caseId, revision]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) setRevision((value) => value + 1); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [messages, sending]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = validDraft(draft);
    if (!text || busy.current || !token || !caseId) return;
    busy.current = true;
    setSending('saving');
    setProblem(null);
    setAssistantNote(null);
    try {
      const saved = await caseApi.postMessage(token, caseId, text);
      setMessages((current) => mergeMessages(current, [saved]));
      setDraft('');
    } catch (error) {
      setProblem(`${errorText(error, 'Mesajul nu a putut fi trimis.')} Textul a rămas în câmp; puteți încerca din nou.`);
      busy.current = false;
      setSending(null);
      return;
    }
    // The Backend may have added an emergency notice while saving, so refresh before asking the assistant.
    setRevision((value) => value + 1);
    setSending('asking');
    try {
      const answer = await caseApi.askLocalQuestion(token, caseId);
      if (answer.message) {
        const question = answer.message;
        setMessages((current) => mergeMessages(current, [question]));
        setFinishedNote(null);
      } else {
        setFinishedNote(answer.notice);
      }
    } catch {
      setAssistantNote('Mesajul dumneavoastră a fost trimis medicului. Asistentul nu este disponibil acum, așa că nu a pus o întrebare.');
    } finally {
      busy.current = false;
      setSending(null);
    }
  }

  if (doctorKey === '') return null;

  if (setup.phase === 'loading') return <section className="patient-chat" aria-busy="true"><p role="status">Se pregătește conversația…</p></section>;

  if (setup.phase === 'error') {
    return (
      <section className="patient-chat">
        <p role="alert">{setup.message}</p>
        <button type="button" className="ui-button ui-button--primary" onClick={() => { setSetup({ phase: 'loading' }); setAttempt((value) => value + 1); }}>Încercați din nou</button>
      </section>
    );
  }

  const ordered = orderMessages(messages);

  return (
    <section className="patient-chat" aria-labelledby="patient-chat-title">
      <h2 id="patient-chat-title">Discuție cu asistentul</h2>
      <p>Asistentul vă pune câteva întrebări, ca medicul dumneavoastră să înțeleagă situația. Nu pune diagnostice și nu recomandă tratament. Medicul citește tot ce scrieți și vă răspunde personal.</p>
      <p className="patient-chat__urgent"><strong>Dacă este o urgență, sunați la 112.</strong></p>

      {ordered.length === 0 && <p className="patient-chat__empty">Scrieți mai jos ce vă supără sau ce doriți să știe medicul.</p>}
      <ol className="patient-chat__messages" aria-label="Conversația" aria-live="polite">
        {ordered.map((message) => {
          const kind = senderKind(message.senderRole);
          return (
            <li key={message.id} className={`patient-chat__message patient-chat__message--${kind}`}>
              <span className="patient-chat__who">{SENDER_LABELS[kind]}</span>
              <p>{message.content}</p>
              <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}</time>
            </li>
          );
        })}
      </ol>
      {sending === 'asking' && <p role="status" className="patient-chat__status">Asistentul pregătește următoarea întrebare…</p>}
      {assistantNote && <p role="status" className="patient-chat__note">{assistantNote}</p>}
      {finishedNote && sending === null && <p role="status" className="patient-chat__note">{finishedNote}</p>}
      {problem && <p role="alert" className="patient-chat__problem">{problem}</p>}

      <form className="patient-chat__form" onSubmit={(event) => void submit(event)}>
        <label htmlFor="patient-chat-draft">Mesajul dumneavoastră</label>
        <textarea
          id="patient-chat-draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={MAX_MESSAGE_LENGTH}
          readOnly={sending !== null}
          rows={3}
        />
        <button type="submit" className="ui-button ui-button--primary" disabled={sending !== null || validDraft(draft) === null} aria-busy={sending !== null}>
          {sending === 'saving' ? 'Se trimite…' : sending === 'asking' ? 'Se așteaptă asistentul…' : 'Trimiteți'}
        </button>
      </form>
      <div ref={end} />
    </section>
  );
}
