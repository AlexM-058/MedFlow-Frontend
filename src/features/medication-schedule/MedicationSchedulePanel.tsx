import { useCallback, useEffect, useId, useState } from 'react';
import type { ConfirmedMedication, MedicationSchedule, ScheduleAdapter } from '../care-scenario/contracts';
import { DataSourceBadge } from '../care-scenario/DataSourceBadge';
import { ScheduleCard } from './ScheduleCard';
import { NotSchedulableCard, ScheduleForm, type ScheduleRequest } from './ScheduleForm';
import { classifyRegimen, deviceTimeZone, effectiveStatus, formatDoseDay, nextDose, PERMISSION_MESSAGES } from './scheduleLogic';
import { useReminders } from './useReminders';
import './medication-schedule.css';

const systemNow = () => new Date();

interface LoadResult {
  adapter: ScheduleAdapter;
  token: number;
  schedules: MedicationSchedule[] | null;
  error: string | null;
}

const EMPTY: MedicationSchedule[] = [];

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function MedicationSchedulePanel({
  adapter,
  medications,
  now = systemNow,
}: {
  adapter: ScheduleAdapter;
  medications: ConfirmedMedication[];
  now?: () => Date;
}) {
  const id = useId();
  const [token, setToken] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  // The device zone is read once per mount; a change is detected against saved schedules.
  const [deviceZone] = useState(deviceTimeZone);

  useEffect(() => {
    const controller = new AbortController();
    adapter.list(controller.signal).then(
      (schedules) => {
        if (!controller.signal.aborted) setResult({ adapter, token, schedules, error: null });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setResult({ adapter, token, schedules: null, error: errorMessage(error, 'The schedules could not be loaded.') });
        }
      },
    );
    return () => controller.abort();
  }, [adapter, token]);

  // A result from another adapter (e.g. another account) or an older request is never shown.
  const current = result && result.adapter === adapter && result.token === token ? result : null;
  const schedules = current?.schedules ?? EMPTY;
  const reminders = useReminders(schedules, now);
  const nowDate = new Date(reminders.nowMs);

  const save = useCallback(
    async (request: ScheduleRequest) => {
      const saved = await adapter.save(request);
      setResult((previous) =>
        previous && previous.adapter === adapter && previous.schedules
          ? { ...previous, schedules: [...previous.schedules.filter((item) => item.id !== saved.id), saved] }
          : previous,
      );
    },
    [adapter],
  );

  const { dismissSchedule } = reminders;
  const cancel = useCallback(
    async (scheduleId: string) => {
      const cancelled = await adapter.cancel(scheduleId);
      dismissSchedule(scheduleId);
      setResult((previous) =>
        previous && previous.adapter === adapter && previous.schedules
          ? { ...previous, schedules: previous.schedules.map((item) => (item.id === cancelled.id ? cancelled : item)) }
          : previous,
      );
    },
    [adapter, dismissSchedule],
  );

  const active = schedules.filter((schedule) => effectiveStatus(schedule, nowDate) === 'active');
  const ended = schedules.filter((schedule) => effectiveStatus(schedule, nowDate) === 'ended');
  const withoutSchedule = medications.filter((medication) => !active.some((schedule) => schedule.medicationId === medication.id));
  const next = nextDose(active, nowDate);

  return (
    <section className="med-schedule" aria-labelledby={`${id}-title`}>
      <header className="med-schedule-header">
        <h2 id={`${id}-title`}>Medication schedule</h2>
        <DataSourceBadge source={adapter.source} />
      </header>

      <p className="med-schedule-note med-schedule-note--info">
        Reminders work only while this page is open. Background and lock-screen notifications are not available in this
        demo.
      </p>

      {!current && (
        <p role="status" className="med-schedule-status">
          Loading your schedules…
        </p>
      )}

      {current?.error && (
        <div className="med-schedule-note med-schedule-note--error" role="alert">
          <p>Could not load your schedules: {current.error}</p>
          <button type="button" className="ui-button ui-button--secondary" onClick={() => setToken((value) => value + 1)}>
            Try again
          </button>
        </div>
      )}

      {current?.schedules && (
        <>
          <p className="med-schedule-summary" aria-live="polite">
            {next ? (
              <>
                Next dose: <strong>{next.medication}</strong> at <strong>{next.time}</strong>, {formatDoseDay(next, nowDate)}
              </>
            ) : (
              'No upcoming doses scheduled.'
            )}
          </p>

          <div className="med-schedule-notify">
            <p>{PERMISSION_MESSAGES[reminders.permission]}</p>
            {reminders.permission === 'default' && (
              <button
                type="button"
                className="ui-button ui-button--secondary"
                onClick={() => void reminders.requestPermission()}
                disabled={reminders.requesting}
                aria-busy={reminders.requesting}
              >
                {reminders.requesting ? 'Waiting for your answer…' : 'Turn on notifications'}
              </button>
            )}
            {reminders.systemFailed && (
              <p>This browser did not show the system notification. The in-page reminder is shown instead.</p>
            )}
          </div>

          <div className="med-schedule-banners" role="alert">
            {reminders.banners.map((dose) => (
              <div key={dose.key} className="med-schedule-banner">
                <p>
                  Reminder: <strong>{dose.medication}</strong>, scheduled for {dose.time}.
                </p>
                <div className="med-schedule-actions">
                  <button type="button" className="ui-button ui-button--primary" onClick={() => reminders.markTaken(dose.key)}>
                    Mark as taken
                  </button>
                  <button type="button" className="ui-button ui-button--secondary" onClick={() => reminders.dismiss(dose.key)}>
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>

          {reminders.taken.length > 0 && (
            <ul className="med-schedule-taken" aria-label="Marked as taken on this page">
              {reminders.taken.map(({ dose }) => (
                <li key={dose.key}>
                  Marked as taken: {dose.medication}, {dose.time} (kept on this page only)
                </li>
              ))}
            </ul>
          )}

          {active.length > 0 && (
            <div className="med-schedule-list">
              {active.map((schedule) => (
                <ScheduleCard key={schedule.id} schedule={schedule} now={nowDate} deviceZone={deviceZone} ended={false} onCancel={cancel} />
              ))}
            </div>
          )}

          {withoutSchedule.length > 0 && (
            <div className="med-schedule-list">
              {withoutSchedule.map((medication) =>
                classifyRegimen(medication) === 'fixed' ? (
                  <ScheduleForm key={medication.id} medication={medication} timeZone={deviceZone} onSave={save} />
                ) : (
                  <NotSchedulableCard key={medication.id} medication={medication} />
                ),
              )}
            </div>
          )}

          {medications.length === 0 && active.length === 0 && (
            <p className="med-schedule-status">No confirmed medications yet. Confirm a prescription first.</p>
          )}

          {ended.length > 0 && (
            <div className="med-schedule-list">
              <h3 className="med-schedule-subtitle">Ended schedules</h3>
              {ended.map((schedule) => (
                <ScheduleCard key={schedule.id} schedule={schedule} now={nowDate} deviceZone={deviceZone} ended />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
