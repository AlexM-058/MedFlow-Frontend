import type { CaseMessageRecord, CaseRecord } from '../../lib/caseApi.ts';
import type { ChatMessage } from '../chat/types.ts';

export type ChatSender = 'patient' | 'assistant' | 'doctor' | 'system';

export const SENDER_LABELS: Record<ChatSender, string> = {
  patient: 'Dumneavoastră',
  assistant: 'Asistent (AI)',
  doctor: 'Medic',
  system: 'Important',
};

/** Backend sender roles: patient, doctor, ai (the assistant's collection questions) and system (e.g. an emergency notice). */
export function senderKind(role: string): ChatSender {
  if (role === 'patient') return 'patient';
  if (role === 'doctor') return 'doctor';
  if (role === 'ai') return 'assistant';
  return 'system';
}

/** A saved case message as the chat shows it: the patient on the right, everyone else on the left. */
export function toChatMessage(message: CaseMessageRecord): ChatMessage {
  const kind = senderKind(message.senderRole);
  return {
    id: message.id,
    sender: kind === 'assistant' ? 'ai' : kind,
    text: message.content,
    createdAt: message.createdAt,
  };
}

export const MAX_MESSAGE_LENGTH = 2000;

/** The trimmed text to send, or null when it is empty or too long (the caller keeps the draft). */
export function validDraft(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_MESSAGE_LENGTH ? trimmed : null;
}

/**
 * The conversation to continue: the patient's newest case with one of the doctors they are connected
 * to. Null means no such case exists yet and one must be opened with the connected doctor.
 */
export function chooseCase(cases: readonly CaseRecord[], connectedDoctorIds: readonly string[]): CaseRecord | null {
  let best: CaseRecord | null = null;
  for (const item of cases) {
    if (!connectedDoctorIds.includes(item.doctorId)) continue;
    if (best === null || Date.parse(item.createdAt) > Date.parse(best.createdAt)) best = item;
  }
  return best;
}

/** Oldest first, ties by id, so the order never jumps between refreshes. */
export function orderMessages(messages: readonly CaseMessageRecord[]): CaseMessageRecord[] {
  return [...messages].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
}

/** Adds new or changed messages by id; nothing the patient already saw is dropped. */
export function mergeMessages(current: readonly CaseMessageRecord[], incoming: readonly CaseMessageRecord[]): CaseMessageRecord[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return orderMessages([...byId.values()]);
}
