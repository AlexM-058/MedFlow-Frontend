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
    text: 'How can I help you prepare an update for your next appointment?',
    createdAt: '2026-11-06T09:00:00.000Z',
    simulated: true,
  },
  {
    id: 'seed-2',
    sender: 'patient',
    text: 'Hi! I would like to share a short update before my appointment.',
    createdAt: '2026-11-06T09:00:30.000Z',
  },
  {
    id: 'seed-3',
    sender: 'ai',
    text: 'You can describe the update in your own words and list the questions you would like to discuss.',
    createdAt: '2026-11-06T09:00:45.000Z',
    simulated: true,
  },
  {
    id: 'seed-4',
    sender: 'patient',
    text: 'Sure, give me a moment to write it down.',
    createdAt: '2026-11-06T09:01:10.000Z',
  },
];

const REPLIES = [
  'This is a local demo reply. Your update is visible here, but has not been sent or saved to a care team.',
  'Is there another question you would like to prepare for your appointment? This demo does not provide medical advice.',
  'You can continue drafting your update here. This conversation will be cleared when the page is reloaded.',
];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const mockChatService: ChatService = {
  async loadConversation() {
    return SEED.map((message) => ({ ...message }));
  },

  async sendMessage(text, history) {
    await wait(REPLY_DELAY_MS);
    if (text.includes(SIMULATE_ERROR_TOKEN)) {
      throw new Error('Simulated reply failure.');
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
