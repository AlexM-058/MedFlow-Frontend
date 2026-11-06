import { MessageItem } from './MessageItem';
import type { ChatMessage } from './types';

export function MessageList({ messages }: { messages: readonly ChatMessage[] }) {
  return (
    <ol className="message-list" role="log" aria-live="polite" aria-label="Conversation">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </ol>
  );
}
