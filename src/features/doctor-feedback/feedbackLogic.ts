// Patient view of the doctor's answer (M8). Pure: no React, DOM or env access.
// The patient view model is built field by field from DoctorFeedback only, so the
// summary, decision-support variants or any AI-generated text cannot reach it,
// even if a caller passes a wider object.
import type { DoctorFeedback } from '../care-scenario/contracts.ts';

const FEEDBACK_TIME_ZONE = 'Europe/Bucharest';

const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: FEEDBACK_TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatFeedbackTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateTimeFormat.format(date);
}

export type PatientFeedbackView =
  | { state: 'pending' }
  | {
      state: 'answered';
      doctorName: string;
      /** The doctor's words exactly as sent. */
      text: string;
      createdAt: string;
      timeLabel: string;
    };

export function buildPatientFeedbackView(feedback: DoctorFeedback | null): PatientFeedbackView {
  if (!feedback) return { state: 'pending' };
  return {
    state: 'answered',
    doctorName: feedback.doctor.fullName,
    text: feedback.text,
    createdAt: feedback.createdAt,
    timeLabel: formatFeedbackTime(feedback.createdAt),
  };
}

/** "Dr. Demo said:" */
export function attributionLabel(doctorName: string): string {
  return `${doctorName} said:`;
}
