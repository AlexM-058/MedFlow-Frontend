// Pure rules for the intake chat. No React, DOM or API imports, so they run under Node tests.
// A patient message is never dropped: it stays visible while pending and after a failure,
// and a retry reuses the same clientMessageId so the server never stores it twice.
import type { IntakeMessage, IntakeResult } from '../care-scenario/contracts.ts';

export type Delivery = 'sent' | 'pending' | 'failed';

export interface ChatEntry {
  /** Stable React key: the clientMessageId for local sends, otherwise the message id. */
  key: string;
  message: IntakeMessage;
  delivery: Delivery;
  /** Deterministic safety rule returned for this patient message (not LLM text). */
  redFlag?: { message: string };
  /** The patient message was saved but the assistant did not reply. */
  partialError?: boolean;
}

const fallbackId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/** Generated once per new message and reused for every retry of that message. */
export function createClientMessageId(random: () => string = defaultRandom): string {
  return `cm-${random()}`;
}

function defaultRandom(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return typeof cryptoApi?.randomUUID === 'function' ? cryptoApi.randomUUID() : fallbackId();
}

/** Enter sends; Shift+Enter adds a line; Enter that ends an IME composition never sends. */
export function shouldSendOnKey(event: { key: string; shiftKey: boolean; isComposing: boolean; keyCode: number }): boolean {
  if (event.key !== 'Enter' || event.shiftKey) return false;
  if (event.isComposing || event.keyCode === 229) return false;
  return true;
}

const sameMessage = (a: IntakeMessage, b: IntakeMessage) =>
  a.id === b.id || (a.clientMessageId !== undefined && a.clientMessageId === b.clientMessageId);

/** Entries for a freshly loaded history, without duplicates. */
export function entriesFromHistory(messages: readonly IntakeMessage[]): ChatEntry[] {
  let entries: ChatEntry[] = [];
  for (const message of messages) entries = upsertMessage(entries, message, 'sent');
  return entries;
}

/** Inserts or replaces a message, matching by id or clientMessageId. */
export function upsertMessage(entries: readonly ChatEntry[], message: IntakeMessage, delivery: Delivery): ChatEntry[] {
  const index = entries.findIndex((entry) => sameMessage(entry.message, message));
  if (index === -1) return [...entries, { key: message.clientMessageId ?? message.id, message, delivery }];
  const next = entries.slice();
  next[index] = { ...next[index], message, delivery };
  return next;
}

/** Shows the patient's message immediately, as pending. A retry of the same id only flips it back to pending. */
export function addPending(entries: readonly ChatEntry[], text: string, clientMessageId: string, now: string): ChatEntry[] {
  const existing = entries.find((entry) => entry.message.clientMessageId === clientMessageId);
  if (existing) return setDelivery(entries, clientMessageId, 'pending');
  const message: IntakeMessage = { id: `local-${clientMessageId}`, role: 'patient', text, createdAt: now, clientMessageId };
  return [...entries, { key: clientMessageId, message, delivery: 'pending' }];
}

export function setDelivery(entries: readonly ChatEntry[], clientMessageId: string, delivery: Delivery): ChatEntry[] {
  return entries.map((entry) => (entry.message.clientMessageId === clientMessageId ? { ...entry, delivery } : entry));
}

/**
 * Applies a send result: the saved patient message replaces the pending one (same key),
 * the assistant reply is appended once, and a red flag or partial error is attached to
 * the patient message. A red flag never comes with an assistant reply.
 */
export function applyResult(entries: readonly ChatEntry[], clientMessageId: string, result: IntakeResult): ChatEntry[] {
  const saved: IntakeMessage = { ...result.patientMessage, clientMessageId: result.patientMessage.clientMessageId ?? clientMessageId };
  // Drop any other copy of the saved message (e.g. one that arrived through a reload).
  const pendingIndex = entries.findIndex((entry) => entry.message.clientMessageId === clientMessageId);
  let next = entries.filter((entry, index) => index === pendingIndex || !sameMessage(entry.message, saved));
  const patientEntry: ChatEntry = {
    key: clientMessageId,
    message: saved,
    delivery: 'sent',
    ...(result.redFlag ? { redFlag: result.redFlag } : {}),
    ...(result.partialError && !result.redFlag ? { partialError: true } : {}),
  };
  const index = next.findIndex((entry) => entry.message.clientMessageId === clientMessageId);
  if (index === -1) next = [...next, patientEntry];
  else next[index] = patientEntry;

  if (result.assistantMessage && !result.redFlag) next = upsertMessage(next, result.assistantMessage, 'sent');
  return next;
}

/** Visible status of a patient message; null when it was delivered. */
export function deliveryLabel(delivery: Delivery): string | null {
  if (delivery === 'pending') return 'Se trimite…';
  if (delivery === 'failed') return 'Netrimis';
  return null;
}
