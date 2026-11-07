// The final summary for the doctor: for every question the assistant asked, what the patient answered, word for word.
// No model is involved and nothing is rewritten: it only pairs the saved messages of the conversation, in order, so
// there is nothing to invent and nothing leaves the laptop. A message the patient wrote before the first question
// (the reason for the visit, usually) is kept as its own group. No network and no import.meta.env: safe for Node tests.

export interface SummaryMessage {
  id: string;
  senderRole: string;
  content: string;
  createdAt: string;
}

export interface AnswerGroup {
  /** The assistant's question, or null for what the patient wrote before any question. */
  question: string | null;
  answers: { id: string; text: string; at: string }[];
}

export interface AnswersSummary {
  groups: AnswerGroup[];
  /** Questions the patient has not answered yet. */
  unanswered: number;
  /** Emergency or other system notices that were added to the conversation (shown to the doctor as they are). */
  notices: { id: string; text: string; at: string }[];
}

/** Oldest first, ties by id, like the chat shows them. */
function ordered(messages: readonly SummaryMessage[]): SummaryMessage[] {
  return [...messages].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
}

export function pairAnswers(messages: readonly SummaryMessage[]): AnswersSummary {
  const groups: AnswerGroup[] = [];
  const notices: AnswersSummary['notices'] = [];
  let current: AnswerGroup | null = null;

  for (const message of ordered(messages)) {
    const text = message.content.trim();
    if (!text) continue;
    if (message.senderRole === 'ai') {
      current = { question: text, answers: [] };
      groups.push(current);
    } else if (message.senderRole === 'patient') {
      if (current === null) {
        current = { question: null, answers: [] };
        groups.push(current);
      }
      current.answers.push({ id: message.id, text, at: message.createdAt });
    } else if (message.senderRole === 'system') {
      notices.push({ id: message.id, text, at: message.createdAt });
    }
    // Doctor messages are not answers: they stay in the conversation, not in this summary.
  }

  return { groups, unanswered: groups.filter((group) => group.question !== null && group.answers.length === 0).length, notices };
}
