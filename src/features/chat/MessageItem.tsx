import { brand } from '../../brand/brand.config';
import type { ChatMessage } from './types';

const SENDER_LABEL: Record<ChatMessage['sender'], string> = {
  ai: brand.assistantName,
  patient: 'Dumneavoastră',
  doctor: 'Medicul dumneavoastră',
  system: 'Important',
};

/** A quiet clock time (e.g. 14:05); nothing is shown when the timestamp cannot be read. */
function MessageTime({ iso }: { iso: string }) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return <time className="message__time" dateTime={date.toISOString()}>{date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}</time>;
}

export function MessageItem({ message }: { message: ChatMessage }) {
  const isPatient = message.sender === 'patient';

  return (
    <li className={`message message--${message.sender}`}>
      <p className={isPatient ? 'visually-hidden' : 'message__meta'}>
        <span className="message__sender">{SENDER_LABEL[message.sender]}</span>
        {message.simulated && <span className="message__tag">Simulat</span>}
      </p>
      <p className={isPatient ? 'message__bubble' : 'message__text'}>{message.text}</p>
      <MessageTime iso={message.createdAt} />
    </li>
  );
}
