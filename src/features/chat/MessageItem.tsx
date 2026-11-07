import { brand } from '../../brand/brand.config';
import type { ChatMessage } from './types';

const SENDER_LABEL: Record<ChatMessage['sender'], string> = {
  ai: brand.assistantName,
  patient: 'Dumneavoastră',
};

export function MessageItem({ message }: { message: ChatMessage }) {
  const isPatient = message.sender === 'patient';

  return (
    <li className={`message message--${message.sender}`}>
      <p className={isPatient ? 'visually-hidden' : 'message__meta'}>
        <span className="message__sender">{SENDER_LABEL[message.sender]}</span>
        {message.simulated && <span className="message__tag">Simulat</span>}
      </p>
      <p className={isPatient ? 'message__bubble' : 'message__text'}>{message.text}</p>
    </li>
  );
}
