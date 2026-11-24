// Shared pieces of the settings pages: frame with category navigation, honest save, leave protection,
// review-only tools (role preview, failing save) and the no-permission state.
import { discardUnsaved, useUnsaved } from '../unsaved';
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Bell, CreditCard, FileText, Globe2, Languages, Lock, ShoppingCart, Store, Truck, Users, FlaskConical, UserCircle, BadgeCheck, ListTree, ReceiptText, FileSpreadsheet } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, navigate, useRoute } from '../../../core/router';
import { useReviewMode } from '../../../core/review';
import { testStore } from '../../merchant/stores';
import { ROLES, type Role } from '../../merchant/perms';
import { Button, Card, EmptyState, ErrorState, Segmented, Skeleton, cn, useTx } from '../../../ds/ui';
import { Modal, PageHeader, Switch, useToast } from '../../../ds/kit';
import { setDashState } from '../review';
import { CATEGORIES, ROLE_LABEL, canOpen, rolesFor, type CatId } from './model';
import { settingsSimStore } from './stores';

export const ICON: Record<CatId, ComponentType<{ className?: string }>> = {
  store: Store, team: Users, payments: CreditCard, shipping: Truck, checkout: ShoppingCart, domains: Globe2, policies: FileText, notifications: Bell, language: Languages, account: UserCircle, verification: BadgeCheck, 'order-statuses': ListTree, invoice: ReceiptText, exports: FileSpreadsheet,
};
export const settingsHref = (cat?: string, q?: Record<string, string | undefined>) => link(`/dashboard/settings${cat ? `/${cat}` : ''}`, q);

/** Category page frame: back link, title, side navigation on desktop. */
/** Pages that need the full width (live document preview beside the form). */
const WIDE: CatId[] = ['invoice'];
export function Frame({ cat, actions, children, meta }: { cat: CatId; actions?: ReactNode; children: ReactNode; meta?: ReactNode }) {
  const tx = useTx();
  const { lang } = useLang();
  const role = testStore.use().role;
  const c = CATEGORIES.find((x) => x.id === cat)!;
  useFocusSection();
  return (
    <div className="space-y-6">
      <ReviewTools />
      <PageHeader back={{ href: settingsHref(), label: tx('الإعدادات', 'Settings') }} title={c.title[lang]} description={c.desc[lang]} actions={actions} meta={meta} />
      <div className={cn('grid grid-cols-1 gap-6', WIDE.includes(cat) ? '2xl:grid-cols-[220px_minmax(0,1fr)]' : 'lg:grid-cols-[220px_minmax(0,1fr)]')}>
        <nav aria-label={tx('أقسام الإعدادات', 'Settings sections')} className={WIDE.includes(cat) ? 'hidden 2xl:block' : 'hidden lg:block'}>
          <ul className="sticky top-24 space-y-0.5">
            {CATEGORIES.map((x) => {
              const I = ICON[x.id];
              const on = x.id === cat;
              return (
                <li key={x.id}>
                  <a href={settingsHref(x.id)} aria-current={on ? 'page' : undefined}
                    className={cn('flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium transition-colors', on ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
                    <I className="size-4 shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{x.title[lang]}</span>
                    {!canOpen(role, x.id) && <Lock className="size-3.5 text-subtle" aria-label={tx('غير متاح لدورك', 'Not in your role')} />}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className={cn('min-w-0 space-y-6', !WIDE.includes(cat) && 'max-w-3xl')}>{children}</div>
      </div>
    </div>
  );
}

/** Refusal that explains the role and who can help, without loading any of the page's data. */
export function NoPermission({ cat }: { cat: CatId }) {
  const tx = useTx();
  const { lang } = useLang();
  const role = testStore.use().role;
  const review = useReviewMode();
  const c = CATEGORIES.find((x) => x.id === cat)!;
  const who = rolesFor(cat).map((r) => ROLE_LABEL[r][lang]).join(tx('، ', ', '));
  return (
    <Card>
      <EmptyState as="h2" icon={<Lock className="size-6" aria-hidden="true" />} title={tx(`«${c.title.ar}» غير متاح لدورك`, `${c.title.en} isn’t part of your role`)}
        action={<>
          <a href={settingsHref()} className="inline-flex h-10 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-fg hover:bg-surface-2">{tx('كل الإعدادات', 'All settings')}</a>
          {review && role !== 'owner' && <Button onClick={() => testStore.set((t) => ({ ...t, role: 'owner' }))}>{tx('عُد إلى معاينة المالك', 'Back to owner preview')}</Button>}
        </>}>
        {tx(`دورك «${ROLE_LABEL[role].ar}». يملك هذه الصلاحية: ${who}. لم يُحمَّل شيء من بيانات الصفحة.`, `Your role is ${ROLE_LABEL[role].en}. Ask: ${who}. None of this page’s data was loaded.`)}
      </EmptyState>
    </Card>
  );
}

/** Review mode only: preview the dashboard as another role and make the next save fail. */
export function ReviewTools() {
  const tx = useTx();
  const { lang } = useLang();
  const review = useReviewMode();
  const role = testStore.use().role;
  const sim = settingsSimStore.use();
  if (!review) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-dashed border-border bg-surface px-4 py-3" role="region" aria-label={tx('أدوات المراجعة', 'Review tools')}>
      <span className="flex items-center gap-1.5 text-xs font-semibold text-muted"><FlaskConical className="size-4" aria-hidden="true" />{tx('معاينة كدور', 'Preview as role')}</span>
      <RolePreview role={role} lang={lang} />
      <label className="ms-auto flex items-center gap-2 text-xs font-medium text-muted">
        <Switch checked={sim.failSave} onChange={(v) => settingsSimStore.set((s) => ({ ...s, failSave: v }))} label={tx('حاكِ فشل الحفظ', 'Simulate a failed save')} />
        {tx('حاكِ فشل الحفظ', 'Simulate a failed save')}
      </label>
    </div>
  );
}
export function RolePreview({ role, lang }: { role: Role; lang: 'ar' | 'en' }) {
  const tx = useTx();
  return <Segmented label={tx('الدور المعروض', 'Previewed role')} value={role} onChange={(r) => testStore.set((t) => ({ ...t, role: r }))} options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r][lang] }))} />;
}

/**
 * Honest save: shows "Saving…" while the (simulated) request runs, writes only on success and keeps the
 * edits with a reference when it fails. A failure stays in the save bar, not only in a toast.
 */
export function useSave() {
  const tx = useTx();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const save = useCallback((commit: () => void, done?: string) => {
    setSaving(true); setError(null);
    window.setTimeout(() => {
      if (!alive.current) return;
      setSaving(false);
      if (settingsSimStore.get().failSave) { setError(tx('تعذّر الحفظ (SIM-SET-503). احتفظنا بتعديلاتك؛ أعد المحاولة.', 'Couldn’t save (SIM-SET-503). Your edits are kept; try again.')); return; }
      commit();
      toast({ tone: 'ok', text: done ?? tx('حُفظت التغييرات', 'Changes saved') });
    }, 600);
  }, [tx, toast]);
  return { saving, error, save, clearError: () => setError(null) };
}

/** Leave protection: links inside the app ask before discarding unsaved edits; closing the tab asks the browser. */
export function LeaveGuard({ dirty }: { dirty: boolean }) {
  const tx = useTx();
  useUnsaved(dirty, { ar: 'تعديلات الإعدادات', en: 'Settings edits' });
  const [to, setTo] = useState<string | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as HTMLElement).closest('a');
      const href = a?.getAttribute('href');
      if (!a || !href?.startsWith('#') || a.target === '_blank' || href === window.location.hash) return;
      e.preventDefault();
      setTo(href);
    };
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    document.addEventListener('click', onClick, true);
    window.addEventListener('beforeunload', onUnload);
    return () => { document.removeEventListener('click', onClick, true); window.removeEventListener('beforeunload', onUnload); };
  }, [dirty]);
  if (!to) return null;
  return (
    <Modal title={tx('المغادرة دون حفظ؟', 'Leave without saving?')} description={tx('ستفقد التغييرات التي لم تحفظها في هذه الصفحة.', 'Unsaved changes on this page will be lost.')} onClose={() => setTo(null)}
      footer={<><Button variant="secondary" onClick={() => setTo(null)}>{tx('تابع التعديل', 'Keep editing')}</Button><Button variant="danger" onClick={() => { const h = to; setTo(null); discardUnsaved(); navigate(h); }}>{tx('تجاهل وغادر', 'Discard and leave')}</Button></>} />
  );
}

/** Loading skeleton shaped like a settings form page. */
export function FormSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
          <Skeleton className="h-4 w-40" />
          <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-10 w-full rounded-xl" /><Skeleton className="h-10 w-full rounded-xl" /></div>
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}
export function PageError({ what }: { what: string }) {
  const tx = useTx();
  return (
    <Card><ErrorState as="h2" title={tx(`تعذّر تحميل ${what}`, `${what} could not load`)} onRetry={() => setDashState('live')}>
      {tx('لم يتغير شيء في إعداداتك. المرجع SIM-SET-500.', 'Nothing changed in your settings. Ref SIM-SET-500.')}
    </ErrorState></Card>
  );
}

/** Card section with a heading row; keeps every settings form the same shape. */
export function Section({ title, hint, action, children, id, flush }: { title: ReactNode; hint?: ReactNode; action?: ReactNode; children: ReactNode; id: string; flush?: boolean }) {
  return (
    <Card aria-labelledby={id}>
      <div className="flex flex-wrap items-center gap-3 px-5 pt-5 pb-3">
        <h2 id={id} className="flex min-w-0 flex-1 items-center gap-1.5 text-[15px] font-semibold text-fg">{title}{hint}</h2>
        {action}
      </div>
      <div className={flush ? 'pb-2' : 'px-5 pb-5'}>{children}</div>
    </Card>
  );
}

/**
 * `?focus=<section id>` (from a global-search hit on a setting) scrolls to that section once it has rendered and
 * outlines it briefly, so «الشراء كضيف» lands on the guest-checkout switch, not the top of the page.
 */
function useFocusSection() {
  const focus = useRoute().query.get('focus');
  useEffect(() => {
    if (!focus) return;
    let tries = 0;
    const t = window.setInterval(() => {
      const el = document.getElementById(focus)?.closest('section, [aria-labelledby]') as HTMLElement | null;
      if (!el && ++tries < 20) return;
      window.clearInterval(t);
      if (!el) return;
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      el.classList.add('ring-2', 'ring-brand-400');
      window.setTimeout(() => el.classList.remove('ring-2', 'ring-brand-400'), 2200);
    }, 100);
    return () => window.clearInterval(t);
  }, [focus]);
}
