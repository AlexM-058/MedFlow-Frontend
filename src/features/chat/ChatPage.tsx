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
        Chat with {brand.assistantName}
      </h1>

      {onOpenSuggestion && (
        <div className="chat__toolbar">
          <div>
            <p className="chat__eyebrow">CARE TEAM</p>
            <p>Stay connected with your doctor</p>
          </div>
          <button
            type="button"
            className="ui-button ui-button--secondary chat__suggestion-button"
            aria-expanded={suggestionOpen}
            onClick={onOpenSuggestion}
          >
            Doctor suggestion <span className="chat__demo-tag">Demo</span>
          </button>
        </div>
      )}

      <div className="chat__scroll" ref={scrollRef}>
        <div className="chat__column">
          {isChatSimulated && (
            <p className="notice notice--info" role="note">
              <strong>Demo mode.</strong> Replies are simulated, not medical advice. Nothing is sent
              to a doctor. Messages are kept only until you reload or leave this demo.
            </p>
          )}

          {status === 'loading' && (
            <p className="chat__status" role="status">
              Loading conversation…
            </p>
          )}
          {status === 'error' && (
            <div className="notice notice--error" role="alert">
              <p>The conversation could not be loaded.</p>
              <button type="button" className="ui-button ui-button--secondary" onClick={retryLoad}>
                Try again
              </button>
            </div>
          )}

          {status === 'ready' && messages.length === 0 && (
            <p className="chat__empty">Start a conversation by writing a message below.</p>
          )}

          {messages.length > 0 && <p className="chat__day">Demo conversation</p>}

          <MessageList messages={messages} isBusy={isReplying} />

          {isReplying && (
            <p className="chat__status" role="status">
              {brand.assistantName} is replying (simulated)…
            </p>
          )}

          {failedMessages.map((message) => (
            <div key={message.id} className="notice notice--error" role="alert">
              <p className="message__text">
                The simulated reply could not be loaded. Your message was kept:
                {' '}“{message.text.length > 80 ? `${message.text.slice(0, 80)}…` : message.text}”
              </p>
              <button
                type="button"
                className="ui-button ui-button--secondary"
                disabled={isReplying}
                aria-label={failedMessages.length === 1 ? 'Retry reply' : `Retry reply to: ${message.text}`}
                onClick={() => handleRetry(message)}
              >
                Retry reply
              </button>
            </div>
          ))}
        </div>
      </div>

      <Composer onSend={handleSend} isSending={isReplying} disabled={status !== 'ready'} />
    </main>
  );
}
