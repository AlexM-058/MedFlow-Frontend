import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getChatService, isChatSimulated } from './chatService';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import type { ChatMessage } from './types';

type LoadStatus = 'loading' | 'ready' | 'error';

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

export function ChatPage() {
  const service = useMemo(() => getChatService(), []);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isReplying, setIsReplying] = useState(false);
  /** Patient message whose reply failed; kept in the conversation, offered for retry. */
  const [failed, setFailed] = useState<ChatMessage | null>(null);

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
  }, [service, commitMessages]);

  // Keep the newest message and pending/error state in view.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [messages.length, isReplying, failed]);

  const requestReply = useCallback(
    async (patientMessage: ChatMessage) => {
      replyPendingRef.current = true;
      setIsReplying(true);
      setFailed(null);
      try {
        const reply = await service.sendMessage(patientMessage.text, messagesRef.current);
        commitMessages([...messagesRef.current, reply]);
      } catch {
        setFailed(patientMessage);
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

  const handleRetry = useCallback(() => {
    if (failed && !replyPendingRef.current) void requestReply(failed);
  }, [failed, requestReply]);

  return (
    <main className="chat" aria-labelledby="chat-title">
      <h1 id="chat-title" className="visually-hidden">
        Chat with MedFlow Assistant
      </h1>

      <div className="chat__scroll" ref={scrollRef}>
        <div className="chat__column">
          {isChatSimulated && (
            <p className="notice notice--info" role="note">
              <strong>Demo mode.</strong> Assistant replies are simulated and are not medical advice.
            </p>
          )}

          {status === 'loading' && (
            <p className="chat__status" role="status">
              Loading conversation…
            </p>
          )}
          {status === 'error' && (
            <p className="notice notice--error" role="alert">
              The conversation could not be loaded. Please reload the page.
            </p>
          )}

          <MessageList messages={messages} />

          {isReplying && (
            <p className="chat__status" role="status">
              MedFlow Assistant is replying (simulated)…
            </p>
          )}

          {failed && !isReplying && (
            <div className="notice notice--error" role="alert">
              <p>The simulated reply could not be loaded. Your message was kept.</p>
              <button type="button" className="button-secondary" onClick={handleRetry}>
                Retry reply
              </button>
            </div>
          )}
        </div>
      </div>

      <Composer onSend={handleSend} isSending={isReplying} disabled={status !== 'ready'} />
    </main>
  );
}
