import { DoctorDialog } from '../shared/DoctorDialog';
import { formatFollowUp, formatLastContact } from '../format';
import type { DoctorPatient } from '../types';
import { StatusBadge } from './StatusBadge';

export interface PatientDetailsDialogProps {
  patient: DoctorPatient | null;
  now: Date;
  onClose: () => void;
  onSuggest: (patient: DoctorPatient) => void;
}

/** Local synthetic summary only. Nothing clinical, no diagnosis. */
export function PatientDetailsDialog({ patient, now, onClose, onSuggest }: PatientDetailsDialogProps) {
  return (
    <DoctorDialog
      open={patient !== null}
      title={patient?.name ?? 'Patient'}
      description="Synthetic demo summary, not a medical record."
      onClose={onClose}
      footer={
        patient && (
          <button
            type="button"
            className="doctor-button doctor-button--primary"
            onClick={() => onSuggest(patient)}
          >
            Give suggestions
          </button>
        )
      }
    >
      {patient && (
        <div className="doctor-workspace-summary">
          <p>
            <span className="doctor-demo-tag">Demo data</span>
          </p>
          <dl className="doctor-workspace-details">
            <div>
              <dt>Patient ID</dt>
              <dd>{patient.id}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge status={patient.status} />
              </dd>
            </div>
            <div>
              <dt>Last contact</dt>
              <dd>
                <time dateTime={patient.lastContactAt}>
                  {formatLastContact(patient.lastContactAt, now)}
                </time>
              </dd>
            </div>
            <div>
              <dt>Next follow-up</dt>
              <dd>
                <time dateTime={patient.nextFollowUpOn}>
                  {formatFollowUp(patient.nextFollowUpOn, now)}
                </time>
              </dd>
            </div>
          </dl>
          <section aria-labelledby="doctor-workspace-summary-heading">
            <h3 id="doctor-workspace-summary-heading" className="doctor-workspace-summary__heading">
              Summary
            </h3>
            <p>{patient.summary}</p>
          </section>
        </div>
      )}
    </DoctorDialog>
  );
}
