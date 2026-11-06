import { useId, useRef, useState, type FormEvent } from 'react';
import type { ConfirmedMedication, MedicationSchedule } from '../care-scenario/contracts';
import {
  buildScheduleRequest,
  classifyRegimen,
  computeEndDate,
  formatDate,
  isValidDate,
  parseDuration,
  REGIMEN_MESSAGES,
  validateScheduleForm,
  type EndMode,
  type ScheduleError,
} from './scheduleLogic';

export type ScheduleRequest = Omit<MedicationSchedule, 'id' | 'status' | 'confirmedAt'>;

function PrescriptionText({ medication }: { medication: ConfirmedMedication }) {
  return (
    <dl className="med-schedule-rx">
      <div>
        <dt>Medication</dt>
        <dd>{medication.name}</dd>
      </div>
      <div>
        <dt>Dose</dt>
        <dd>{medication.doseText}</dd>
      </div>
      <div>
        <dt>Instruction</dt>
        <dd>{medication.instructionOriginal}</dd>
      </div>
      <div>
        <dt>Duration</dt>
        <dd>{medication.durationText ?? 'Not given in the prescription'}</dd>
      </div>
    </dl>
  );
}

/** Shown instead of the form for as-needed or variable regimens. */
export function NotSchedulableCard({ medication }: { medication: ConfirmedMedication }) {
  const regimen = classifyRegimen(medication);
  return (
    <article className="med-schedule-card">
      <h3>{medication.name}</h3>
      <PrescriptionText medication={medication} />
      <p className="med-schedule-note med-schedule-note--warning">
        {regimen === 'fixed' ? REGIMEN_MESSAGES.variable : REGIMEN_MESSAGES[regimen]}
      </p>
    </article>
  );
}

interface TimeRow {
  id: number;
  value: string;
}

function errorText(errors: ScheduleError[], field: ScheduleError['field'], index?: number): string | null {
  const found = errors.find((error) => error.field === field && error.index === index);
  return found ? found.message : null;
}

export function ScheduleForm({
  medication,
  timeZone,
  onSave,
}: {
  medication: ConfirmedMedication;
  timeZone: string;
  onSave: (request: ScheduleRequest) => Promise<void>;
}) {
  const id = useId();
  const nextRowId = useRef(1);
  // One empty row: the patient types every time; nothing is pre-filled.
  const [rows, setRows] = useState<TimeRow[]>([{ id: 0, value: '' }]);
  const [startDate, setStartDate] = useState('');
  const [endMode, setEndMode] = useState<EndMode>('unset');
  const [endDate, setEndDate] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);

  const duration = parseDuration(medication.durationText);
  const result = validateScheduleForm(medication, { times: rows.map((row) => row.value), startDate, endMode, endDate });
  const errors = attempted && !result.ok ? result.errors : [];
  const suggestedEnd = duration && isValidDate(startDate) ? computeEndDate(startDate, duration.days) : null;

  const submit = async () => {
    if (savingRef.current) return;
    setAttempted(true);
    if (!result.ok) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(buildScheduleRequest(medication, result.value, timeZone));
    } catch (error) {
      setSaveError(error instanceof Error && error.message ? error.message : 'The schedule could not be saved.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit();
  };

  const addRow = () => {
    const rowId = nextRowId.current;
    nextRowId.current += 1;
    setRows((list) => [...list, { id: rowId, value: '' }]);
  };

  const timesError = errorText(errors, 'times');
  const startError = errorText(errors, 'startDate');
  const endError = errorText(errors, 'end');

  return (
    <form className="med-schedule-card med-schedule-form" onSubmit={onSubmit} noValidate aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>Set up reminders: {medication.name}</h3>
      <PrescriptionText medication={medication} />
      <p className="med-schedule-note">
        Your prescription says: «{medication.instructionOriginal}». Choose the time(s) that match it; if you are not sure,
        ask your doctor.
      </p>

      <fieldset className="med-schedule-fieldset" aria-describedby={timesError ? `${id}-times-error` : undefined}>
        <legend>Times (24-hour, HH:MM)</legend>
        <ul className="med-schedule-times">
          {rows.map((row, index) => {
            const rowError = errorText(errors, 'times', index);
            const inputId = `${id}-time-${row.id}`;
            return (
              <li key={row.id} className="med-schedule-time-row">
                <label htmlFor={inputId}>Time {index + 1}</label>
                <input
                  id={inputId}
                  className="med-schedule-input"
                  type="time"
                  step={60}
                  value={row.value}
                  aria-invalid={rowError ? true : undefined}
                  aria-describedby={rowError ? `${inputId}-error` : undefined}
                  onChange={(event) => {
                    const value = event.target.value;
                    setRows((list) => list.map((item) => (item.id === row.id ? { ...item, value } : item)));
                  }}
                />
                {rows.length > 1 && (
                  <button
                    type="button"
                    className="ui-button ui-button--secondary"
                    onClick={() => setRows((list) => list.filter((item) => item.id !== row.id))}
                    aria-label={`Remove time ${index + 1}`}
                  >
                    Remove
                  </button>
                )}
                {rowError && (
                  <p id={`${inputId}-error`} className="med-schedule-field-error">
                    {rowError}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <button type="button" className="ui-button ui-button--secondary" onClick={addRow}>
          Add a time
        </button>
        {timesError && (
          <p id={`${id}-times-error`} className="med-schedule-field-error">
            {timesError}
          </p>
        )}
      </fieldset>

      <div className="med-schedule-field">
        <label htmlFor={`${id}-start`}>First day (required)</label>
        <input
          id={`${id}-start`}
          className="med-schedule-input"
          type="date"
          required
          value={startDate}
          aria-invalid={startError ? true : undefined}
          aria-describedby={startError ? `${id}-start-error` : undefined}
          onChange={(event) => setStartDate(event.target.value)}
        />
        {startError && (
          <p id={`${id}-start-error`} className="med-schedule-field-error">
            {startError}
          </p>
        )}
      </div>

      <fieldset className="med-schedule-fieldset" aria-describedby={endError ? `${id}-end-error` : undefined}>
        <legend>Last day</legend>
        {duration ? (
          <>
            <p>
              Your prescription gives the duration «{medication.durationText}». Last day (included):{' '}
              <strong>{suggestedEnd ? formatDate(suggestedEnd) : 'choose the first day to see it'}</strong>
            </p>
            <label className="med-schedule-check">
              <input
                type="checkbox"
                checked={endMode === 'suggested'}
                onChange={(event) => setEndMode(event.target.checked ? 'suggested' : 'unset')}
              />
              <span>I confirm this last day. If it does not match what my doctor said, I will ask my doctor.</span>
            </label>
          </>
        ) : (
          <>
            {medication.durationText && (
              <p>
                Your prescription says about the duration: «{medication.durationText}». It is not turned into a date
                automatically.
              </p>
            )}
            <div className="med-schedule-field">
              <label htmlFor={`${id}-end`}>Last day (included)</label>
              <input
                id={`${id}-end`}
                className="med-schedule-input"
                type="date"
                value={endDate}
                min={isValidDate(startDate) ? startDate : undefined}
                disabled={endMode === 'none'}
                aria-invalid={endError && endMode !== 'none' ? true : undefined}
                onChange={(event) => {
                  setEndDate(event.target.value);
                  setEndMode(event.target.value ? 'date' : 'unset');
                }}
              />
            </div>
            <label className="med-schedule-check">
              <input
                type="checkbox"
                checked={endMode === 'none'}
                onChange={(event) => setEndMode(event.target.checked ? 'none' : endDate ? 'date' : 'unset')}
              />
              <span>The prescription gives no end date</span>
            </label>
          </>
        )}
        {endError && (
          <p id={`${id}-end-error`} className="med-schedule-field-error">
            {endError}
          </p>
        )}
      </fieldset>

      <p className="med-schedule-meta">
        Time zone: <strong>{timeZone}</strong> (this device). Reminders follow this time zone.
      </p>

      {attempted && !result.ok && (
        <p className="med-schedule-field-error" role="alert">
          Check the highlighted fields before confirming.
        </p>
      )}

      {saveError && (
        <div className="med-schedule-note med-schedule-note--error" role="alert">
          <p>Could not save the schedule: {saveError} Your choices are kept.</p>
          <button type="button" className="ui-button ui-button--secondary" onClick={() => void submit()} disabled={saving}>
            Try again
          </button>
        </div>
      )}

      <button type="submit" className="ui-button ui-button--primary" disabled={saving} aria-busy={saving}>
        {saving ? 'Saving…' : 'Confirm schedule'}
      </button>
    </form>
  );
}
