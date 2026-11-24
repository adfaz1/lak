// Reviews and answered questions as shoppers see them on a product page. Used by the online store's product page
// and by the moderation screen's preview, so both always show the same thing. Reads the merchant's stores.
import { MessageCircleReply, Star } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { reviewSettingsStore, reviewsStore } from '../../merchant/stores';
import { storeReviews, type Review, type ReviewSettings } from '../../merchant/growth';
import { cn, useTx } from '../../../ds/ui';

export function Stars({ n, size = 'size-4' }: { n: number; size?: string }) {
  const tx = useTx();
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={tx(`${n} من 5`, `${n} out of 5`)}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cn(size, i <= n ? 'fill-amber-400 text-amber-400' : 'text-border')} aria-hidden="true" />)}
    </span>
  );
}

/** One entry as published: masked name, stars, text and the store's reply. */
export function PublicEntry({ r, store }: { r: Review; store: string }) {
  const tx = useTx();
  const { lang } = useLang();
  return (
    <li className="space-y-2 py-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {r.rating !== undefined && <Stars n={r.rating} />}
        <span className="font-semibold text-fg">{r.author[lang]}</span>
        {r.verified && <span className="text-xs text-emerald-700 dark:text-emerald-400">{tx('مشترٍ موثّق', 'Verified buyer')}</span>}
        <span className="text-xs text-muted"><bdi dir="ltr">{r.at}</bdi></span>
      </div>
      <p className="text-sm leading-relaxed text-fg" dir="auto">{r.kind === 'question' ? `${tx('سؤال', 'Q')}: ${r.text}` : r.text}</p>
      {r.reply && (
        <div className="ms-4 rounded-xl bg-surface-2 px-3 py-2 text-sm">
          <p className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold text-muted"><MessageCircleReply className="size-3.5" aria-hidden="true" />{tx(`رد ${store}`, `Reply from ${store}`)}</p>
          <p className="text-fg" dir="auto">{r.reply.text}</p>
        </div>
      )}
    </li>
  );
}

/** The product-page block. Renders nothing when reviews and questions are off or none are published. */
export function ProductReviews({ productId, override }: { productId: string; override?: { list?: Review[]; settings?: ReviewSettings } }) {
  const tx = useTx();
  const live = reviewsStore.use();
  const liveSettings = reviewSettingsStore.use();
  const s = storeReviews(override?.list ?? live, productId, override?.settings ?? liveSettings);
  if (!s.count && !s.questions.length) return null;
  const store = tx('المتجر', 'the store');
  return (
    <section aria-labelledby={`rv-${productId}`} className="space-y-2 pt-12">
      <h2 id={`rv-${productId}`} className="flex flex-wrap items-center gap-3 text-xl font-bold text-fg">
        {tx('آراء العملاء', 'Customer reviews')}
        {s.avg !== null && <span className="flex items-center gap-2 text-sm font-medium text-muted"><Stars n={Math.round(s.avg)} /><bdi dir="ltr">{s.avg.toFixed(1)}</bdi> · {tx(`${s.count} تقييم`, `${s.count} reviews`)}</span>}
      </h2>
      {s.count > 0 && <ul className="divide-y divide-border border-y border-border">{s.reviews.map((r) => <PublicEntry key={r.id} r={r} store={store} />)}</ul>}
      {s.questions.length > 0 && (
        <>
          <h3 className="pt-6 text-base font-semibold text-fg">{tx('أسئلة وأجوبة', 'Questions and answers')}</h3>
          <ul className="divide-y divide-border border-y border-border">{s.questions.map((r) => <PublicEntry key={r.id} r={r} store={store} />)}</ul>
        </>
      )}
    </section>
  );
}
