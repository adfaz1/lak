// Local UI helpers for the merchant workspace (built here rather than in core, per the brief).
import { useEffect, useRef, type ReactNode } from 'react';
import { useLang, type L } from '../../core/lang';
import { link, replace } from '../../core/router';
import { Badge, Money, type Tone } from '../../core/ui';
import { canSee, type Page, type Role } from './perms';
import { testStore } from './stores';

/** Inline bilingual string: every visible string is written in Arabic and English at the point of use. */
export function useTx() {
  const { lang } = useLang();
  return (ar: string, en: string) => (lang === 'ar' ? ar : en);
}
export function useL() {
  const { lang } = useLang();
  return (l: L) => l[lang];
}

export const mhref = (path: string, q?: Record<string, string | undefined>) => link(`/merchant${path ? `/${path.replace(/^\//, '')}` : ''}`, q);
/** Update the query without a history entry (typing in search boxes). */
export const mreplace = (path: string, q: Record<string, string | undefined>) => replace(mhref(path, q));

export const useRole = (): Role => testStore.use().role;

const ICONS: Record<string, string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  orders: 'M6 3h12l1 4H5zM5 7h14v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM9 11h6',
  products: 'M12 3l8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10',
  inventory: 'M3 9l9-5 9 5v11H3zM7 20v-7h10v7M7 16h10',
  customers: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0-1-5.8M22 20a6 6 0 0 0-4-5.6',
  analytics: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  finance: 'M3 7h18v12H3zM3 11h18M7 15h3',
  marketing: 'M4 10v4l11 5V5zM15 9a3 3 0 0 1 0 6M7 14l1 6h3l-1-5',
  automations: 'M13 2L4 14h7l-1 8 9-12h-7z',
  store: 'M4 4h16l-1 5H5zM5 9v11h14V9M10 20v-6h4v6',
  market: 'M3 6h18l-2 9H6zM6 15l-1 4h14M9 21h.01M17 21h.01',
  app: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2',
  apps: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .3-1.5-1.5L17 5l-3-1-1 2h-2L10 4 7 5l.5 1.8L6 8.3 4 8l-1 3 2 1v0l-2 1 1 3 2-.3 1.5 1.5L7 19l3 1 1-2h2l1 2 3-1-.5-1.8 1.5-1.5 2 .3 1-3z',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5L20 7',
  alert: 'M12 3l10 18H2zM12 10v4M12 17.5v.01',
  plus: 'M12 5v14M5 12h14',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  evidence: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z',
  flask: 'M9 3h6M10 3v6L4 19a1 1 0 0 0 .9 1.5h14.2A1 1 0 0 0 20 19l-6-10V3',
  team: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
};
export type IconName = keyof typeof ICONS;
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="m-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={ICONS[name]} />
    </svg>
  );
}

/** Explains a refusal without showing any of the data behind it (QA10). Rendered instead of the page. */
export function NoAccess({ what }: { what: string }) {
  const tx = useTx();
  const role = useRole();
  const roleName = ROLE_NAMES[role];
  return (
    <section className="card m-noaccess" aria-labelledby="noaccess-h">
      <div className="card-body">
        <span className="m-noaccess-icon"><Icon name="lock" size={24} /></span>
        <h1 id="noaccess-h">{tx('لا تملك صلاحية لهذه الصفحة', 'You don’t have access to this page')}</h1>
        <p>{tx(`دورك الحالي «${roleName.ar}» لا يشمل ${what}. لم تُحمَّل أي بيانات من هذه الصفحة.`, `Your current role, “${roleName.en}”, doesn’t include ${what}. No data from this page was loaded.`)}</p>
        <p className="muted">{tx('إن احتجت الوصول، اطلبه من مالك المتجر من الإعدادات ← الفريق والصلاحيات. هذا ليس قيدًا في الباقة.', 'If you need access, ask the store owner (Settings → Team & permissions). This is not a plan limit.')}</p>
        <a className="btn" href={mhref('')}>{tx('العودة إلى الرئيسية', 'Back to home')}</a>
      </div>
    </section>
  );
}

export const ROLE_NAMES: Record<Role, L> = {
  owner: { ar: 'المالك', en: 'Owner' },
  fulfilment: { ar: 'موظف تجهيز', en: 'Fulfilment staff' },
  finance: { ar: 'مسؤول مالي', en: 'Finance' },
  marketing: { ar: 'مسوّق', en: 'Marketing' },
};

/** Inline refusal for one action on a page the role can see. */
export function ActionLocked({ children }: { children: ReactNode }) {
  return <p className="m-locked"><Icon name="lock" size={16} /> <span>{children}</span></p>;
}

export const allowed = (role: Role, page: Page) => canSee(role, page);

export interface Col<T> { key: string; head: ReactNode; cell: (r: T) => ReactNode; end?: boolean; srHead?: boolean }
/** Desktop table plus a mobile row summary (no squeezed tables on phones). */
export function DataTable<T>({ label, cols, rows, rowKey, mobile, empty }: { label: string; cols: Col<T>[]; rows: T[]; rowKey: (r: T) => string; mobile: (r: T) => ReactNode; empty?: ReactNode }) {
  return (
    <>
      <div className="table-wrap m-desktop">
        <table aria-label={label}>
          <thead><tr>{cols.map((c) => <th key={c.key} scope="col" className={c.end ? 'end' : undefined}>{c.srHead ? <span className="sr">{c.head}</span> : c.head}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={rowKey(r)}>{cols.map((c) => <td key={c.key} className={c.end ? 'end' : undefined}>{c.cell(r)}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <ul className="m-rows m-mobile" aria-label={label}>
        {rows.map((r) => <li key={rowKey(r)} className="m-rowcard">{mobile(r)}</li>)}
      </ul>
      {rows.length === 0 && empty}
    </>
  );
}

export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="m-progress-wrap">
      <div className="m-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
        <span style={{ inlineSize: `${pct}%` }} />
      </div>
      <span className="small muted"><bdi>{value}</bdi> / <bdi>{max}</bdi></span>
    </div>
  );
}

export function Pager({ page, pages, hrefFor }: { page: number; pages: number; hrefFor: (p: number) => string }) {
  const tx = useTx();
  if (pages <= 1) return null;
  return (
    <nav className="m-pager" aria-label={tx('الصفحات', 'Pages')}>
      {page > 1 ? <a className="btn small" href={hrefFor(page - 1)}>{tx('السابق', 'Previous')}</a> : <span className="btn small m-disabled" aria-disabled="true">{tx('السابق', 'Previous')}</span>}
      <span className="small">{tx(`صفحة ${page} من ${pages}`, `Page ${page} of ${pages}`)}</span>
      {page < pages ? <a className="btn small" href={hrefFor(page + 1)}>{tx('التالي', 'Next')}</a> : <span className="btn small m-disabled" aria-disabled="true">{tx('التالي', 'Next')}</span>}
    </nav>
  );
}

export function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return <dl className="m-kv">{rows.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

export function Steps({ steps, current, label }: { steps: string[]; current: number; label: string }) {
  return (
    <ol className="m-steps" aria-label={label}>
      {steps.map((s, i) => <li key={s} aria-current={i === current ? 'step' : undefined} className={i < current ? 'done' : undefined}><span className="m-step-n">{i < current ? <Icon name="check" size={14} /> : i + 1}</span><span>{s}</span></li>)}
    </ol>
  );
}

export function Toggle({ id, checked, onChange, label, disabled }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className="check m-toggle" htmlFor={id}>
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function StateBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <Badge tone={tone}>{children}</Badge>;
}

export function Delta({ v, goodWhenUp = true }: { v: number | null; goodWhenUp?: boolean }) {
  const tx = useTx();
  if (v === null) return <span className="muted small">{tx('لا مقارنة عادلة', 'No fair comparison')}</span>;
  const up = v > 0;
  const good = v === 0 ? null : up === goodWhenUp;
  return (
    <span className={`m-delta ${good === null ? '' : good ? 'good' : 'bad'}`}>
      <Icon name={up ? 'up' : 'down'} size={14} /><bdi dir="ltr">{up ? '+' : ''}{v}%</bdi>
      <span className="sr">{good === null ? '' : good ? tx('تحسن', 'better') : tx('تراجع', 'worse')}</span>
    </span>
  );
}

export { Money };

export function downloadText(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Block in-app link navigation (and reload/close) while there are unsaved edits. */
export function useLeaveGuard(dirty: boolean, onBlocked: (href: string) => void) {
  const cb = useRef(onBlocked);
  cb.current = onBlocked;
  useEffect(() => {
    if (!dirty) return;
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a');
      const href = a?.getAttribute('href');
      if (!a || !href || !href.startsWith('#/') || a.hasAttribute('data-leave-ok') || e.defaultPrevented) return;
      e.preventDefault();
      cb.current(href);
    };
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    document.addEventListener('click', click, true);
    window.addEventListener('beforeunload', unload);
    return () => { document.removeEventListener('click', click, true); window.removeEventListener('beforeunload', unload); };
  }, [dirty]);
}

export function Sec({ id, title, actions, children, className }: { id: string; title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className ?? ''}`} aria-labelledby={id}>
      <div className="card-head"><h2 id={id}>{title}</h2>{actions}</div>
      <div className="card-body">{children}</div>
    </section>
  );
}

/** Small "what this means" text kept next to a figure. */
export function Def({ children }: { children: ReactNode }) {
  return <span className="m-def">{children}</span>;
}
