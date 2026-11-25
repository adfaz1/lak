// Online store → Custom URLs → «من بحث المتجر» (`#/dashboard/storefront/redirects?src=search`): search terms that send
// shoppers to a category or product instead of an empty results page. Same list as the search report's «وجّه البحث»
// action (merchant/stores searchRedirectsStore, merchant/demand rules); the store's search follows them as before.
import { useState } from 'react';
import { CornerDownLeft, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, type Route } from '../../../core/router';
import { can } from '../../merchant/perms';
import { logAction, productsStore, searchLogStore, searchRedirectsStore } from '../../merchant/stores';
import { normTerm, redirectFor, removeRedirect, setRedirect, type SearchRedirect } from '../../merchant/demand';
import type { L } from '../../merchant/domain';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, IconButton, ProductImage, Skeleton, cn, useTx } from '../../../ds/ui';
import { DataTable, Field, Input, Modal, PageHeader, Pagination, SearchInput, Select, Tabs, useToast, type Column } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { Locked, ReviewRole, useRole } from '../marketing/access';
import { productPhoto } from '../model/media';
import { sectionHref } from '../pages';
import { StoreTabs } from './nav';
import { redirectsStore } from './state';

const PAGE = 20;
const RHREF = (q?: Record<string, string | undefined>) => link('/dashboard/storefront/redirects', q);
const slug = (c: L) => c.en.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other';

/** The two lists of the Custom URLs page: old addresses, and search terms (from the search report or added here). */
export function RedirectTabs({ current }: { current: 'url' | 'search' }) {
  const tx = useTx();
  const urls = redirectsStore.use().length;
  const terms = searchRedirectsStore.use().length;
  return (
    <Tabs label={tx('نوع التحويل', 'Redirect kind')} items={[
      { href: RHREF(), label: tx('روابط قديمة', 'Old addresses'), current: current === 'url', count: urls || undefined },
      { href: RHREF({ src: 'search' }), label: tx('من بحث المتجر', 'From store search'), current: current === 'search', count: terms || undefined },
    ]} />
  );
}

/** Live categories and products a search can be sent to (only what the online store shows). */
function useTargets() {
  const products = productsStore.use();
  const live = products.filter((p) => p.status === 'active' && p.channels.online);
  const cats = [...new Map(live.map((p) => [slug(p.category), p.category])).entries()];
  const nameOf = (kind: string, id: string): L | undefined => (kind === 'category' ? cats.find(([s]) => s === id)?.[1] : live.find((p) => p.id === id)?.name);
  const shownBy = (kind: string, id: string) => (kind === 'category' ? live.filter((p) => slug(p.category) === id) : live.filter((p) => p.id === id));
  return { live, cats, nameOf, shownBy };
}

export function SearchRedirects({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const role = useRole();
  const state = useDashState();
  const list = searchRedirectsStore.use();
  const log = searchLogStore.use();
  const { nameOf } = useTargets();
  // Same permission as the search report's action.
  const canEdit = can(role, 'settings.manage') || can(role, 'product.edit');
  const q = route.query.get('q') ?? '';
  const pg = Math.max(1, Number(route.query.get('page')) || 1);
  const [edit, setEdit] = useState<string | null>(null);
  const [del, setDel] = useState<SearchRedirect | null>(null);
  const all = state === 'empty' ? [] : list;
  const needle = normTerm(q);
  const filtered = [...all].reverse().filter((r) => !needle || r.term.includes(needle) || normTerm(r.target.name.ar).includes(needle) || normTerm(r.target.name.en).includes(needle));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const rows = filtered.slice((Math.min(pg, pages) - 1) * PAGE, Math.min(pg, pages) * PAGE);
  const searches = (term: string) => log.filter((e) => e.term === term).length;

  const header = (
    <>
      <PageHeader title={tx('روابط مخصصة', 'Custom URLs')} description={tx('حوّل الروابط القديمة وكلمات البحث لمكانها الصحيح', 'Send old addresses and search terms to the right place')}
        actions={canEdit ? <Button onClick={() => setEdit('new')}><Plus className="size-4" aria-hidden="true" />{tx('توجيه بحث جديد', 'New search redirect')}</Button> : <Locked>{tx('التعديل للمالك أو مدير المنتجات', 'Editing is for the Owner or product managers')}</Locked>} />
      <StoreTabs current="redirects" />
      <ReviewRole />
    </>
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<Card className="space-y-3 p-5" role="status" aria-label="Loading">{[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 flex-1" /></div>)}</Card></div>;
  if (state === 'error') return <div className="space-y-6">{header}<Card><ErrorState as="h2" title={tx('تعذّر تحميل توجيهات البحث', 'Search redirects could not load')} onRetry={() => setDashState('live')}>{tx('التوجيهات الحالية تعمل في متجرك كما هي. المرجع SIM-URL-504.', 'Existing redirects keep working in your store. Ref SIM-URL-504.')}</ErrorState></Card></div>;

  const remove = (r: SearchRedirect) => {
    const before = searchRedirectsStore.get();
    searchRedirectsStore.set((l) => removeRedirect(l, r.term));
    logAction('store', { ar: `ألغى توجيه البحث «${r.raw}»`, en: `Removed the search redirect for “${r.raw}”` });
    setDel(null);
    toast({ tone: 'info', text: tx('أُلغي التوجيه', 'Redirect removed'), action: { label: tx('تراجع', 'Undo'), run: () => searchRedirectsStore.set(before) } });
  };
  const target = (r: SearchRedirect) => {
    const now = nameOf(r.target.kind, r.target.id);
    return (
      <span className="min-w-0">
        <span className="block truncate text-fg">{r.target.kind === 'category' ? tx('تصنيف', 'Category') : tx('منتج', 'Product')} · {(now ?? r.target.name)[lang]}</span>
        {!now && <Badge tone="red">{tx('الوجهة لم تعد في المتجر', 'Target no longer in the store')}</Badge>}
      </span>
    );
  };
  const actions = (r: SearchRedirect) => canEdit ? (
    <span className="inline-flex items-center gap-1">
      <IconButton label={tx(`عدّل «${r.raw}»`, `Edit “${r.raw}”`)} onClick={() => setEdit(r.term)}><Pencil className="size-4" aria-hidden="true" /></IconButton>
      <IconButton label={tx(`احذف «${r.raw}»`, `Delete “${r.raw}”`)} onClick={() => setDel(r)}><Trash2 className="size-4" aria-hidden="true" /></IconButton>
    </span>
  ) : null;
  const cols: Column<SearchRedirect>[] = [
    { key: 'term', header: tx('كلمة البحث', 'Search term'), cell: (r) => <span className="font-semibold text-fg" dir="auto">«{r.raw}»</span> },
    { key: 'to', header: tx('يرى المتسوق', 'Shoppers see'), cell: target },
    { key: 'n', header: tx('عمليات البحث', 'Searches'), align: 'end', hideBelow: 'md', cell: (r) => <span className="tabular-nums text-muted">{searches(r.term).toLocaleString('en-US')}</span> },
    { key: 'by', header: tx('أضافه', 'Added by'), hideBelow: 'lg', cell: (r) => <span className="text-xs text-muted">{r.by} · <bdi dir="ltr">{r.at.slice(0, 10)}</bdi></span> },
    { key: 'a', header: <span className="sr-only">{tx('إجراء', 'Action')}</span>, align: 'end', cell: (r) => actions(r) },
  ];

  return (
    <div className="space-y-6">
      {header}
      <RedirectTabs current="search" />
      <TestSearch list={all} />
      {all.length === 0 ? (
        <Card><EmptyState as="h2" icon={<Search className="size-6" aria-hidden="true" />} title={tx('لا توجيهات بحث', 'No search redirects')}
          action={canEdit ? <Button onClick={() => setEdit('new')}><Plus className="size-4" aria-hidden="true" />{tx('وجّه كلمة بحث', 'Redirect a search term')}</Button> : undefined}>
          {tx('من تقرير البحث: كلمة بلا نتائج ← «وجّه البحث». تظهر هنا كل التوجيهات.', 'From the search report: a term with no results → “Redirect search”. Every redirect shows here.')}
          {' '}<a className="font-semibold text-brand-700 hover:underline dark:text-brand-300" href={sectionHref('analytics', '', { report: 'search' })}>{tx('تقرير البحث', 'Search report')}</a>
        </EmptyState></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <SearchInput value={q} onChange={(v) => replace(RHREF({ src: 'search', q: v || undefined }))} placeholder={tx('ابحث بالكلمة أو الوجهة', 'Search by term or target')} />
          </div>
          {filtered.length === 0 ? (
            <EmptyState icon={<Search className="size-6" aria-hidden="true" />} title={tx('لا توجيهات تطابق', 'No redirects match')} action={<Button variant="secondary" onClick={() => replace(RHREF({ src: 'search' }))}>{tx('امسح التصفية', 'Clear filters')}</Button>} />
          ) : (
            <>
              <DataTable label={tx('توجيهات البحث', 'Search redirects')} rows={rows} rowKey={(r) => r.term} columns={cols}
                card={(r) => (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate font-semibold text-fg" dir="auto">«{r.raw}»</span>{actions(r)}</div>
                    <div className="flex items-start gap-2 text-sm"><CornerDownLeft className="mt-0.5 size-4 shrink-0 text-subtle ltr:-scale-x-100" aria-hidden="true" />{target(r)}</div>
                    <p className="text-xs text-muted">{tx(`${searches(r.term)} عملية بحث`, `${searches(r.term)} searches`)}</p>
                  </div>
                )} />
              <Pagination page={Math.min(pg, pages)} pages={pages} total={filtered.length} hrefFor={(n) => RHREF({ src: 'search', q: q || undefined, page: String(n) })} />
            </>
          )}
        </Card>
      )}
      {edit && <SearchRedirectEditor key={edit} term={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {del && (
        <Modal title={tx(`حذف توجيه «${del.raw}»`, `Delete the redirect for “${del.raw}”`)} onClose={() => setDel(null)}
          description={tx('من يبحث بهذه الكلمة يرى نتائج البحث العادية (قد تكون فارغة).', 'Shoppers searching this term see the normal results again (possibly none).')}
          footer={<><Button variant="secondary" onClick={() => setDel(null)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={() => remove(del)}><Trash2 className="size-4" aria-hidden="true" />{tx('احذف', 'Delete')}</Button></>}>
          <p className="text-sm text-fg">«{del.raw}» → {del.target.name[lang]}</p>
        </Modal>
      )}
    </div>
  );
}

/** Type a search as a shopper would: see whether it is redirected and where. Same matching as the store (normTerm). */
function TestSearch({ list }: { list: SearchRedirect[] }) {
  const tx = useTx();
  const [v, setV] = useState('');
  const [term, setTerm] = useState<string | null>(null);
  const hit = term !== null ? redirectFor(list, term) : undefined;
  return (
    <Card aria-labelledby="sr-test">
      <CardHeader id="sr-test" title={tx('اختبر كلمة بحث', 'Test a search')} hint={tx('نطابق الكلمة كما يفعل المتجر: بلا فرق بين الهمزات والتشكيل وحالة الأحرف.', 'Matched the way the store does: hamza forms, diacritics and case don’t matter.')} />
      <form className="flex flex-wrap items-end gap-2 px-5 pb-4" onSubmit={(e) => { e.preventDefault(); setTerm(v.trim()); }}>
        <div className="min-w-0 flex-1"><Input aria-label={tx('كلمة البحث', 'Search term')} dir="auto" value={v} placeholder={tx('مثال: عبايه سوداء', 'e.g. black abaya')} onChange={(e) => setV(e.target.value)} /></div>
        <Button type="submit" variant="secondary" disabled={!v.trim()}>{tx('اختبر', 'Test')}</Button>
      </form>
      {term !== null && (
        <p role="status" className={cn('border-t border-border px-5 py-4 text-sm font-semibold', hit ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted')}>
          {hit ? tx(`«${term}» ← يرى المتسوق ${hit.target.name.ar}`, `“${term}” → shoppers see ${hit.target.name.en}`) : tx(`«${term}» بلا توجيه: تظهر نتائج البحث العادية`, `“${term}” has no redirect: normal search results show`)}
          {hit && <span className="ms-2 text-xs font-normal text-muted">({hit.target.kind === 'category' ? tx('تصنيف', 'category') : tx('منتج', 'product')} · «{hit.raw}»)</span>}
        </p>
      )}
    </Card>
  );
}

/** Add or change one search redirect, with a preview of what the shopper sees. */
function SearchRedirectEditor({ term, onClose }: { term: string | null; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const role = useRole();
  const list = searchRedirectsStore.use();
  const { live, cats, nameOf, shownBy } = useTargets();
  const current = term ? list.find((r) => r.term === term) : undefined;
  const [raw, setRaw] = useState(current?.raw ?? '');
  const [target, setTarget] = useState(current ? `${current.target.kind}:${current.target.id}` : cats[0] ? `category:${cats[0][0]}` : '');
  const [tried, setTried] = useState(false);
  const [kind, id] = target.split(':');
  const name = nameOf(kind, id);
  const key = normTerm(raw);
  const taken = !current && key ? list.find((r) => r.term === key) : undefined;
  const error = !key ? tx('اكتب كلمة البحث', 'Type the search term') : taken ? tx(`«${taken.raw}» موجّهة من قبل؛ عدّلها من القائمة`, `“${taken.raw}” is already redirected; edit it in the list`) : null;
  const shown = shownBy(kind, id);
  const save = () => {
    setTried(true);
    if (error || !name) return;
    const before = searchRedirectsStore.get();
    const r: SearchRedirect = { term: current?.term ?? key, raw: current?.raw ?? raw.trim(), target: { kind: kind as 'product' | 'category', id, name }, by: role, at: new Date().toISOString() };
    searchRedirectsStore.set((l) => setRedirect(l, r));
    logAction('store', { ar: `وجّه البحث «${r.raw}» إلى ${name.ar}`, en: `Redirected the search “${r.raw}” to ${name.en}` }, { before: current?.target.name[lang], after: name[lang] });
    toast({ tone: 'ok', text: tx(`من يبحث عن «${r.raw}» يرى الآن ${name.ar}`, `Shoppers searching “${r.raw}” now see ${name.en}`), action: { label: tx('تراجع', 'Undo'), run: () => searchRedirectsStore.set(before) } });
    onClose();
  };
  return (
    <Modal size="lg" title={current ? tx(`توجيه «${current.raw}»`, `Redirect for “${current.raw}”`) : tx('توجيه بحث جديد', 'New search redirect')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={save} disabled={!name}><Search className="size-4" aria-hidden="true" />{current ? tx('حدّث التوجيه', 'Update redirect') : tx('وجّه البحث', 'Redirect search')}</Button></>}>
      {!current && (
        <Field label={tx('كلمة البحث', 'Search term')} error={tried ? error : null} hint={tx('كما يكتبها المتسوق', 'As shoppers type it')}>
          {(p) => <Input {...p} dir="auto" value={raw} onChange={(e) => setRaw(e.target.value)} />}
        </Field>
      )}
      <Field label={tx('يرى المتسوق', 'Shoppers see')}>
        {(p) => (
          <Select {...p} value={target} onChange={(e) => setTarget(e.target.value)}>
            <optgroup label={tx('فئة', 'Category')}>{cats.map(([s, c]) => <option key={s} value={`category:${s}`}>{c[lang]}</option>)}</optgroup>
            <optgroup label={tx('منتج', 'Product')}>{live.map((p) => <option key={p.id} value={`product:${p.id}`}>{p.name[lang]}</option>)}</optgroup>
          </Select>
        )}
      </Field>
      {name && (
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="text-xs font-semibold text-muted">{tx('معاينة ما يراه المتسوق', 'What the shopper sees')}</p>
          <p className="mt-1 text-[13px] text-fg">{tx(`لا نتائج لـ«${current?.raw ?? (raw.trim() || '…')}». نعرض لك: ${name.ar}`, `No results for “${current?.raw ?? (raw.trim() || '…')}”. Showing: ${name.en}`)}</p>
          <ul className="mt-2 flex flex-wrap gap-2">{shown.slice(0, 6).map((p) => <li key={p.id} className="flex items-center gap-1.5 rounded-lg bg-surface px-2 py-1 text-xs"><ProductImage src={productPhoto(p.id)} alt="" size={24} />{p.name[lang]}</li>)}{shown.length > 6 && <li className="text-xs text-muted">+{shown.length - 6}</li>}</ul>
        </div>
      )}
    </Modal>
  );
}
