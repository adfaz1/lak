import { useEffect, useMemo, useState } from 'react';

/** Hash router. State that must survive navigation, reload and deep links lives in the URL. */
export interface Route {
  /** Path segments, e.g. ['merchant', 'orders', '10482']. */
  path: string[];
  query: URLSearchParams;
}

export function parse(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  return { path: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(query) };
}

/** Build an href. Empty and undefined query values are dropped. */
export function link(path: string, query?: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v) params.set(k, v);
  const q = params.toString();
  return `#${path.startsWith('/') ? path : `/${path}`}${q ? `?${q}` : ''}`;
}

export function navigate(href: string): void {
  window.location.hash = href.replace(/^#/, '');
}

/** Replace the current URL without adding a history entry (e.g. while typing in a search box). */
export function replace(href: string): void {
  window.history.replaceState(null, '', href);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** The route with its first `n` segments removed, for a surface or section to read its own sub-path. */
export function sub(route: Route, n: number): Route {
  return { path: route.path.slice(n), query: route.query };
}

export function useRoute(): Route {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return useMemo(() => parse(hash), [hash]);
}
