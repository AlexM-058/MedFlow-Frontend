// Pure mapping from Backend documents (GET /cases/:id/documents) to the medications the patient
// confirmed. A document counts only if the patient reviewed it (`review` is set); what the reader
// extracted but nobody confirmed is never turned into a confirmed medication. No network, no
// import.meta.env: safe for Node tests.
import type { CaseDocumentRecord } from '../../../lib/caseApi.ts';
import type { ConfirmedMedication, ReviewedField } from '../contracts.ts';

type Raw = Record<string, unknown>;
const isRecord = (value: unknown): value is Raw => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const FIELD_PATH = /^medications\.(\d+)\.(name|dose|frequency|duration)$/;

function toReviewedField(value: unknown): ReviewedField | null {
  if (!isRecord(value) || typeof value.path !== 'string' || !FIELD_PATH.test(value.path)) return null;
  const confirmation = isRecord(value.confirmation) ? value.confirmation : {};
  const at = typeof confirmation.at === 'string' ? confirmation.at : undefined;
  const sourceQuote = typeof value.sourceQuote === 'string' ? value.sourceQuote : undefined;
  return {
    path: value.path,
    label: typeof value.label === 'string' ? value.label : value.path,
    extracted: typeof value.extracted === 'string' ? value.extracted : null,
    value: typeof value.value === 'string' ? value.value : null,
    confirmation: { status: 'confirmed', by: 'patient', ...(at ? { at } : {}) },
    ...(sourceQuote ? { sourceQuote } : {}),
  };
}

export function mapConfirmedMedications(documents: CaseDocumentRecord[]): ConfirmedMedication[] {
  const result: ConfirmedMedication[] = [];
  for (const document of documents) {
    if (!isRecord(document.review) || !Array.isArray(document.review.medications)) continue;
    const fields = Array.isArray(document.review.fields)
      ? document.review.fields.map(toReviewedField).filter((field): field is ReviewedField => field !== null)
      : [];
    document.review.medications.forEach((entry, index) => {
      if (!isRecord(entry)) return;
      const name = text(entry.name);
      const dose = text(entry.dose);
      const frequency = text(entry.frequency);
      if (!name || !dose || !frequency) return; // an incomplete review row is not shown as confirmed
      result.push({
        id: `${document.id}:${index}`,
        documentId: document.id,
        name,
        doseText: dose,
        instructionOriginal: frequency,
        durationText: text(entry.duration),
        fields: fields.filter((field) => field.path.startsWith(`medications.${index}.`)),
        confirmedAt: document.reviewedAt ?? document.createdAt,
      });
    });
  }
  return result;
}
