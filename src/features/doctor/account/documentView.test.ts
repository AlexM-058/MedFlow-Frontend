import type { CaseDocumentRecord } from '../../../lib/caseApi.ts';
import { describeDocument, formatSize, MISSING } from './documentView.ts';

const assert = {
  equal(actual: unknown, expected: unknown) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  },
};

const doc = (extractedData: unknown, over: Partial<CaseDocumentRecord> = {}): CaseDocumentRecord =>
  ({ id: 'd1', caseId: 'c1', uploadedBy: 'p1', documentType: 'prescription', mimeType: 'image/jpeg', sizeBytes: 1_300_000, extractedData, createdAt: '2026-11-07T09:00:00Z', ...over });

// Extracted medications are copied as text; a missing field is a dash, never a guess.
const extracted = describeDocument(doc({
  medications: [{ name: 'Amoxicilină', dose: '875 mg', frequency: '2 cpr / zi', duration: null }, { name: null, dose: null, frequency: null, duration: null }],
  dates: [{ label: 'Data emiterii', value: '07.11.2026' }],
}));
assert.equal(extracted.status, 'extracted');
assert.equal(extracted.typeLabel, 'Rețetă');
assert.equal(extracted.sizeLabel, '1,2 MB');
assert.equal(extracted.medications[0], { name: 'Amoxicilină', dose: '875 mg', frequency: '2 cpr / zi', duration: MISSING });
assert.equal(extracted.medications[1], { name: MISSING, dose: MISSING, frequency: MISSING, duration: MISSING });
assert.equal(extracted.dates, [{ label: 'Data emiterii', value: '07.11.2026' }]);

// A failed extraction is stated and the document stays visible.
const unavailable = describeDocument(doc({ extraction_status: 'unavailable', error: 'Serviciul nu este disponibil' }));
assert.equal(unavailable.status, 'unavailable');
assert.equal(unavailable.statusLabel, 'Extracție indisponibilă');
assert.equal(unavailable.medications.length, 0);

// A readable but empty result is not presented as a success.
assert.equal(describeDocument(doc({ medications: [], dates: [] })).status, 'empty');
assert.equal(describeDocument(doc(null)).status, 'empty');

// Unexpected shapes surface a warning instead of being dropped silently.
const odd = describeDocument(doc({ medications: 'not a list' }));
assert.equal(odd.warnings.length > 0, true);

// Unknown types fall back to a neutral label; sizes are readable.
assert.equal(describeDocument(doc({}, { documentType: 'something_new' })).typeLabel, 'Alt document');
assert.equal(describeDocument(doc({}, { documentType: 'lab_result' })).typeLabel, 'Analize');
assert.equal(formatSize(512), '512 B');
assert.equal(formatSize(2048), '2 KB');
assert.equal(formatSize(-1), MISSING);

console.log('documentView: ok');
