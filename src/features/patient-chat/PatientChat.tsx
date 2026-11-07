import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { caseApi, type CaseMessageRecord } from '../../lib/caseApi';
import { Composer } from '../chat/Composer';
import { MessageList } from '../chat/MessageList';
import type { ChatMessage } from '../chat/types';
import { mergeMessages, orderMessages, toChatMessage, validDraft } from './chatLogic';
import { ChatAttachments } from './ChatAttachments';
import { ChatIntroduction } from './ChatIntroduction';
import './patient-chat.css';

const REFRESH_MS = 15_000;

interface Outgoing { id: string; text: string; createdAt: string }

/**
 * The patient's real conversation, in the chat layout of the design: the assistant, the doctor and notices on the
 * left, the patient on the right. Every message is saved in the case (the doctor sees it) BEFORE the assistant is
 * asked: if the assistant is unavailable or a send fails, nothing the patient wrote is lost. The assistant (a local
 * AI model) only asks collection questions and never diagnoses or prescribes.
 */
export function PatientChat({ caseId, token, onOpenDocuments }: { caseId: string; token: string; onOpenDocuments?: () => void }) {
  const [saved, setSaved] = useState<CaseMessageRecord[]>([]);
  const [sendingNow, setSendingNow] = useState<Outgoing | null>(null);
  const [failed, setFailed] = useState<Outgoing[]>([]);
  const [asking, setAsking] = useState(false);
  const [revision, setRevision] = useState(0);
  const [assistantNote, setAssistantNote] = useState<string | null>(null);
  const [finishedNote, setFinishedNote] = useState<string | null>(null);
  const busy = useRef(false);
  const end = useRef<HTMLDivElement>(null);

  // Load and keep the saved messages fresh (the doctor may write too).
  useEffect(() => {
    const controller = new AbortController();
    caseApi.listMessages(token, caseId, 0, controller.signal).then(
      (loaded) => { if (!controller.signal.aborted) setSaved((current) => mergeMessages(current, loaded)); },
      () => { /* Keep what is on screen; the next refresh tries again. */ },
    );
    return () => controller.abort();
  }, [token, caseId, revision]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) setRevision((value) => value + 1); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [saved, sendingNow, asking, failed]);

  /** Saves the message, then asks the assistant for the next question. Never drops the text. */
  const deliver = useCallback(async (item: Outgoing) => {
    setAssistantNote(null);
    try {
      const message = await caseApi.postMessage(token, caseId, item.text);
      setSaved((current) => mergeMessages(current, [message]));
      setSendingNow(null);
    } catch {
      setSendingNow(null);
      setFailed((current) => [...current, item]);
      busy.current = false;
      return;
    }
    // The Backend may have added an emergency notice while saving, so refresh before asking the assistant.
    setRevision((value) => value + 1);
    setAsking(true);
    try {
      const answer = await caseApi.askLocalQuestion(token, caseId);
      if (answer.message) {
        const question = answer.message;
        setSaved((current) => mergeMessages(current, [question]));
        setFinishedNote(null);
      } else {
        setFinishedNote(answer.notice);
      }
    } catch {
      setAssistantNote('Mesajul dumneavoastră a fost trimis medicului. Asistentul nu este disponibil acum, așa că nu a pus o întrebare.');
    } finally {
      busy.current = false;
      setAsking(false);
    }
  }, [token, caseId]);

  const send = useCallback((text: string): boolean => {
    const valid = validDraft(text);
    if (!valid || busy.current) return false;
    busy.current = true;
    const item: Outgoing = { id: `local-${Date.now()}`, text: valid, createdAt: new Date().toISOString() };
    setSendingNow(item);
    void deliver(item);
    return true;
  }, [deliver]);

  function retry(item: Outgoing) {
    if (busy.current) return;
    busy.current = true;
    setFailed((current) => current.filter((entry) => entry.id !== item.id));
    setSendingNow(item);
    void deliver(item);
  }

  const messages: ChatMessage[] = useMemo(() => [
    ...orderMessages(saved).map(toChatMessage),
    ...(sendingNow ? [{ id: sendingNow.id, sender: 'patient' as const, text: sendingNow.text, createdAt: sendingNow.createdAt }] : []),
    ...failed.map((item) => ({ id: item.id, sender: 'patient' as const, text: item.text, createdAt: item.createdAt })),
  ], [saved, sendingNow, failed]);
  const sending = sendingNow !== null || asking;

  return (
    <section className="chat patient-chat" aria-label="Conversație cu asistentul">
      <ChatIntroduction />
      <div className="chat__scroll">
        <div className="chat__column">
          {messages.length === 0 && <p className="chat__empty">Scrieți mai jos ce vă supără sau ce doriți să știe medicul.</p>}
          <MessageList messages={messages} isBusy={sending} />
          {asking && <p className="chat__status chat__typing" role="status"><span className="chat__dots" aria-hidden="true"><i /><i /><i /></span>Asistentul pregătește următoarea întrebare…</p>}
          {assistantNote && <p className="chat__status" role="status">{assistantNote}</p>}
          {finishedNote && !sending && <p className="chat__status" role="status">{finishedNote}</p>}
          {failed.map((item) => (
            <div key={item.id} className="notice notice--error" role="alert">
              <p>Mesajul nu a putut fi trimis, dar textul a fost păstrat: „{item.text.length > 80 ? `${item.text.slice(0, 80)}…` : item.text}”.</p>
              <button type="button" className="ui-button ui-button--secondary" disabled={sending} onClick={() => retry(item)}>Reîncercați trimiterea</button>
            </div>
          ))}
          <div ref={end} />
        </div>
      </div>
      <Composer onSend={send} isSending={sending} actions={<ChatAttachments token={token} onOpenDocuments={onOpenDocuments} />} />
    </section>
  );
}
