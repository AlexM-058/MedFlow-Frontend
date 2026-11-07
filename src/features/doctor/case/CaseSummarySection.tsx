import type { CaseSummary } from '../../care-scenario/contracts';
import {
  buildSummaryRows,
  coverageLabel,
  formatDateTime,
  formatTime,
  messageAnchorId,
  summaryOriginLabel,
  type CaseLookup,
  type Coverage,
  type SummaryFlag,
} from './caseLogic';
import type { Resource } from './useResource';

interface Props {
  summary: Resource<CaseSummary | null>;
  onRetry: () => void;
  lookup: CaseLookup;
  coverage: Coverage | null;
  onGoTo: (targetId: string) => void;
}

const FLAG_LABEL: Record<SummaryFlag, string> = { Negated: 'Negat', Uncertain: 'Incert' };

/** Derived summary with sources, flags and code-computed coverage. Originals stay visible elsewhere. */
export function CaseSummarySection({ summary, onRetry, lookup, coverage, onGoTo }: Props) {
  return (
    <section className="care-case-card" aria-labelledby="care-case-summary-title">
      <h3 id="care-case-summary-title" className="care-case-card__title">
        Rezumat (derivat — verificați sursele)
      </h3>

      {summary.status === 'loading' && <p role="status">Se încarcă rezumatul…</p>}

      {summary.status === 'error' && (
        <div className="care-case-alert care-case-alert--error" role="alert">
          <p>Rezumatul nu a putut fi încărcat: {summary.message}</p>
          <p>Conversația originală de mai jos este completă și fără el.</p>
          <button type="button" className="ui-button ui-button--secondary" onClick={onRetry}>
            Încercați din nou
          </button>
        </div>
      )}

      {summary.status === 'ready' && summary.data === null && (
        <p className="care-case-hint">Nu există încă un rezumat pentru acest caz. Citiți conversația originală.</p>
      )}

      {summary.status === 'ready' && summary.data !== null && (
        <>
          <p className="care-case-hint">
            <span className="care-case-tag care-case-tag--origin">{summaryOriginLabel(summary.data.generatedBy)}</span>{' '}
            Versiunea {summary.data.version}, {formatDateTime(summary.data.createdAt)}. Nu înlocuiește niciodată originalele.
          </p>
          <ul className="care-case-summary">
            {buildSummaryRows(summary.data, lookup).map((row) => (
              <li key={row.id} className="care-case-summary__item">
                <p className="care-case-summary__text">{row.text}</p>
                {row.flags.length > 0 && (
                  <p className="care-case-summary__flags">
                    {row.flags.map((flag) => (
                      <span key={flag} className={`care-case-tag care-case-tag--${flag.toLowerCase()}`}>
                        {FLAG_LABEL[flag]}
                      </span>
                    ))}
                  </p>
                )}
                {row.unsourced ? (
                  <p className="care-case-tag care-case-tag--unsourced">Fără sursă — verificați</p>
                ) : (
                  <div className="care-case-summary__sources" role="group" aria-label="Surse">
                    {row.links.map((link, index) =>
                      link.targetId ? (
                        <button
                          key={index}
                          type="button"
                          className="ui-button ui-button--secondary care-case-source"
                          onClick={() => onGoTo(link.targetId as string)}
                        >
                          {link.label}
                        </button>
                      ) : (
                        <span key={index} className="care-case-tag care-case-tag--unsourced">
                          {link.label}
                        </span>
                      ),
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {coverage && (
        <div className="care-case-coverage">
          <p className="care-case-coverage__count">
            <strong>{coverageLabel(coverage)}</strong> de rezumat (calculat din surse, nu afirmat de un model).
          </p>
          {coverage.uncited.length > 0 && (
            <section className="care-case-alert care-case-alert--warning" aria-labelledby="care-case-uncited-title">
              <h4 id="care-case-uncited-title" className="care-case-subtitle">
                Neincluse în rezumat — citiți originalul
              </h4>
              <ul className="care-case-uncited">
                {coverage.uncited.map((message) => (
                  <li key={message.id} className="care-case-uncited__item">
                    <p className="care-case-meta">Pacient, {formatTime(message.createdAt)}</p>
                    <p className="care-case-verbatim">{message.text}</p>
                    <button
                      type="button"
                      className="ui-button ui-button--secondary care-case-source"
                      onClick={() => onGoTo(messageAnchorId(message.id))}
                    >
                      Arată în conversație
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </section>
  );
}
