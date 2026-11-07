import type { CaseDecision } from '../../lib/caseApi.ts';
import { isUnread, latestDecision, markerKey, readMarker, senderName, UNKNOWN_DOCTOR_NAME, writeMarker, type MarkerStorage } from './doctorNoticeLogic.ts';

const assert = {
  equal(actual: unknown, expected: unknown) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  },
};

const decision = (id: string, createdAt: string, doctorId = 'd1'): CaseDecision => ({ id, caseId: `c-${id}`, doctorId, text: 'Synthetic doctor message', createdAt });

// The newest message wins; cases without a message are ignored.
assert.equal(latestDecision([]), null);
assert.equal(latestDecision([null, null]), null);
const older = decision('a', '2026-11-06T10:00:00Z');
const newer = decision('b', '2026-11-07T09:00:00Z');
assert.equal(latestDecision([older, null, newer])?.id, 'b');
assert.equal(latestDecision([newer, older])?.id, 'b');

// Unread rules: nothing to read, never read, older read marker, read marker at/after the message.
assert.equal(isUnread(null, null), false);
assert.equal(isUnread(newer, null), true);
assert.equal(isUnread(newer, '2026-11-06T10:00:00Z'), true);
assert.equal(isUnread(newer, '2026-11-07T09:00:00Z'), false);
assert.equal(isUnread(newer, '2026-11-08T00:00:00Z'), false);

// The doctor's own name is used; a disconnected doctor gets the neutral label.
const doctors = [{ id: 'd1', fullName: '  Dr. Marin  ' }];
assert.equal(senderName(decision('x', '2026-11-07T09:00:00Z', 'd1'), doctors), 'Dr. Marin');
assert.equal(senderName(decision('x', '2026-11-07T09:00:00Z', 'gone'), doctors), UNKNOWN_DOCTOR_NAME);
assert.equal(senderName(decision('x', '2026-11-07T09:00:00Z', 'd1'), [{ id: 'd1', fullName: '   ' }]), UNKNOWN_DOCTOR_NAME);

// Marker storage: per user, only a timestamp, and never throws.
const memory = (): MarkerStorage & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value; } };
};
const store = memory();
assert.equal(readMarker('u1', store), null);
assert.equal(writeMarker('u1', '2026-11-07T09:00:00Z', store), true);
assert.equal(readMarker('u1', store), '2026-11-07T09:00:00Z');
assert.equal(readMarker('u2', store), null);
assert.equal(Object.keys(store.data), [markerKey('u1')]);
assert.equal(Object.values(store.data), ['2026-11-07T09:00:00Z']);

const broken: MarkerStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
assert.equal(readMarker('u1', broken), null);
assert.equal(writeMarker('u1', '2026-11-07T09:00:00Z', broken), false);
assert.equal(readMarker('u1', null), null);
assert.equal(writeMarker('u1', '2026-11-07T09:00:00Z', null), false);
assert.equal(writeMarker('u1', 'not a date', memory()), false);
const corrupt = memory(); corrupt.data[markerKey('u1')] = 'garbage';
assert.equal(readMarker('u1', corrupt), null);

console.log('doctorNoticeLogic: ok');
