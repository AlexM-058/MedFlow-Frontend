// Fictional data only. No real patients, symptoms or medical advice.
import type { ChatService } from '../features/chat/chatService';
import type { ChatMessage } from '../features/chat/types';

/** Mock-only trigger: a patient message containing this text gets a failed reply. */
export const SIMULATE_ERROR_TOKEN = '[simulate-error]';

const REPLY_DELAY_MS = 600;

const SEED: ChatMessage[] = [
  {
    id: 'seed-1',
    sender: 'ai',
    text: 'Cum vă pot ajuta să pregătiți o actualizare pentru următoarea programare?',
    createdAt: '2026-11-06T09:00:00.000Z',
    simulated: true,
  },
  {
    id: 'seed-2',
    sender: 'patient',
    text: 'Bună ziua! Aș dori să transmit o scurtă actualizare înainte de programare.',
    createdAt: '2026-11-06T09:00:30.000Z',
  },
  {
    id: 'seed-3',
    sender: 'ai',
    text: 'Puteți descrie actualizarea cu cuvintele dumneavoastră și puteți enumera întrebările pe care doriți să le discutați.',
    createdAt: '2026-11-06T09:00:45.000Z',
    simulated: true,
  },
  {
    id: 'seed-4',
    sender: 'patient',
    text: 'Desigur, vă rog să-mi acordați un moment să o scriu.',
    createdAt: '2026-11-06T09:01:10.000Z',
  },
];

const REPLIES = [
  'Acesta este un răspuns demonstrativ local. Actualizarea dumneavoastră este vizibilă aici, dar nu a fost trimisă și nici salvată la o echipă de îngrijire.',
  'Mai aveți o întrebare pe care doriți să o pregătiți pentru programare? Această demonstrație nu oferă sfaturi medicale.',
  'Puteți continua să redactați actualizarea aici. Această conversație va fi ștearsă la reîncărcarea paginii.',
];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const mockChatService: ChatService = {
  async loadConversation() {
    return SEED.map((message) => ({ ...message }));
  },

  async sendMessage(text, history) {
    await wait(REPLY_DELAY_MS);
    if (text.includes(SIMULATE_ERROR_TOKEN)) {
      throw new Error('Eșec simulat al răspunsului.');
    }
    // Deterministic: the reply depends only on how many patient messages exist.
    const patientCount = history.filter((message) => message.sender === 'patient').length;
    return {
      id: `ai-${history.length + 1}`,
      sender: 'ai',
      text: REPLIES[(patientCount - 1 + REPLIES.length) % REPLIES.length],
      createdAt: new Date().toISOString(),
      simulated: true,
    };
  },
};
