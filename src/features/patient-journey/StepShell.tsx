import type { ReactNode } from 'react';

export interface StepAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * One layout for every step of the patient's journey: a short title, one sentence of help, the content, and a bar
 * that stays at the bottom of the screen with the main action and a quiet secondary one. One screen, one main action.
 */
export function StepShell({ title, hint, children, primary, secondary }: {
  title: string;
  hint?: string;
  children: ReactNode;
  primary?: StepAction;
  secondary?: StepAction;
}) {
  return (
    <section className="step" aria-labelledby="step-title">
      <header className="step__head">
        <h2 id="step-title">{title}</h2>
        {hint && <p className="step__hint">{hint}</p>}
      </header>
      <div className="step__body">{children}</div>
      {(primary || secondary) && (
        <div className="step__bar">
          {secondary && <button type="button" className="ui-button ui-button--secondary" onClick={secondary.onClick} disabled={secondary.disabled}>{secondary.label}</button>}
          {primary && <button type="button" className="ui-button ui-button--primary" onClick={primary.onClick} disabled={primary.disabled}>{primary.label}</button>}
        </div>
      )}
    </section>
  );
}
