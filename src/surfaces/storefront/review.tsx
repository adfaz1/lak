// Review mode for the storefront (`?review=1`): forced screen states and the simulation switches for payment and
// stock. Shoppers never see any of this; outside review mode payments succeed and Apple Pay follows the real device.
import { useState } from 'react';
import { FlaskConical, X } from 'lucide-react';
import { createStore } from '../../core/store';
import { useReviewMode } from '../../core/review';
import { link } from '../../core/router';
import { Button, Segmented, cn, useTx } from '../../ds/ui';
import { Select } from '../../ds/kit';
import type { Outcome } from './domain';
import { cartStore, catalogStore, sellOutFirstInBag, testStore, type TestState } from './state';
import { variantById } from './domain';
import { useS } from './kit';

export type SfState = 'live' | 'loading' | 'empty' | 'error';
const sfStateStore = createStore.key('storefront.reviewState')<SfState>(() => 'live');
export const setSfState = (s: SfState) => sfStateStore.set(s);

/** The state a page renders: always live outside review mode. */
export function useSfState(): SfState {
  const s = sfStateStore.use();
  return useReviewMode() ? s : 'live';
}

/** Real Apple Pay availability on this device (Safari exposes ApplePaySession). */
function deviceHasApplePay(): boolean {
  try {
    const w = window as unknown as { ApplePaySession?: { canMakePayments?: () => boolean } };
    return !!w.ApplePaySession?.canMakePayments?.();
  } catch { return false; }
}

/** What the simulated payment provider will do. Only review mode can change it. */
export function useSim(): { applePay: boolean; outcome: Outcome; verify: TestState['verify']; review: boolean } {
  const review = useReviewMode();
  const ts = testStore.use();
  return review ? { applePay: ts.applePay, outcome: ts.outcome, verify: ts.verify, review } : { applePay: deviceHasApplePay(), outcome: 'success', verify: 'paid', review };
}
export function simNow(review: boolean): { outcome: Outcome; verify: TestState['verify'] } {
  const ts = testStore.get();
  return review ? { outcome: ts.outcome, verify: ts.verify } : { outcome: 'success', verify: 'paid' };
}

export function ReviewPanel() {
  const tx = useTx();
  const { t, l } = useS();
  const on = useReviewMode();
  const s = sfStateStore.use();
  const ts = testStore.use();
  const cart = cartStore.use();
  const [msg, setMsg] = useState('');
  if (!on) return null;
  const outcomes: Outcome[] = ['success', 'declined', '3ds', 'timeout'];
  const sellOut = () => {
    const vid = sellOutFirstInBag();
    if (!vid) { setMsg(t.tpSellOutNone); return; }
    const f = variantById(catalogStore.get(), vid);
    setMsg(t.tpSellOutDone(f ? l(f.product.name) : vid));
  };
  return (
    <div className="fixed bottom-3 start-3 z-40 max-w-[calc(100vw-24px)]" role="region" aria-label={tx('وضع المراجعة', 'Review mode')}>
      {!ts.open ? (
        <button type="button" onClick={() => testStore.set((x) => ({ ...x, open: true }))}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-dashed border-border bg-surface px-4 text-xs font-semibold text-muted shadow-pop hover:text-fg">
          <FlaskConical className="size-4" aria-hidden="true" />{tx('وضع المراجعة', 'Review mode')}
        </button>
      ) : (
        <div className="w-[min(92vw,380px)] space-y-3 rounded-2xl border border-dashed border-border bg-surface p-4 text-sm shadow-pop">
          <div className="flex items-center gap-2">
            <FlaskConical className="size-4 text-muted" aria-hidden="true" />
            <p className="flex-1 font-semibold">{tx('وضع المراجعة', 'Review mode')}</p>
            <button type="button" aria-label={t.tpClose} onClick={() => testStore.set((x) => ({ ...x, open: false }))} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2"><X className="size-4" aria-hidden="true" /></button>
          </div>
          <p className="text-xs text-muted">{t.tpSub}</p>
          <Segmented label={tx('حالة الشاشة', 'Screen state')} value={s} onChange={setSfState}
            options={[{ value: 'live', label: tx('بيانات', 'Data') }, { value: 'loading', label: tx('تحميل', 'Loading') }, { value: 'empty', label: tx('فارغ', 'Empty') }, { value: 'error', label: tx('خطأ', 'Error') }]} />
          <label className="flex items-center justify-between gap-3"><span className="text-[13px] font-medium">{t.tpOutcome}</span>
            <Select className="h-9 w-40" value={ts.outcome} onChange={(e) => testStore.set((x) => ({ ...x, outcome: e.target.value as Outcome }))}>
              {outcomes.map((o) => <option key={o} value={o}>{t.outcomes[o]}</option>)}
            </Select>
          </label>
          <label className="flex items-center justify-between gap-3"><span className="text-[13px] font-medium">{t.tpVerify}</span>
            <Select className="h-9 w-40" value={ts.verify} onChange={(e) => testStore.set((x) => ({ ...x, verify: e.target.value as TestState['verify'] }))}>
              {(['paid', 'failed', 'unknown'] as const).map((o) => <option key={o} value={o}>{t.verifyRes[o]}</option>)}
            </Select>
          </label>
          <label className="flex items-center gap-2 text-[13px] font-medium">
            <input type="checkbox" className="size-4 accent-brand-600" checked={ts.applePay} onChange={(e) => testStore.set((x) => ({ ...x, applePay: e.target.checked }))} />{t.tpApple}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={sellOut} disabled={!cart.lines.length}>{t.tpSellOut}</Button>
            <a href={link('/')} className={cn('px-2 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300')}>{tx('كل الواجهات', 'All surfaces')}</a>
            <a href={link('/store', { review: '0' })} className="px-2 text-xs font-semibold text-muted hover:underline">{tx('إنهاء المراجعة', 'Exit review')}</a>
          </div>
          {msg && <p className="text-xs text-muted" role="status">{msg}</p>}
        </div>
      )}
    </div>
  );
}
