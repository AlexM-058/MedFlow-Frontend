import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/authContext';
import type { AccountProfile } from '../../auth/contracts';
import { formatDateTime, statusLabel } from '../patient-context/contextLogic';
import { caseApi, type CaseDecision, type CaseMessageRecord, type LocalCaseSummary } from '../../lib/caseApi';
import { ControlQuestionsPanel } from './ControlQuestionsPanel';
import './cases.css';

function errorText(error: unknown) { return error instanceof Error ? error.message : 'Datele nu au putut fi încărcate.'; }
export type Drafts = { message: string; feedback: string };
function useLoad<T>(load: (signal: AbortSignal) => Promise<T>, revision: number) {
  const [result, setResult] = useState<{ load: typeof load; revision: number; data?: T; error?: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setResult({ load, revision, data }); },
      (error: unknown) => { if (!controller.signal.aborted) setResult({ load, revision, error: errorText(error) }); },
    );
    return () => controller.abort();
  }, [load, revision]);
  return result?.load === load && result.revision === revision ? result : null;
}

/** Real account data only. No AI calls and no synthetic fallback. */
export function CaseInbox() {
  const { session, profile } = useAuth();
  if (!session || !profile) return null;
  return <CaseInboxForUser key={profile.id} token={session.access_token} profile={profile} />;
}

function CaseInboxForUser({ token, profile }: { token: string; profile: AccountProfile }) {
  const doctorFieldId = useId();
  const [revision, setRevision] = useState(0);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Drafts>>({});
  const [doctorId, setDoctorId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = useCallback((signal: AbortSignal) => caseApi.listCases(token, offset, signal), [token, offset]);
  const result = useLoad(load, revision);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (pending.current || !doctorId) return;
    pending.current = true; setCreating(true); setError(null);
    try {
      const created = await caseApi.createCase(token, doctorId);
      if (!alive.current) return;
      setSelected(created.id); setOffset(0); setRevision((value) => value + 1);
    } catch (reason) { if (alive.current) setError(`${errorText(reason)} Dacă răspunsul s-a pierdut, reîmprospătați dosarele înainte de a crea altul.`); }
    finally { pending.current = false; if (alive.current) setCreating(false); }
  }

  return (
    <section className="case-inbox" aria-label="Dosare și mesaje persistente">
      <header className="case-inbox__heading"><h2>Dosare și mesaje</h2><span>Date din contul dumneavoastră</span></header>
      <p>Mesajele și răspunsurile medicului se salvează în baza de date. Asistentul AI nu este activ în această secțiune. Folosiți numai date medicale sintetice pentru testare.</p>
      {profile.role === 'patient' && (
        <form className="case-inbox__actions" onSubmit={(event) => void create(event)}>
          <div><label htmlFor={doctorFieldId}>Medicul pentru noul dosar</label>
            <select id={doctorFieldId} value={doctorId} onChange={(event) => setDoctorId(event.target.value)} disabled={creating}>
              <option value="">Alegeți medicul</option>
              {profile.activeDoctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.fullName} · {doctor.specialty}</option>)}
            </select>
          </div>
          <button className="ui-button ui-button--primary" disabled={creating || !doctorId}>{creating ? 'Se creează…' : 'Deschideți un dosar nou'}</button>
          {profile.activeDoctors.length === 0 && <p>Conectați-vă mai întâi la un medic și așteptați acceptarea.</p>}
        </form>
      )}
      <button type="button" className="ui-button ui-button--secondary" disabled={!result} onClick={() => setRevision((value) => value + 1)}>Reîmprospătați dosarele</button>
      {error && <p role="alert">{error}</p>}
      {!result ? <p role="status">Se încarcă dosarele…</p> : result.error ? <p role="alert">{result.error} Verificați configurarea backendului și conexiunea la baza de date.</p> : (
        <>
          {result.data?.length === 0 && <p>Nu există dosare pe această pagină.</p>}
          <ul className="case-inbox__list">{result.data?.map((item) => <li key={item.id}>
            <button type="button" className="ui-button ui-button--secondary" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>
              Dosar {item.id.slice(0, 8)} · {new Date(item.createdAt).toLocaleDateString('ro-RO')}
            </button>
          </li>)}</ul>
          <div className="case-inbox__actions">
            <button type="button" className="ui-button ui-button--secondary" disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - 50))}>Pagina anterioară</button>
            <button type="button" className="ui-button ui-button--secondary" disabled={result.data?.length !== 50} onClick={() => setOffset((value) => value + 50)}>Pagina următoare</button>
          </div>
        </>
      )}
      {selected && <CaseConversation key={selected} caseId={selected} token={token} profile={profile}
        drafts={drafts[selected] ?? { message: '', feedback: '' }}
        changeDraft={(kind, text) => setDrafts((current) => ({ ...current, [selected]: { ...(current[selected] ?? { message: '', feedback: '' }), [kind]: text } }))} />}
    </section>
  );
}

export function CaseConversation({ caseId, token, profile, drafts, changeDraft }: { caseId: string; token: string; profile: AccountProfile; drafts: Drafts; changeDraft: (kind: keyof Drafts, text: string) => void }) {
  const messageFieldId = useId();
  const feedbackFieldId = useId();
  const [revision, setRevision] = useState(0);
  const draft = drafts.message;
  const feedbackDraft = drafts.feedback;
  const [sending, setSending] = useState<'message' | 'feedback' | 'question' | 'summary' | null>(null);
  const [summary, setSummary] = useState<LocalCaseSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = useCallback(async (signal: AbortSignal) => {
    const [messages, decision, context] = await Promise.all([
      caseApi.listMessages(token, caseId, offset, signal), caseApi.getDecision(token, caseId, signal),
      profile.role === 'doctor' ? caseApi.loadCaseContext(token, caseId, signal) : Promise.resolve([]),
    ]);
    return { messages, decision, context };
  }, [token, caseId, offset, profile.role]);
  const result = useLoad(load, revision);

  async function askLocalQuestion() {
    if (pending.current) return;
    pending.current = true; setSending('question'); setError(null); setNotice(null);
    try {
      const answer = await caseApi.askLocalQuestion(token, caseId);
      if (!alive.current) return;
      setNotice(answer.notice ?? 'Întrebarea agentului local a fost salvată.');
      setRevision((value) => value + 1);
    } catch (reason) { if (alive.current) setError(`${errorText(reason)} Mesajele deja salvate nu se pierd.`); }
    finally { pending.current = false; if (alive.current) setSending(null); }
  }

  async function summarize() {
    if (pending.current) return;
    pending.current = true; setSending('summary'); setError(null); setNotice(null);
    try {
      const generated = await caseApi.summarizeLocally(token, caseId);
      if (alive.current) setSummary(generated);
    } catch (reason) { if (alive.current) setError(errorText(reason)); }
    finally { pending.current = false; if (alive.current) setSending(null); }
  }

  async function send(kind: 'message' | 'feedback', event: FormEvent) {
    event.preventDefault();
    const text = (kind === 'message' ? draft : feedbackDraft).trim();
    if (pending.current || !text) return;
    pending.current = true; setSending(kind); setError(null); setNotice(null);
    try {
      if (kind === 'message') await caseApi.postMessage(token, caseId, text);
      else await caseApi.sendDecision(token, caseId, text);
      if (!alive.current) return;
      changeDraft(kind, '');
      setRevision((value) => value + 1); setNotice('Salvat în baza de date.');
    } catch (reason) {
      if (alive.current) setError(`${errorText(reason)} Textul a fost păstrat. Reîmprospătați mesajele înainte de a retrimite: dacă răspunsul s-a pierdut, operațiunea poate fi deja salvată.`);
    } finally { pending.current = false; if (alive.current) setSending(null); }
  }

  return (
    <section className="case-inbox__conversation" aria-label={`Dosar ${caseId.slice(0, 8)}`}>
      <h3>Conversația dosarului {caseId.slice(0, 8)}</h3>
      <button type="button" className="ui-button ui-button--secondary" disabled={!result || !!sending} onClick={() => setRevision((value) => value + 1)}>Reîmprospătați mesajele și feedback-ul</button>
      {!result ? <p role="status">Se încarcă conversația…</p> : result.error ? <p role="alert">{result.error}</p> : (
        <>
          <ol className="case-inbox__messages">{result.data?.messages.map((message: CaseMessageRecord) => <li key={message.id}>
            <strong>{message.senderRole === 'doctor' ? 'Medic' : message.senderRole === 'patient' ? 'Pacient' : message.senderRole === 'ai' ? 'Asistent AI' : 'Sistem'}</strong>
            <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('ro-RO')}</time>
            <p>{message.content}</p>
          </li>)}</ol>
          {result.data?.messages.length === 0 && <p>Nu există mesaje pe această pagină.</p>}
          <div className="case-inbox__actions">
            <button type="button" className="ui-button ui-button--secondary" disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - 100))}>Mesajele anterioare</button>
            <button type="button" className="ui-button ui-button--secondary" disabled={result.data?.messages.length !== 100} onClick={() => setOffset((value) => value + 100)}>Mesajele următoare</button>
          </div>
          <Feedback decision={result.data?.decision ?? null} />
          {profile.role === 'doctor' && <section className="case-inbox__feedback">
            <h4>Context declarat de pacient</h4>
            <p>Confirmarea de către pacient nu este verificare medicală.</p>
            {result.data?.context.length === 0 ? <p>Nu există informații declarate în această secțiune.</p> : <ul>{result.data?.context.map((item) => <li key={item.id}>
              <strong>{item.kind === 'allergy' ? 'Alergie' : item.kind === 'condition' ? 'Afecțiune' : 'Medicament declarat'}</strong>: {item.text}
              <p>{statusLabel(item.confirmation.status)} · Declarat de pacient
                {item.source.kind === 'patient-input' && ` la ${formatDateTime(item.source.at)}`}
                {item.confirmation.at && ` · ${item.confirmation.status === 'confirmed' ? 'Confirmat' : 'Marcat necunoscut'} de pacient la ${formatDateTime(item.confirmation.at)}`}
              </p>
            </li>)}</ul>}
          </section>}
        </>
      )}
      <form className="case-inbox__form" onSubmit={(event) => void send('message', event)}>
        <label htmlFor={messageFieldId}>Mesaj pentru {profile.role === 'patient' ? 'medic' : 'pacient'}</label>
        <textarea id={messageFieldId} value={draft} onChange={(event) => changeDraft('message', event.target.value)} maxLength={5000} required readOnly={!!sending} />
        <button className="ui-button ui-button--primary" disabled={!!sending || !draft.trim() || !result || !!result.error}>{sending === 'message' ? 'Se salvează…' : 'Trimiteți mesajul'}</button>
      </form>
      {profile.role === 'patient' && <div>
        <button type="button" className="ui-button ui-button--secondary" disabled={!!sending || !result || !!result.error}
          onClick={() => void askLocalQuestion()}>{sending === 'question' ? 'Se așteaptă agentul local…' : 'Cereți o întrebare de clarificare (AI local)'}</button>
        <p>Salvați mai întâi mesajul. AI-ul local colectează informații pentru medic; nu diagnostichează și nu prescrie.</p>
      </div>}
      {profile.role === 'doctor' && <form className="case-inbox__form" onSubmit={(event) => void send('feedback', event)}>
        <label htmlFor={feedbackFieldId}>Feedback-ul dumneavoastră pentru pacient</label>
        <textarea id={feedbackFieldId} value={feedbackDraft} onChange={(event) => changeDraft('feedback', event.target.value)} maxLength={10000} required readOnly={!!sending} />
        <button className="ui-button ui-button--primary" disabled={!!sending || !feedbackDraft.trim() || !result || !!result.error}>{sending === 'feedback' ? 'Se salvează…' : 'Trimiteți feedback-ul ca medic'}</button>
      </form>}
      {profile.role === 'doctor' && <ControlQuestionsPanel caseId={caseId} token={token} />}
      {profile.role === 'doctor' && <section className="case-inbox__feedback" aria-label="Rezumat local cu surse">
        <h4>Organizarea mesajelor pentru medic</h4>
        <button type="button" className="ui-button ui-button--secondary" disabled={!!sending || !result || !!result.error}
          onClick={() => void summarize()}>{sending === 'summary' ? 'Se generează local…' : 'Generați rezumatul cu citate (AI local)'}</button>
        {summary && <>
          <p>Generat de AI local din mesajele pacientului. Verificați citatele și originalele; nu reprezintă un diagnostic. Fotografie a conversației la momentul generării.</p>
          <ul>{summary.items.map((item, index) => <li key={`${item.messageId}-${index}`}>
            <blockquote>{item.text}</blockquote>
            <details><summary>Mesajul sursă</summary><p>{summary.originals.find((original) => original.id === item.messageId)?.text}</p></details>
          </li>)}</ul>
          <p>{summary.uncoveredMessageIds.length} mesaje fără citat în această organizare. Citatele nu garantează păstrarea tuturor detaliilor.</p>
          <details><summary>Toate mesajele originale folosite</summary>{summary.originals.map((original) => <p key={original.id}>{original.text}</p>)}</details>
        </>}
      </section>}
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    </section>
  );
}

function Feedback({ decision }: { decision: CaseDecision | null }) {
  return <section className="case-inbox__feedback"><h4>Ultimul feedback al medicului</h4>
    {decision ? <><p>Medic · {new Date(decision.createdAt).toLocaleString('ro-RO')}</p><blockquote>{decision.text}</blockquote></> : <p>Medicul nu a trimis încă feedback.</p>}
  </section>;
}
