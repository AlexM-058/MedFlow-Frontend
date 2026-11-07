import { Fragment, useEffect, useId, useMemo, useState } from 'react';
import { caseApi, type CaseDocumentRecord } from '../../../lib/caseApi';
import { describeDocument, MISSING } from './documentView';

/**
 * Documents the patient uploaded for this case, with what the extractor read from each one.
 * Only the extracted data is kept (the original image is not stored), and a failed extraction is
 * stated, never hidden.
 */
export function DoctorPatientDocuments({ token, caseId }: { token: string; caseId: string }) {
  const titleId = useId();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ revision: number; documents?: CaseDocumentRecord[]; error?: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    caseApi.listDocuments(token, caseId, controller.signal).then(
      (documents) => { if (!controller.signal.aborted) setResult({ revision, documents }); },
      (failure: unknown) => {
        if (controller.signal.aborted) return;
        setResult((current) => ({ revision, documents: current?.documents, error: failure instanceof Error ? failure.message : 'Documentele nu au putut fi încărcate.' }));
      },
    );
    return () => controller.abort();
  }, [token, caseId, revision]);

  const loading = result === null || result.revision !== revision;
  const views = useMemo(() => (result?.documents ?? []).map(describeDocument), [result]);

  return (
    <section className="doctor-documents" aria-labelledby={titleId}>
      <header className="doctor-documents__head">
        <h3 id={titleId}>Documentele pacientului</h3>
        <button type="button" className="doctor-button doctor-button--secondary" onClick={() => setRevision((value) => value + 1)} disabled={loading} aria-busy={loading}>
          {loading ? 'Se încarcă…' : 'Reîmprospătați'}
        </button>
      </header>
      <p className="doctor-documents__note">Se păstrează doar datele extrase din document, nu fotografia originală. Verificați întotdeauna cu pacientul datele importante.</p>

      {result?.error && <p className="doctor-notice doctor-notice--error" role="alert">{result.error}</p>}
      {result === null ? <p role="status">Se încarcă documentele…</p> : views.length === 0 && !result.error ? <p>Pacientul nu a încărcat încă documente.</p> : (
        <ul className="doctor-documents__list">
          {views.map((view) => (
            <li key={view.id}>
              <details className="doctor-documents__item">
                <summary>
                  <span className="doctor-documents__title">{view.typeLabel}</span>
                  <span className={`doctor-documents__status doctor-documents__status--${view.status}`}>{view.statusLabel}</span>
                  <span className="doctor-documents__meta">{new Date(view.createdAt).toLocaleString('ro-RO')} · {view.sizeLabel}</span>
                </summary>
                {view.status === 'unavailable' && <p>Citirea automată a documentului nu a fost disponibilă. Documentul a fost primit, dar conținutul lui nu a putut fi extras.</p>}
                {view.status === 'empty' && <p>Din document nu s-au putut citi câmpuri.</p>}
                {view.reviewLabel && (
                  <p className={`doctor-documents__review doctor-documents__review--${view.review}`}>{view.reviewLabel}</p>
                )}
                {view.medications.length > 0 && (
                  <table className="doctor-documents__table">
                    <caption className="doctor-sr-only">{view.review === 'confirmed' ? 'Medicamente confirmate de pacient' : 'Medicamente extrase'}</caption>
                    <thead><tr><th scope="col">Medicament</th><th scope="col">Doză</th><th scope="col">Frecvență</th><th scope="col">Durată</th></tr></thead>
                    <tbody>{view.medications.map((medication, index) => (
                      <Fragment key={index}>
                        <tr>
                          <th scope="row">{medication.name}</th>
                          <td>{medication.dose}</td>
                          <td>{medication.frequency}</td>
                          <td>{medication.duration}</td>
                        </tr>
                        {medication.corrections && (
                          <tr className="doctor-documents__corrections">
                            <td colSpan={4}>
                              {medication.corrections.map((correction, position) => (
                                <p key={position}>Corectat de pacient, {correction.label}: cititorul a văzut „{correction.readerSaw}”, pacientul a confirmat „{correction.patientValue}”</p>
                              ))}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}</tbody>
                  </table>
                )}
                {view.dates.length > 0 && (
                  <ul className="doctor-documents__dates">{view.dates.map((entry, index) => <li key={index}><strong>{entry.label}:</strong> {entry.value}</li>)}</ul>
                )}
                {view.warnings.map((warning, index) => <p key={index} className="doctor-notice doctor-notice--error">{warning}</p>)}
                {view.status === 'extracted' && <p className="doctor-documents__note">Câmpurile marcate cu „{MISSING}” nu au fost citite din document.</p>}
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
