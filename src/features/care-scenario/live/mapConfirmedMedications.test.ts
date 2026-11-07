import { mapConfirmedMedications } from './mapConfirmedMedications.ts';
import type { CaseDocumentRecord } from '../../../lib/caseApi.ts';

const failures: string[] = [];
let passed = 0;
function check(name: string, ok: boolean) {
  if (ok) passed++;
  else failures.push(name);
}

function doc(overrides: Partial<CaseDocumentRecord>): CaseDocumentRecord {
  return {
    id: 'doc-1', caseId: 'case-1', uploadedBy: 'patient-1', documentType: 'prescription', mimeType: 'image/png',
    sizeBytes: 10, extractedData: { medications: [] }, review: null, reviewedAt: null, createdAt: '2026-11-07T09:00:00Z',
    ...overrides,
  };
}

const field = (index: number, key: string, value: string | null) => ({
  path: `medications.${index}.${key}`, label: key, extracted: value, value,
  confirmation: { status: 'confirmed', by: 'patient', at: '2026-11-07T10:00:00Z' },
});
const review = {
  fields: [
    field(0, 'name', 'Amlodipină'), field(0, 'dose', '5 mg'), field(0, 'frequency', '1 cp dimineața'), field(0, 'duration', null),
  ],
  medications: [{ name: 'Amlodipină', dose: '5 mg', frequency: '1 cp dimineața', duration: null }],
};

const unreviewed = mapConfirmedMedications([doc({ extractedData: { medications: [{ name: 'X', dose: '1 mg', frequency: 'zilnic', duration: null }] } })]);
check('an unreviewed document gives no confirmed medication, even if the reader extracted some', unreviewed.length === 0);

const confirmed = mapConfirmedMedications([doc({ review, reviewedAt: '2026-11-07T10:00:00Z' })]);
check('a reviewed document gives its medications', confirmed.length === 1);
check('texts are kept verbatim', confirmed[0]?.doseText === '5 mg' && confirmed[0]?.instructionOriginal === '1 cp dimineața');
check('an absent duration stays null', confirmed[0]?.durationText === null);
check('the four reviewed fields are attached', confirmed[0]?.fields.length === 4);
check('confirmedAt is the review time', confirmed[0]?.confirmedAt === '2026-11-07T10:00:00Z');
check('ids are stable per document and row', confirmed[0]?.id === 'doc-1:0' && confirmed[0]?.documentId === 'doc-1');

const broken = mapConfirmedMedications([
  doc({ review: { medications: [{ name: 'Y', dose: null, frequency: 'zilnic' }] } }),
  doc({ id: 'doc-2', review: 'not an object' }),
  doc({ id: 'doc-3', review: { medications: 'x' } }),
]);
check('incomplete or malformed review data is never shown as confirmed', broken.length === 0);

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length > 0) throw new Error(`Failed: ${failures.join('; ')}`);
