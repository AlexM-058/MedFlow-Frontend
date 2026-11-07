import { MessageItem } from './MessageItem';
import type { ChatMessage } from './types';

interface MessageListProps {
  messages: readonly ChatMessage[];
  isBusy?: boolean;
}

export function MessageList({ messages, isBusy = false }: MessageListProps) {
  return (
    <ol
      className="message-list"
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      aria-busy={isBusy}
      aria-label="Conversație"
    >
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </ol>
  );
}
