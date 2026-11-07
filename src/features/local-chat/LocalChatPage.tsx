import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AppHeader } from '../../components/AppHeader';
import '../cases/cases.css';

type Message = { id: string; text: string; role: 'patient' | 'assistant'; pending?: boolean; failed?: boolean };
type Reply = { text: string; questionId: string | null };

export function LocalChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [asked, setAsked] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const scrollTarget = useRef<HTMLDivElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { scrollTarget.current?.scrollIntoView({ block: 'nearest' }); }, [messages, pending]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || !draft.trim() || done) return;
    const patientMessages = messages.filter((message) => message.role === 'patient' && !message.failed);
    if (patientMessages.length >= 20) { setError('Limita conversației de test a fost atinsă. Începeți o conversație nouă.'); return; }
    const message: Message = { id: crypto.randomUUID(), role: 'patient', text: draft.trim(), pending: true };
    busy.current = true; setPending(true); setError(null);
    setMessages((current) => [...current.filter((entry) => !entry.failed || entry.text !== message.text), message]);
    const currentController = new AbortController(); controller.current = currentController;
    const timeout = window.setTimeout(() => currentController.abort(), 110000);
    try {
      const configured = import.meta.env.VITE_API_BASE_URL?.trim();
      if (!configured) throw new Error('Adresa backendului nu este configurată.');
      const url = new URL(configured);
      if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('Adresa backendului nu este validă.');
      const response = await fetch(`${url.href.replace(/\/$/, '')}/demo/local-intake`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', redirect: 'error', cache: 'no-store',
        body: JSON.stringify({ messages: [...patientMessages, message].map(({ id, text }) => ({ id, text })), asked }),
        signal: currentController.signal,
      });
      if (!response.ok) throw new Error(response.status === 429 ? 'Agentul este ocupat. Așteptați puțin și retrimiteți mesajul.' : 'Agentul local nu este disponibil. Mesajul dumneavoastră a fost păstrat pentru reîncercare.');
      const reply = await response.json() as Reply;
      if (!reply || typeof reply.text !== 'string' || !reply.text.trim() || reply.text.length > 500 || (reply.questionId !== null && typeof reply.questionId !== 'string')) throw new Error('Răspunsul agentului nu este valid.');
      setMessages((current) => [...current.map((entry) => entry.id === message.id ? { ...entry, pending: false } : entry), { id: crypto.randomUUID(), role: 'assistant', text: reply.text }]);
      setDraft('');
      if (reply.questionId === null) setDone(true); else setAsked((current) => [...current, reply.questionId as string]);
    } catch (reason) {
      setMessages((current) => current.map((entry) => entry.id === message.id ? { ...entry, pending: false, failed: true } : entry));
      setError(reason instanceof Error && reason.name !== 'AbortError' ? reason.message : 'Cererea s-a întrerupt. Textul a rămas în câmp; puteți reîncerca.');
    } finally { window.clearTimeout(timeout); busy.current = false; setPending(false); }
  }
  function restart() {
    if (messages.length && !window.confirm('Ștergeți conversația de test din această pagină? Nu este salvată în cont.')) return;
    controller.current?.abort();
    setMessages([]); setDraft(''); setAsked([]); setDone(false); setError(null);
  }
  return <div className="app" style={{ height: 'auto', minHeight: '100dvh' }}>
    <AppHeader />
    <main style={{ width: 'min(100%, 48rem)', marginInline: 'auto', padding: 'var(--gutter)', boxSizing: 'border-box' }}>
      <section className="case-inbox" aria-label="Conversație de test cu agentul local">
        <h1>Conversație cu asistentul local</h1>
        <p>Test tehnic cu modelul care rulează pe laptop. Folosiți numai informații fictive. Conversația nu este salvată și nu este trimisă unui medic; se șterge la reîncărcarea paginii.</p>
        <p>MedFlow ajută la colectarea informațiilor pentru comunicarea cu medicul. Asistentul nu diagnostichează, nu prescrie și nu monitorizează urgențe.</p>
        <button type="button" className="ui-button ui-button--secondary" disabled={pending} onClick={restart}>Conversație nouă</button>
        {messages.length === 0 && <p>Începeți cu un mesaj fictiv despre ce ați dori să comunicați medicului.</p>}
        <ol className="case-inbox__messages" aria-label="Mesaje">
          {messages.map((message) => <li key={message.id}><strong>{message.role === 'patient' ? 'Dumneavoastră' : 'Asistent local'}</strong><p>{message.text}</p>
            {message.pending && <small>Se trimite…</small>}{message.failed && <small>Netrimis — textul este păstrat în câmp.</small>}
          </li>)}
        </ol>
        {pending && <p role="status">Asistentul pregătește întrebarea pe laptop…</p>}
        {error && <p role="alert">{error}</p>}
        {done && <p role="status">Conversația de test s-a încheiat. Nimic nu a fost trimis medicului.</p>}
        <form className="case-inbox__form" onSubmit={(event) => void submit(event)}>
          <label htmlFor="local-chat-message">Mesajul dumneavoastră de test</label>
          <textarea id="local-chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1000} readOnly={pending || done} required />
          <button className="ui-button ui-button--primary" disabled={pending || done || !draft.trim()}>{pending ? 'Se așteaptă răspunsul…' : error ? 'Reîncercați mesajul' : 'Trimiteți'}</button>
        </form>
        <div ref={scrollTarget} />
      </section>
    </main>
  </div>;
}
