// Information pages the merchant writes in the dashboard (Online store → Pages): about, contact and custom pages.
// Only the live (published) version is shown, in the shopper's language; drafts never reach this page.
import { useEffect } from 'react';
import { Mail, Phone } from 'lucide-react';
import type { Route } from '../../../core/router';
import { cn } from '../../../ds/ui';
import { productsStore, settingsStore } from '../../merchant/stores';
import { inlineRuns, toBlocks, type StorePage } from '../../dashboard/storefront/content';
import { contentStore } from '../../dashboard/storefront/state';
import { docTitle, servedPage, storeName } from '../bridge';
import { Crumbs, H1, PANEL, WRAP, to, useS } from '../kit';

function Rich({ src }: { src: string }) {
  const runs = (t: string) => inlineRuns(t).map((r, i) => (r.bold ? <strong key={i} className="font-semibold text-fg">{r.text}</strong> : <span key={i}>{r.text}</span>));
  return (
    <div className="space-y-5 text-[15px] leading-loose text-fg/90">
      {toBlocks(src).map((b, i) => b.type === 'h' ? <h2 key={i} className="pt-2 text-lg font-bold text-fg">{runs(b.text)}</h2>
        : b.type === 'ul' ? <ul key={i} className="list-disc space-y-1.5 ps-5">{b.items.map((x, j) => <li key={j}>{runs(x)}</li>)}</ul>
          : <p key={i}>{runs(b.text)}</p>)}
    </div>
  );
}

export default function ContentPage({ page }: { page: StorePage }) {
  const { t, lang, l } = useS();
  const store = settingsStore.use().store;
  const live = page.live!;
  const title = live.title[lang].trim() || live.title[lang === 'ar' ? 'en' : 'ar'];
  const body = live.body[lang].trim() || live.body[lang === 'ar' ? 'en' : 'ar'];
  return (
    <div className={cn(WRAP, 'max-w-3xl py-6 sm:py-10')}>
      <Crumbs items={[{ label: t.home, href: to() }, { label: title }]} />
      <h1 className={H1}>{title}</h1>
      <div className="mt-8"><Rich src={body} /></div>
      {page.kind === 'contact' && (
        <ul className={cn(PANEL, 'mt-8 space-y-3 p-5 text-sm sm:p-6')} aria-label={l({ ar: 'وسائل التواصل', en: 'Contact details' })}>
          {store.email && <li className="flex items-center gap-3"><Mail className="size-4 text-muted" aria-hidden="true" /><a href={`mailto:${store.email}`} dir="ltr" className="font-medium underline-offset-2 hover:underline">{store.email}</a></li>}
          {store.phone && !/x/i.test(store.phone) && <li className="flex items-center gap-3"><Phone className="size-4 text-muted" aria-hidden="true" /><a href={`tel:${store.phone.replace(/\s/g, '')}`} dir="ltr" className="font-medium underline-offset-2 hover:underline">{store.phone}</a></li>}
        </ul>
      )}
    </div>
  );
}

/**
 * Browser tab title from the merchant's SEO settings: the store SEO title on the home page, a product's SEO title on its
 * page, an information page's own SEO title, otherwise "<page> | <store>". Restores the previous title on leave.
 */
export function useDocTitle(route: Route) {
  const { lang } = useS();
  const content = contentStore.use();
  const settings = settingsStore.use();
  const products = productsStore.use();
  const [a, b] = route.path;
  useEffect(() => {
    const name = storeName(settings.store);
    let title = docTitle(content.seo, name, lang);
    if (a === 'p') {
      const p = products.find((x) => x.id === b);
      if (p) title = p.seo.title.trim() || docTitle(content.seo, name, lang, p.name[lang]);
    } else if (a === 'page') {
      const pg = servedPage(content.pages, b);
      if (pg) title = pg.seo.title[lang].trim() || docTitle(content.seo, name, lang, pg.live!.title[lang] || pg.live!.title.ar);
    }
    const prev = document.title;
    document.title = title;
    return () => { document.title = prev; };
  }, [a, b, lang, content, settings.store, products]);
}
