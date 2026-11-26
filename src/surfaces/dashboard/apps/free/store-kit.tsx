// Shared parts of the store-facing free apps' settings screens: a draft kept for the session (leaving and coming back
// restores it), the save with SaveBar + leave protection + activity log, the store preview frame and the results tiles.
import { useEffect, useState, type ReactNode } from 'react';
import { createStore } from '../../../../core/store';
import { logAction } from '../../../merchant/stores';
import { settingsStore } from '../../../merchant/stores';
import { Card, CardHeader, ErrorState, InfoHint, Skeleton, cn, useTx } from '../../../../ds/ui';
import { Input, SaveBar, Simulated, useToast } from '../../../../ds/kit';
import { useUnsaved } from '../../unsaved';
import { setDashState, useDashState } from '../../review';
import { freeAppById, freeAppsStore, saveAppSettings, type FreeAppId } from './registry';
import { settingsOf } from './store-runtime';

const draftsStore = createStore.key('dashboard.freeApps.storeDrafts')<Partial<Record<FreeAppId, Record<string, unknown>>>>(() => ({}));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Saved settings, the session draft over them, dirty state and save/discard. Problems block the save. */
export function useAppDraft<T extends object>(id: FreeAppId, defaults: T, problems: (d: T) => string[]) {
  const tx = useTx();
  const toast = useToast();
  const saved = settingsOf(freeAppsStore.use(), id, defaults);
  const stored = draftsStore.use()[id] as T | undefined;
  const draft: T = stored ? { ...saved, ...stored } : saved;
  const dirty = !!stored && !same(draft, saved);
  const app = freeAppById(id)!;
  useUnsaved(dirty, { ar: `إعدادات «${app.name.ar}»`, en: `“${app.name.en}” settings` });
  const set = (patch: Partial<T>) => draftsStore.set((x) => ({ ...x, [id]: { ...draft, ...patch } }));
  const discard = () => draftsStore.set((x) => { const n = { ...x }; delete n[id]; return n; });
  const errs = problems(draft);
  const save = () => {
    if (errs.length) return false;
    saveAppSettings(id, draft as Record<string, unknown>);
    discard();
    logAction('apps', { ar: `حفظ إعدادات «${app.name.ar}»`, en: `Saved “${app.name.en}” settings` }, { target: id });
    toast({ tone: 'ok', text: tx('حُفظت الإعدادات وتظهر في المتجر الآن.', 'Saved. It shows in the store now.') });
    return true;
  };
  return { saved, draft, set, dirty, discard, save, errs };
}

/** The bar at the bottom: unsaved state, the first problem, save and discard. */
export function AppSaveBar({ d, error }: { d: { dirty: boolean; errs: string[]; save: () => boolean; discard: () => void }; error?: string }) {
  return <SaveBar dirty={d.dirty} error={d.dirty && d.errs.length ? error : undefined} onSave={d.save} onDiscard={d.discard} />;
}

/** Loading / error states the review bar can force; the live page otherwise. */
export function AppStates({ children }: { children: ReactNode }) {
  const tx = useTx();
  const st = useDashState();
  if (st === 'loading') return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]" role="status" aria-label={tx('جارٍ التحميل', 'Loading')}><div className="space-y-4"><Skeleton className="h-28 w-full rounded-2xl" /><Skeleton className="h-72 w-full rounded-2xl" /></div><Skeleton className="h-96 w-full rounded-2xl" /></div>;
  if (st === 'error') return <Card><ErrorState title={tx('تعذّر تحميل إعدادات التطبيق', 'Couldn’t load the app’s settings')} onRetry={() => setDashState('live')}>{tx('إعداداتك محفوظة. أعد المحاولة.', 'Your settings are safe. Try again.')}</ErrorState></Card>;
  return <>{children}</>;
}

/** Settings on the start side, a sticky live preview on the end side (stacked on phones). */
export function AppLayout({ results, settings, preview }: { results: ReactNode; settings: ReactNode; preview: ReactNode }) {
  return (
    <AppStates>
      <div className="space-y-4">
        {results}
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0 space-y-4">{settings}</div>
          <div className="min-w-0 lg:sticky lg:top-20">{preview}</div>
        </div>
      </div>
    </AppStates>
  );
}

/** A small mock of the merchant's store page around the preview. */
export function PreviewFrame({ children, note, page }: { children: ReactNode; note?: ReactNode; page?: string }) {
  const tx = useTx();
  const name = settingsStore.use().store.name;
  return (
    <Card aria-labelledby="pv-h" className="overflow-hidden">
      <CardHeader id="pv-h" title={tx('كيف يظهر في متجرك', 'How it looks in your store')} hint={note ? <InfoHint>{note}</InfoHint> : undefined} />
      <div className="px-4 pb-4">
        <div className="overflow-hidden rounded-xl border border-border bg-bg">
          <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-2 text-[11px] text-muted">
            <span className="flex gap-1" aria-hidden="true"><i className="size-2 rounded-full bg-border" /><i className="size-2 rounded-full bg-border" /><i className="size-2 rounded-full bg-border" /></span>
            <span className="truncate font-semibold text-fg">{name}</span>{page && <span className="truncate">· {page}</span>}
          </div>
          <div className="relative min-h-56 p-3">{children}</div>
        </div>
      </div>
    </Card>
  );
}

export interface Stat { label: string; value: ReactNode; hint?: string; sim?: boolean }
/** The results card: a few tiles from real data, simulated ones marked. */
export function Results({ items, empty, title }: { items: Stat[]; empty?: ReactNode; title?: string }) {
  const tx = useTx();
  return (
    <Card aria-labelledby="res-h">
      <CardHeader id="res-h" title={title ?? tx('النتائج', 'Results')} hint={<InfoHint>{tx('من بيانات متجرك الفعلية. المعلَّم «محاكاة» يُحسب من زيارات هذه الجلسة فقط.', 'From your store’s real data. Items marked “Simulated” count this session’s visits only.')}</InfoHint>} />
      {empty ? <div className="px-5 pb-5 text-sm text-muted">{empty}</div> : (
        <dl className="grid grid-cols-2 gap-3 px-5 pb-5 lg:grid-cols-4">
          {items.map((s) => (
            <div key={s.label} className="rounded-xl bg-surface-2 p-3">
              <dt className="flex items-center gap-1 text-xs text-muted">{s.label}{s.hint && <InfoHint>{s.hint}</InfoHint>}</dt>
              <dd className={cn('mt-1 flex flex-wrap items-center gap-2 text-lg font-semibold tabular-nums text-fg')}>{s.value}{s.sim && <Simulated />}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

/** Arabic digits accepted for numeric inputs; NaN when not a whole number. */
export const num = (s: string) => { const t = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).trim(); return /^\d+$/.test(t) ? Number(t) : Number.NaN; };

/** A whole-number input that keeps what is typed (Arabic digits accepted) and reports the number, NaN while invalid. */
export function NumInput({ value, onChange, ...p }: { value: number; onChange: (n: number) => void; id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string; className?: string }) {
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : '');
  useEffect(() => { if (num(text) !== value && Number.isFinite(value)) setText(String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Input {...p} inputMode="numeric" dir="ltr" value={text} onChange={(e) => { setText(e.target.value); onChange(num(e.target.value)); }} />;
}
