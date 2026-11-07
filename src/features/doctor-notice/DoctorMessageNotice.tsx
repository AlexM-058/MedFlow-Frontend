import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/authContext';
import { caseApi, type CaseDecision } from '../../lib/caseApi';
import { formatActivity } from '../doctor/account/backlogLogic';
import {
  browserStorage,
  isUnread,
  latestDecision,
  MAX_CASES_CHECKED,
  readMarker,
  senderName,
  writeMarker,
} from './doctorNoticeLogic';
import './doctor-notice.css';

const REFRESH_MS = 30_000;

async function fetchLatestDecision(token: string, signal: AbortSignal): Promise<CaseDecision | null> {
  const cases = await caseApi.listCases(token, 0, signal);
  const recent = [...cases].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, MAX_CASES_CHECKED);
  return latestDecision(await Promise.all(recent.map((item) => caseApi.getDecision(token, item.id, signal))));
}

/**
 * Shows the doctor's own words to the patient: "Dr. X a spus: ...". The text is the doctor's, copied
 * exactly; nothing here is generated. An unread message stays on top until the patient presses
 * "Am citit". Only a timestamp is remembered in this browser, never the message itself.
 */
export function DoctorMessageNotice() {
  const { session, profile } = useAuth();
  const token = session?.access_token ?? null;
  const userId = profile?.id ?? null;
  const doctors = profile?.activeDoctors ?? [];
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ revision: number; decision: CaseDecision | null; error: boolean } | null>(null);
  const [lastRead, setLastRead] = useState<string | null>(() => (userId ? readMarker(userId, browserStorage()) : null));
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    fetchLatestDecision(token, controller.signal).then(
      (decision) => { if (!controller.signal.aborted) setResult({ revision, decision, error: false }); },
      () => { if (!controller.signal.aborted) setResult((current) => ({ revision, decision: current?.decision ?? null, error: true })); },
    );
    return () => controller.abort();
  }, [token, revision]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) setRevision((value) => value + 1); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  if (!token || !userId || !result) return null;

  if (result.error && !result.decision) {
    return (
      <section className="doctor-notice-card doctor-notice-card--error" role="alert" aria-label="Mesaje de la medic">
        <p>Nu am putut verifica dacă aveți un mesaj nou de la medic.</p>
        <button type="button" className="ui-button ui-button--secondary" onClick={() => setRevision((value) => value + 1)}>Încercați din nou</button>
      </section>
    );
  }

  const decision = result.decision;
  if (!decision) return null;
  const unread = isUnread(decision, lastRead) && dismissed !== decision.id;
  const name = senderName(decision, doctors);

  function markRead(current: CaseDecision) {
    // If the browser blocks storage the card still closes for this visit and returns next time.
    if (userId && writeMarker(userId, current.createdAt, browserStorage())) setLastRead(current.createdAt);
    setDismissed(current.id);
  }

  if (unread) {
    return (
      <section className="doctor-notice-card doctor-notice-card--unread" aria-live="polite" aria-labelledby="doctor-notice-title">
        <p className="doctor-notice-card__eyebrow">Mesaj nou de la medic · {formatActivity(decision.createdAt)}</p>
        <h2 id="doctor-notice-title">{name} a spus:</h2>
        <blockquote className="doctor-notice-card__text">{decision.text}</blockquote>
        <button type="button" className="ui-button ui-button--primary" onClick={() => markRead(decision)}>Am citit</button>
      </section>
    );
  }

  return (
    <details className="doctor-notice-card doctor-notice-card--read">
      <summary>Ultimul mesaj de la medic · {formatActivity(decision.createdAt)}</summary>
      <p className="doctor-notice-card__who">{name} a spus:</p>
      <blockquote className="doctor-notice-card__text">{decision.text}</blockquote>
    </details>
  );
}
