import { useId, useRef, useState } from 'react';
import type { MedicationSchedule } from '../care-scenario/contracts';
import { formatDate, formatDoseDay, nextDoseOf, upcomingSkipped } from './scheduleLogic';

export function ScheduleCard({
  schedule,
  now,
  deviceZone,
  ended,
  onCancel,
}: {
  schedule: MedicationSchedule;
  now: Date;
  deviceZone: string;
  ended: boolean;
  onCancel?: (id: string) => Promise<void>;
}) {
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const pendingRef = useRef(false);

  const next = ended ? null : nextDoseOf(schedule, now);
  const skipped = ended ? [] : upcomingSkipped(schedule, now);

  const cancel = async () => {
    if (!onCancel || pendingRef.current) return;
    pendingRef.current = true;
    setCancelling(true);
    setCancelError(null);
    try {
      await onCancel(schedule.id);
    } catch (error) {
      setCancelError(error instanceof Error && error.message ? error.message : 'The schedule could not be cancelled.');
    } finally {
      pendingRef.current = false;
      setCancelling(false);
    }
  };

  return (
    <article className="med-schedule-card" aria-labelledby={`${id}-title`}>
      <div className="med-schedule-card__heading">
        <h3 id={`${id}-title`}>{schedule.medication}</h3>
        <span className={`med-schedule-chip ${ended ? 'med-schedule-chip--ended' : 'med-schedule-chip--active'}`}>
          {ended ? 'Ended' : 'Active'}
        </span>
      </div>

      <p className="med-schedule-meta">
        Prescription: {schedule.doseText} · «{schedule.instructionOriginal}»
      </p>

      {!ended && (
        <p className="med-schedule-next">
          {next ? (
            <>
              Next dose: <strong>{next.time}</strong>, {formatDoseDay(next, now)}
            </>
          ) : (
            'No upcoming doses.'
          )}
        </p>
      )}
      {ended && <p>This schedule has ended. It no longer sends reminders.</p>}

      <dl className="med-schedule-details">
        <div>
          <dt>Times</dt>
          <dd>{schedule.times.join(', ')}</dd>
        </div>
        <div>
          <dt>First day</dt>
          <dd>{formatDate(schedule.startDate)}</dd>
        </div>
        <div>
          <dt>Last day</dt>
          <dd>{schedule.endDate ? formatDate(schedule.endDate) : 'No end date given in the prescription'}</dd>
        </div>
        <div>
          <dt>Time zone</dt>
          <dd>{schedule.timezone}</dd>
        </div>
      </dl>

      {schedule.timezone !== deviceZone && !ended && (
        <p className="med-schedule-note med-schedule-note--warning">
          This schedule was set in {schedule.timezone}, but this device is set to {deviceZone}. Reminders still follow{' '}
          {schedule.timezone} times. If you moved to another time zone, cancel this schedule and set it up again, or ask
          your doctor.
        </p>
      )}

      {skipped.map((item) => (
        <p key={`${item.date}|${item.time}`} className="med-schedule-note med-schedule-note--warning">
          On {formatDate(item.date)}, {item.time} does not exist in {item.timezone} because the clocks change. That reminder
          is skipped; it is not moved to another time.
        </p>
      ))}

      {!ended && onCancel && (
        <div className="med-schedule-actions">
          {!confirming ? (
            <button type="button" className="ui-button ui-button--secondary" onClick={() => setConfirming(true)}>
              Cancel schedule
            </button>
          ) : (
            <div className="med-schedule-confirm" role="group" aria-label="Confirm cancellation">
              <p>Stop all reminders for {schedule.medication}? Your prescription itself does not change.</p>
              <div className="med-schedule-actions">
                <button
                  type="button"
                  className="ui-button ui-button--danger"
                  onClick={() => void cancel()}
                  disabled={cancelling}
                  aria-busy={cancelling}
                >
                  {cancelling ? 'Cancelling…' : cancelError ? 'Try again' : 'Yes, cancel schedule'}
                </button>
                <button
                  type="button"
                  className="ui-button ui-button--secondary"
                  onClick={() => {
                    setConfirming(false);
                    setCancelError(null);
                  }}
                  disabled={cancelling}
                >
                  Keep schedule
                </button>
              </div>
            </div>
          )}
          {cancelError && (
            <p className="med-schedule-note med-schedule-note--error" role="alert">
              Could not cancel the schedule: {cancelError}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
