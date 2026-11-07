// Pure review logic for a scanned prescription (DEMO_IMPLEMENTATION_PLAN.md M3).
// Extraction is a transcription of an existing prescription: nothing here invents,
// infers or prefills a value. A field is resolved only by an explicit patient action.
// No React, DOM or import.meta.env, so it runs under `node --experimental-strip-types`.
import type { ExtractedDocument, ExtractedMedication, ReviewedField } from '../care-scenario/contracts.ts';

export type FieldKey = 'name' | 'dose' | 'frequency' | 'duration';

export const FIELD_KEYS: readonly FieldKey[] = ['name', 'dose', 'frequency', 'duration'];

export const FIELD_LABELS: Record<FieldKey, string> = {
  name: 'Denumire',
  dose: 'Doză',
  frequency: 'Indicație',
  duration: 'Durată',
};

/** Only Duration may be absent from a prescription; name, dose and instruction are required. */
export const NOT_PRESENT_ALLOWED: ReadonlySet<FieldKey> = new Set<FieldKey>(['duration']);

export type FieldResolution =
  | { kind: 'pending' }
  /** `edited` = the value is the patient's own transcription, not the extracted text. */
  | { kind: 'confirmed'; value: string; edited: boolean; at: string }
  | { kind: 'not-present'; at: string };

export interface ReviewFieldState {
  /** e.g. "medications.0.dose" (same path keys as ExtractedDocument.sourceQuotes). */
  path: string;
  medicationIndex: number;
  key: FieldKey;
  label: string;
  /** Extracted text as returned, or null when missing / unreadable (whitespace-only counts as unreadable). */
  extracted: string | null;
  sourceQuote?: string;
  resolution: FieldResolution;
}

export interface MissingField {
  path: string;
  medicationIndex: number;
  label: string;
  reason: 'not-readable' | 'not-confirmed';
}

export type ActionResult = { ok: true; fields: ReviewFieldState[] } | { ok: false; error: string };

export function fieldPath(medicationIndex: number, key: FieldKey): string {
  return `medications.${medicationIndex}.${key}`;
}

function readable(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** One pending field per medication property. Values are copied, never filled in. */
export function buildReviewFields(document: ExtractedDocument): ReviewFieldState[] {
  return document.medications.flatMap((medication: ExtractedMedication, index) =>
    FIELD_KEYS.map((key) => {
      const path = fieldPath(index, key);
      const quote = readable(document.sourceQuotes[path]);
      const field: ReviewFieldState = {
        path,
        medicationIndex: index,
        key,
        label: FIELD_LABELS[key],
        extracted: readable(medication[key]),
        resolution: { kind: 'pending' },
      };
      if (quote !== null) field.sourceQuote = quote;
      return field;
    }),
  );
}

export function isUnreadable(field: ReviewFieldState): boolean {
  return field.extracted === null;
}

function update(
  fields: ReviewFieldState[],
  path: string,
  apply: (field: ReviewFieldState) => ReviewFieldState | string,
): ActionResult {
  const index = fields.findIndex((field) => field.path === path);
  if (index === -1) return { ok: false, error: `Câmp necunoscut ${path}.` };
  const next = apply(fields[index]);
  if (typeof next === 'string') return { ok: false, error: next };
  const copy = fields.slice();
  copy[index] = next;
  return { ok: true, fields: copy };
}

/** "Confirm": the extracted value is correct. Not possible for an unreadable field. */
export function confirmField(fields: ReviewFieldState[], path: string, at: string): ActionResult {
  return update(fields, path, (field) => {
    if (field.extracted === null) {
      return 'Acest câmp nu a putut fi citit. Introduceți-l de pe rețeta pe hârtie sau întrebați medicul.';
    }
    return { ...field, resolution: { kind: 'confirmed', value: field.extracted, edited: false, at } };
  });
}

/** "Edit": the patient's own transcription. Whitespace-only text is rejected. */
export function editField(fields: ReviewFieldState[], path: string, text: string, at: string): ActionResult {
  const value = text.trim();
  if (value === '') return { ok: false, error: 'Introduceți valoarea exact așa cum este scrisă pe rețetă.' };
  return update(fields, path, (field) => ({
    ...field,
    resolution: { kind: 'confirmed', value, edited: value !== field.extracted, at },
  }));
}

/** "Not on the prescription": only allowed for Duration. */
export function markNotPresent(fields: ReviewFieldState[], path: string, at: string): ActionResult {
  return update(fields, path, (field) => {
    if (!NOT_PRESENT_ALLOWED.has(field.key)) {
      return `${field.label} este obligatoriu. Introduceți-l de pe rețeta pe hârtie sau întrebați medicul.`;
    }
    return { ...field, resolution: { kind: 'not-present', at } };
  });
}

/** "Change": back to pending so the patient can decide again. */
export function resetField(fields: ReviewFieldState[], path: string): ActionResult {
  return update(fields, path, (field) => ({ ...field, resolution: { kind: 'pending' } }));
}

export function isResolved(field: ReviewFieldState): boolean {
  const { resolution } = field;
  if (resolution.kind === 'confirmed') return resolution.value.trim() !== '';
  if (resolution.kind === 'not-present') return NOT_PRESENT_ALLOWED.has(field.key);
  return false;
}

/**
 * Every field must be resolved: name, dose and instruction with a value, duration with a
 * value or explicitly "not on the prescription" (an unanswered duration would otherwise be
 * saved as "none given", which is an inference).
 */
export function missingFields(fields: ReviewFieldState[]): MissingField[] {
  return fields
    .filter((field) => !isResolved(field))
    .map((field) => ({
      path: field.path,
      medicationIndex: field.medicationIndex,
      label: field.label,
      reason: field.extracted === null ? 'not-readable' : 'not-confirmed',
    }));
}

export function canConfirm(fields: ReviewFieldState[]): boolean {
  return fields.length > 0 && missingFields(fields).length === 0;
}

/** Fields to send to `saveReview`. Throws when the review is not complete. */
export function toReviewedFields(fields: ReviewFieldState[]): ReviewedField[] {
  if (!canConfirm(fields)) throw new Error('The review is not complete.');
  return fields.map((field) => {
    const { resolution } = field;
    if (resolution.kind === 'pending') throw new Error(`Unresolved field ${field.path}.`);
    const reviewed: ReviewedField = {
      path: field.path,
      label: field.label,
      extracted: field.extracted,
      value: resolution.kind === 'confirmed' ? resolution.value : null,
      confirmation: { status: 'confirmed', by: 'patient', at: resolution.at },
    };
    if (field.sourceQuote !== undefined) reviewed.sourceQuote = field.sourceQuote;
    return reviewed;
  });
}

export function medicationCount(fields: ReviewFieldState[]): number {
  return fields.reduce((max, field) => Math.max(max, field.medicationIndex + 1), 0);
}
