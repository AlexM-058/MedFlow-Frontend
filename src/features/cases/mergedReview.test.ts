import { buildReviews, isRowReady, mergeMedications, pendingDocuments, type RowDecision } from './mergedReview.ts';
import type { CaseDocumentRecord } from '../../lib/caseApi.ts';

const failures: string[] = [];
let passed = 0;
function check(name: string, ok: boolean) {
  if (ok) passed++;
  else failures.push(name);
}

const med = (name: string | null, dose: string | null, frequency: string | null, duration: string | null = null) => ({ name, dose, frequency, duration });
function doc(id: string, medications: unknown[], over: Partial<CaseDocumentRecord> = {}): CaseDocumentRecord {
  return {
    id, caseId: 'case-1', uploadedBy: 'patient-1', documentType: 'prescription', mimeType: 'image/png', sizeBytes: 10,
    extractedData: { medications }, review: null, reviewedAt: null, createdAt: '2026-11-07T09:00:00Z', ...over,
  };
}
const at = '2026-11-07T10:00:00Z';
const ok = (row: { name: string | null; dose: string | null; frequency: string | null }): RowDecision =>
  ({ confirmed: true, name: row.name ?? '', dose: row.dose ?? '', frequency: row.frequency ?? '' });

// 30 sheets repeating the same two medicines give two rows, with every occurrence kept.
const many = Array.from({ length: 30 }, (_, i) => doc(`d${i}`, [med('Amlodipină', '5 mg', '1 cp dimineața', '30 zile'), med('METFORMIN', '500 mg', '2 cp/zi')]));
const rows = mergeMedications(many);
check('30 sheets -> 2 unique rows', rows.length === 2);
check('every occurrence is kept', rows.every((row) => row.occurrences.length === 30));
check('rows are sorted by name', rows[0]?.name === 'Amlodipină');
check('case and diacritics do not split a row', mergeMedications([doc('a', [med('amlodipina', '5 MG', '1  cp dimineata')]), doc('b', [med('Amlodipină', '5 mg', '1 cp dimineața')])]).length === 1);
check('a different dose is a different row', mergeMedications([doc('a', [med('X', '5 mg', 'zilnic')]), doc('b', [med('X', '10 mg', 'zilnic')])]).length === 2);

// Only unreviewed prescriptions with something read are listed.
check('reviewed documents are not listed again', pendingDocuments([doc('a', [med('X', '1', '2')], { review: { medications: [] } })]).length === 0);
check('failed readings and empty ones are not listed', pendingDocuments([
  doc('a', [med('X', '1', '2')], { extractedData: { extraction_status: 'unavailable' } }),
  doc('b', []),
  doc('c', [med('X', '1', '2')], { documentType: 'lab_result' }),
  doc('d', [], { extractedData: null }),
]).length === 0);

// Confirming everything reviews every document, with the reader's text kept in `extracted`.
const all: Record<string, RowDecision> = Object.fromEntries(rows.map((row) => [row.key, ok(row)]));
const built = buildReviews(many, rows, all, at);
check('every document gets a review', built.reviews.length === 30 && built.skipped.length === 0);
const first = built.reviews[0]!.fields;
check('4 fields per medicine, by position', first.length === 8 && first[0]?.path === 'medications.0.name' && first[7]?.path === 'medications.1.duration');
check('extracted is what the reader saw', first[1]?.extracted === '5 mg' && first[3]?.extracted === '30 zile');
check('duration is confirmed as extracted, absent stays null', first[3]?.value === '30 zile' && first[7]?.extracted === null && first[7]?.value === null);
check('every field is a patient confirmation', first.every((field) => field.confirmation.status === 'confirmed' && field.confirmation.by === 'patient' && field.confirmation.at === at));

// A correction applies to every sheet of that row; the reader's text is still recorded.
const edited = { ...all, [rows[0]!.key]: { confirmed: true, name: 'Amlodipină', dose: '10 mg', frequency: '1 cp dimineața' } };
const correctedReview = buildReviews(many, rows, edited, at).reviews[3]!.fields;
check('the correction reaches every sheet', correctedReview[1]?.value === '10 mg' && correctedReview[1]?.extracted === '5 mg');

// A sheet is reviewed only if ALL its medicines are confirmed.
const partial = buildReviews(many, rows, { [rows[0]!.key]: ok(rows[0]!) }, at);
check('an unconfirmed medicine leaves the whole sheet unreviewed', partial.reviews.length === 0 && partial.skipped.length === 30);
const mixed = [doc('only-a', [med('A', '1 mg', 'zilnic')]), doc('a-and-b', [med('A', '1 mg', 'zilnic'), med('B', '2 mg', 'zilnic')])];
const mixedRows = mergeMedications(mixed);
const rowA = mixedRows.find((row) => row.name === 'A')!;
const mixedResult = buildReviews(mixed, mixedRows, { [rowA.key]: ok(rowA) }, at);
check('sheets whose medicines are all confirmed go through, the others are skipped',
  mixedResult.reviews.length === 1 && mixedResult.reviews[0]?.documentId === 'only-a' && mixedResult.skipped[0] === 'a-and-b');

// An unreadable field must be typed by the patient; it cannot be confirmed empty.
const unreadable = mergeMedications([doc('u', [med('Aspirină', null, 'zilnic')])]);
check('an empty dose cannot be confirmed', !isRowReady({ confirmed: true, name: 'Aspirină', dose: '  ', frequency: 'zilnic' }));
check('unchecked rows are never ready', !isRowReady({ confirmed: false, name: 'x', dose: 'y', frequency: 'z' }) && !isRowReady(undefined));
const typed = buildReviews([doc('u', [med('Aspirină', null, 'zilnic')])], unreadable, { [unreadable[0]!.key]: { confirmed: true, name: 'Aspirină', dose: '75 mg', frequency: 'zilnic' } }, at);
check('typed value is saved while extracted stays null', typed.reviews[0]?.fields[1]?.extracted === null && typed.reviews[0]?.fields[1]?.value === '75 mg');

// A malformed entry keeps its position so the Backend can check the review.
const odd = [doc('o', ['not a record', med('Z', '1 mg', 'zilnic')])];
const oddRows = mergeMedications(odd);
check('a malformed entry is a row that must be typed', oddRows.length === 2);
const oddBuilt = buildReviews(odd, oddRows, Object.fromEntries(oddRows.map((row) => [row.key, { confirmed: true, name: row.name ?? 'Necunoscut', dose: row.dose ?? '1 mg', frequency: row.frequency ?? 'zilnic' }])), at);
check('positions are preserved', oddBuilt.reviews[0]?.fields.some((field) => field.path === 'medications.1.name' && field.value === 'Z') === true);

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length > 0) throw new Error(`Failed: ${failures.join('; ')}`);
