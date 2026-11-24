// Shared pieces for the LAK operations console (P02). Built only from src/ds; no local restyling of primitives.
import { useState, type ReactNode } from 'react';
import { AlertTriangle, Clock, FlaskConical, Lock, SearchX } from 'lucide-react';
import { useLang, type Lang } from '../../core/lang';
import { link, navigate, replace, type Route } from '../../core/router';
import { createStore } from '../../core/store';
import { useReviewMode } from '../../core/review';
import { Alert, Field, Modal, PageHeader, Simulated, Textarea } from '../../ds/kit';
import { Button, Card, EmptyState, ErrorState, LinkButton, Segmented, Skeleton, cn, useTx } from '../../ds/ui';
import { allowedSections, DATA_AS_OF, hasReason, MIN_REASON, type RoleId, type Section } from './domain';
import { ERR, ROLE_LABEL, SECTION_LABEL } from './i18n';
import type { Outcome } from './state';

/* ---------- Links ---------- */

export const ahref = (path = '', q?: Record<string, string | undefined>) => link(`/admin${path ? `/${path}` : ''}`, q);
export const sectionHref = (s: Section, path = '', q?: Record<string, string | undefined>) => ahref([s === 'overview' ? '' : s, path].filter(Boolean).join('/'), q);

/** Patch the current query. `replace` for typing (no history entry per keystroke), `push` otherwise. */
export function useQueryNav(base: string, route: Route) {
  return (patch: Record<string, string | undefined>, how: 'push' | 'replace' = 'push') => {
    const q: Record<string, string | undefined> = {};
    route.query.forEach((v, k) => { q[k] = v; });
    Object.assign(q, { page: undefined }, patch);
    const h = ahref(base, q);
    if (how === 'replace') replace(h); else navigate(h);
  };
}
export function qhref(base: string, route: Route, patch: Record<string, string | undefined>) {
  const q: Record<string, string | undefined> = {};
  route.query.forEach((v, k) => { q[k] = v; });
  Object.assign(q, patch);
  return ahref(base, q);
}

/* ---------- Dates: Riyadh time, Latin digits to match money ---------- */

const loc = (lang: Lang) => (lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB');
export function useFmt() {
  const { lang } = useLang();
  return {
    dt: (v: number | string) => new Intl.DateTimeFormat(loc(lang), { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(v)),
    d: (v: number | string) => new Intl.DateTimeFormat(loc(lang), { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(v)),
    n: (v: number) => v.toLocaleString('en-US'),
  };
}
export const pct = (bp: number) => `${(bp / 100).toFixed(2)}%`;

/* ---------- Review mode: forced screen states ---------- */

export type ViewState = 'live' | 'loading' | 'empty' | 'error';
const stateStore = createStore.key('admin.reviewState')<ViewState>(() => 'live');
export const setViewState = (s: ViewState) => stateStore.set(s);
/** Always "live" in the product view; review mode (`?review=1`) can force loading / empty / error. */
export function useViewState(): ViewState {
  const s = stateStore.use();
  return useReviewMode() ? s : 'live';
}
export function ReviewBar() {
  const tx = useTx();
  const on = useReviewMode();
  const s = stateStore.use();
  if (!on) return null;
  return (
    <div className="lak z-50 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-border bg-surface p-2 shadow-pop" style={{ minHeight: 0, position: 'fixed', bottom: 16, insetInlineStart: 16 }} role="region" aria-label={tx('وضع المراجعة', 'Review mode')}>
      <span className="flex items-center gap-1 px-2 text-xs font-semibold text-muted"><FlaskConical className="size-3.5" aria-hidden="true" />{tx('مراجعة', 'Review')}</span>
      <Segmented label={tx('حالة الشاشة', 'Screen state')} value={s} onChange={setViewState}
        options={[{ value: 'live', label: tx('بيانات', 'Data') }, { value: 'loading', label: tx('تحميل', 'Loading') }, { value: 'empty', label: tx('فارغ', 'Empty') }, { value: 'error', label: tx('خطأ', 'Error') }]} />
      <a href={ahref('', { review: '0' })} className="px-2 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('إنهاء', 'Exit')}</a>
    </div>
  );
}

/* ---------- Page states ---------- */

export function PageSkeleton({ kind = 'table' }: { kind?: 'table' | 'cards' | 'detail' }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      {kind === 'cards' && <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="space-y-3 rounded-2xl border border-border bg-surface p-5"><Skeleton className="h-4 w-24" /><Skeleton className="h-7 w-32" /></div>)}</div>}
      {kind === 'detail' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3"><Skeleton className="h-80 rounded-2xl lg:col-span-2" /><Skeleton className="h-80 rounded-2xl" /></div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface">
          <div className="flex gap-4 border-b border-border px-5 py-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-5 w-16" />)}</div>
          <div className="divide-y divide-border">{Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5"><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/4" /></div><Skeleton className="hidden h-6 w-16 rounded-full md:block" /><Skeleton className="h-4 w-20" /></div>
          ))}</div>
        </div>
      )}
    </div>
  );
}

/** Renders loading / error for a page; returns null when the page should render its data. */
export function StateGate({ state, header, what, refCode, kind }: { state: ViewState; header: ReactNode; what: { ar: string; en: string }; refCode: string; kind?: 'table' | 'cards' | 'detail' }) {
  const tx = useTx();
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<PageSkeleton kind={kind} /></div>;
  if (state === 'error') return (
    <div className="space-y-6">{header}
      <Card><ErrorState as="h2" title={tx(`تعذّر تحميل ${what.ar}`, `${what.en} could not load`)} onRetry={() => setViewState('live')}>
        {tx(`لم يتغير شيء في بيانات التجار. المرجع ${refCode}.`, `Nothing changed in merchant data. Ref ${refCode}.`)}
      </ErrorState></Card>
    </div>
  );
  return null;
}

export function NoResults({ onClear, children }: { onClear: () => void; children?: ReactNode }) {
  const tx = useTx();
  return <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا نتائج تطابق البحث والمرشحات', 'Nothing matches your search and filters')}
    action={<Button variant="secondary" onClick={onClear}>{tx('امسح البحث والمرشحات', 'Clear search and filters')}</Button>}>{children}</EmptyState>;
}

/* ---------- Permission ---------- */

/** Shown instead of a section the role cannot open. No data from the section is read. */
export function NoPermission({ role, section }: { role: RoleId; section: Section }) {
  const tx = useTx();
  const { lang } = useLang();
  const allowed = allowedSections(role);
  return (
    <div className="space-y-6">
      <PageHeader title={SECTION_LABEL[section][lang]} />
      <Card>
        <EmptyState as="h2" icon={<Lock className="size-6" aria-hidden="true" />} title={tx('هذا القسم غير متاح لدورك', 'This section is not available to your role')}
          action={allowed.slice(0, 4).map((s) => <LinkButton key={s} variant="secondary" size="sm" href={sectionHref(s)}>{SECTION_LABEL[s][lang]}</LinkButton>)}>
          {tx(`دور «${ROLE_LABEL[role].ar}» لا يفتح «${SECTION_LABEL[section].ar}». لم تُحمَّل أي بيانات منه.`, `The ${ROLE_LABEL[role].en} role cannot open “${SECTION_LABEL[section].en}”. No data from it was loaded.`)}
        </EmptyState>
      </Card>
    </div>
  );
}

/** A control the role cannot use: says so instead of a silently missing button. */
export function Locked({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('flex items-start gap-1.5 text-xs text-muted', className)}><Lock className="mt-px size-3.5 shrink-0" aria-hidden="true" /><span>{children}</span></p>;
}

export function NotFound({ back, backLabel }: { back: string; backLabel: string }) {
  const tx = useTx();
  return (
    <div className="space-y-6">
      <PageHeader title={tx('غير موجود', 'Not found')} back={{ href: back, label: backLabel }} />
      <Card><EmptyState as="h2" icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('هذا السجل غير موجود', 'This record does not exist')} action={<LinkButton variant="secondary" href={back}>{backLabel}</LinkButton>}>
        {tx('ربما أُعيد ضبط البيانات التجريبية أو الرابط غير صحيح.', 'The demo data may have been reset, or the link is wrong.')}
      </EmptyState></Card>
    </div>
  );
}

export function AsOf() {
  const tx = useTx();
  const f = useFmt();
  return <span className="inline-flex items-center gap-1.5 text-xs text-muted"><Clock className="size-3.5" aria-hidden="true" />{tx('البيانات حتى', 'Data as of')} <bdi>{f.dt(DATA_AS_OF)}</bdi> · {tx('بتوقيت الرياض', 'Riyadh time')}</span>;
}

/* ---------- Consequential actions ---------- */

/** The standing safety line inside every merchant-affecting dialog. */
export function SimNote() {
  const tx = useTx();
  return (
    <div className="flex items-start gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-xs text-muted">
      <Simulated /><span className="flex-1">{tx('محاكاة على بيانات تجريبية. لا يتأثر أي تاجر أو متجر أو مبلغ حقيقي، ولا يُرسل أي إشعار.', 'Simulation on demo data. No real merchant, store or money is affected, and no notification is sent.')}</span>
    </div>
  );
}

export interface ImpactItem { icon: ReactNode; text: ReactNode; tone?: 'warn' | 'safe' }
export function ImpactList({ title, items }: { title?: string; items: ImpactItem[] }) {
  const tx = useTx();
  return (
    <div>
      <p className="mb-2 text-[13px] font-semibold text-fg">{title ?? tx('ماذا سيحدث', 'What will happen')}</p>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className={cn('flex items-start gap-2.5 rounded-xl px-3 py-2 text-sm', it.tone === 'safe' ? 'bg-emerald-500/8 text-emerald-900 dark:text-emerald-200' : it.tone === 'warn' ? 'bg-amber-500/8 text-amber-900 dark:text-amber-200' : 'bg-surface-2 text-fg')}>
            <span className="mt-0.5 shrink-0 [&>svg]:size-4" aria-hidden="true">{it.icon}</span><span className="min-w-0 flex-1">{it.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Confirmation for an action with consequences: target, impact, mandatory reason (logged), a specific verb.
 * `onConfirm` returns a domain error code or null.
 */
export function ReasonModal({ title, target, children, confirmLabel, danger, optional, reasonLabel, onConfirm, onClose, size }: {
  title: string; target: ReactNode; children?: ReactNode; confirmLabel: string; danger?: boolean; optional?: boolean; reasonLabel?: string;
  onConfirm: (reason: string) => Outcome; onClose: () => void; size?: 'md' | 'lg';
}) {
  const tx = useTx();
  const { lang } = useLang();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<Outcome>(null);
  const submit = () => {
    if (!optional && !hasReason(reason)) { setErr('reasonRequired'); return; }
    const e = onConfirm(reason);
    if (e) setErr(e); else onClose();
  };
  const left = Math.max(0, MIN_REASON - reason.trim().length);
  return (
    <Modal title={title} size={size} onClose={onClose} footer={<>
      <Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button>
      <Button variant={danger ? 'danger' : 'primary'} onClick={submit}>{confirmLabel}</Button>
    </>}>
      <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">{target}</div>
      {children}
      <Field label={reasonLabel ?? (optional ? tx('ملاحظة (تُحفظ في السجل)', 'Note (saved to the audit log)') : tx('السبب (يُحفظ في السجل)', 'Reason (saved to the audit log)'))} optional={optional}
        error={err === 'reasonRequired' ? ERR.reasonRequired[lang] : null}
        hint={!optional && left > 0 ? tx(`${left} أحرف أخرى على الأقل`, `${left} more characters at least`) : undefined}>
        {(p) => <Textarea {...p} value={reason} onChange={(e) => { setReason(e.target.value); if (err === 'reasonRequired') setErr(null); }} />}
      </Field>
      {err && err !== 'reasonRequired' && <Alert tone="bad">{ERR[err][lang]}</Alert>}
      <SimNote />
    </Modal>
  );
}

/* ---------- Small layout helpers ---------- */

export function Facts({ items, cols = 2 }: { items: { label: ReactNode; value: ReactNode }[]; cols?: 2 | 3 }) {
  return (
    <dl className={cn('grid gap-3', cols === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2')}>
      {items.map((it, i) => <div key={i} className="min-w-0 rounded-xl bg-surface-2 px-3 py-2.5"><dt className="text-xs text-muted">{it.label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-fg">{it.value}</dd></div>)}
    </dl>
  );
}

export function Timeline({ items, empty }: { items: { key: string; when: string; title: ReactNode; meta?: ReactNode; note?: string }[]; empty?: ReactNode }) {
  if (items.length === 0) return <p className="px-5 pb-5 text-sm text-muted">{empty}</p>;
  return (
    <ol className="space-y-0 px-5 pb-5">
      {items.map((e, i) => (
        <li key={e.key} className="relative flex gap-3 pb-4 last:pb-0">
          {i < items.length - 1 && <span className="absolute top-3 bottom-0 start-[5px] w-px bg-border" aria-hidden="true" />}
          <span className="mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-brand-500 bg-surface" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">{e.title}</p>
            <p className="text-xs text-muted">{e.when}{e.meta && <> · {e.meta}</>}</p>
            {e.note && <p className="mt-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[13px] text-muted">«{e.note}»</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Horizontal share bars (the home page's channel bars), with exact values in text. */
export function Bars({ rows }: { rows: { key: string; label: ReactNode; value: ReactNode; pct: number }[] }) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-center justify-between gap-3 text-[13px]"><span className="min-w-0 truncate font-medium text-fg">{r.label}</span><span className="shrink-0 tabular-nums text-muted">{r.value}</span></div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand-gradient" style={{ width: `${Math.max(2, Math.min(100, r.pct))}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function Stat({ label, hint, value, sub, icon, tint }: { label: string; hint?: ReactNode; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tint?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1 text-[13px] font-medium text-muted">{label}{hint}</p>
        {icon && <span className={cn('hidden size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-b to-transparent sm:grid [&>svg]:size-5', tint)} aria-hidden="true">{icon}</span>}
      </div>
      <p className="mt-1 text-xl font-bold tracking-tight text-fg tabular-nums sm:text-2xl">{value}</p>
      {sub && <p className="mt-1.5 text-xs text-subtle">{sub}</p>}
    </div>
  );
}

export function WarnIcon() { return <AlertTriangle className="size-4" aria-hidden="true" />; }
