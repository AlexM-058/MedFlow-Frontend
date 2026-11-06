// Synthetic demo data only. Names and IDs are fictional; no clinical content.
import type { DoctorPatient, DoctorProfile } from './types.ts';

/** Fixed demo clock so relative labels ("Today", "Yesterday") are deterministic. */
export const DEMO_NOW = new Date('2026-11-06T12:00:00+02:00');

/** All demo dates are displayed in this zone, independent of the device zone. */
export const DEMO_TIME_ZONE = 'Europe/Bucharest';

export const DEMO_DOCTOR: DoctorProfile = {
  fullName: 'Dr. Elena Marin',
  specialty: 'Medicină de familie',
  email: 'elena.marin@clinic.example',
};

export const DEMO_PATIENTS: readonly DoctorPatient[] = [
  {
    id: 'MF-001',
    name: 'Ana Popescu',
    status: 'needs-review',
    lastContactAt: '2026-11-06T09:42:00+02:00',
    nextFollowUpOn: '2026-11-06',
    summary: 'A transmis o actualizare înainte de vizită prin chatul pacientului. Preferă programările dimineața.',
  },
  {
    id: 'MF-002',
    name: 'Mihai Ionescu',
    status: 'needs-review',
    lastContactAt: '2026-11-06T08:15:00+02:00',
    nextFollowUpOn: '2026-11-07',
    summary: 'A cerut reprogramarea următoarei vizite. De contactat telefonic după ora 16:00.',
  },
  {
    id: 'MF-003',
    name: 'Ioana Stan',
    status: 'needs-review',
    lastContactAt: '2026-11-05T16:20:00+02:00',
    nextFollowUpOn: '2026-11-09',
    summary: 'A încărcat întrebări pentru următoarea programare în chatul demo.',
  },
  {
    id: 'MF-004',
    name: 'Andrei Dima',
    status: 'follow-up-due',
    lastContactAt: '2026-11-04T11:00:00+02:00',
    nextFollowUpOn: '2026-11-06',
    summary: 'Apel de urmărire programat pentru astăzi. Niciun mesaj nou de la ultimul contact.',
  },
  {
    id: 'MF-005',
    name: 'Maria Radu',
    status: 'follow-up-due',
    lastContactAt: '2026-11-03T14:30:00+02:00',
    nextFollowUpOn: '2026-11-06',
    summary: 'Urmărire scadentă astăzi. Preferă mesajele după-amiaza.',
  },
  {
    id: 'MF-006',
    name: 'Vlad Dumitru',
    status: 'up-to-date',
    lastContactAt: '2026-11-05T10:05:00+02:00',
    nextFollowUpOn: '2026-11-12',
    summary: 'La zi. Următoarea verificare de rutină este planificată săptămâna viitoare.',
  },
  {
    id: 'MF-007',
    name: 'Elena Pavel',
    status: 'up-to-date',
    lastContactAt: '2026-11-04T15:40:00+02:00',
    nextFollowUpOn: '2026-11-14',
    summary: 'La zi. A confirmat datele de contact la ultima vizită.',
  },
  {
    id: 'MF-008',
    name: 'Radu Matei',
    status: 'up-to-date',
    lastContactAt: '2026-11-02T09:10:00+02:00',
    nextFollowUpOn: '2026-11-16',
    summary: 'La zi. A cerut mementouri prin e-mail.',
  },
];
