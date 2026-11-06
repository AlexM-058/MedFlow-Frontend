// Pure logic for the doctor's case view (M6-M8). No React, DOM or env access, so it
// runs under `node --experimental-strip-types` in caseLogic.test.ts.
//
// Coverage is computed here from the summary's sources. It is never a model claim:
// a patient message no summary item cites is listed for the doctor to read in full.
import type {
  CaseStatus,
  CaseSummary,
  ConfirmationStatus,
  ContextKind,
  DecisionVariants,
  ExtractedDocument,
  IntakeMessage,
  Source,
  SummaryItem,
} from '../../care-scenario/contracts.ts';

export const CASE_TIME_ZONE = 'Europe/Bucharest';
export const FEEDBACK_MAX_LENGTH = 4000;

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: CASE_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: CASE_TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function validDate(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "14:05" in the demo time zone; the raw value when it is not a valid date. */
export function formatTime(iso: string): string {
  const date = validDate(iso);
  return date ? timeFormat.format(date) : iso;
}

/** "07 Nov 2026, 14:05" in the demo time zone. */
export function formatDateTime(iso: string): string {
  const date = validDate(iso);
  return date ? dateTimeFormat.format(date) : iso;
}

// ---------- DOM anchors (ids only; the component does the scrolling) ----------

export function messageAnchorId(messageId: string): string {
  return `care-case-message-${messageId}`;
}

export function documentAnchorId(documentId: string): string {
  return `care-case-document-${documentId}`;
}

// ---------- Coverage ----------

export interface Coverage {
  /** Patient message ids cited by at least one summary item. */
  citedIds: string[];
  /** Patient messages no summary item cites, in conversation order. Shown verbatim. */
  uncited: IntakeMessage[];
  citedCount: number;
  /** Number of patient messages (assistant and system messages do not count). */
  totalPatientMessages: number;
}

/** Message ids cited by any summary item, in first-seen order, without duplicates. */
export function citedMessageIds(summary: CaseSummary | null): string[] {
  const ids: string[] = [];
  for (const item of summary?.items ?? []) {
    for (const source of item.sources) {
      if (source.kind === 'message' && !ids.includes(source.messageId)) ids.push(source.messageId);
    }
  }
  return ids;
}

/** Which patient messages the summary cites. With no summary, every patient message is uncited. */
export function computeCoverage(messages: IntakeMessage[], summary: CaseSummary | null): Coverage {
  const cited = new Set(citedMessageIds(summary));
  const patientMessages = messages.filter((message) => message.role === 'patient');
  const citedIds = patientMessages.filter((m) => cited.has(m.id)).map((m) => m.id);
  return {
    citedIds,
    uncited: patientMessages.filter((m) => !cited.has(m.id)),
    citedCount: citedIds.length,
    totalPatientMessages: patientMessages.length,
  };
}

export function coverageLabel(coverage: Coverage): string {
  const noun = coverage.totalPatientMessages === 1 ? 'patient message' : 'patient messages';
  return `${coverage.citedCount} of ${coverage.totalPatientMessages} ${noun} cited`;
}

// ---------- Source links ----------

export interface SourceLink {
  label: string;
  /** DOM id of the original to scroll to; null when the original is not in this case. */
  targetId: string | null;
}

export interface CaseLookup {
  messages: IntakeMessage[];
  documents: ExtractedDocument[];
}

const DOCUMENT_TYPE_LABEL: Record<ExtractedDocument['documentType'], string> = {
  prescription: 'prescription',
  lab_result: 'lab result',
  medical_letter: 'medical letter',
  other: 'other document',
};

export function documentTypeLabel(type: ExtractedDocument['documentType']): string {
  return DOCUMENT_TYPE_LABEL[type] ?? type;
}

/** "Message 14:05", "Document: prescription, page 1", "Patient input 07 Nov 2026, 10:00". */
export function sourceLink(source: Source, lookup: CaseLookup): SourceLink {
  switch (source.kind) {
    case 'message': {
      const message = lookup.messages.find((m) => m.id === source.messageId);
      if (!message) return { label: 'Message not found in this case', targetId: null };
      const who = message.role === 'patient' ? 'Message' : message.role === 'assistant' ? 'Assistant message' : 'System message';
      return { label: `${who} ${formatTime(message.createdAt)}`, targetId: messageAnchorId(message.id) };
    }
    case 'document': {
      const document = lookup.documents.find((d) => d.id === source.documentId);
      if (!document) return { label: 'Document not found in this case', targetId: null };
      const page = source.page !== undefined ? `, page ${source.page}` : '';
      return { label: `Document: ${documentTypeLabel(document.documentType)}${page}`, targetId: documentAnchorId(document.id) };
    }
    case 'patient-input':
      return { label: `Patient input ${formatDateTime(source.at)}`, targetId: null };
    case 'doctor':
      return { label: `Doctor entry ${formatDateTime(source.at)}`, targetId: null };
  }
}

// ---------- Summary rows ----------

export type SummaryFlag = 'Negated' | 'Uncertain';

export interface SummaryRow {
  id: string;
  /** Item text exactly as in the summary; never reworded. */
  text: string;
  flags: SummaryFlag[];
  links: SourceLink[];
  /** True when the item has no source: shown as "No source — verify". */
  unsourced: boolean;
}

export function summaryFlags(item: SummaryItem): SummaryFlag[] {
  const flags: SummaryFlag[] = [];
  if (item.negated) flags.push('Negated');
  if (item.uncertain) flags.push('Uncertain');
  return flags;
}

export function buildSummaryRows(summary: CaseSummary, lookup: CaseLookup): SummaryRow[] {
  return summary.items.map((item) => ({
    id: item.id,
    text: item.text,
    flags: summaryFlags(item),
    links: item.sources.map((source) => sourceLink(source, lookup)),
    unsourced: item.sources.length === 0,
  }));
}

export function summaryOriginLabel(generatedBy: CaseSummary['generatedBy']): string {
  return generatedBy === 'ai' ? 'Generated by AI' : 'Demo summary';
}

// ---------- Labels ----------

export function caseStatusLabel(status: CaseStatus, hasFeedback: boolean): string {
  if (hasFeedback || status === 'answered') return 'Answered';
  if (status === 'pending_doctor') return 'Waiting for your review';
  return 'Not submitted yet';
}

const CONFIRMATION_LABEL: Record<ConfirmationStatus, string> = {
  confirmed: 'Confirmed',
  unconfirmed: 'Not confirmed',
  unknown: 'Unknown',
  conflict: 'Conflict',
};

export function confirmationLabel(status: ConfirmationStatus, by?: 'patient' | 'doctor', at?: string): string {
  const base = CONFIRMATION_LABEL[status] ?? status;
  if (status !== 'confirmed') return base;
  const who = by ? ` by ${by}` : '';
  const when = at ? `, ${formatDateTime(at)}` : '';
  return `${base}${who}${when}`;
}

const CONTEXT_KIND_LABEL: Record<ContextKind, string> = {
  allergy: 'Allergy',
  condition: 'Condition',
  medication: 'Medication',
};

export function contextKindLabel(kind: ContextKind): string {
  return CONTEXT_KIND_LABEL[kind] ?? kind;
}

// ---------- Feedback ----------

export type FeedbackValidation = { ok: true; value: string } | { ok: false; error: string };

/** The doctor's text is trimmed at the ends only; the inner wording is never changed. */
export function validateFeedback(text: string): FeedbackValidation {
  const value = text.trim();
  if (value.length === 0) return { ok: false, error: 'Write your response before sending.' };
  if (value.length > FEEDBACK_MAX_LENGTH) {
    return { ok: false, error: `Your response is ${value.length} characters; the limit is ${FEEDBACK_MAX_LENGTH}.` };
  }
  return { ok: true, value };
}

export function characterCountLabel(text: string): string {
  return `${text.length} / ${FEEDBACK_MAX_LENGTH} characters`;
}

// ---------- Optional decision-support variants ----------

export interface VariantPrefill {
  /** Editable starting text for the doctor; never sent without the doctor's explicit action. */
  text: string;
  /** 0-based index into DecisionVariants.options. */
  basedOnVariant: number;
}

/** Text that prefills the editable feedback field. Returns null for an unknown index. */
export function prefillFromVariant(variants: DecisionVariants, index: number): VariantPrefill | null {
  const option = variants.options[index];
  if (!option) return null;
  return { text: option.option.slice(0, FEEDBACK_MAX_LENGTH), basedOnVariant: index };
}

/** After an edit: an emptied field no longer counts as based on a variant. */
export function basedOnVariantAfterEdit(text: string, current: number | null): number | null {
  return text.trim().length === 0 ? null : current;
}
