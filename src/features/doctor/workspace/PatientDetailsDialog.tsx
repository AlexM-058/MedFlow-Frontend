import { brand } from '../../../brand/brand.config';
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
  const ai = patient?.aiSummary;

  return (
    <DoctorDialog
      open={patient !== null}
      title={patient?.name ?? 'Pacient'}
      description={ai ? 'Sumar pre-consultație procesat de AI pentru evaluarea medicului.' : 'Fișă sintetică pacient.'}
      onClose={onClose}
      wide={ai !== undefined}
      footer={
        patient && (
          <button
            type="button"
            className="doctor-button doctor-button--primary"
            onClick={() => onSuggest(patient)}
          >
            {ai ? 'Răspunde pacientului (Sugestii)' : 'Oferiți sugestii'}
          </button>
        )
      }
    >
      {patient && (
        <div className="doctor-workspace-summary">
          <p className="doctor-workspace-dialog-top">
            <span className="doctor-demo-tag">Date sintetice</span>
            {ai && <span className="doctor-ai-pill">Sumar {brand.assistantName}</span>}
          </p>

          <dl className="doctor-workspace-details">
            <div>
              <dt>ID Pacient</dt>
              <dd>{patient.id}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge status={patient.status} />
              </dd>
            </div>
            <div>
              <dt>Ultimul contact</dt>
              <dd>
                <time dateTime={patient.lastContactAt}>
                  {formatLastContact(patient.lastContactAt, now)}
                </time>
              </dd>
            </div>
            <div>
              <dt>Următorul follow-up</dt>
              <dd>
                <time dateTime={patient.nextFollowUpOn}>
                  {formatFollowUp(patient.nextFollowUpOn, now)}
                </time>
              </dd>
            </div>
          </dl>

          {ai ? (
            <div className="doctor-ai-case-card">
              <div className="doctor-ai-case-header">
                <div>
                  <p className="doctor-eyebrow">Raport asistent AI</p>
                  <h3 className="doctor-ai-case-title">{ai.headline}</h3>
                </div>
                {ai.sourceDocument && (
                  <span className="doctor-ai-doc-badge" title="Document sursă analizat">
                    📄 {ai.sourceDocument}
                  </span>
                )}
              </div>

              {ai.flaggedAlert && (
                <div className="doctor-notice doctor-notice--error doctor-ai-alert" role="alert">
                  <strong>Alertă de siguranță:</strong> {ai.flaggedAlert}
                </div>
              )}

              <div className="doctor-ai-section">
                <h4 className="doctor-ai-section-title">Sinteză clinică preliminară</h4>
                <p className="doctor-ai-notes">{ai.clinicalNotes}</p>
              </div>

              <div className="doctor-ai-grid">
                {ai.symptoms.length > 0 && (
                  <div className="doctor-ai-fact-box">
                    <h5 className="doctor-ai-fact-heading">Simptome raportate</h5>
                    <ul className="doctor-ai-tags-list">
                      {ai.symptoms.map((symptom) => (
                        <li key={symptom} className="doctor-ai-tag">
                          {symptom}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {ai.allergies && ai.allergies.length > 0 && (
                  <div className="doctor-ai-fact-box">
                    <h5 className="doctor-ai-fact-heading">Alergii în dosar</h5>
                    <ul className="doctor-ai-tags-list">
                      {ai.allergies.map((allergy) => (
                        <li key={allergy} className="doctor-ai-tag doctor-ai-tag--warning">
                          ⚠️ {allergy}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {ai.medications && ai.medications.length > 0 && (
                  <div className="doctor-ai-fact-box">
                    <h5 className="doctor-ai-fact-heading">Medicație curentă / menționată</h5>
                    <ul className="doctor-ai-tags-list">
                      {ai.medications.map((med) => (
                        <li key={med} className="doctor-ai-tag">
                          💊 {med}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <p className="doctor-ai-disclaimer">
                ℹ️ <em>Sumarul este generat automat din datele transmise de pacient. Decizia clinică și recomandările aparțin exclusiv medicului (conform regulilor de siguranță {brand.productName}).</em>
              </p>
            </div>
          ) : (
            <section aria-labelledby="doctor-workspace-summary-heading">
              <h3 id="doctor-workspace-summary-heading" className="doctor-workspace-summary__heading">
                Rezumat
              </h3>
              <p>{patient.summary}</p>
            </section>
          )}

          {patient.medicalRecord && (
            <div className="doctor-patient-record-section">
              <h4 className="doctor-patient-record-title">
                📁 Fișă medicală & Documente pacient ({patient.medicalRecord.documents.length})
              </h4>

              {patient.medicalRecord.chronicConditions && patient.medicalRecord.chronicConditions.length > 0 && (
                <div className="doctor-patient-record-conditions">
                  <span className="doctor-patient-record-cond-label">Boli cronice / Antecedente:</span>{' '}
                  {patient.medicalRecord.chronicConditions.join(', ')}
                </div>
              )}

              <div className="doctor-patient-docs-list">
                {patient.medicalRecord.documents.map((doc) => (
                  <div key={doc.id} className="doctor-patient-doc-item">
                    <div className="doctor-patient-doc-main">
                      <div className="doctor-patient-doc-header">
                        <span className="doctor-patient-doc-icon" aria-hidden="true">
                          {doc.type === 'prescription' ? '💊' : doc.type === 'lab_result' ? '🔬' : '📋'}
                        </span>
                        <strong className="doctor-patient-doc-title">{doc.title}</strong>
                        {doc.fileFormat && (
                          <span className="doctor-patient-doc-format">{doc.fileFormat}</span>
                        )}
                      </div>
                      <p className="doctor-patient-doc-summary">{doc.summary}</p>
                      <div className="doctor-patient-doc-meta">
                        <span>Emis: {doc.date}</span>
                        <span aria-hidden="true" className="doctor-workspace-dot">·</span>
                        <span>Sursă: {doc.source}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </DoctorDialog>
  );
}
