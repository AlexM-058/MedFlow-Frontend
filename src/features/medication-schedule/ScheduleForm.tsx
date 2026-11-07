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
import { coherenceWarnings } from './coherence';

export type ScheduleRequest = Omit<MedicationSchedule, 'id' | 'status' | 'confirmedAt'>;

function PrescriptionText({ medication }: { medication: ConfirmedMedication }) {
  return (
    <dl className="med-schedule-rx">
      <div>
        <dt>Medicament</dt>
        <dd>{medication.name}</dd>
      </div>
      <div>
        <dt>Doză</dt>
        <dd>{medication.doseText}</dd>
      </div>
      <div>
        <dt>Indicație</dt>
        <dd>{medication.instructionOriginal}</dd>
      </div>
      <div>
        <dt>Durată</dt>
        <dd>{medication.durationText ?? 'Nu este indicată în prescripție'}</dd>
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
  // Informative only: the patient's choice is never changed or blocked.
  const enteredTimes = rows.filter((row) => row.value.trim() !== '').length;
  const coherence = coherenceWarnings({
    frequencyText: medication.instructionOriginal,
    durationText: medication.durationText,
    quantity: null,
    chosenTimes: enteredTimes > 0 ? enteredTimes : null,
  });

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
      setSaveError(error instanceof Error && error.message ? error.message : 'Programul nu a putut fi salvat.');
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
      <h3 id={`${id}-title`}>Configurați mementourile: {medication.name}</h3>
      <PrescriptionText medication={medication} />
      <p className="med-schedule-note">
        Prescripția dumneavoastră indică: «{medication.instructionOriginal}». Alegeți ora sau orele care corespund; dacă
        nu sunteți sigur, întrebați medicul dumneavoastră.
      </p>

      <fieldset className="med-schedule-fieldset" aria-describedby={timesError ? `${id}-times-error` : undefined}>
        <legend>Ore (format 24 de ore, HH:MM)</legend>
        <ul className="med-schedule-times">
          {rows.map((row, index) => {
            const rowError = errorText(errors, 'times', index);
            const inputId = `${id}-time-${row.id}`;
            return (
              <li key={row.id} className="med-schedule-time-row">
                <label htmlFor={inputId}>Ora {index + 1}</label>
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
                    aria-label={`Eliminați ora ${index + 1}`}
                  >
                    Eliminați
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
          Adăugați o oră
        </button>
        {timesError && (
          <p id={`${id}-times-error`} className="med-schedule-field-error">
            {timesError}
          </p>
        )}
        {coherence.map((warning) => (
          <p key={warning.code} className="med-schedule-note med-schedule-note--warning" role="status">
            {warning.message}
          </p>
        ))}
      </fieldset>

      <div className="med-schedule-field">
        <label htmlFor={`${id}-start`}>Prima zi (obligatoriu)</label>
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
        <legend>Ultima zi</legend>
        {duration ? (
          <>
            <p>
              Prescripția dumneavoastră indică durata «{medication.durationText}». Ultima zi (inclusiv):{' '}
              <strong>{suggestedEnd ? formatDate(suggestedEnd) : 'alegeți prima zi pentru a o vedea'}</strong>
            </p>
            <label className="med-schedule-check">
              <input
                type="checkbox"
                checked={endMode === 'suggested'}
                onChange={(event) => setEndMode(event.target.checked ? 'suggested' : 'unset')}
              />
              <span>Confirm această ultimă zi. Dacă nu corespunde cu ce a spus medicul meu, voi întreba medicul.</span>
            </label>
          </>
        ) : (
          <>
            {medication.durationText && (
              <p>
                Prescripția dumneavoastră indică despre durată: «{medication.durationText}». Aceasta nu este transformată
                automat într-o dată.
              </p>
            )}
            <div className="med-schedule-field">
              <label htmlFor={`${id}-end`}>Ultima zi (inclusiv)</label>
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
              <span>Prescripția nu indică o dată de încheiere</span>
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
        Fus orar: <strong>{timeZone}</strong> (acest dispozitiv). Mementourile urmează acest fus orar.
      </p>

      {attempted && !result.ok && (
        <p className="med-schedule-field-error" role="alert">
          Verificați câmpurile evidențiate înainte de confirmare.
        </p>
      )}

      {saveError && (
        <div className="med-schedule-note med-schedule-note--error" role="alert">
          <p>Programul nu a putut fi salvat: {saveError} Alegerile dumneavoastră au fost păstrate.</p>
          <button type="button" className="ui-button ui-button--secondary" onClick={() => void submit()} disabled={saving}>
            Încercați din nou
          </button>
        </div>
      )}

      <button type="submit" className="ui-button ui-button--primary" disabled={saving} aria-busy={saving}>
        {saving ? 'Se salvează…' : 'Confirmați programul'}
      </button>
    </form>
  );
}
