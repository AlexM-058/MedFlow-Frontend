import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Modal } from '../../../components/Modal';
import { caseApi, type CaseDecision, type CaseMessageRecord, type LocalCaseSummary } from '../../../lib/caseApi';
import type { ContextItem } from '../../care-scenario/contracts';
import type { Drafts } from '../../cases/CaseInbox';
import { ControlQuestionsPanel } from '../../cases/ControlQuestionsPanel';
import { formatDateTime, statusLabel } from '../../patient-context/contextLogic';
import { pairAnswers } from './answersSummary';
import { DoctorPatientDocuments } from './DoctorPatientDocuments';
import './dossier.css';

type Section = 'chat' | 'documents' | 'summary' | 'context' | 'feedback';

const SENDER: Record<string, string> = { doctor: 'Medic', patient: 'Pacient', ai: 'Asistent AI', system: 'Sistem' };
const REFRESH_MS = 20_000;
const errorText = (error: unknown) => (error instanceof Error ? error.message : 'Datele nu au putut fi încărcate.');

interface Overview {
  messages: CaseMessageRecord[] | null;
  documents: number | null;
  context: number | null;
  decision: CaseDecision | null | undefined;
}

/** What each button shows (counts, "new"). Every piece loads on its own: one failing does not hide the others. */
function useOverview(token: string, caseId: string, revision: number): Overview {
  const [overview, setOverview] = useState<Overview>({ messages: null, documents: null, context: null, decision: undefined });
  useEffect(() => {
    const controller = new AbortController();
    const done = (patch: Partial<Overview>) => { if (!controller.signal.aborted) setOverview((current) => ({ ...current, ...patch })); };
    caseApi.listMessages(token, caseId, 0, controller.signal).then((messages) => done({ messages }), () => {});
    caseApi.listDocuments(token, caseId, controller.signal).then((documents) => done({ documents: documents.length }), () => {});
    caseApi.loadCaseContext(token, caseId, controller.signal).then((context) => done({ context: context.length }), () => {});
    caseApi.getDecision(token, caseId, controller.signal).then((decision) => done({ decision }), () => {});
    return () => controller.abort();
  }, [token, caseId, revision]);
  return overview;
}

/**
 * The doctor's page for ONE patient: a panel of big buttons, no scrolling. Each button opens a window with its own
 * content (the conversation, the medical documents, the AI summaries, what the patient declared, the feedback).
 * Nothing here changes what is saved or sent: it reuses the same calls as before.
 */
export function PatientDossier({ token, caseId, drafts, changeDraft }: {
  token: string;
  caseId: string;
  drafts: Drafts;
  changeDraft: (kind: keyof Drafts, text: string) => void;
}) {
  const [open, setOpen] = useState<Section | null>(null);
  const [revision, setRevision] = useState(0);
  const overview = useOverview(token, caseId, revision);

  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden && open === null) setRevision((value) => value + 1); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [open]);

  const close = () => { setOpen(null); setRevision((value) => value + 1); };
  const count = (value: number | null, one: string, many: string) => (value === null ? '…' : `${value} ${value === 1 ? one : many}`);
  const last = overview.messages?.at(-1);
  const waiting = last?.senderRole === 'patient';

  const tiles: { key: Section; title: string; detail: string; badge?: string }[] = [
    { key: 'chat', title: 'Conversație', detail: count(overview.messages?.length ?? null, 'mesaj', 'mesaje'), ...(waiting ? { badge: 'Răspuns așteptat' } : {}) },
    { key: 'documents', title: 'Documente medicale', detail: count(overview.documents, 'foaie', 'foi') },
    { key: 'summary', title: 'Rezumat AI', detail: 'Rezumate și întrebări' },
    { key: 'context', title: 'Context declarat', detail: count(overview.context, 'element', 'elemente') },
    { key: 'feedback', title: 'Feedback', detail: overview.decision === undefined ? '…' : overview.decision ? 'Trimis' : 'Netrimis' },
  ];

  return (
    <>
      <div className="dossier__tiles" role="group" aria-label="Dosarul pacientului">
        {tiles.map((tile) => (
          <button key={tile.key} type="button" className="dossier__tile" onClick={() => setOpen(tile.key)}>
            <span className="dossier__tile-title">{tile.title}</span>
            <span className="dossier__tile-detail">{tile.detail}</span>
            {tile.badge && <span className="dossier__badge">{tile.badge}</span>}
          </button>
        ))}
      </div>

      <Modal open={open === 'chat'} title="Conversație" onClose={close}>
        <Chat token={token} caseId={caseId} drafts={drafts} changeDraft={changeDraft} />
      </Modal>
      <Modal open={open === 'documents'} title="Documente medicale" onClose={close}>
        <DoctorPatientDocuments token={token} caseId={caseId} />
      </Modal>
      <Modal open={open === 'summary'} title="Rezumat AI" onClose={close}>
        <Summary token={token} caseId={caseId} />
      </Modal>
      <Modal open={open === 'context'} title="Context declarat de pacient" onClose={close}>
        <Context token={token} caseId={caseId} />
      </Modal>
      <Modal open={open === 'feedback'} title="Feedback pentru pacient" onClose={close}>
        <Feedback token={token} caseId={caseId} draft={drafts.feedback} changeDraft={(text) => changeDraft('feedback', text)} />
      </Modal>
    </>
  );
}

/** Loads once on open, then every 20 s while the window stays open. */
function useLive<T>(load: (signal: AbortSignal) => Promise<T>, revision: number) {
  const [state, setState] = useState<{ data?: T; error?: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const run = () => load(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setState({ data }); },
      (error: unknown) => { if (!controller.signal.aborted) setState({ error: errorText(error) }); },
    );
    void run();
    const timer = window.setInterval(() => { if (!document.hidden) void run(); }, REFRESH_MS);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [load, revision]);
  return state;
}

function Chat({ token, caseId, drafts, changeDraft }: { token: string; caseId: string; drafts: Drafts; changeDraft: (kind: keyof Drafts, text: string) => void }) {
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const load = useCallback((signal: AbortSignal) => caseApi.listMessages(token, caseId, offset, signal), [token, caseId, offset]);
  const state = useLive(load, revision);
  const messages = state?.data ?? [];

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = drafts.message.trim();
    if (busy.current || !text) return;
    busy.current = true; setSending(true); setError(null);
    try {
      await caseApi.postMessage(token, caseId, text);
      changeDraft('message', '');
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(`${errorText(reason)} Textul a fost păstrat; reîncercați după ce verificați mesajele.`);
    } finally { busy.current = false; setSending(false); }
  }

  return (
    <div className="dossier__panel">
      {!state && <p role="status">Se încarcă conversația…</p>}
      {state?.error && <p role="alert">{state.error}</p>}
      {state?.data && messages.length === 0 && <p>Nu există mesaje încă.</p>}
      <ol className="dossier__messages">
        {messages.map((message) => (
          <li key={message.id} data-sender={message.senderRole}>
            <strong>{SENDER[message.senderRole] ?? 'Sistem'}</strong>
            <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('ro-RO')}</time>
            <p>{message.content}</p>
          </li>
        ))}
      </ol>
      {(offset > 0 || messages.length === 100) && (
        <div className="dossier__row">
          <button type="button" className="ui-button ui-button--secondary" disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - 100))}>Mesajele anterioare</button>
          <button type="button" className="ui-button ui-button--secondary" disabled={messages.length !== 100} onClick={() => setOffset((value) => value + 100)}>Mesajele următoare</button>
        </div>
      )}
      <form className="dossier__form" onSubmit={(event) => void send(event)}>
        <label htmlFor="dossier-message">Mesaj pentru pacient</label>
        <textarea id="dossier-message" value={drafts.message} onChange={(event) => changeDraft('message', event.target.value)} maxLength={5000} rows={3} readOnly={sending} />
        <button type="submit" className="ui-button ui-button--primary" disabled={sending || !drafts.message.trim() || !state?.data}>{sending ? 'Se salvează…' : 'Trimiteți mesajul'}</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

function Feedback({ token, caseId, draft, changeDraft }: { token: string; caseId: string; draft: string; changeDraft: (text: string) => void }) {
  const [revision, setRevision] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const busy = useRef(false);
  const load = useCallback((signal: AbortSignal) => caseApi.getDecision(token, caseId, signal), [token, caseId]);
  const state = useLive(load, revision);
  const decision = state?.data ?? null;

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (busy.current || !text) return;
    busy.current = true; setSending(true); setError(null); setSaved(false);
    try {
      await caseApi.sendDecision(token, caseId, text);
      changeDraft('');
      setSaved(true);
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(`${errorText(reason)} Textul a fost păstrat. Reîncărcați înainte de a retrimite: dacă răspunsul s-a pierdut, feedback-ul poate fi deja salvat.`);
    } finally { busy.current = false; setSending(false); }
  }

  return (
    <div className="dossier__panel">
      {state?.error && <p role="alert">{state.error}</p>}
      {decision && <section><h3>Ultimul feedback trimis</h3><p className="dossier__meta">Medic · {new Date(decision.createdAt).toLocaleString('ro-RO')}</p><blockquote>{decision.text}</blockquote></section>}
      <form className="dossier__form" onSubmit={(event) => void send(event)}>
        <label htmlFor="dossier-feedback">Feedback-ul dumneavoastră pentru pacient</label>
        <textarea id="dossier-feedback" value={draft} onChange={(event) => changeDraft(event.target.value)} maxLength={10000} rows={5} readOnly={sending} />
        <button type="submit" className="ui-button ui-button--primary" disabled={sending || !draft.trim()}>{sending ? 'Se salvează…' : 'Trimiteți feedback-ul'}</button>
      </form>
      {saved && <p role="status">Feedback salvat.</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

function Context({ token, caseId }: { token: string; caseId: string }) {
  const load = useCallback((signal: AbortSignal) => caseApi.loadCaseContext(token, caseId, signal), [token, caseId]);
  const state = useLive<ContextItem[]>(load, 0);
  return (
    <div className="dossier__panel">
      <p className="dossier__meta">Declarat de pacient. Confirmarea de către pacient nu este verificare medicală.</p>
      {!state && <p role="status">Se încarcă…</p>}
      {state?.error && <p role="alert">{state.error}</p>}
      {state?.data?.length === 0 && <p>Pacientul nu a declarat încă nimic.</p>}
      <ul className="dossier__list">
        {state?.data?.map((item) => (
          <li key={item.id}>
            <strong>{item.kind === 'allergy' ? 'Alergie' : item.kind === 'condition' ? 'Afecțiune' : 'Medicament declarat'}</strong>: {item.text}
            <p className="dossier__meta">
              {statusLabel(item.confirmation.status)}
              {item.source.kind === 'patient-input' && ` · declarat la ${formatDateTime(item.source.at)}`}
              {item.confirmation.at && ` · ${item.confirmation.status === 'confirmed' ? 'confirmat' : 'marcat necunoscut'} la ${formatDateTime(item.confirmation.at)}`}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The three summaries: answers to the control questions (no model), the AI control questions, the quotes. */
function Summary({ token, caseId }: { token: string; caseId: string }) {
  const [local, setLocal] = useState<LocalCaseSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback((signal: AbortSignal) => caseApi.listMessages(token, caseId, 0, signal), [token, caseId]);
  const state = useLive(load, 0);
  const answers = state?.data ? pairAnswers(state.data) : null;

  async function summarize() {
    if (busy) return;
    setBusy(true); setError(null);
    try { setLocal(await caseApi.summarizeLocally(token, caseId)); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  return (
    <div className="dossier__panel">
      <section>
        <h3>Răspunsurile pacientului</h3>
        <p className="dossier__meta">La fiecare întrebare a asistentului, exact ce a scris pacientul. Fără model, nu pleacă nimic în cloud.</p>
        {!state && <p role="status">Se încarcă…</p>}
        {state?.error && <p role="alert">{state.error}</p>}
        {answers && answers.groups.length === 0 && <p>Nu există încă întrebări sau răspunsuri.</p>}
        {answers?.notices.map((notice) => <p key={notice.id} className="dossier__alert" role="alert">{notice.text}</p>)}
        <ol className="dossier__qa">
          {answers?.groups.map((group, index) => (
            <li key={index}>
              <strong>{group.question ?? 'Mesajele pacientului de la început'}</strong>
              {group.answers.length === 0 ? <p className="dossier__meta">Fără răspuns încă.</p> : group.answers.map((answer) => <blockquote key={answer.id}>{answer.text}</blockquote>)}
            </li>
          ))}
        </ol>
        {answers && answers.unanswered > 0 && <p className="dossier__meta">{answers.unanswered} {answers.unanswered === 1 ? 'întrebare fără răspuns' : 'întrebări fără răspuns'}.</p>}
      </section>

      <ControlQuestionsPanel caseId={caseId} token={token} />

      <section>
        <h3>Mesajele organizate, cu citate</h3>
        <button type="button" className="ui-button ui-button--secondary" disabled={busy} onClick={() => void summarize()}>{busy ? 'Se generează local…' : 'Generați rezumatul cu citate (AI local)'}</button>
        {error && <p role="alert">{error}</p>}
        {local && (
          <>
            <p className="dossier__meta">Generat de AI local din mesajele pacientului. Verificați citatele; nu este un diagnostic.</p>
            <ul className="dossier__list">
              {local.items.map((item, index) => (
                <li key={`${item.messageId}-${index}`}>
                  <blockquote>{item.text}</blockquote>
                  <details><summary>Mesajul sursă</summary><p>{local.originals.find((original) => original.id === item.messageId)?.text}</p></details>
                </li>
              ))}
            </ul>
            <p className="dossier__meta">{local.uncoveredMessageIds.length} mesaje fără citat. Citatele nu garantează păstrarea tuturor detaliilor.</p>
          </>
        )}
      </section>
    </div>
  );
}
