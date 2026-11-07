import type { ConnectionRequest } from '../../../auth/contracts.ts';
import type { CaseRecord } from '../../../lib/caseApi.ts';
import { buildBacklog, countByFilter, filterBacklog, formatActivity, normalizeText, UNKNOWN_PATIENT_NAME } from './backlogLogic.ts';

const assert = {
  equal(actual: unknown, expected: unknown) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  },
};

const doctor = { id: 'd1', fullName: 'Dr. Synthetic', specialty: 'Medicină de familie', clinic: 'Clinica de test' };
const request = (patientId: string, fullName: string, createdAt: string, status: ConnectionRequest['status'] = 'accepted'): ConnectionRequest =>
  ({ id: `r-${patientId}-${createdAt}`, status, createdAt, doctor, patient: { id: patientId, fullName } });
const item = (id: string, patientId: string, over: Partial<CaseRecord> = {}): CaseRecord =>
  ({ id, patientId, doctorId: 'd1', status: 'draft', createdAt: '2026-11-01T08:00:00Z', updatedAt: '2026-11-01T08:00:00Z', ...over });

const accepted = [
  request('p1', 'Ana Popescu', '2026-11-01T08:00:00Z'),
  request('p2', 'Mihai Ionescu', '2026-11-02T08:00:00Z'),
  request('p3', 'Ioana Stănescu', '2026-11-03T08:00:00Z'),
  request('p4', 'Doar în așteptare', '2026-11-04T08:00:00Z', 'pending'),
];
const cases = [
  item('c1', 'p1', { reviewState: 'needs_review', lastActivityAt: '2026-11-07T09:42:00Z', lastMessage: { senderRole: 'patient', content: 'Am durere de cap', createdAt: '2026-11-07T09:42:00Z' } }),
  item('c2', 'p2', { reviewState: 'up_to_date', lastActivityAt: '2026-11-06T10:00:00Z', lastMessage: { senderRole: 'doctor', content: 'Continuați tratamentul', createdAt: '2026-11-06T10:00:00Z' } }),
];

// Only accepted patients are listed; a connected patient without a case is "new".
const rows = buildBacklog(accepted, cases);
assert.equal(rows.map((row) => row.patientName), ['Ana Popescu', 'Ioana Stănescu', 'Mihai Ionescu']);
assert.equal(rows.map((row) => row.state), ['needs_review', 'new', 'up_to_date']);
assert.equal(rows[1]?.caseId, null);
assert.equal(rows[1]?.lastActivityAt, '2026-11-03T08:00:00Z');
assert.equal(rows[0]?.lastMessage, { fromPatient: true, text: 'Am durere de cap', at: '2026-11-07T09:42:00Z' });
assert.equal(rows[2]?.lastMessage?.fromPatient, false);

// A pending or rejected request never makes a patient appear.
assert.equal(buildBacklog([request('p9', 'Respins', '2026-11-01T08:00:00Z', 'rejected')], []).length, 0);

// Needs review comes first even when older, then newest activity, then name.
const ordered = buildBacklog(
  [request('a', 'Zoe', '2026-11-01T00:00:00Z'), request('b', 'Ana', '2026-11-01T00:00:00Z'), request('c', 'Bia', '2026-11-01T00:00:00Z')],
  [item('x', 'a', { reviewState: 'needs_review', lastActivityAt: '2026-11-02T00:00:00Z' }), item('y', 'b', { reviewState: 'up_to_date', lastActivityAt: '2026-11-09T00:00:00Z' })],
);
assert.equal(ordered.map((row) => row.patientName), ['Zoe', 'Bia', 'Ana']);

// If the case list failed, no state is invented; if the Backend omitted the fields, the state is unknown.
assert.equal(buildBacklog(accepted, null).map((row) => row.state), ['unknown', 'unknown', 'unknown']);
assert.equal(buildBacklog([request('p1', 'Ana', '2026-11-01T00:00:00Z')], [item('c', 'p1')])[0]?.state, 'unknown');

// A case of a patient missing from the accepted list is still shown (never silently dropped).
const orphan = buildBacklog([], [item('c9', 'p9', { reviewState: 'needs_review' })]);
assert.equal(orphan.length, 1);
assert.equal(orphan[0]?.patientName, UNKNOWN_PATIENT_NAME);

// Several cases of one patient: the newest one is used. Repeated accepted requests are listed once.
const twice = buildBacklog(
  [request('p1', 'Ana', '2026-11-01T00:00:00Z'), request('p1', 'Ana', '2026-11-05T00:00:00Z')],
  [item('old', 'p1', { reviewState: 'up_to_date' }), item('new', 'p1', { createdAt: '2026-11-04T00:00:00Z', reviewState: 'needs_review' })],
);
assert.equal(twice.length, 1);
assert.equal(twice[0]?.caseId, 'new');

// Counts and filters; search ignores case and diacritics.
assert.equal(countByFilter(rows), { all: 3, needs_review: 1, new: 1, up_to_date: 1 });
assert.equal(filterBacklog(rows, '', 'needs_review').map((row) => row.patientName), ['Ana Popescu']);
assert.equal(filterBacklog(rows, 'stanescu', 'all').map((row) => row.patientName), ['Ioana Stănescu']);
assert.equal(filterBacklog(rows, '  IONESCU ', 'all').map((row) => row.patientName), ['Mihai Ionescu']);
assert.equal(filterBacklog(rows, 'ionescu', 'needs_review').length, 0);
assert.equal(normalizeText('Ștefănescu'), 'stefanescu');

// Activity labels.
const now = new Date(2026, 10, 7, 12, 0);
assert.equal(formatActivity(new Date(2026, 10, 7, 9, 5).toISOString(), now), 'azi 09:05');
assert.equal(formatActivity(new Date(2026, 10, 6, 23, 59).toISOString(), now), 'ieri');
assert.equal(formatActivity(new Date(2026, 10, 1, 8, 0).toISOString(), now), '01.11.2026');
assert.equal(formatActivity('not a date', now), '—');

console.log('backlogLogic: ok');
