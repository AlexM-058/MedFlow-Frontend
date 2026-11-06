// Run: node --experimental-strip-types --no-warnings src/features/doctor/case/caseLogic.test.ts
// Synthetic data only.
import type { CaseSummary, DecisionVariants, ExtractedDocument, IntakeMessage } from '../../care-scenario/contracts.ts';
import { assertEqual, assertTrue, finish, test } from '../../connections/testHarness.ts';
import {
  basedOnVariantAfterEdit,
  buildSummaryRows,
  caseStatusLabel,
  computeCoverage,
  coverageLabel,
  documentAnchorId,
  FEEDBACK_MAX_LENGTH,
  formatTime,
  messageAnchorId,
  prefillFromVariant,
  sourceLink,
  summaryOriginLabel,
  validateFeedback,
} from './caseLogic.ts';

const msg = (id: string, role: IntakeMessage['role'], text: string, createdAt: string): IntakeMessage => ({ id, role, text, createdAt });

const messages: IntakeMessage[] = [
  msg('m1', 'assistant', 'What brings you here today?', '2026-11-07T12:00:00Z'),
  msg('m2', 'patient', 'Headache since yesterday, maybe.', '2026-11-07T12:05:00Z'),
  msg('m3', 'assistant', 'Do you have a fever?', '2026-11-07T12:06:00Z'),
  msg('m4', 'patient', 'I do not have a fever.', '2026-11-07T12:07:00Z'),
  msg('m5', 'patient', 'Also a little dizzy when standing up.', '2026-11-07T12:09:00Z'),
  msg('m6', 'system', 'Safety notice shown.', '2026-11-07T12:10:00Z'),
];

const documents: ExtractedDocument[] = [
  {
    id: 'd1',
    documentType: 'prescription',
    fileName: 'synthetic-prescription.jpg',
    medications: [{ name: 'Amlodipine', dose: '5 mg', frequency: '1 cp dimineata', duration: '30 de zile' }],
    dates: [],
    warnings: [],
    sourceQuotes: {},
    extractedAt: '2026-11-07T11:00:00Z',
  },
];

const summary: CaseSummary = {
  version: 1,
  createdAt: '2026-11-07T12:15:00Z',
  generatedBy: 'fixture',
  items: [
    { id: 's1', text: 'Headache, possibly since yesterday.', sources: [{ kind: 'message', messageId: 'm2', quote: 'maybe' }], uncertain: true },
    { id: 's2', text: 'No fever.', sources: [{ kind: 'message', messageId: 'm4', quote: 'I do not have a fever.' }], negated: true },
    { id: 's3', text: 'Takes amlodipine 5 mg.', sources: [{ kind: 'document', documentId: 'd1', page: 1 }] },
    { id: 's4', text: 'Asked about fever.', sources: [{ kind: 'message', messageId: 'm3', quote: 'fever' }] },
    { id: 's5', text: 'Sleeps poorly.', sources: [] },
  ],
};
const lookup = { messages, documents };

test('negation and uncertainty are preserved as flags; text is unchanged', () => {
  const rows = buildSummaryRows(summary, lookup);
  assertEqual(rows[0].flags, ['Uncertain']);
  assertEqual(rows[0].text, 'Headache, possibly since yesterday.');
  assertEqual(rows[1].flags, ['Negated']);
  assertEqual(rows[1].text, 'No fever.');
  assertEqual(rows[2].flags, []);
});

test('an item with both flags keeps both', () => {
  const rows = buildSummaryRows(
    { ...summary, items: [{ id: 'x', text: 'Probably no rash.', sources: [], negated: true, uncertain: true }] },
    lookup,
  );
  assertEqual(rows[0].flags, ['Negated', 'Uncertain']);
});

test('items without sources are flagged as unsourced', () => {
  const rows = buildSummaryRows(summary, lookup);
  assertTrue(rows[4].unsourced, 's5 has no source');
  assertTrue(!rows[0].unsourced);
  assertEqual(rows[4].links, []);
});

test('uncited patient messages are listed verbatim, in order', () => {
  const coverage = computeCoverage(messages, summary);
  assertEqual(coverage.uncited.map((m) => m.id), ['m5']);
  assertEqual(coverage.uncited[0].text, 'Also a little dizzy when standing up.');
  assertEqual(coverage.citedIds, ['m2', 'm4']);
  assertEqual(coverageLabel(coverage), '2 of 3 patient messages cited');
});

test('coverage ignores assistant and system messages, even when cited', () => {
  const coverage = computeCoverage(messages, summary);
  assertEqual(coverage.totalPatientMessages, 3);
  assertTrue(!coverage.citedIds.includes('m3'), 'assistant message never counts as covered');
  assertTrue(!coverage.uncited.some((m) => m.role !== 'patient'));
});

test('without a summary every patient message is uncited', () => {
  const coverage = computeCoverage(messages, null);
  assertEqual(coverage.uncited.map((m) => m.id), ['m2', 'm4', 'm5']);
  assertEqual(coverageLabel(coverage), '0 of 3 patient messages cited');
});

test('a citation of a message id not in the case does not count as coverage', () => {
  const coverage = computeCoverage(messages, {
    ...summary,
    items: [{ id: 'g', text: 'Ghost', sources: [{ kind: 'message', messageId: 'missing', quote: '' }] }],
  });
  assertEqual(coverage.citedCount, 0);
  assertEqual(sourceLink({ kind: 'message', messageId: 'missing', quote: '' }, lookup).targetId, null);
});

test('source labels point at the original message and document', () => {
  const message = sourceLink({ kind: 'message', messageId: 'm2', quote: '' }, lookup);
  assertEqual(message.label, `Message ${formatTime('2026-11-07T12:05:00Z')}`);
  assertEqual(message.label, 'Message 14:05', 'Europe/Bucharest is UTC+2 in November');
  assertEqual(message.targetId, messageAnchorId('m2'));
  const assistant = sourceLink({ kind: 'message', messageId: 'm3', quote: '' }, lookup);
  assertEqual(assistant.label, 'Assistant message 14:06');
  const document = sourceLink({ kind: 'document', documentId: 'd1', page: 1 }, lookup);
  assertEqual(document.label, 'Document: prescription, page 1');
  assertEqual(document.targetId, documentAnchorId('d1'));
  assertEqual(sourceLink({ kind: 'document', documentId: 'd1' }, lookup).label, 'Document: prescription');
  assertEqual(sourceLink({ kind: 'patient-input', at: '2026-11-07T08:00:00Z' }, lookup).targetId, null);
});

test('summary origin and case status labels', () => {
  assertEqual(summaryOriginLabel('ai'), 'Generated by AI');
  assertEqual(summaryOriginLabel('fixture'), 'Demo summary');
  assertEqual(caseStatusLabel('pending_doctor', false), 'Waiting for your review');
  assertEqual(caseStatusLabel('pending_doctor', true), 'Answered');
  assertEqual(caseStatusLabel('answered', false), 'Answered');
});

test('feedback is trimmed at the ends only and required', () => {
  assertEqual(validateFeedback('  Keep  taking it.\n'), { ok: true, value: 'Keep  taking it.' });
  assertEqual(validateFeedback('   \n ').ok, false);
  assertEqual(validateFeedback('').ok, false);
});

test('feedback length limit applies to the trimmed text', () => {
  assertEqual(validateFeedback('a'.repeat(FEEDBACK_MAX_LENGTH)).ok, true);
  assertEqual(validateFeedback(`  ${'a'.repeat(FEEDBACK_MAX_LENGTH)}  `).ok, true);
  assertEqual(validateFeedback('a'.repeat(FEEDBACK_MAX_LENGTH + 1)).ok, false);
});

const variants: DecisionVariants = {
  generatedBy: 'fixture',
  createdAt: '2026-11-07T12:20:00Z',
  options: [
    { option: 'Option A text', reasoning: 'r', confidence: 'low', confirmationPath: 'p' },
    { option: 'Option B text', reasoning: 'r', confidence: 'low', confirmationPath: 'p' },
  ],
  missingInformation: [],
  contradictions: [],
};

test('variant prefill only returns editable text and the index', () => {
  assertEqual(prefillFromVariant(variants, 1), { text: 'Option B text', basedOnVariant: 1 });
  assertEqual(prefillFromVariant(variants, 5), null);
});

test('emptying the field drops the variant link', () => {
  assertEqual(basedOnVariantAfterEdit('', 1), null);
  assertEqual(basedOnVariantAfterEdit('edited', 1), 1);
  assertEqual(basedOnVariantAfterEdit('edited', null), null);
});

finish();
