// Review mode for the public site: forces a page state (loading / empty / error) for inspection.
// Only active with `?review=1`; the product view never shows it.
import { createStore } from '../../core/store';
import { useReviewMode } from '../../core/review';
import { link } from '../../core/router';
import { Segmented, useTx } from '../../ds/ui';

export type SiteState = 'live' | 'loading' | 'empty' | 'error';
const stateStore = createStore.key('site.reviewState')<SiteState>(() => 'live');
export const setSiteState = (s: SiteState) => stateStore.set(s);
/** The state a page should render: always live outside review mode. */
export function useSiteState(): SiteState {
  const s = stateStore.use();
  return useReviewMode() ? s : 'live';
}

export function SiteReviewBar() {
  const tx = useTx();
  const on = useReviewMode();
  const s = stateStore.use();
  if (!on) return null;
  return (
    <div className="fixed bottom-4 start-4 z-50 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-dashed border-border bg-surface p-2 shadow-pop" role="region" aria-label={tx('وضع المراجعة', 'Review mode')}>
      <span className="px-2 text-xs font-semibold text-muted">{tx('وضع المراجعة', 'Review mode')}</span>
      <Segmented label={tx('حالة الصفحة', 'Page state')} value={s} onChange={setSiteState}
        options={[{ value: 'live', label: tx('بيانات', 'Data') }, { value: 'loading', label: tx('تحميل', 'Loading') }, { value: 'empty', label: tx('فارغ', 'Empty') }, { value: 'error', label: tx('خطأ', 'Error') }]} />
      <a href={link('/')} className="px-2 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('كل الواجهات', 'All surfaces')}</a>
      <a href={link('/site', { review: '0' })} className="px-2 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('إنهاء المراجعة', 'Exit review')}</a>
    </div>
  );
}
