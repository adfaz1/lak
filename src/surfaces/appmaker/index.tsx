// The App Maker now lives in the merchant dashboard (`#/dashboard/appmaker`). Old links (`#/appmaker/...`)
// keep working: they are replaced, without a history entry, by the same path and query below the dashboard.
import { useEffect } from 'react';
import { link, replace, type Route } from '../../core/router';

/** Old prototype step names that moved inside the dashboard section. */
const MOVED: Record<string, string> = { identity: 'design', layout: 'design', plan: '' };

export function dashboardPath(path: string[]): string {
  const [first, ...rest] = path;
  const head = first === undefined ? [] : first in MOVED ? (MOVED[first] ? [MOVED[first]] : []) : [first];
  return ['/dashboard/appmaker', ...[...head, ...rest].map(encodeURIComponent)].join('/');
}

export default function AppMakerRedirect({ route }: { route: Route }) {
  const to = link(dashboardPath(route.path), Object.fromEntries(route.query.entries()));
  useEffect(() => { replace(to); }, [to]);
  return null;
}
