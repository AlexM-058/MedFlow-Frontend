import type { CaseMessageRecord, CaseRecord } from '../../lib/caseApi.ts';
import { chooseCase, MAX_MESSAGE_LENGTH, mergeMessages, orderMessages, senderKind, toChatMessage, validDraft } from './chatLogic.ts';

const assert = {
  equal(actual: unknown, expected: unknown) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  },
};

const item = (id: string, doctorId: string, createdAt: string): CaseRecord =>
  ({ id, patientId: 'p1', doctorId, status: 'draft', createdAt, updatedAt: createdAt });
const message = (id: string, senderRole: string, createdAt: string, content = 'Synthetic'): CaseMessageRecord =>
  ({ id, caseId: 'c1', senderRole, content, createdAt });

// Backend roles map to what the patient sees; anything unknown is shown as an important notice.
assert.equal(['patient', 'doctor', 'ai', 'system', 'something_else'].map(senderKind), ['patient', 'doctor', 'assistant', 'system', 'system']);

// A draft is sent only if it has text and fits; it is trimmed, never altered otherwise.
assert.equal(validDraft('  Am dureri de cap  '), 'Am dureri de cap');
assert.equal(validDraft('   '), null);
assert.equal(validDraft(''), null);
assert.equal(validDraft('x'.repeat(MAX_MESSAGE_LENGTH)), 'x'.repeat(MAX_MESSAGE_LENGTH));
assert.equal(validDraft('x'.repeat(MAX_MESSAGE_LENGTH + 1)), null);

// The newest case with a connected doctor is continued; none means a new one must be opened.
const cases = [item('old', 'd1', '2026-11-01T00:00:00Z'), item('new', 'd1', '2026-11-05T00:00:00Z'), item('other', 'd9', '2026-11-09T00:00:00Z')];
assert.equal(chooseCase(cases, ['d1'])?.id, 'new');
assert.equal(chooseCase(cases, ['d1', 'd9'])?.id, 'other');
assert.equal(chooseCase(cases, ['d2']), null);
assert.equal(chooseCase([], ['d1']), null);
assert.equal(chooseCase(cases, []), null);

// Messages are oldest first with a stable tie-break.
const out = orderMessages([message('b', 'ai', '2026-11-07T10:00:00Z'), message('a', 'patient', '2026-11-07T10:00:00Z'), message('c', 'patient', '2026-11-07T09:00:00Z')]);
assert.equal(out.map((entry) => entry.id), ['c', 'a', 'b']);

// Merging keeps what was already shown, adds new messages and never duplicates by id.
const shown = [message('a', 'patient', '2026-11-07T10:00:00Z')];
const merged = mergeMessages(shown, [message('a', 'patient', '2026-11-07T10:00:00Z'), message('b', 'ai', '2026-11-07T10:01:00Z'), message('s', 'system', '2026-11-07T10:00:30Z', 'Sunați la 112')]);
assert.equal(merged.map((entry) => entry.id), ['a', 's', 'b']);
assert.equal(mergeMessages(merged, []).length, 3);
assert.equal(mergeMessages([], []).length, 0);

// In the chat the patient is on the right; the assistant, the doctor and notices on the left, each with its label.
assert.equal(['patient', 'ai', 'doctor', 'system', 'x'].map((role) => toChatMessage(message('m', role, '2026-11-07T10:00:00Z', 'Text')).sender), ['patient', 'ai', 'doctor', 'system', 'system']);
assert.equal(toChatMessage(message('m1', 'patient', '2026-11-07T10:00:00Z', 'Am sete.')), { id: 'm1', sender: 'patient', text: 'Am sete.', createdAt: '2026-11-07T10:00:00Z' });

console.log('chatLogic: ok');
