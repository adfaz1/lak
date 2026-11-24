// The live context custom URLs resolve against (products, categories, pages, landing pages, articles), shared by the
// dashboard's Custom URLs page and the shopper store, which follows redirects for addresses it does not serve.
import { useMemo } from 'react';
import { levelsStore, productsStore } from '../../merchant/stores';
import { categoriesOf, toStoreProducts } from '../../storefront/bridge';
import { isServed } from './content';
import { blogStore, contentStore, landingStore } from './state';
import { lpServed } from './landing-model';
import { postServed } from './blog-model';
import type { RCtx } from './redirects-model';

export function useRCtx(): RCtx {
  const products = productsStore.use();
  const levels = levelsStore.use();
  const content = contentStore.use();
  const landings = landingStore.use();
  const blog = blogStore.use();
  return useMemo(() => {
    const now = Date.now();
    const store = toStoreProducts(products, levels);
    return {
      products: products.map((p) => ({ id: p.id, name: `${p.name.ar} · ${p.name.en}`, served: store.some((s) => s.id === p.id), archived: p.status === 'archived' })),
      categories: [{ id: 'all', name: 'كل المنتجات · All products' }, ...categoriesOf(store).map((c) => ({ id: c.id, name: `${c.name.ar} · ${c.name.en}` }))],
      pages: content.pages.map((p) => ({ id: p.id, slug: p.slug, name: p.draft.title.ar || p.draft.title.en || p.slug, served: isServed(p) })),
      landings: landings.map((p) => ({ id: p.id, slug: p.slug, name: p.name || p.slug, served: lpServed(p, now) })),
      posts: blog.posts.map((p) => ({ id: p.id, slug: p.slug, name: p.draft.title.ar || p.draft.title.en || p.slug, served: blog.settings.on && postServed(p, now) })),
    };
  }, [products, levels, content, landings, blog]);
}
