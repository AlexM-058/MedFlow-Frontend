// Synthetic demo data only. Names and IDs are fictional; no clinical content.
import type { DoctorPatient, DoctorProfile } from './types.ts';

/** Fixed demo clock so relative labels ("Today", "Yesterday") are deterministic. */
export const DEMO_NOW = new Date('2026-11-06T12:00:00+02:00');

/** All demo dates are displayed in this zone, independent of the device zone. */
export const DEMO_TIME_ZONE = 'Europe/Bucharest';

export const DEMO_DOCTOR: DoctorProfile = {
  fullName: 'Dr. Elena Marin',
  specialty: 'Family medicine',
  email: 'elena.marin@clinic.example',
};

export const DEMO_PATIENTS: readonly DoctorPatient[] = [
  {
    id: 'MF-001',
    name: 'Ana Popescu',
    status: 'needs-review',
    lastContactAt: '2026-11-06T09:42:00+02:00',
    nextFollowUpOn: '2026-11-06',
    summary: 'Shared a pre-visit update through the patient chat. Prefers morning appointments.',
  },
  {
    id: 'MF-002',
    name: 'Mihai Ionescu',
    status: 'needs-review',
    lastContactAt: '2026-11-06T08:15:00+02:00',
    nextFollowUpOn: '2026-11-07',
    summary: 'Asked to reschedule the next visit. Contact by phone after 16:00.',
  },
  {
    id: 'MF-003',
    name: 'Ioana Stan',
    status: 'needs-review',
    lastContactAt: '2026-11-05T16:20:00+02:00',
    nextFollowUpOn: '2026-11-09',
    summary: 'Uploaded questions for the next appointment in the demo chat.',
  },
  {
    id: 'MF-004',
    name: 'Andrei Dima',
    status: 'follow-up-due',
    lastContactAt: '2026-11-04T11:00:00+02:00',
    nextFollowUpOn: '2026-11-06',
    summary: 'Follow-up call scheduled for today. No new messages since last contact.',
  },
  {
    id: 'MF-005',
    name: 'Maria Radu',
    status: 'follow-up-due',
    lastContactAt: '2026-11-03T14:30:00+02:00',
    nextFollowUpOn: '2026-11-06',
    summary: 'Follow-up due today. Prefers messages in the afternoon.',
  },
  {
    id: 'MF-006',
    name: 'Vlad Dumitru',
    status: 'up-to-date',
    lastContactAt: '2026-11-05T10:05:00+02:00',
    nextFollowUpOn: '2026-11-12',
    summary: 'Up to date. Next routine check-in planned for next week.',
  },
  {
    id: 'MF-007',
    name: 'Elena Pavel',
    status: 'up-to-date',
    lastContactAt: '2026-11-04T15:40:00+02:00',
    nextFollowUpOn: '2026-11-14',
    summary: 'Up to date. Confirmed contact details at the last visit.',
  },
  {
    id: 'MF-008',
    name: 'Radu Matei',
    status: 'up-to-date',
    lastContactAt: '2026-11-02T09:10:00+02:00',
    nextFollowUpOn: '2026-11-16',
    summary: 'Up to date. Requested reminders by e-mail.',
  },
];
