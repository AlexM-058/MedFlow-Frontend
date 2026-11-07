// Pure backlog query logic: counts, search, status filter and sorting.
// No React or CSS imports so it runs under Node (see patientQuery.test.ts).
// Sorting always uses real timestamps, never the display labels.
import type { DoctorPatient, PatientStatus } from '../types.ts';

export type StatusFilter = 'all' | PatientStatus;

/** 'recent': newest contact first; 'oldest': oldest contact first; 'follow-up': soonest follow-up first. */
export type PatientSort = 'recent' | 'oldest' | 'follow-up';

export interface PatientQuery {
  search: string;
  status: StatusFilter;
  sort: PatientSort;
}

export const DEFAULT_QUERY: PatientQuery = { search: '', status: 'all', sort: 'recent' };

export const STATUS_LABELS: Record<PatientStatus, string> = {
  'needs-review': 'Necesită verificare',
  'follow-up-due': 'Control de urmărire scadent',
  'up-to-date': 'La zi',
};

export const STATUS_ORDER: readonly PatientStatus[] = ['needs-review', 'follow-up-due', 'up-to-date'];

export const SORT_LABELS: Record<PatientSort, string> = {
  recent: 'Cea mai recentă activitate',
  oldest: 'Cea mai veche activitate',
  'follow-up': 'Următorul control de urmărire',
};

export interface StatusCounts {
  all: number;
  'needs-review': number;
  'follow-up-due': number;
  'up-to-date': number;
}

export function countByStatus(patients: readonly DoctorPatient[]): StatusCounts {
  const counts: StatusCounts = { all: 0, 'needs-review': 0, 'follow-up-due': 0, 'up-to-date': 0 };
  for (const patient of patients) {
    counts.all += 1;
    counts[patient.status] += 1;
  }
  return counts;
}

/** Normalizes user search text: trimmed, inner whitespace collapsed, lowercase. */
export function normalizeSearch(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function matchesSearch(patient: DoctorPatient, search: string): boolean {
  const needle = normalizeSearch(search);
  if (needle === '') return true;
  return (
    normalizeSearch(patient.name).includes(needle) || patient.id.toLowerCase().includes(needle)
  );
}

function contactTime(patient: DoctorPatient): number {
  const time = Date.parse(patient.lastContactAt);
  return Number.isNaN(time) ? 0 : time;
}

function followUpTime(patient: DoctorPatient): number {
  // Date-only values are compared as UTC midnight; time zone does not matter for ordering.
  const time = Date.parse(`${patient.nextFollowUpOn}T00:00:00Z`);
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function byId(a: DoctorPatient, b: DoctorPatient): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function compare(sort: PatientSort): (a: DoctorPatient, b: DoctorPatient) => number {
  switch (sort) {
    case 'recent':
      return (a, b) => contactTime(b) - contactTime(a) || byId(a, b);
    case 'oldest':
      return (a, b) => contactTime(a) - contactTime(b) || byId(a, b);
    case 'follow-up':
      return (a, b) => {
        const diff = followUpTime(a) - followUpTime(b);
        // Infinity - Infinity is NaN; treat as equal.
        return (Number.isNaN(diff) ? 0 : diff) || contactTime(b) - contactTime(a) || byId(a, b);
      };
  }
}

/** Returns a new array; the input is never mutated. */
export function queryPatients(
  patients: readonly DoctorPatient[],
  query: PatientQuery,
): DoctorPatient[] {
  return patients
    .filter((patient) => query.status === 'all' || patient.status === query.status)
    .filter((patient) => matchesSearch(patient, query.search))
    .sort(compare(query.sort));
}

export function isFiltered(query: PatientQuery): boolean {
  return normalizeSearch(query.search) !== '' || query.status !== 'all';
}
