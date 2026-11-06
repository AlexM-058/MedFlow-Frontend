// Run from Frontend/: node --experimental-strip-types --no-warnings src/features/doctor/workspace/patientQuery.test.ts
import { assertEqual, assertTrue, finish, test } from '../shared/testHarness.ts';
import { DEMO_NOW, DEMO_PATIENTS } from '../fixtures.ts';
import { formatLastContact } from '../format.ts';
import type { DoctorPatient } from '../types.ts';
import {
  countByStatus,
  DEFAULT_QUERY,
  isFiltered,
  queryPatients,
  type PatientQuery,
} from './patientQuery.ts';

const ids = (patients: readonly DoctorPatient[]) => patients.map((p) => p.id);
const run = (partial: Partial<PatientQuery>, data: readonly DoctorPatient[] = DEMO_PATIENTS) =>
  queryPatients(data, { ...DEFAULT_QUERY, ...partial });

test('counts are computed from data', () => {
  assertEqual(countByStatus(DEMO_PATIENTS), {
    all: 8,
    'needs-review': 3,
    'follow-up-due': 2,
    'up-to-date': 3,
  });
  assertEqual(countByStatus([]), { all: 0, 'needs-review': 0, 'follow-up-due': 0, 'up-to-date': 0 });
});

test('default query returns all patients', () => {
  assertEqual(run({}).length, 8);
  assertTrue(!isFiltered(DEFAULT_QUERY), 'default query is not filtered');
});

test('search by name is case-insensitive', () => {
  // Substring match: "ana" is in "Ana Popescu" and "Ioana Stan".
  assertEqual(ids(run({ search: 'ana' })), ['MF-001', 'MF-003']);
  assertEqual(ids(run({ search: 'ANA POP' })), ['MF-001']);
  assertEqual(ids(run({ search: 'radu' }, DEMO_PATIENTS)).sort(), ['MF-005', 'MF-008']);
});

test('search by ID is case-insensitive', () => {
  assertEqual(ids(run({ search: 'mf-003' })), ['MF-003']);
  assertEqual(ids(run({ search: 'MF-00' })).length, 8);
});

test('search trims and collapses whitespace', () => {
  assertEqual(ids(run({ search: '   ioana   stan  ' })), ['MF-003']);
  assertEqual(run({ search: '    ' }).length, 8);
  assertTrue(!isFiltered({ ...DEFAULT_QUERY, search: '   ' }), 'whitespace-only search is not a filter');
});

test('status filter', () => {
  assertEqual(ids(run({ status: 'needs-review' })), ['MF-001', 'MF-002', 'MF-003']);
  assertEqual(ids(run({ status: 'follow-up-due' })), ['MF-004', 'MF-005']);
  assertEqual(ids(run({ status: 'up-to-date' })).sort(), ['MF-006', 'MF-007', 'MF-008']);
});

test('most recent activity sorts by timestamp, newest first', () => {
  assertEqual(ids(run({ sort: 'recent' })), [
    'MF-001', // Today, 09:42
    'MF-002', // Today, 08:15
    'MF-003', // Yesterday 16:20
    'MF-006', // Yesterday 10:05
    'MF-007', // 04 Nov 15:40
    'MF-004', // 04 Nov 11:00
    'MF-005', // 03 Nov
    'MF-008', // 02 Nov
  ]);
});

test('"Today, 08:15" is older than "Today, 09:42" (not label order)', () => {
  const oldest = ids(run({ sort: 'oldest' }));
  assertEqual(formatLastContact(DEMO_PATIENTS[1].lastContactAt, DEMO_NOW), 'Today, 08:15');
  assertEqual(formatLastContact(DEMO_PATIENTS[0].lastContactAt, DEMO_NOW), 'Today, 09:42');
  assertTrue(oldest.indexOf('MF-002') < oldest.indexOf('MF-001'), '08:15 before 09:42 in oldest-first');
});

test('"Yesterday" entries are ordered by timestamp and sit between today and older dates', () => {
  const recent = ids(run({ sort: 'recent' }));
  assertEqual(formatLastContact(DEMO_PATIENTS[2].lastContactAt, DEMO_NOW), 'Yesterday');
  assertEqual(formatLastContact(DEMO_PATIENTS[5].lastContactAt, DEMO_NOW), 'Yesterday');
  // A label sort would put "Yesterday" after "04 Nov 2026"/"Today"; timestamps must win.
  assertEqual(recent.slice(2, 4), ['MF-003', 'MF-006']);
  assertTrue(recent.indexOf('MF-006') < recent.indexOf('MF-007'), 'Yesterday before 04 Nov');
});

test('oldest activity is the exact reverse of most recent for distinct timestamps', () => {
  assertEqual(ids(run({ sort: 'oldest' })), ids(run({ sort: 'recent' })).reverse());
});

test('next follow-up sorts by date, soonest first', () => {
  assertEqual(ids(run({ sort: 'follow-up' })), [
    'MF-001', // today, contacted most recently
    'MF-004', // today
    'MF-005', // today
    'MF-002', // tomorrow
    'MF-003', // 09 Nov
    'MF-006', // 12 Nov
    'MF-007', // 14 Nov
    'MF-008', // 16 Nov
  ]);
});

test('ties are broken by ID and input order does not matter', () => {
  const twin = (id: string): DoctorPatient => ({
    ...DEMO_PATIENTS[0],
    id,
    name: `Test ${id}`,
  });
  const data = [twin('MF-103'), twin('MF-101'), twin('MF-102')];
  assertEqual(ids(run({ sort: 'recent' }, data)), ['MF-101', 'MF-102', 'MF-103']);
  assertEqual(ids(run({ sort: 'oldest' }, data)), ['MF-101', 'MF-102', 'MF-103']);
  assertEqual(ids(run({ sort: 'follow-up' }, data)), ['MF-101', 'MF-102', 'MF-103']);
  const shuffled = [...DEMO_PATIENTS].reverse();
  assertEqual(ids(run({ sort: 'recent' }, shuffled)), ids(run({ sort: 'recent' })));
});

test('input array is not mutated', () => {
  const before = ids(DEMO_PATIENTS);
  run({ sort: 'oldest' });
  assertEqual(ids(DEMO_PATIENTS), before);
});

test('combined search, status and sort', () => {
  assertEqual(ids(run({ search: 'mf-00', status: 'needs-review', sort: 'oldest' })), [
    'MF-003',
    'MF-002',
    'MF-001',
  ]);
  assertEqual(ids(run({ search: 'a', status: 'follow-up-due' })), ['MF-004', 'MF-005']);
  assertTrue(isFiltered({ ...DEFAULT_QUERY, status: 'up-to-date' }), 'status filter counts as filtered');
});

test('no results', () => {
  assertEqual(run({ search: 'zzz' }), []);
  assertEqual(run({ search: 'ana', status: 'up-to-date' }), []);
  assertEqual(run({}, []), []);
});

finish();
