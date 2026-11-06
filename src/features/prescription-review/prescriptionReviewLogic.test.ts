// Run: node --experimental-strip-types --no-warnings src/features/prescription-review/prescriptionReviewLogic.test.ts
import type { ExtractedDocument } from '../care-scenario/contracts.ts';
import { assertEqual, assertTrue, finish, test } from '../connections/testHarness.ts';
import {
  buildReviewFields,
  canConfirm,
  confirmField,
  editField,
  markNotPresent,
  missingFields,
  resetField,
  toReviewedFields,
  type ActionResult,
  type ReviewFieldState,
} from './prescriptionReviewLogic.ts';

const AT = '2026-11-07T09:00:00.000Z';

// Synthetic prescription (demo data only).
function doc(overrides: Partial<ExtractedDocument['medications'][number]> = {}): ExtractedDocument {
  return {
    id: 'doc-synthetic-1',
    documentType: 'prescription',
    fileName: 'synthetic-prescription.jpg',
    medications: [
      { name: 'Amlodipina', dose: '5 mg', frequency: '1 cp dimineata', duration: '30 de zile', ...overrides },
    ],
    dates: [{ label: 'Data', value: '07.11.2026' }],
    warnings: [],
    sourceQuotes: { 'medications.0.dose': 'Amlodipina 5 mg' },
    extractedAt: AT,
  };
}

function ok(result: ActionResult): ReviewFieldState[] {
  if (!result.ok) throw new Error(`expected ok, got error: ${result.error}`);
  return result.fields;
}

function confirmAll(fields: ReviewFieldState[]): ReviewFieldState[] {
  return fields.reduce((acc, field) => ok(confirmField(acc, field.path, AT)), fields);
}

test('builds one pending field per property, with source quotes', () => {
  const fields = buildReviewFields(doc());
  assertEqual(fields.map((f) => f.path), [
    'medications.0.name',
    'medications.0.dose',
    'medications.0.frequency',
    'medications.0.duration',
  ]);
  assertTrue(fields.every((f) => f.resolution.kind === 'pending'), 'nothing is pre-confirmed');
  assertEqual(fields[1].sourceQuote, 'Amlodipina 5 mg');
  assertEqual(fields[0].sourceQuote, undefined);
  assertEqual(canConfirm(fields), false);
});

test('illegible (null) dose blocks confirmation and cannot be confirmed as extracted', () => {
  const fields = buildReviewFields(doc({ dose: null }));
  const dose = fields.find((f) => f.key === 'dose')!;
  assertEqual(dose.extracted, null);
  const result = confirmField(fields, dose.path, AT);
  assertEqual(result.ok, false);
  const others = fields.filter((f) => f.key !== 'dose').reduce((acc, f) => ok(confirmField(acc, f.path, AT)), fields);
  assertEqual(canConfirm(others), false);
  assertEqual(missingFields(others), [
    { path: 'medications.0.dose', medicationIndex: 0, label: 'Dose', reason: 'not-readable' },
  ]);
});

test('whitespace-only extracted value is treated as unreadable', () => {
  const fields = buildReviewFields(doc({ frequency: '   ' }));
  assertEqual(fields.find((f) => f.key === 'frequency')!.extracted, null);
});

test('no inferred values: unreadable fields stay empty until the patient types them', () => {
  const fields = buildReviewFields(doc({ dose: null, frequency: null, duration: null }));
  for (const field of fields.filter((f) => f.key !== 'name')) {
    assertEqual(field.extracted, null);
    assertEqual(field.resolution, { kind: 'pending' });
  }
});

test('edited value is the patient transcription and unlocks confirmation', () => {
  let fields = buildReviewFields(doc({ dose: null }));
  fields = ok(editField(fields, 'medications.0.dose', '  5 mg ', AT));
  fields = ['medications.0.name', 'medications.0.frequency', 'medications.0.duration'].reduce(
    (acc, path) => ok(confirmField(acc, path, AT)),
    fields,
  );
  assertTrue(canConfirm(fields));
  const reviewed = toReviewedFields(fields);
  const dose = reviewed.find((f) => f.path === 'medications.0.dose')!;
  assertEqual(dose.extracted, null);
  assertEqual(dose.value, '5 mg');
  assertEqual(dose.confirmation, { status: 'confirmed', by: 'patient', at: AT });
  const resolution = fields.find((f) => f.key === 'dose')!.resolution;
  assertTrue(resolution.kind === 'confirmed' && resolution.edited, 'marked as corrected by the patient');
});

test('edit identical to the extracted text is not marked as a correction', () => {
  const fields = ok(editField(buildReviewFields(doc()), 'medications.0.dose', '5 mg', AT));
  const resolution = fields.find((f) => f.key === 'dose')!.resolution;
  assertTrue(resolution.kind === 'confirmed' && !resolution.edited);
});

test('whitespace-only edits are rejected', () => {
  const fields = buildReviewFields(doc({ dose: null }));
  const result = editField(fields, 'medications.0.dose', '   \t ', AT);
  assertEqual(result.ok, false);
});

test('duration can be marked not on the prescription; value saved as null', () => {
  let fields = buildReviewFields(doc({ duration: null }));
  fields = ok(markNotPresent(fields, 'medications.0.duration', AT));
  fields = ['medications.0.name', 'medications.0.dose', 'medications.0.frequency'].reduce(
    (acc, path) => ok(confirmField(acc, path, AT)),
    fields,
  );
  assertTrue(canConfirm(fields));
  const duration = toReviewedFields(fields).find((f) => f.path === 'medications.0.duration')!;
  assertEqual(duration.value, null);
  assertEqual(duration.extracted, null);
  assertEqual(duration.confirmation.status, 'confirmed');
});

test('name, dose and instruction cannot be marked not present', () => {
  const fields = buildReviewFields(doc());
  for (const path of ['medications.0.name', 'medications.0.dose', 'medications.0.frequency']) {
    assertEqual(markNotPresent(fields, path, AT).ok, false, path);
  }
});

test('unanswered duration still blocks confirmation (never saved as "none given")', () => {
  let fields = buildReviewFields(doc({ duration: null }));
  fields = ['medications.0.name', 'medications.0.dose', 'medications.0.frequency'].reduce(
    (acc, path) => ok(confirmField(acc, path, AT)),
    fields,
  );
  assertEqual(canConfirm(fields), false);
  assertEqual(missingFields(fields).map((m) => m.path), ['medications.0.duration']);
});

test('reset returns a field to pending and blocks confirmation again', () => {
  let fields = confirmAll(buildReviewFields(doc()));
  assertTrue(canConfirm(fields));
  fields = ok(resetField(fields, 'medications.0.name'));
  assertEqual(canConfirm(fields), false);
});

test('instruction text is kept verbatim (no conversion to hours)', () => {
  const fields = confirmAll(buildReviewFields(doc({ frequency: 'de 2 ori pe zi' })));
  const instruction = toReviewedFields(fields).find((f) => f.path === 'medications.0.frequency')!;
  assertEqual(instruction.value, 'de 2 ori pe zi');
  assertEqual(instruction.label, 'Instruction');
});

test('document without medications cannot be confirmed', () => {
  const empty = { ...doc(), medications: [] };
  assertEqual(canConfirm(buildReviewFields(empty)), false);
});

test('toReviewedFields refuses an incomplete review', () => {
  let threw = false;
  try {
    toReviewedFields(buildReviewFields(doc()));
  } catch {
    threw = true;
  }
  assertTrue(threw);
});

finish();
