import { brand } from '../../../brand/brand.config';
import type { CareCase, IntakeMessage } from '../../care-scenario/contracts';
import {
  confirmationLabel,
  contextKindLabel,
  documentAnchorId,
  documentTypeLabel,
  formatDateTime,
  messageAnchorId,
  sourceLink,
} from './caseLogic';

interface Props {
  careCase: CareCase;
  highlightedId: string | null;
}

const NOT_EXTRACTED = 'Not extracted (unreadable or missing)';

function speaker(message: IntakeMessage, patientName: string): string {
  if (message.role === 'patient') return `${patientName} (patient)`;
  if (message.role === 'assistant') return `${brand.assistantName} (assistant, AI)`;
  return 'System notice (safety rule)';
}

function highlightClass(base: string, id: string, highlightedId: string | null): string {
  return id === highlightedId ? `${base} care-case-highlight` : base;
}

/** Originals: every message verbatim, documents, context and confirmed medications. */
export function CaseOriginals({ careCase, highlightedId }: Props) {
  const lookup = { messages: careCase.messages, documents: careCase.documents };

  return (
    <>
      <section className="care-case-card" aria-labelledby="care-case-conversation-title">
        <h3 id="care-case-conversation-title" className="care-case-card__title">
          Original conversation
        </h3>
        {careCase.messages.length === 0 ? (
          <p className="care-case-hint">No messages in this case.</p>
        ) : (
          <ol className="care-case-conversation">
            {careCase.messages.map((message) => {
              const anchor = messageAnchorId(message.id);
              return (
                <li
                  key={message.id}
                  id={anchor}
                  tabIndex={-1}
                  className={highlightClass(`care-case-message care-case-message--${message.role}`, anchor, highlightedId)}
                >
                  <p className="care-case-meta">
                    <strong>{speaker(message, careCase.patient.fullName)}</strong>, {formatDateTime(message.createdAt)}
                  </p>
                  <p className="care-case-verbatim">{message.text}</p>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="care-case-card" aria-labelledby="care-case-documents-title">
        <h3 id="care-case-documents-title" className="care-case-card__title">
          Documents
        </h3>
        {careCase.documents.length === 0 ? (
          <p className="care-case-hint">No documents in this case.</p>
        ) : (
          careCase.documents.map((document) => {
            const anchor = documentAnchorId(document.id);
            const quotes = Object.entries(document.sourceQuotes);
            return (
              <article
                key={document.id}
                id={anchor}
                tabIndex={-1}
                className={highlightClass('care-case-document', anchor, highlightedId)}
                aria-label={`Document: ${documentTypeLabel(document.documentType)}`}
              >
                <h4 className="care-case-subtitle">
                  Document: {documentTypeLabel(document.documentType)}
                </h4>
                <p className="care-case-meta">
                  {document.fileName}, extracted {formatDateTime(document.extractedAt)}
                </p>
                {document.medications.map((medication, index) => (
                  <dl key={index} className="care-case-fields">
                    <dt>Medication</dt>
                    <dd>{medication.name ?? NOT_EXTRACTED}</dd>
                    <dt>Dose</dt>
                    <dd>{medication.dose ?? NOT_EXTRACTED}</dd>
                    <dt>Frequency (as written)</dt>
                    <dd>{medication.frequency ?? NOT_EXTRACTED}</dd>
                    <dt>Duration</dt>
                    <dd>{medication.duration ?? NOT_EXTRACTED}</dd>
                  </dl>
                ))}
                {document.dates.length > 0 && (
                  <dl className="care-case-fields">
                    {document.dates.map((date, index) => (
                      <div key={index} className="care-case-fields__row">
                        <dt>{date.label ?? 'Date'}</dt>
                        <dd>{date.value ?? NOT_EXTRACTED}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {document.warnings.length > 0 && (
                  <div className="care-case-alert care-case-alert--warning">
                    <p>
                      <strong>Extraction warnings</strong>
                    </p>
                    <ul>
                      {document.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {quotes.length > 0 && (
                  <details className="care-case-details">
                    <summary>Source text per field</summary>
                    <dl className="care-case-fields">
                      {quotes.map(([path, quote]) => (
                        <div key={path} className="care-case-fields__row">
                          <dt>{path}</dt>
                          <dd className="care-case-verbatim">“{quote}”</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              </article>
            );
          })
        )}
      </section>

      <section className="care-case-card" aria-labelledby="care-case-context-title">
        <h3 id="care-case-context-title" className="care-case-card__title">
          Patient context
        </h3>
        {careCase.context.length === 0 ? (
          <p className="care-case-hint">No context items recorded.</p>
        ) : (
          <ul className="care-case-list">
            {careCase.context.map((item) => (
              <li key={item.id} className="care-case-list__item">
                <p>
                  <strong>{contextKindLabel(item.kind)}:</strong> <span className="care-case-verbatim">{item.text}</span>
                </p>
                <p className="care-case-meta">
                  <span className={`care-case-tag care-case-tag--${item.confirmation.status}`}>
                    {confirmationLabel(item.confirmation.status, item.confirmation.by, item.confirmation.at)}
                  </span>{' '}
                  Source: {sourceLink(item.source, lookup).label}
                </p>
                {item.note && <p className="care-case-note">{item.note}</p>}
              </li>
            ))}
          </ul>
        )}

        <h4 className="care-case-subtitle">Confirmed medications</h4>
        {careCase.medications.length === 0 ? (
          <p className="care-case-hint">No confirmed medications.</p>
        ) : (
          <ul className="care-case-list">
            {careCase.medications.map((medication) => (
              <li key={medication.id} className="care-case-list__item">
                <p>
                  <strong>{medication.name}</strong> {medication.doseText}
                </p>
                <dl className="care-case-fields">
                  <dt>Instruction (verbatim)</dt>
                  <dd className="care-case-verbatim">{medication.instructionOriginal}</dd>
                  <dt>Duration</dt>
                  <dd>{medication.durationText ?? 'No duration on the prescription'}</dd>
                  <dt>Confirmed by the patient</dt>
                  <dd>{formatDateTime(medication.confirmedAt)}</dd>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
