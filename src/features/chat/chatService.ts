import { mockChatService } from '../../mocks/chat.mock';
import type { ChatMessage } from './types';

/**
 * Contract the chat UI depends on. Phase 1 uses the local mock; a later phase
 * swaps getChatService() for an API-backed implementation without UI changes.
 */
export interface ChatService {
  loadConversation(): Promise<ChatMessage[]>;
  /** Replies to `text`; `history` includes the original message, including on retry. */
  sendMessage(text: string, history: readonly ChatMessage[]): Promise<ChatMessage>;
}

/** True while replies are simulated; the UI shows a demo notice. */
export const isChatSimulated = true;

export function getChatService(): ChatService {
  return mockChatService;
}
