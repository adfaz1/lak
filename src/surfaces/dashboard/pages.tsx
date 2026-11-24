// Route registry for the new dashboard. Each section lives in its own folder and exports
// `default function ({ route })`, where route.path is below `#/dashboard/<section>`.
// A section appears in navigation as "new" only when listed in BUILT; otherwise the nav opens
// the previous workspace and labels it.
import { lazy, type ComponentType } from 'react';
import { link, type Route } from '../../core/router';

type Page = ComponentType<{ route: Route }>;
export const SECTIONS: Record<string, Page> = {
  orders: lazy(() => import('./orders')),
  products: lazy(() => import('./products')),
  inventory: lazy(() => import('./inventory')),
  customers: lazy(() => import('./customers')),
  analytics: lazy(() => import('./analytics')),
  finance: lazy(() => import('./finance')),
  marketing: lazy(() => import('./marketing')),
  automations: lazy(() => import('./automations')),
  storefront: lazy(() => import('./storefront')),
  apps: lazy(() => import('./apps')),
  settings: lazy(() => import('./settings')),
  help: lazy(() => import('./help')),
};
/** Sections rebuilt on the LAK design system and linked from navigation. */
export const BUILT = new Set<string>(['orders']);

/** Link to a merchant section: the rebuilt page when it exists, otherwise the previous workspace (labelled there). */
export function sectionHref(key: string, path = '', query?: Record<string, string | undefined>): string {
  return BUILT.has(key)
    ? link(`/dashboard/${key}${path ? `/${path}` : ''}`, query)
    : link(`/merchant/${key}${path ? `/${path}` : ''}`, { ...query, from: 'v2' });
}
