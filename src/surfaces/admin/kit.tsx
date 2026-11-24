import { useState, type ReactNode } from 'react';
import type { Lang } from '../../core/lang';
import { link, parse, replace, type Route } from '../../core/router';
import { createStore } from '../../core/store';
import { Alert, Dialog } from '../../core/ui';
import { allowedSections, hasReason, type RoleId, type Section } from './domain';
import { ERR, ROLE_LABEL, SECTION_LABEL, type Strings } from './i18n';
import type { Outcome } from './state';

/** Props every admin screen receives. */
export interface Ctx { t: Strings; lang: Lang; role: RoleId; route: Route }

export const href = (path: string, query?: Record<string, string | undefined>) => link(`/admin${path}`, query);

/* ---------- Formatting (Riyadh time, Latin digits to match money) ---------- */

const loc = (lang: Lang) => (lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB');
export function fmtDateTime(v: number | string, lang: Lang): string {
  return new Intl.DateTimeFormat(loc(lang), { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(v));
}
export function fmtDate(v: number | string, lang: Lang): string {
  return new Intl.DateTimeFormat(loc(lang), { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(v));
}
export const pct = (bp: number) => `${(bp / 100).toFixed(2)}%`;

/* ---------- Flash: a persistent status line for the last action's outcome ---------- */

export const flashStore = createStore.key('admin.flashStore')<{ msg: string; at: string } | null>(() => null);
/** Path below /admin, e.g. "stores/s-1001". A flash shows only on the page it belongs to. */
export const adminKey = () => parse(window.location.hash).path.slice(1).join('/');
export const flash = (msg: string, at: string = adminKey()) => flashStore.set({ msg, at });

/* ---------- Icons (inline stroke SVG, decorative) ---------- */

const PATHS: Record<string, string> = {
  overview: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  kyc: 'M3 5h18v14H3zM7 10a2 2 0 1 0 4 0a2 2 0 1 0-4 0M6 16c.8-1.6 2-2.3 3-2.3s2.2.7 3 2.3M14 9h4M14 13h4',
  stores: 'M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 2 3s2-1.3 2-3c0 1.7 1.3 3 3 3s3-1.3 3-3M10 20v-5h4v5',
  plans: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  payments: 'M3 6h18v12H3zM3 10h18M7 15h4',
  shipping: 'M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-.1M17 19a2 2 0 1 0 0-.1',
  content: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM16.5 13v7M13 16.5h7',
  health: 'M3 12h4l2-6 4 12 2-6h6',
  reports: 'M6 3h9l4 4v14H6zM15 3v4h4M9 13h7M9 17h7M9 9h3',
  announcements: 'M4 10v4h3l7 4V6L7 10zM17 9c1 .8 1.5 1.8 1.5 3s-.5 2.2-1.5 3',
  audit: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  shield: 'M12 3l7 3v5c0 4.5-3 8-7 10c-4-2-7-5.5-7-10V6z',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  check: 'M5 12l5 5 9-10',
  x: 'M6 6l12 12M18 6L6 18',
  arrow: 'M15 6l-6 6 6 6',
};
export function Icon({ name, size = 20 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg className="adm-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}

/* ---------- Data list: a table at width, row summaries in a narrow container ---------- */

export interface Col<T> { key: string; head: ReactNode; cell: (r: T) => ReactNode; end?: boolean; primary?: boolean }
export function DataList<T>({ rows, cols, rowKey, label, empty }: { rows: T[]; cols: Col<T>[]; rowKey: (r: T) => string; label: string; empty?: ReactNode }) {
  if (rows.length === 0) return <div className="empty">{empty}</div>;
  const primary = cols.find((c) => c.primary) ?? cols[0];
  const rest = cols.filter((c) => c !== primary);
  return (
    <div className="adm-dl">
      <div className="table-wrap adm-dl-table" role="region" aria-label={label} tabIndex={0}>
        <table>
          <caption className="sr">{label}</caption>
          <thead><tr>{cols.map((c) => <th key={c.key} scope="col" className={c.end ? 'end' : undefined}>{c.head}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => <tr key={rowKey(r)}>{cols.map((c) => <td key={c.key} className={c.end ? 'end' : undefined}>{c.cell(r)}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      <ul className="adm-dl-rows" aria-label={label}>
        {rows.map((r) => (
          <li key={rowKey(r)}>
            <div className="adm-dl-primary">{primary.cell(r)}</div>
            <dl>
              {rest.map((c) => <div key={c.key}><dt>{c.head}</dt><dd>{c.cell(r)}</dd></div>)}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Reason dialog: scope + mandatory reason + specific confirm label ---------- */

export function ReasonDialog({ t, lang, title, scope, confirmLabel, danger, optional, reasonLabel, children, onConfirm, onClose }: {
  t: Strings; lang: Lang; title: string; scope: ReactNode; confirmLabel: string; danger?: boolean; optional?: boolean; reasonLabel?: string;
  children?: ReactNode; onConfirm: (reason: string) => Outcome; onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<Outcome>(null);
  const submit = () => {
    if (!optional && !hasReason(reason)) { setError('reasonRequired'); return; }
    const e = onConfirm(reason);
    if (e) setError(e); else onClose();
  };
  const fieldErr = error === 'reasonRequired';
  return (
    <Dialog title={title} onClose={onClose} footer={<>
      <button type="button" className="btn" onClick={onClose}>{t.cancel}</button>
      <button type="button" className={`btn ${danger ? 'adm-danger' : 'primary'}`} onClick={submit}>{confirmLabel}</button>
    </>}>
      <div className="adm-scope">{scope}</div>
      {children}
      <div className="field wide">
        <label htmlFor="adm-reason">{reasonLabel ?? t.reason}</label>
        <textarea id="adm-reason" className="input" value={reason} onChange={(e) => { setReason(e.target.value); if (fieldErr) setError(null); }}
          aria-invalid={fieldErr || undefined} aria-describedby={fieldErr ? 'adm-reason-err' : 'adm-reason-hint'} />
        {fieldErr ? <span className="error" id="adm-reason-err" role="alert">{ERR.reasonRequired[lang]}</span>
          : <span className="hint" id="adm-reason-hint">{t.reasonHint}</span>}
      </div>
      {error && !fieldErr && <Alert tone="danger">{ERR[error][lang]}</Alert>}
    </Dialog>
  );
}

/* ---------- No permission: explains what is allowed, loads no data ---------- */

export function NoAccess({ t, lang, role, section }: { t: Strings; lang: Lang; role: RoleId; section: Section }) {
  const allowed = allowedSections(role);
  return (
    <section className="card adm-noaccess" aria-labelledby="noaccess-h">
      <div className="card-body">
        <div className="adm-noaccess-head"><Icon name="lock" size={28} /><h1 id="noaccess-h">{t.noAccessTitle}</h1></div>
        <p>{t.noAccessBody(SECTION_LABEL[section][lang], ROLE_LABEL[role][lang])}</p>
        <p className="strong">{t.noAccessCan}</p>
        <ul className="adm-allowed">
          {allowed.map((s) => <li key={s}><a className="chip" href={href(s === 'overview' ? '' : `/${s}`)}>{SECTION_LABEL[s][lang]}</a></li>)}
        </ul>
        <p className="muted small">{t.noAccessAsk}</p>
      </div>
    </section>
  );
}

/** Inline note that a control is unavailable to the current role (instead of a silently missing button). */
export function Locked({ children }: { children: ReactNode }) {
  return <p className="adm-locked small"><Icon name="lock" size={16} /><span>{children}</span></p>;
}

export function NotFound({ t, back, backLabel }: { t: Strings; back: string; backLabel: string }) {
  return (
    <>
      <a className="back" href={back}>{t.backTo(backLabel)}</a>
      <div className="card"><div className="card-body"><h1>{t.notFound}</h1><p className="muted">{t.notFoundBody}</p></div></div>
    </>
  );
}

export function AsOf({ t, lang, at }: { t: Strings; lang: Lang; at: string | number }) {
  return <span className="adm-asof"><Icon name="clock" size={16} />{t.dataAsOf} <bdi>{fmtDateTime(at, lang)}</bdi> ({t.riyadh})</span>;
}

/** Update the URL query in place (no history entry per keystroke). */
export function setQuery(path: string, route: Route, patch: Record<string, string | undefined>) {
  const q: Record<string, string | undefined> = {};
  route.query.forEach((v, k) => { q[k] = v; });
  Object.assign(q, patch);
  replace(href(path, q));
}
export function withQuery(path: string, route: Route, patch: Record<string, string | undefined>) {
  const q: Record<string, string | undefined> = {};
  route.query.forEach((v, k) => { q[k] = v; });
  Object.assign(q, patch);
  return href(path, q);
}
