export type ChatSender = 'ai' | 'patient';

export interface ChatMessage {
  id: string;
  sender: ChatSender;
  text: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** True when the content comes from the local mock, not a real AI service. */
  simulated?: boolean;
}
