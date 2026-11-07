import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { brand } from '../../brand/brand.config';
import { getChatService, isChatSimulated } from './chatService';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import type { ChatMessage } from './types';

type LoadStatus = 'loading' | 'ready' | 'error';

export interface ChatPageProps {
  onOpenSuggestion?: () => void;
  suggestionOpen?: boolean;
}

let patientMessageCounter = 0;
function createPatientMessage(text: string): ChatMessage {
  patientMessageCounter += 1;
  return {
    id: `patient-${Date.now()}-${patientMessageCounter}`,
    sender: 'patient',
    text,
    createdAt: new Date().toISOString(),
  };
}

export function ChatPage({ onOpenSuggestion, suggestionOpen = false }: ChatPageProps) {
  const service = useMemo(() => getChatService(), []);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isReplying, setIsReplying] = useState(false);
  /** Each failed reply remains actionable until that specific message succeeds. */
  const [failedMessages, setFailedMessages] = useState<ChatMessage[]>([]);
  const [loadAttempt, setLoadAttempt] = useState(0);

  // Refs give synchronous truth for guards (double clicks happen before re-render).
  const messagesRef = useRef<ChatMessage[]>([]);
  const replyPendingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const commitMessages = useCallback((next: ChatMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  useEffect(() => {
    let active = true;
    service
      .loadConversation()
      .then((initial) => {
        if (!active) return;
        commitMessages(initial);
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [service, commitMessages, loadAttempt]);

  // Keep the newest message and pending/error state in view.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [messages.length, isReplying, failedMessages]);

  const requestReply = useCallback(
    async (patientMessage: ChatMessage) => {
      replyPendingRef.current = true;
      setIsReplying(true);
      try {
        const reply = await service.sendMessage(patientMessage.text, messagesRef.current);
        commitMessages([...messagesRef.current, reply]);
        setFailedMessages((previous) => previous.filter((message) => message.id !== patientMessage.id));
      } catch {
        setFailedMessages((previous) =>
          previous.some((message) => message.id === patientMessage.id)
            ? previous
            : [...previous, patientMessage],
        );
      } finally {
        replyPendingRef.current = false;
        setIsReplying(false);
      }
    },
    [service, commitMessages],
  );

  const handleSend = useCallback(
    (text: string): boolean => {
      if (replyPendingRef.current || text.trim().length === 0) return false;
      const patientMessage = createPatientMessage(text);
      // Appended exactly once, before the reply is requested; never removed on failure.
      commitMessages([...messagesRef.current, patientMessage]);
      void requestReply(patientMessage);
      return true;
    },
    [commitMessages, requestReply],
  );

  const handleRetry = useCallback((message: ChatMessage) => {
    if (!replyPendingRef.current) void requestReply(message);
  }, [requestReply]);

  function retryLoad() {
    setStatus('loading');
    setLoadAttempt((attempt) => attempt + 1);
  }

  return (
    <main className="chat" aria-labelledby="chat-title">
      <h1 id="chat-title" className="visually-hidden">
        Conversație cu {brand.assistantName}
      </h1>

      {onOpenSuggestion && (
        <div className="chat__toolbar">
          <div>
            <p className="chat__eyebrow">ECHIPA DE ÎNGRIJIRE</p>
            <p>Păstrați legătura cu medicul dumneavoastră</p>
          </div>
          <button
            type="button"
            className="ui-button ui-button--secondary chat__suggestion-button"
            aria-expanded={suggestionOpen}
            onClick={onOpenSuggestion}
          >
            Sugestia medicului <span className="chat__demo-tag">Demo</span>
          </button>
        </div>
      )}

      <div className="chat__scroll" ref={scrollRef}>
        <div className="chat__column">
          {isChatSimulated && (
            <p className="notice notice--info" role="note">
              <strong>Mod demonstrativ.</strong> Răspunsurile sunt simulate și nu reprezintă sfat medical. Nimic nu este trimis
              unui medic. Mesajele sunt păstrate doar până reîncărcați sau părăsiți această demonstrație.
            </p>
          )}

          {status === 'loading' && (
            <p className="chat__status" role="status">
              Se încarcă conversația…
            </p>
          )}
          {status === 'error' && (
            <div className="notice notice--error" role="alert">
              <p>Conversația nu a putut fi încărcată.</p>
              <button type="button" className="ui-button ui-button--secondary" onClick={retryLoad}>
                Încercați din nou
              </button>
            </div>
          )}

          {status === 'ready' && messages.length === 0 && (
            <p className="chat__empty">Începeți conversația scriind un mesaj mai jos.</p>
          )}

          {messages.length > 0 && <p className="chat__day">Conversație demonstrativă</p>}

          <MessageList messages={messages} isBusy={isReplying} />

          {isReplying && (
            <p className="chat__status" role="status">
              {brand.assistantName} răspunde (simulat)…
            </p>
          )}

          {failedMessages.map((message) => (
            <div key={message.id} className="notice notice--error" role="alert">
              <p className="message__text">
                Răspunsul simulat nu a putut fi încărcat. Mesajul dumneavoastră a fost păstrat:
                {' '}“{message.text.length > 80 ? `${message.text.slice(0, 80)}…` : message.text}”
              </p>
              <button
                type="button"
                className="ui-button ui-button--secondary"
                disabled={isReplying}
                aria-label={failedMessages.length === 1 ? 'Reîncercați răspunsul' : `Reîncercați răspunsul la: ${message.text}`}
                onClick={() => handleRetry(message)}
              >
                Reîncercați răspunsul
              </button>
            </div>
          ))}
        </div>
      </div>

      <Composer onSend={handleSend} isSending={isReplying} disabled={status !== 'ready'} />
    </main>
  );
}
