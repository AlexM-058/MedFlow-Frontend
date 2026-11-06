// Run: node --experimental-strip-types --no-warnings src/features/care-scenario/live/mapExtractedDocument.test.ts
import type { CaseDocumentRecord } from '../../../lib/caseApi.ts';
import { assertEqual, finish, test } from '../../connections/testHarness.ts';
import { mapExtractedDocument, UNEXPECTED_FORMAT_WARNING } from './mapExtractedDocument.ts';

const base = (extractedData: unknown, documentType = 'prescription'): CaseDocumentRecord => ({
  id: 'doc-1',
  caseId: 'case-1',
  uploadedBy: 'user-1',
  documentType,
  mimeType: 'image/jpeg',
  sizeBytes: 1234,
  extractedData,
  createdAt: '2026-11-07T09:00:00.000Z',
});

test('maps medications, dates and warnings, with empty quotes', () => {
  const doc = mapExtractedDocument(base({
    medications: [{ name: 'Amlodipina', dose: '5 mg', frequency: '1 cp dimineata', duration: '30 zile' }],
    dates: [{ label: 'Data prescrierii', value: '06.11.2026' }],
    warnings: ['Removed a value not present in the document'],
    diagnoses: [],
  }), 'reteta.jpg');
  assertEqual(doc.id, 'doc-1');
  assertEqual(doc.documentType, 'prescription');
  assertEqual(doc.fileName, 'reteta.jpg');
  assertEqual(doc.medications, [{ name: 'Amlodipina', dose: '5 mg', frequency: '1 cp dimineata', duration: '30 zile' }]);
  assertEqual(doc.dates, [{ label: 'Data prescrierii', value: '06.11.2026' }]);
  assertEqual(doc.warnings, ['Removed a value not present in the document']);
  assertEqual(doc.sourceQuotes, {});
  assertEqual(doc.extractedAt, '2026-11-07T09:00:00.000Z');
});

test('null, missing and empty fields stay null', () => {
  const doc = mapExtractedDocument(base({
    medications: [{ name: 'Amlodipina', dose: null, frequency: '', duration: undefined }],
    dates: [{ label: null, value: '06.11.2026' }],
    warnings: ['Dose could not be read'],
  }));
  assertEqual(doc.medications, [{ name: 'Amlodipina', dose: null, frequency: null, duration: null }]);
  assertEqual(doc.dates, [{ label: null, value: '06.11.2026' }]);
  assertEqual(doc.warnings, ['Dose could not be read']);
});

test('empty extraction maps to empty lists without warnings', () => {
  const doc = mapExtractedDocument(base({ medications: [], dates: [], warnings: [] }));
  assertEqual([doc.medications, doc.dates, doc.warnings], [[], [], []]);
});

test('unexpected shapes are reported, not dropped silently', () => {
  assertEqual(mapExtractedDocument(base(null)).warnings, [UNEXPECTED_FORMAT_WARNING]);
  const doc = mapExtractedDocument(base({ medications: ['Amlodipina'], dates: 'today', warnings: [{ field: 'dose' }] }, 'unknown_type'));
  assertEqual(doc.medications, []);
  assertEqual(doc.documentType, 'other');
  assertEqual(doc.warnings, ['{"field":"dose"}', UNEXPECTED_FORMAT_WARNING]);
});

finish();
