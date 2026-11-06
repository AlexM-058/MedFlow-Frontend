import type { PatientStatus } from '../types';
import { STATUS_LABELS } from './patientQuery';

/** Status is conveyed by text; color only reinforces it. */
export function StatusBadge({ status }: { status: PatientStatus }) {
  return <span className={`doctor-status doctor-status--${status}`}>{STATUS_LABELS[status]}</span>;
}
