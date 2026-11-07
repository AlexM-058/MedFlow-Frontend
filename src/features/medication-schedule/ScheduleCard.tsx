import { useId, useRef, useState } from 'react';
import type { MedicationSchedule } from '../care-scenario/contracts';
import { formatDate, nextDoseOf, upcomingSkipped } from './scheduleLogic';
import { formatDoseDay } from './scheduleLabels';

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
      setCancelError(error instanceof Error && error.message ? error.message : 'Programul nu a putut fi anulat.');
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
          {ended ? 'Încheiat' : 'Activ'}
        </span>
      </div>

      <p className="med-schedule-meta">
        Prescripție: {schedule.doseText} · «{schedule.instructionOriginal}»
      </p>

      {!ended && (
        <p className="med-schedule-next">
          {next ? (
            <>
              Următoarea doză: <strong>{next.time}</strong>, {formatDoseDay(next, now)}
            </>
          ) : (
            'Nu există doze viitoare.'
          )}
        </p>
      )}
      {ended && <p>Acest program s-a încheiat. Nu mai trimite mementouri.</p>}

      <dl className="med-schedule-details">
        <div>
          <dt>Ore</dt>
          <dd>{schedule.times.join(', ')}</dd>
        </div>
        <div>
          <dt>Prima zi</dt>
          <dd>{formatDate(schedule.startDate)}</dd>
        </div>
        <div>
          <dt>Ultima zi</dt>
          <dd>{schedule.endDate ? formatDate(schedule.endDate) : 'Prescripția nu indică o dată de încheiere'}</dd>
        </div>
        <div>
          <dt>Fus orar</dt>
          <dd>{schedule.timezone}</dd>
        </div>
      </dl>

      {schedule.timezone !== deviceZone && !ended && (
        <p className="med-schedule-note med-schedule-note--warning">
          Acest program a fost creat pentru {schedule.timezone}, dar dispozitivul dumneavoastră este setat pe {deviceZone}.
          Mementourile urmează în continuare ora din {schedule.timezone}. Dacă v-ați mutat în alt fus orar, anulați acest
          program și configurați-l din nou sau întrebați medicul dumneavoastră.
        </p>
      )}

      {skipped.map((item) => (
        <p key={`${item.date}|${item.time}`} className="med-schedule-note med-schedule-note--warning">
          În {formatDate(item.date)}, ora {item.time} nu există în {item.timezone} din cauza schimbării orei. Acest memento
          este omis; nu este mutat la altă oră.
        </p>
      ))}

      {!ended && onCancel && (
        <div className="med-schedule-actions">
          {!confirming ? (
            <button type="button" className="ui-button ui-button--secondary" onClick={() => setConfirming(true)}>
              Anulați programul
            </button>
          ) : (
            <div className="med-schedule-confirm" role="group" aria-label="Confirmați anularea">
              <p>Opriți toate mementourile pentru {schedule.medication}? Prescripția dumneavoastră nu se modifică.</p>
              <div className="med-schedule-actions">
                <button
                  type="button"
                  className="ui-button ui-button--danger"
                  onClick={() => void cancel()}
                  disabled={cancelling}
                  aria-busy={cancelling}
                >
                  {cancelling ? 'Se anulează…' : cancelError ? 'Încercați din nou' : 'Da, anulați programul'}
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
                  Păstrați programul
                </button>
              </div>
            </div>
          )}
          {cancelError && (
            <p className="med-schedule-note med-schedule-note--error" role="alert">
              Programul nu a putut fi anulat: {cancelError}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
