// Adding a health item from the "+" button: the patient types an allergy, a condition or a medicine in their own
// words; it is saved and, in the same step, confirmed by the patient (they declared it themselves). Only confirmed
// items are used for the anonymized summary. No network and no import.meta.env here: safe for Node tests.
import type { ContextItem, ContextKind } from '../care-scenario/contracts.ts';

export const KIND_LABELS: Record<ContextKind, string> = {
  allergy: 'Alergie',
  condition: 'Afecțiune',
  medication: 'Medicament',
};

export const KIND_EXAMPLES: Record<ContextKind, string> = {
  allergy: 'de ex. penicilină',
  condition: 'de ex. diabet',
  medication: 'de ex. metformin',
};

export const KINDS: readonly ContextKind[] = ['allergy', 'condition', 'medication'];
export const MAX_ITEM_LENGTH = 300;

/** The trimmed text to save, or null when it is empty or too long (the caller keeps what was typed). */
export function validItemText(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_ITEM_LENGTH ? trimmed : null;
}

export interface DeclareApi {
  add(kind: ContextKind, text: string): Promise<ContextItem>;
  confirm(id: string): Promise<ContextItem>;
}

/**
 * Saves the item and confirms it. If saving fails the error is thrown (nothing was saved). If only the confirmation
 * fails, the item IS saved: it is returned with `confirmed: false`, so the screen can say so instead of losing it.
 */
export async function declareItem(api: DeclareApi, kind: ContextKind, text: string): Promise<{ item: ContextItem; confirmed: boolean }> {
  const value = validItemText(text);
  if (value === null) throw new Error('Scrieți ce doriți să adăugați (cel mult 300 de caractere).');
  const saved = await api.add(kind, value);
  try {
    return { item: await api.confirm(saved.id), confirmed: true };
  } catch {
    return { item: saved, confirmed: false };
  }
}
