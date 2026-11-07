// Everything the reader found in a document, not only the medicines: diagnoses, lab results, allergies and other
// medical information (vital signs, symptoms, procedures, recommendations). Values are the document's own text,
// already checked by the service against the document; this module only reads them safely and counts them.
// Identity data (names, address, phone, CNP) is never extracted by the service, so it never shows up here.
// No network and no import.meta.env: safe for Node tests.

type Raw = Record<string, unknown>;
const isRecord = (value: unknown): value is Raw => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

export interface LabFinding { test: string; value: string | null; unit: string | null; range: string | null }
export interface ObservationFinding { label: string; value: string }

export interface Findings {
  medications: number;
  diagnoses: string[];
  labs: LabFinding[];
  allergies: string[];
  observations: ObservationFinding[];
}

export const EMPTY_FINDINGS: Findings = { medications: 0, diagnoses: [], labs: [], allergies: [], observations: [] };

/** The findings of one document's `extracted_data`. Anything malformed is skipped, never invented. */
export function readFindings(data: unknown): Findings {
  if (!isRecord(data) || data.extraction_status === 'unavailable') return { ...EMPTY_FINDINGS };
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
  const labs: LabFinding[] = [];
  for (const entry of list(data.lab_results)) {
    const row = isRecord(entry) ? entry : {};
    const test = text(row.test);
    if (test) labs.push({ test, value: text(row.value), unit: text(row.unit), range: text(row.reference_range) });
  }
  const observations: ObservationFinding[] = [];
  for (const entry of list(data.observations)) {
    const row = isRecord(entry) ? entry : {};
    const label = text(row.label);
    const value = text(row.value);
    if (label && value) observations.push({ label, value });
  }
  return {
    medications: list(data.medications).filter((entry) => isRecord(entry) && !!text(entry.name)).length,
    diagnoses: list(data.diagnoses).map(text).filter((entry): entry is string => entry !== null),
    labs,
    allergies: list(data.allergies).map(text).filter((entry): entry is string => entry !== null),
    observations,
  };
}

/** How many pieces of medical data were found (dates alone do not count as data). */
export function countFindings(findings: Findings): number {
  return findings.medications + findings.diagnoses.length + findings.labs.length + findings.allergies.length + findings.observations.length;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** One short line per sheet: what was found, or a clear "nothing found" so an unreadable sheet is never shown as read. */
export function describeReading(findings: Findings): string {
  const parts = [
    findings.medications > 0 ? plural(findings.medications, 'medicament', 'medicamente') : null,
    findings.diagnoses.length > 0 ? plural(findings.diagnoses.length, 'diagnostic', 'diagnostice') : null,
    findings.labs.length > 0 ? plural(findings.labs.length, 'analiză', 'analize') : null,
    findings.allergies.length > 0 ? plural(findings.allergies.length, 'alergie', 'alergii') : null,
    findings.observations.length > 0 ? plural(findings.observations.length, 'observație', 'observații') : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? `Am găsit: ${parts.join(', ')}.` : 'Nu am găsit date în această foaie. Încercați o poză mai clară.';
}

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** All sheets together: the same finding on several sheets appears once. Medicines are counted per sheet, not merged. */
export function mergeFindings(all: Findings[]): Findings {
  const seen = new Set<string>();
  const once = <T>(items: T[], key: (item: T) => string): T[] => items.filter((item) => {
    const id = normalize(key(item));
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const merged: Findings = { medications: 0, diagnoses: [], labs: [], allergies: [], observations: [] };
  for (const findings of all) {
    merged.medications += findings.medications;
    merged.diagnoses.push(...once(findings.diagnoses, (item) => `dx|${item}`));
    merged.labs.push(...once(findings.labs, (item) => `lab|${item.test}|${item.value ?? ''}|${item.unit ?? ''}`));
    merged.allergies.push(...once(findings.allergies, (item) => `al|${item}`));
    merged.observations.push(...once(findings.observations, (item) => `ob|${item.label}|${item.value}`));
  }
  return merged;
}
