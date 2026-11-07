import type { ConnectionRequest } from '../../../auth/contracts.ts';
import type { CaseRecord } from '../../../lib/caseApi.ts';

/** `unknown` = the case list could not be read, so no state is claimed (never guessed). */
export type BacklogState = 'new' | 'needs_review' | 'up_to_date' | 'unknown';
export type BacklogFilter = 'all' | 'needs_review' | 'new' | 'up_to_date';

export interface BacklogRow {
  patientId: string;
  patientName: string;
  /** Null until the patient opens a case with this doctor. */
  caseId: string | null;
  state: BacklogState;
  lastMessage: { fromPatient: boolean; text: string; at: string } | null;
  /** ISO time of the newest known activity (message, feedback or, before any case, the connection). */
  lastActivityAt: string;
}

export const STATE_LABELS: Record<BacklogState, string> = {
  needs_review: 'De revăzut',
  new: 'Nou',
  up_to_date: 'La zi',
  unknown: 'Necunoscută',
};

export const UNKNOWN_PATIENT_NAME = 'Pacient (nume indisponibil)';

const newer = (a: string, b: string) => Date.parse(a) > Date.parse(b);

/**
 * One row per connected patient, enriched with the patient's newest case. `cases` is null when the
 * case list failed to load. Cases whose patient is not in the accepted list are still shown: a
 * report is never dropped just because a second list failed.
 */
export function buildBacklog(accepted: readonly ConnectionRequest[], cases: readonly CaseRecord[] | null): BacklogRow[] {
  const patients = new Map<string, { name: string; connectedAt: string }>();
  for (const request of accepted) {
    if (request.status !== 'accepted') continue;
    const known = patients.get(request.patient.id);
    if (!known || newer(request.createdAt, known.connectedAt)) {
      patients.set(request.patient.id, { name: request.patient.fullName, connectedAt: request.createdAt });
    }
  }

  const newestCase = new Map<string, CaseRecord>();
  for (const item of cases ?? []) {
    const current = newestCase.get(item.patientId);
    if (!current || newer(item.createdAt, current.createdAt)) newestCase.set(item.patientId, item);
  }

  const rows: BacklogRow[] = [];
  const seen = new Set<string>();
  for (const [patientId, info] of patients) {
    seen.add(patientId);
    rows.push(rowFor(patientId, info.name, info.connectedAt, newestCase.get(patientId), cases !== null));
  }
  for (const [patientId, item] of newestCase) {
    if (!seen.has(patientId)) rows.push(rowFor(patientId, UNKNOWN_PATIENT_NAME, item.createdAt, item, true));
  }
  return sortBacklog(rows);
}

function rowFor(patientId: string, patientName: string, connectedAt: string, item: CaseRecord | undefined, casesLoaded: boolean): BacklogRow {
  if (!item) {
    return { patientId, patientName, caseId: null, state: casesLoaded ? 'new' : 'unknown', lastMessage: null, lastActivityAt: connectedAt };
  }
  const last = item.lastMessage ?? null;
  return {
    patientId,
    patientName,
    caseId: item.id,
    state: item.reviewState ?? 'unknown',
    lastMessage: last ? { fromPatient: last.senderRole === 'patient', text: last.content, at: last.createdAt } : null,
    lastActivityAt: item.lastActivityAt ?? item.updatedAt,
  };
}

const ORDER: Record<BacklogState, number> = { needs_review: 0, new: 1, unknown: 2, up_to_date: 3 };

/** Needs review first, then newest activity, then name, so the order is stable between refreshes. */
export function sortBacklog(rows: readonly BacklogRow[]): BacklogRow[] {
  return [...rows].sort((a, b) =>
    ORDER[a.state] - ORDER[b.state]
    || Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt)
    || a.patientName.localeCompare(b.patientName, 'ro')
    || a.patientId.localeCompare(b.patientId));
}

export function countByFilter(rows: readonly BacklogRow[]): Record<BacklogFilter, number> {
  return {
    all: rows.length,
    needs_review: rows.filter((row) => row.state === 'needs_review').length,
    new: rows.filter((row) => row.state === 'new').length,
    up_to_date: rows.filter((row) => row.state === 'up_to_date').length,
  };
}

/** Case- and diacritics-insensitive, so "ionescu" finds "Ionescu" and "stanescu" finds "Stănescu". */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

export function filterBacklog(rows: readonly BacklogRow[], query: string, filter: BacklogFilter): BacklogRow[] {
  const needle = normalizeText(query);
  return rows.filter((row) => (filter === 'all' || row.state === filter) && (needle === '' || normalizeText(row.patientName).includes(needle)));
}

/** "azi 09:42", "ieri" or "07.11.2026". `now` is injected so the result is testable. */
export function formatActivity(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days === 0) return `azi ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  if (days === 1) return 'ieri';
  return `${String(at.getDate()).padStart(2, '0')}.${String(at.getMonth() + 1).padStart(2, '0')}.${at.getFullYear()}`;
}
