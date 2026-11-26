// Shared pieces of the WhatsApp, Google, accounting, currency and QR app screens: a settings form kept as a session
// draft (leaving and returning restores it), registered with the leave guard, saved with a short simulated delay and
// logged; result tiles; and the loading / error states.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { L } from '../../../merchant/domain';
import { logAction } from '../../../merchant/stores';
import { useSessionDraft } from '../../settings/drafts';
import { useUnsaved } from '../../unsaved';
import { setDashState, useDashState } from '../../review';
import { Card, ErrorState, InfoHint, Skeleton, cn, useTx } from '../../../../ds/ui';
import { Switch, useToast } from '../../../../ds/kit';
import { saveAppSettings, type FreeAppId } from './registry';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Settings form for one app. `base` is the saved value; `draft` the edited one (session draft until saved).
 * `commit(next, what, apply?)` writes the app settings, logs `what` with who and when, clears the draft and toasts.
 */
export function useAppForm<T extends Record<string, unknown>>(id: FreeAppId, base: T, label: L) {
  const tx = useTx();
  const toast = useToast();
  const [draft, setDraft, clear] = useSessionDraft<T>(`freeApp.${id}`, base);
  const dirty = !same(draft, base);
  useUnsaved(dirty, label);
  const [saving, setSaving] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const set = (patch: Partial<T>) => setDraft({ ...draft, ...patch });
  /** `apply` replaces the default write (app settings) when the form spans more than one store. */
  const commit = (next: T, what: L, apply?: (next: T) => void) => {
    setSaving(true);
    window.setTimeout(() => {
      if (!alive.current) return;
      setSaving(false);
      if (apply) apply(next); else saveAppSettings(id, next);
      logAction('apps', what, { target: id });
      clear();
      toast({ tone: 'ok', text: tx('حُفظت الإعدادات', 'Settings saved') });
    }, 400);
  };
  return { draft, set, setDraft, dirty, saving, discard: clear, commit };
}

/** A result figure with an optional definition behind an info hint. */
export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 p-3">
      <dt className="flex items-center gap-1 text-xs text-muted">{label}{hint && <InfoHint>{hint}</InfoHint>}</dt>
      <dd className={cn('mt-1 text-lg font-semibold tabular-nums text-fg', tone === 'ok' && 'text-emerald-700 dark:text-emerald-300', tone === 'bad' && 'text-red-700 dark:text-red-400')}>{value}</dd>
    </div>
  );
}
export const Stats = ({ children }: { children: ReactNode }) => <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</dl>;

/** Review-mode states for an app screen; renders children when live. */
export function AppStates({ children }: { children: ReactNode }) {
  const tx = useTx();
  const st = useDashState();
  if (st === 'loading') return <div className="space-y-4" aria-busy="true"><Skeleton className="h-28 w-full rounded-2xl" /><Skeleton className="h-64 w-full rounded-2xl" /></div>;
  if (st === 'error') return <Card><ErrorState title={tx('تعذّر تحميل إعدادات التطبيق', 'Couldn’t load the app settings')} onRetry={() => setDashState('live')}>{tx('لم يتغير شيء. أعد المحاولة.', 'Nothing changed. Try again.')}</ErrorState></Card>;
  return <>{children}</>;
}

/** Arabic or Latin digits to a number; NaN when not a number. */
export const num = (s: string) => Number(s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)));
export const HOURS = Array.from({ length: 24 }, (_, h) => h);
export const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** A switch with its label shown as text (clicking the text toggles it). */
export function LabeledSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-3 text-sm text-fg">
      <Switch checked={checked} onChange={onChange} label={label} />
      <span>{label}</span>
    </label>
  );
}
