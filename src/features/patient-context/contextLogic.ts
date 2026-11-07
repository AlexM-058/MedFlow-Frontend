// Pure rules for the patient context panel (allergies, conditions, current medication).
// No React, DOM or API imports, so they run under plain Node tests.
// Nothing here infers a clinical fact: statuses and conflict notes come from the adapter.
import type {
  Confirmation,
  ConfirmationStatus,
  ContextItem,
  ContextKind,
  Source,
} from '../care-scenario/contracts.ts';

export const MAX_ITEM_LENGTH = 300;

export interface ContextGroup {
  kind: ContextKind;
  title: string;
  /** Visible label of the "add" input. */
  addLabel: string;
  emptyText: string;
}

export const CONTEXT_GROUPS: readonly ContextGroup[] = [
  { kind: 'allergy', title: 'Alergii', addLabel: 'Adăugați o alergie', emptyText: 'Nu a fost înregistrată nicio alergie.' },
  { kind: 'condition', title: 'Afecțiuni', addLabel: 'Adăugați o afecțiune', emptyText: 'Nu a fost înregistrată nicio afecțiune.' },
  {
    kind: 'medication',
    title: 'Medicație curentă',
    addLabel: 'Adăugați un medicament pe care îl luați',
    emptyText: 'Nu a fost înregistrată nicio medicație curentă.',
  },
];

/** Groups items by kind, keeping the adapter's order inside each group. */
export function groupItems(items: readonly ContextItem[]): Record<ContextKind, ContextItem[]> {
  const groups: Record<ContextKind, ContextItem[]> = { allergy: [], condition: [], medication: [] };
  for (const item of items) groups[item.kind].push(item);
  return groups;
}

const STATUS_LABELS: Record<ConfirmationStatus, string> = {
  confirmed: 'Confirmat',
  unconfirmed: 'Neconfirmat',
  // Never blank and never "No": the patient does not know.
  unknown: 'Necunoscut',
  conflict: 'Conflict',
};

export function statusLabel(status: ConfirmationStatus): string {
  return STATUS_LABELS[status];
}

const MONTHS = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (value: number) => String(value).padStart(2, '0');

/** "06 Nov 2026 14:02" in the device's local time; an unparseable value is shown as given. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${pad(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

export interface SourceDescription {
  /** Plain-words origin, e.g. "You entered this · 06 Nov 2026 14:02". */
  label: string;
  /** Exact quote from the source, when the source provides one. */
  quote?: string;
}

export function describeSource(source: Source): SourceDescription {
  switch (source.kind) {
    case 'patient-input':
      return { label: `Introdus de dumneavoastră · ${formatDateTime(source.at)}` };
    case 'message':
      return { label: 'Din mesajul dumneavoastră din conversație', quote: source.quote };
    case 'document': {
      const page = source.page !== undefined ? `, pagina ${source.page}` : '';
      return {
        label: `Din documentul ${source.documentId}${page}`,
        ...(source.quote ? { quote: source.quote } : {}),
      };
    }
    case 'doctor':
      return { label: `De la medicul dumneavoastră · ${formatDateTime(source.at)}` };
  }
}

const who = (by: Confirmation['by']) => (by === 'doctor' ? 'medicul dumneavoastră' : by === 'patient' ? 'dumneavoastră' : null);

/** Who confirmed (or marked unknown) and when. Never invents a person or a time. */
export function describeConfirmation(confirmation: Confirmation): string {
  const person = who(confirmation.by);
  const when = confirmation.at ? ` · ${formatDateTime(confirmation.at)}` : '';
  switch (confirmation.status) {
    case 'confirmed':
      return `Confirmat${person ? ` de ${person}` : ''}${when}`;
    case 'unknown':
      return `Marcat ca necunoscut${person ? ` de ${person}` : ''}${when}`;
    case 'unconfirmed':
      return 'Încă neconfirmat';
    case 'conflict':
      return 'Necesită medicul dumneavoastră: nu corespunde altor informații.';
  }
}

/** "Confirm" is offered for items the patient has not settled; never for a conflict. */
export function canConfirm(item: ContextItem): boolean {
  return item.confirmation.status === 'unconfirmed' || item.confirmation.status === 'unknown';
}

/** "I don't know" keeps the item as 'unknown'; offered only while it is not confirmed. */
export function canMarkUnknown(item: ContextItem): boolean {
  return item.confirmation.status === 'unconfirmed';
}

export type TextValidation = { ok: true; text: string } | { ok: false; error: string };

export function validateItemText(raw: string): TextValidation {
  const text = raw.trim();
  if (text.length === 0) return { ok: false, error: 'Introduceți o valoare înainte de a o adăuga.' };
  if (text.length > MAX_ITEM_LENGTH) {
    return { ok: false, error: `Folosiți cel mult ${MAX_ITEM_LENGTH} de caractere (acum ${text.length}).` };
  }
  return { ok: true, text };
}

/** Replaces the item with the same id, or appends it; never duplicates an id. */
export function upsertItem(items: readonly ContextItem[], item: ContextItem): ContextItem[] {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index === -1) return [...items, item];
  const next = items.slice();
  next[index] = item;
  return next;
}
