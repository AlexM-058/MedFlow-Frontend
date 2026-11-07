import type { DataSourceKind } from './contracts';
import './data-source-badge.css';

/** Visible origin of a panel's data. Fixture data is never presented as live integration. */
export function DataSourceBadge({ source }: { source: DataSourceKind }) {
  return source === 'live' ? (
    <span className="data-source-badge data-source-badge--live">Live</span>
  ) : (
    <span className="data-source-badge data-source-badge--fixture" title="Date demo sintetice, nesalvate pe server">
      Date demo
    </span>
  );
}
