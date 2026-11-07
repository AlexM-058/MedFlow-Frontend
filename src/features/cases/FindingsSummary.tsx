import { useEffect, useMemo, useState } from 'react';
import { caseApi, type CaseDocumentRecord } from '../../lib/caseApi';
import { countFindings, mergeFindings, readFindings } from './findings';
import './findings.css';

/**
 * Everything the reader found besides the medicines (those have their own list to confirm): diagnoses, lab results,
 * allergies and other medical information, from all the sheets together, each once. Read-only: it is read automatically
 * and the doctor checks it. Nothing here is sent to the cloud AI. Hidden when there is nothing to show.
 */
export function FindingsSummary({ caseId, token, refreshKey }: { caseId: string; token: string; refreshKey: number }) {
  const [documents, setDocuments] = useState<CaseDocumentRecord[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    caseApi.listDocuments(token, caseId, controller.signal).then(
      (list) => { if (!controller.signal.aborted) setDocuments(list); },
      () => { /* a convenience view: the upload itself does not depend on it */ },
    );
    return () => controller.abort();
  }, [token, caseId, refreshKey]);

  const merged = useMemo(() => mergeFindings(documents.map((document) => readFindings(document.extractedData))), [documents]);
  if (countFindings(merged) - merged.medications === 0) return null;

  return (
    <section className="findings" aria-label="Alte date găsite în documente">
      <h3>Alte date găsite în documente</h3>
      <p className="step__hint">Citite automat; medicul le verifică. Nu sunt trimise nicăieri.</p>
      {merged.diagnoses.length > 0 && (
        <details>
          <summary>Diagnostice ({merged.diagnoses.length})</summary>
          <ul>{merged.diagnoses.map((diagnosis) => <li key={diagnosis}>{diagnosis}</li>)}</ul>
        </details>
      )}
      {merged.labs.length > 0 && (
        <details>
          <summary>Analize ({merged.labs.length})</summary>
          <ul>
            {merged.labs.map((lab) => (
              <li key={`${lab.test}|${lab.value}|${lab.unit}`}>
                <strong>{lab.test}</strong>{' '}{[lab.value, lab.unit].filter(Boolean).join(' ')}
                {lab.range && <small> (referință {lab.range})</small>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {merged.allergies.length > 0 && (
        <details>
          <summary>Alergii ({merged.allergies.length})</summary>
          <ul>{merged.allergies.map((allergy) => <li key={allergy}>{allergy}</li>)}</ul>
        </details>
      )}
      {merged.observations.length > 0 && (
        <details>
          <summary>Observații ({merged.observations.length})</summary>
          <ul>{merged.observations.map((item) => <li key={`${item.label}|${item.value}`}><strong>{item.label}:</strong> {item.value}</li>)}</ul>
        </details>
      )}
    </section>
  );
}
