// Review mode for the dashboard: forces a screen state so loading / empty / error can be inspected.
// Only rendered when core review mode is on (`?review=1`); the product view never shows it.
import { createStore } from '../../core/store';
import { useReviewMode } from '../../core/review';
import { link } from '../../core/router';
import { Segmented, useTx } from '../../ds/ui';

export type DashState = 'live' | 'loading' | 'empty' | 'error';
const stateStore = createStore.key('dashboard.reviewState')<DashState>(() => 'live');
export const setDashState = (s: DashState) => stateStore.set(s);
/** The state a page should render: always live outside review mode. */
export function useDashState(): DashState {
  const s = stateStore.use();
  return useReviewMode() ? s : 'live';
}

export function ReviewBar() {
  const tx = useTx();
  const on = useReviewMode();
  const s = stateStore.use();
  if (!on) return null;
  return (
    <div className="lak fixed bottom-4 start-4 z-50 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-border bg-surface p-2 shadow-pop" style={{ minHeight: 0 }} role="region" aria-label={tx('وضع المراجعة', 'Review mode')}>
      <span className="px-2 text-xs font-semibold text-muted">{tx('وضع المراجعة', 'Review mode')}</span>
      <Segmented label={tx('حالة الشاشة', 'Screen state')} value={s} onChange={setDashState}
        options={[{ value: 'live', label: tx('بيانات', 'Data') }, { value: 'loading', label: tx('تحميل', 'Loading') }, { value: 'empty', label: tx('فارغ', 'Empty') }, { value: 'error', label: tx('خطأ', 'Error') }]} />
      <a href={link('/dashboard', { review: '0' })} className="px-2 text-xs font-semibold text-brand-700 hover:underline">{tx('إنهاء المراجعة', 'Exit review')}</a>
    </div>
  );
}
