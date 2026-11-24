// Products section (`#/dashboard/products`): list with filters, tabs, selection and bulk edit; editor and CSV import
// live in their own files. View only: every rule comes from ./model and merchant/catalog.
import { lazy, useMemo, useState } from 'react';
import { Plus, Upload, Download, PackageOpen, SearchX, Pencil, Globe2, Smartphone, Store, Layers } from 'lucide-react';
import { replace, type Route } from '../../../core/router';
import { useLang } from '../../../core/lang';
import { canSee, can } from '../../merchant/perms';
import { categoriesStore, levelsStore, productsStore } from '../../merchant/stores';
import { applyBulkEdit, toCsv, type BulkRow, type Product, type ProductStatus } from '../../merchant/catalog';
import type { Channel } from '../../merchant/domain';
import { Badge, Button, Card, EmptyState, ErrorState, InfoHint, LinkButton, Money, ProductImage, Ref, Skeleton, cn, useTx } from '../../../ds/ui';
import { Alert, BulkBar, Checkbox, DataTable, FilterChip, Input, Modal, PageHeader, Pagination, SearchInput, Select, Switch, Tabs, useToast, type Column } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import {
  DEFAULT_EXPORT, EXPORT_COLS, STATUSES, activeChannels, allTags, bulkChanged, bulkCheck, bulkRowsFor, categoryOptions, exportRows, filterProducts, listPhoto, lowSkuCount,
  paginate, priceRange, readChannel, readTab, selectionScope, stockOf, tabCounts, type ExportCol, type StatusTab,
} from './model';
import { BulkOpModal, UndoBanner, rememberUndo, useUndo } from './bulk';
import { CatalogNav } from './common';
import { NoAccess, ReviewTools, STATUS_TONE, downloadText, phref, roleBadge, useNames, useRole } from './common';

const Editor = lazy(() => import('./editor'));
const ImportWizard = lazy(() => import('./import'));
const Categories = lazy(() => import('./categories'));
const Collections = lazy(() => import('./collections'));

export default function Products({ route }: { route: Route }) {
  const tx = useTx();
  const role = useRole();
  const sub = route.path[0];
  if (!canSee(role, 'products')) return <NoAccess title={tx('لا تملك صلاحية المنتجات', 'You don’t have access to Products')}>{tx('اطلب من مالك المتجر إضافة صلاحية المنتجات لدورك.', 'Ask the store owner to add Products to your role.')}</NoAccess>;
  if (sub === 'import') return <ImportWizard />;
  if (sub === 'categories') return <Categories />;
  if (sub === 'collections') return <Collections id={route.path[1]} />;
  if (sub) return <Editor key={sub} id={sub} />;
  return <ProductList route={route} />;
}

const CH_ICON: Record<Channel, typeof Store> = { online: Store, market: Globe2, app: Smartphone };

function ProductList({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const names = useNames();
  const toast = useToast();
  const state = useDashState();
  const role = useRole();
  const canEdit = can(role, 'product.edit');
  const all = productsStore.use();
  const levels = levelsStore.use();
  const products = state === 'empty' ? [] : all;

  const q = route.query.get('q') ?? '';
  const tab = readTab(route.query.get('tab'));
  const category = route.query.get('cat') ?? '';
  const channel = readChannel(route.query.get('ch'));
  const tag = route.query.get('tag') ?? '';
  const f = { q, tab, category, channel, tag };
  const query = { q: q || undefined, tab: tab === 'all' ? undefined : tab, cat: category || undefined, ch: channel || undefined, tag: tag || undefined };
  const go = (patch: Record<string, string | undefined>) => replace(phref('', { ...query, ...patch, page: undefined }));

  const storeCats = categoriesStore.use();
  const rows = useMemo(() => filterProducts(products, f, storeCats), [products, q, tab, category, channel, tag, storeCats]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = tabCounts(products, f, storeCats);
  const cats = categoryOptions(storeCats, products);
  const tags = allTags(products);
  const [ops, setOps] = useState(false);
  const [exp, setExp] = useState(false);
  const undo = useUndo();
  const pg = paginate(rows, route.query.get('page'));
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<BulkRow[] | null>(null);
  const filtered = !!(q || category || channel || tag);

  const pageIds = pg.rows.map((p) => p.id);
  const allIds = rows.map((p) => p.id);
  const visibleSel = new Set([...sel].filter((id) => allIds.includes(id)));
  const scope = selectionScope(visibleSel, pageIds, allIds);
  const onSelect = (id: string, on: boolean) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });


  const header = (
    <PageHeader title={tx('المنتجات', 'Products')}
      description={state === 'live' ? tx(`${all.length} منتجًا في الكتالوج`, `${all.length} products in your catalogue`) : undefined}
      meta={!canEdit ? roleBadge(tx) : undefined}
      actions={<>
        {state === 'live' && products.length > 0 && <Button variant="secondary" onClick={() => setExp(true)} disabled={!rows.length}><Download className="size-4" aria-hidden="true" />{tx('تصدير', 'Export')}</Button>}
        {can(role, 'product.import') && <LinkButton variant="secondary" href={phref('import')}><Upload className="size-4" aria-hidden="true" />{tx('استيراد CSV', 'Import CSV')}</LinkButton>}
        {canEdit && <LinkButton href={phref('new')}><Plus className="size-4" aria-hidden="true" />{tx('أضف منتجًا', 'Add product')}</LinkButton>}
      </>} />
  );

  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<ListSkeleton /></div>;
  if (state === 'error') return (
    <div className="space-y-6">{header}
      <Card><ErrorState as="h2" title={tx('تعذّر تحميل المنتجات', 'Products could not load')} onRetry={() => setDashState('live')}>
        {tx('لم يتغير شيء في الكتالوج. المرجع SIM-PRD-503.', 'Nothing changed in your catalogue. Ref SIM-PRD-503.')}
      </ErrorState></Card>
    </div>
  );
  if (products.length === 0) return (
    <div className="space-y-6">{header}
      <Card><EmptyState as="h2" icon={<PackageOpen className="size-6" aria-hidden="true" />} title={tx('أضف أول منتج', 'Add your first product')}
        action={canEdit ? <><LinkButton href={phref('new')}><Plus className="size-4" aria-hidden="true" />{tx('أضف منتجًا', 'Add product')}</LinkButton>{can(role, 'product.import') && <LinkButton variant="secondary" href={phref('import')}>{tx('استورد من CSV', 'Import from CSV')}</LinkButton>}</> : undefined}>
        {tx('أضف منتجًا واحدًا أو استورد كتالوجك من ملف CSV.', 'Add one product, or import your catalogue from a CSV file.')}
      </EmptyState></Card>
      <ReviewTools />
    </div>
  );

  const priceCell = (p: Product) => {
    const r = priceRange(p);
    return (
      <span className="inline-flex flex-col items-end">
        <span className="inline-flex items-baseline gap-1">{r.from && <span className="text-xs text-muted">{tx('من', 'from')}</span>}<Money v={r.min} className="font-semibold text-fg" /></span>
        {p.compareAt !== null && <s className="text-xs text-subtle"><Money v={p.compareAt} /></s>}
      </span>
    );
  };
  const stockCell = (p: Product) => {
    const s = stockOf(p, levels);
    if (s === null) return <span className="text-xs text-muted">{tx('رقمي', 'Digital')}</span>;
    // The total is shown as is; a low variant or warehouse is named under it rather than colouring a healthy total.
    const lowSkus = lowSkuCount(p, levels);
    return (
      <span className="inline-flex flex-col leading-tight">
        <span className={cn('font-semibold tabular-nums', s === 0 ? 'text-red-600 dark:text-red-400' : 'text-fg')}>{s === 0 ? tx('نفد', 'Sold out') : s}</span>
        {s > 0 && lowSkus > 0 && <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">{p.variants.length ? tx(`${lowSkus} ${lowSkus === 1 ? 'متغير منخفض' : 'متغيرات منخفضة'}`, `${lowSkus} low variant${lowSkus === 1 ? '' : 's'}`) : tx('منخفض في مستودع', 'Low in a warehouse')}</span>}
      </span>
    );
  };
  const channelsCell = (p: Product) => {
    const on = activeChannels(p);
    if (!on.length) return <span className="text-xs text-subtle">{tx('لا قناة', 'None')}</span>;
    return <span className="flex items-center gap-1.5 text-muted">{on.map((c) => { const I = CH_ICON[c]; return <span key={c} title={names.channel(c)} className="grid size-7 place-items-center rounded-lg bg-surface-2"><I className="size-3.5" aria-hidden="true" /><span className="sr-only">{names.channel(c)}</span></span>; })}</span>;
  };
  const nameCell = (p: Product) => (
    <span className="flex items-center gap-3">
      <ProductImage src={listPhoto(p)} alt={p.name[lang]} size={44} />
      <span className="min-w-0">
        <span className="block truncate font-semibold text-fg">{p.name[lang]}</span>
        <span className="block text-xs font-normal text-muted">{p.category[lang]}{p.variants.length ? tx(` · ${p.variants.length} متغيرات`, ` · ${p.variants.length} variants`) : ''}</span>
      </span>
    </span>
  );

  const columns: Column<Product>[] = [
    { key: 'name', header: tx('المنتج', 'Product'), cell: nameCell, className: 'max-w-72' },
    { key: 'sku', header: 'SKU', cell: (p) => <span className="text-xs text-muted"><Ref>{p.sku}</Ref></span>, hideBelow: 'lg' },
    { key: 'status', header: tx('الحالة', 'Status'), cell: (p) => <Badge tone={STATUS_TONE[p.status]}>{names.status(p.status)}</Badge> },
    { key: 'price', header: tx('السعر', 'Price'), align: 'end', cell: priceCell },
    { key: 'stock', header: <span className="inline-flex items-center gap-1">{tx('المتاح', 'Available')}<InfoHint>{tx('مجموع المتاح في كل المستودعات (الموجود − المحجوز). البرتقالي: عند حد إعادة الطلب في مستودع واحد على الأقل.', 'Sum of available across warehouses (on hand − reserved). Amber: at the reorder point in at least one warehouse.')}</InfoHint></span>, align: 'end', cell: stockCell },
    { key: 'ch', header: tx('القنوات', 'Channels'), cell: channelsCell, hideBelow: 'lg' },
  ];

  const startBulk = () => setBulk(bulkRowsFor(all, visibleSel));

  return (
    <div className="space-y-6">
      {header}
      <CatalogNav />
      <UndoBanner />
      <Card>
        <div className="px-4 pt-2 sm:px-5">
          <Tabs label={tx('حالة المنتج', 'Product status')} items={(['all', ...STATUSES] as StatusTab[]).map((t) => ({
            href: phref('', { ...query, tab: t === 'all' ? undefined : t }), current: tab === t, count: counts[t],
            label: t === 'all' ? tx('الكل', 'All') : names.status(t),
          }))} />
        </div>
        <div className="space-y-3 p-4 sm:px-5">
          {visibleSel.size > 0 && canEdit ? (
            <BulkBar count={visibleSel.size} onClear={() => setSel(new Set())}
              scope={<span className="inline-flex flex-wrap items-center gap-2">
                {scope === 'all' ? tx(`كل النتائج (${rows.length})`, `All ${rows.length} results`) : scope === 'page' ? tx('هذه الصفحة', 'on this page') : tx(`من ${rows.length} نتيجة`, `of ${rows.length} results`)}
                {scope === 'page' && rows.length > pg.rows.length && <button type="button" className="font-semibold text-brand-700 hover:underline dark:text-brand-300" onClick={() => setSel(new Set(allIds))}>{tx(`حدّد كل النتائج (${rows.length})`, `Select all ${rows.length} results`)}</button>}
              </span>}>
              <Button size="sm" onClick={() => setOps(true)}><Layers className="size-3.5" aria-hidden="true" />{tx('تعديل جماعي', 'Bulk edit')}</Button>
              <Button size="sm" variant="secondary" onClick={startBulk}><Pencil className="size-3.5" aria-hidden="true" />{tx('جدول السعر والحالة', 'Price & status table')}</Button>
            </BulkBar>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex w-full sm:w-auto sm:flex-1 sm:max-w-xs"><SearchInput value={q} onChange={(v) => go({ q: v || undefined })} placeholder={tx('ابحث بالاسم أو SKU', 'Search name or SKU')} /></div>
              <FilterChip label={tx('الفئة', 'Category')} value={category} onChange={(v) => go({ cat: v || undefined })} options={cats.map((c) => ({ value: c.key, label: `${c.depth ? '— ' : ''}${c.name[lang]}` }))} />
              {tags.length > 0 && <FilterChip label={tx('الوسم', 'Tag')} value={tag} onChange={(v) => go({ tag: v || undefined })} options={tags.map((t) => ({ value: t, label: t }))} />}
              <FilterChip label={tx('القناة', 'Channel')} value={channel} onChange={(v) => go({ ch: v || undefined })} options={(['online', 'market', 'app'] as Channel[]).map((c) => ({ value: c, label: names.channel(c) }))} />
              {filtered && <a href={phref('', { tab: query.tab })} className="px-2 text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('مسح التصفية', 'Clear filters')}</a>}
            </div>
          )}
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا منتجات تطابق', 'No matching products')}
            action={<LinkButton variant="secondary" href={phref()}>{tx('اعرض كل المنتجات', 'Show all products')}</LinkButton>}>
            {tx('جرّب كلمة أخرى أو أزل أحد المرشحات.', 'Try another word or remove a filter.')}
          </EmptyState>
        ) : (
          <>
            <div className="border-t border-border">
              <DataTable label={tx('المنتجات', 'Products')} rows={pg.rows} columns={columns} rowKey={(p) => p.id} href={(p) => phref(p.id)}
                selected={canEdit ? visibleSel : undefined} onSelect={canEdit ? onSelect : undefined}
                card={(p) => (
                  <span className="flex items-start gap-3">
                    <ProductImage src={listPhoto(p)} alt={p.name[lang]} size={52} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2"><span className="truncate text-sm font-semibold text-fg">{p.name[lang]}</span>{priceCell(p)}</span>
                      <span className="mt-0.5 block text-xs text-muted"><Ref>{p.sku}</Ref></span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted"><Badge tone={STATUS_TONE[p.status]}>{names.status(p.status)}</Badge>{stockOf(p, levels) !== null && <span>{tx('المتاح', 'Available')} {stockCell(p)}</span>}</span>
                    </span>
                  </span>
                )} />
            </div>
            <Pagination page={pg.page} pages={pg.pages} total={rows.length} hrefFor={(n) => phref('', { ...query, page: n > 1 ? String(n) : undefined })} />
          </>
        )}
      </Card>
      <ReviewTools />
      {bulk && <BulkModal rows={bulk} setRows={setBulk} onClose={() => setBulk(null)} onSaved={(n) => { setBulk(null); setSel(new Set()); toast({ tone: 'ok', text: tx(`حُفظت تعديلات ${n} منتجات`, `Saved changes to ${n} products`), action: { label: tx('تراجع', 'Undo'), run: undo } }); }} />}
      {ops && <BulkOpModal ids={[...visibleSel]} onClose={() => setOps(false)} onDone={() => { setOps(false); setSel(new Set()); }} />}
      {exp && <ExportModal rows={rows} onClose={() => setExp(false)} />}
    </div>
  );
}

function BulkModal({ rows, setRows, onClose, onSaved }: { rows: BulkRow[]; setRows: (r: BulkRow[]) => void; onClose: () => void; onSaved: (n: number) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const names = useNames();
  const products = productsStore.use();
  const { errors, invalidRows } = bulkCheck(rows);
  const changed = bulkChanged(products, rows);
  const [tried, setTried] = useState(false);
  const upd = (i: number, patch: Partial<BulkRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const cellErr = (c?: string) => (c === 'compareAt' ? tx('أعلى من السعر', 'Above the price') : c === 'money' ? tx('مبلغ غير صالح', 'Invalid amount') : '');
  const save = () => {
    setTried(true);
    if (invalidRows) return;
    const before = productsStore.get();
    const next = applyBulkEdit(before, rows.filter((r) => changed.includes(r.id)));
    if (!next) return;
    productsStore.set(next);
    rememberUndo({ id: `BULK-T${Date.now().toString(36).slice(-5).toUpperCase()}`, field: 'price', levels: [], products: before.filter((p) => changed.includes(p.id)).map((p) => ({ before: p, afterVersion: p.version + 1 })) }, changed.length);
    onSaved(changed.length);
  };
  return (
    <Modal size="lg" title={tx(`تعديل ${rows.length} منتجات`, `Edit ${rows.length} products`)} onClose={onClose}
      description={<span className="inline-flex items-center gap-1">{tx('لا يُحفظ شيء حتى تصح كل الخلايا.', 'Nothing is saved until every cell is valid.')}<InfoHint>{tx('أسعار المتغيرات المساوية للسعر الأساسي تتبعه. يرتفع إصدار كل منتج يتغير.', 'Variant prices equal to the base price follow it. Each changed product gets a new version.')}</InfoHint></span>}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button>
        <Button onClick={save} disabled={changed.length === 0 || (tried && invalidRows > 0)}>{changed.length ? tx(`احفظ ${changed.length} منتجات`, `Save ${changed.length} products`) : tx('لا تغييرات', 'No changes')}</Button>
      </>}>
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[13px]">
        <span className="font-medium text-muted">{tx('حالة الكل', 'Status for all')}</span>
        <Select className="h-9 w-auto" value="" aria-label={tx('حالة الكل', 'Status for all')} onChange={(e) => e.target.value && setRows(rows.map((r) => ({ ...r, status: e.target.value as ProductStatus })))}>
          <option value="">{tx('اختر…', 'Choose…')}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{names.status(s)}</option>)}
        </Select>
      </div>
      {(tried || invalidRows > 0) && invalidRows > 0 && <Alert tone="bad">{tx(`${invalidRows} صفوف فيها قيم غير صالحة`, `${invalidRows} rows have invalid values`)}</Alert>}
      <ul className="divide-y divide-border rounded-xl border border-border">
        {rows.map((r, i) => {
          const p = products.find((x) => x.id === r.id)!;
          const e = errors[i];
          return (
            <li key={r.id} className={cn('grid grid-cols-2 gap-3 p-3 sm:grid-cols-[1fr_7.5rem_7.5rem_8rem] sm:items-start', changed.includes(r.id) && 'bg-brand-500/[.04]')}>
              <div className="col-span-2 flex min-w-0 items-center gap-2.5 sm:col-span-1 sm:pt-1.5">
                <ProductImage src={listPhoto(p)} alt="" size={32} />
                <span className="truncate text-sm font-semibold text-fg">{p.name[lang]}</span>
              </div>
              <div>
                <Input dir="ltr" inputMode="decimal" value={r.price} aria-label={tx(`سعر ${p.name.ar}`, `Price for ${p.name.en}`)} aria-invalid={!!e.price || undefined} onChange={(ev) => upd(i, { price: ev.target.value })} />
                {e.price && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{cellErr(e.price)}</p>}
              </div>
              <div>
                <Input dir="ltr" inputMode="decimal" value={r.compareAt} placeholder={tx('قبل الخصم', 'Compare-at')} aria-label={tx(`السعر قبل الخصم لـ ${p.name.ar}`, `Compare-at for ${p.name.en}`)} aria-invalid={!!e.compareAt || undefined} onChange={(ev) => upd(i, { compareAt: ev.target.value })} />
                {e.compareAt && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{cellErr(e.compareAt)}</p>}
              </div>
              <Select className="col-span-2 sm:col-span-1" value={r.status} aria-label={tx(`حالة ${p.name.ar}`, `Status for ${p.name.en}`)} onChange={(ev) => upd(i, { status: ev.target.value as ProductStatus })}>
                {STATUSES.map((s) => <option key={s} value={s}>{names.status(s)}</option>)}
              </Select>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

function ListSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface" role="status" aria-label="Loading">
      <div className="flex gap-4 border-b border-border px-5 py-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-16" />)}</div>
      <div className="flex gap-2 p-5"><Skeleton className="h-10 w-72 rounded-xl" /><Skeleton className="h-10 w-24 rounded-xl" /><Skeleton className="h-10 w-24 rounded-xl" /></div>
      <div className="divide-y divide-border border-t border-border">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3"><Skeleton className="size-[18px] rounded" /><Skeleton className="size-11 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/5" /></div><Skeleton className="h-6 w-14 rounded-full" /><Skeleton className="h-4 w-16" /></div>
        ))}
      </div>
    </div>
  );
}

function ExportModal({ rows, onClose }: { rows: Product[]; onClose: () => void }) {
  const tx = useTx();
  const levels = levelsStore.use();
  const [cols, setCols] = useState<ExportCol[]>(DEFAULT_EXPORT);
  const [perVariant, setPerVariant] = useState(false);
  const label: Record<ExportCol, string> = {
    name: tx('الاسم بالإنجليزية', 'English name'), nameAr: tx('الاسم بالعربية', 'Arabic name'), sku: 'SKU', variant: tx('المتغير', 'Variant'), status: tx('الحالة', 'Status'),
    price: tx('السعر', 'Price'), compareAt: tx('السعر قبل الخصم', 'Compare-at'), cost: tx('التكلفة', 'Cost'), margin: tx('الهامش %', 'Margin %'), available: tx('المتاح', 'Available'),
    category: tx('الفئة', 'Category'), channels: tx('القنوات', 'Channels'), tags: tx('الوسوم', 'Tags'),
  };
  const ordered = EXPORT_COLS.filter((c) => cols.includes(c));
  const data = exportRows(rows, levels, ordered, perVariant);
  const go = () => { downloadText('products.csv', toCsv(data)); onClose(); };
  return (
    <Modal title={tx('تصدير المنتجات', 'Export products')} onClose={onClose}
      description={tx(`${rows.length} منتجًا من النتائج الحالية · ${data.length - 1} سطرًا`, `${rows.length} products from the current results · ${data.length - 1} rows`)}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={go} disabled={!ordered.length}><Download className="size-4" aria-hidden="true" />{tx('نزّل CSV', 'Download CSV')}</Button></>}>
      <fieldset>
        <legend className="mb-2 flex items-center gap-1 text-[13px] font-semibold text-fg">{tx('الأعمدة', 'Columns')}<InfoHint>{tx('أسماء الأعمدة تطابق قالب الاستيراد، فيمكنك التعديل ثم الاستيراد.', 'Column names match the import template, so you can edit and import back.')}</InfoHint></legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {EXPORT_COLS.map((c) => (
            <label key={c} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-[13px] text-fg">
              <Checkbox checked={cols.includes(c)} label={label[c]} onChange={(on) => setCols((x) => (on ? [...x, c] : x.filter((y) => y !== c)))} />{label[c]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-medium text-fg">{tx('سطر لكل متغير', 'One row per variant')}<Switch checked={perVariant} onChange={setPerVariant} label={tx('سطر لكل متغير', 'One row per variant')} /></label>
      {!ordered.length && <Alert tone="bad">{tx('اختر عمودًا واحدًا على الأقل.', 'Choose at least one column.')}</Alert>}
    </Modal>
  );
}
