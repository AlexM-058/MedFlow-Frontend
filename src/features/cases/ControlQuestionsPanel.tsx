import { useEffect, useState } from 'react';
import { caseApi, type ControlQuestions } from '../../lib/caseApi';

const ANSWER_TEXT = { yes_no: 'da / nu', number: 'număr', short_text: 'răspuns scurt' } as const;

/**
 * Doctor: asks the cloud AI for a short summary and control questions, built ONLY from an anonymized summary of
 * the patient's file (made on the local laptop). The panel shows exactly what left for the cloud, so nothing is
 * hidden from the doctor. The patient's local agent then asks these questions. The AI does not diagnose or prescribe.
 */
export function ControlQuestionsPanel({ caseId, token }: { caseId: string; token: string }) {
  const [data, setData] = useState<ControlQuestions | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    caseApi.getControlQuestions(token, caseId, controller.signal).then(
      (stored) => { if (!controller.signal.aborted) setData(stored); },
      () => { /* nothing stored yet or unavailable: the button still works */ },
    );
    return () => controller.abort();
  }, [token, caseId]);

  async function generate() {
    setBusy(true);
    setError(null);
    try { setData(await caseApi.generateControlQuestions(token, caseId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Întrebările nu au putut fi generate.'); }
    finally { setBusy(false); }
  }

  return (
    <section className="case-inbox__feedback" aria-label="Întrebări de control">
      <h4>Întrebări de control (AI cloud, date anonimizate)</h4>
      <p>Spre cloud pleacă doar un rezumat anonimizat al dosarului (interval de vârstă, afecțiuni, alergii, substanțe active). Nu pleacă mesaje, documente sau date de identificare.</p>
      <button type="button" className="ui-button ui-button--secondary" disabled={busy} onClick={() => void generate()}>
        {busy ? 'Se generează…' : data ? 'Generați din nou' : 'Generați întrebările de control'}
      </button>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p><strong>Rezumat:</strong> {data.summary}</p>
          <ol aria-label="Întrebări pentru pacient">
            {data.questions.map((question) => <li key={question.id}>{question.text} <small>({ANSWER_TEXT[question.answerType]})</small></li>)}
          </ol>
          <p>Pacientul le primește una câte una de la agentul local. Generat de {data.model}; nu reprezintă un diagnostic.</p>
          <details>
            <summary>Ce a plecat spre cloud</summary>
            <pre>{JSON.stringify(data.sentToCloud, null, 2)}</pre>
          </details>
        </>
      )}
    </section>
  );
}
