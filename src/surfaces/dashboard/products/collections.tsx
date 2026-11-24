// Collections (`#/dashboard/products/collections`, `/collections/<id>`, `/collections/new`): manual collections (pick and
// order products) and smart collections (rules on price, category, tag, stock, status, sale) with the matching products
// shown live before saving. Rules: merchant/catalog.ts (collectionMembers, validateRule, ruleMatches).
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Layers, Plus, Sparkles, Trash2, X, ListChecks, Search } from 'lucide-react';
import { navigate, replace } from '../../../core/router';
import { useLang } from '../../../core/lang';
import { createStore } from '../../../core/store';
import { categoryTree, collectionMembers, validateRule, type Collection, type Product, type Rule, type RuleField, type RuleOp } from '../../merchant/catalog';
import { can } from '../../merchant/perms';
import { categoriesStore, collectionsStore, levelsStore, productsStore } from '../../merchant/stores';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, LinkButton, ProductImage, Segmented, Skeleton, cn, useTx } from '../../../ds/ui';
import { Alert, DataTable, Field, Input, Modal, PageHeader, SaveBar, Select, Switch, useToast, type Column } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { useUnsaved } from '../unsaved';
import { listPhoto, moveItem, stockOf } from './model';
import { CatalogNav, ReviewTools, phref, roleBadge, useNames, useRole } from './common';

/** Unsaved collection edits, per collection id, kept for this session. */
const draftsStore = createStore.key('dashboard.collectionDrafts')<Record<string, Collection>>(() => ({}));
const OPS: Record<RuleField, RuleOp[]> = { price: ['lt', 'gt'], compareAt: ['onSale'], category: ['is', 'isNot'], tag: ['is', 'isNot'], stock: ['inStock', 'outOfStock'], status: ['is', 'isNot'] };
const blank = (): Collection => ({ id: 'new', name: { ar: '', en: '' }, kind: 'smart', productIds: [], match: 'all', rules: [{ field: 'price', op: 'lt', value: '' }], visible: true, version: 0 });

export default function Collections({ id }: { id?: string }) {
  return id ? <Editor key={id} id={id} /> : <List />;
}

function useStock() {
  const levels = levelsStore.use();
  return (p: Product) => stockOf(p, levels);
}

function List() {
  const tx = useTx();
  const { lang } = useLang();
  const state = useDashState();
  const role = useRole();
  const canEdit = can(role, 'product.edit');
  const cols = collectionsStore.use();
  const products = productsStore.use();
  const stock = useStock();
  const header = (
    <PageHeader back={{ href: phref(), label: tx('المنتجات', 'Products') }} title={tx('المجموعات', 'Collections')}
      description={state === 'live' ? tx(`${cols.length} مجموعات`, `${cols.length} collections`) : undefined} meta={!canEdit ? roleBadge(tx) : undefined}
      actions={canEdit && <LinkButton href={phref('collections/new')}><Plus className="size-4" aria-hidden="true" />{tx('أنشئ مجموعة', 'Create collection')}</LinkButton>} />
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<CatalogNav /><Skeleton className="h-72 rounded-2xl" /></div>;
  if (state === 'error') return <div className="space-y-6">{header}<CatalogNav /><Card><ErrorState as="h2" title={tx('تعذّر تحميل المجموعات', 'Collections could not load')} onRetry={() => setDashState('live')}>{tx('لم يتغير شيء. المرجع SIM-COL-503.', 'Nothing changed. Ref SIM-COL-503.')}</ErrorState></Card></div>;
  const rows = state === 'empty' ? [] : cols;
  const columns: Column<Collection>[] = [
    { key: 'n', header: tx('المجموعة', 'Collection'), cell: (c) => <span className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-brand-500/10 text-brand-700 dark:text-brand-300">{c.kind === 'smart' ? <Sparkles className="size-4" aria-hidden="true" /> : <ListChecks className="size-4" aria-hidden="true" />}</span><span className="font-semibold text-fg">{c.name[lang]}</span></span> },
    { key: 'k', header: tx('النوع', 'Type'), cell: (c) => <Badge tone={c.kind === 'smart' ? 'brand' : 'gray'}>{c.kind === 'smart' ? tx('ذكية', 'Smart') : tx('يدوية', 'Manual')}</Badge> },
    { key: 'c', header: tx('المنتجات', 'Products'), align: 'end', cell: (c) => <span className="tabular-nums">{collectionMembers(c, products, stock).length}</span> },
    { key: 'v', header: tx('في المتجر', 'In store'), cell: (c) => <Badge tone={c.visible ? 'green' : 'gray'}>{c.visible ? tx('ظاهرة', 'Visible') : tx('مخفية', 'Hidden')}</Badge>, hideBelow: 'md' },
  ];
  return (
    <div className="space-y-6">
      {header}
      <CatalogNav />
      <Card>
        {rows.length === 0 ? (
          <EmptyState as="h2" icon={<Layers className="size-6" aria-hidden="true" />} title={tx('أنشئ أول مجموعة', 'Create your first collection')} action={canEdit ? <LinkButton href={phref('collections/new')}>{tx('أنشئ مجموعة', 'Create collection')}</LinkButton> : undefined}>
            {tx('اجمع منتجات يدويًا، أو بشروط تتحدّث وحدها.', 'Group products by hand, or by rules that update themselves.')}
          </EmptyState>
        ) : <DataTable label={tx('المجموعات', 'Collections')} rows={rows} columns={columns} rowKey={(c) => c.id} href={(c) => phref(`collections/${c.id}`)}
          card={(c) => <span className="flex items-center justify-between gap-2"><span className="font-semibold text-fg">{c.name[lang]}</span><span className="flex items-center gap-2 text-xs text-muted"><Badge tone={c.kind === 'smart' ? 'brand' : 'gray'}>{c.kind === 'smart' ? tx('ذكية', 'Smart') : tx('يدوية', 'Manual')}</Badge>{tx(`${collectionMembers(c, products, stock).length} منتجات`, `${collectionMembers(c, products, stock).length} products`)}</span></span>} />}
      </Card>
      <ReviewTools />
    </div>
  );
}

function Editor({ id }: { id: string }) {
  const tx = useTx();
  const { lang } = useLang();
  const names = useNames();
  const toast = useToast();
  const state = useDashState();
  const role = useRole();
  const canEdit = can(role, 'product.edit');
  const cols = collectionsStore.use();
  const products = productsStore.use();
  const cats = categoriesStore.use();
  const stock = useStock();
  const stored = cols.find((c) => c.id === id);
  const base = stored ?? blank();
  const kept = draftsStore.get()[id];
  const [d, setD] = useState<Collection>(kept ?? base);
  const [tried, setTried] = useState(false);
  const [pick, setPick] = useState(false);
  const [del, setDel] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(base);
  useUnsaved(dirty && canEdit, { ar: 'تعديلات المجموعة', en: 'Collection edits' });
  const members = useMemo(() => collectionMembers(d, products, stock), [d, products, stock]);
  const back = { href: phref('collections'), label: tx('المجموعات', 'Collections') };
  if (state === 'loading') return <div className="space-y-6" aria-busy="true"><PageHeader back={back} title={<Skeleton className="h-8 w-56" />} /><Skeleton className="h-80 rounded-2xl" /></div>;
  if (state === 'error') return <div className="space-y-6"><PageHeader back={back} title={tx('مجموعة', 'Collection')} /><Card><ErrorState as="h2" title={tx('تعذّر تحميل المجموعة', 'The collection could not load')} onRetry={() => setDashState('live')}>{tx('المرجع SIM-COL-504.', 'Ref SIM-COL-504.')}</ErrorState></Card></div>;
  if (id !== 'new' && !stored) return <div className="space-y-6"><PageHeader back={back} title={tx('المجموعة غير موجودة', 'Collection not found')} /><Card><EmptyState title={tx('لا توجد مجموعة بهذا المعرف', 'No collection with this id')} action={<LinkButton variant="secondary" href={back.href}>{tx('كل المجموعات', 'All collections')}</LinkButton>} /></Card></div>;

  const set = (p: Partial<Collection>) => { const n = { ...d, ...p }; setD(n); draftsStore.set((x) => ({ ...x, [id]: n })); };
  const clear = () => draftsStore.set((x) => { const n = { ...x }; delete n[id]; return n; });
  const discard = () => { setD(base); clear(); setTried(false); };
  const nameErr = (k: 'ar' | 'en') => (tried && !d.name[k].trim() ? tx('مطلوب', 'Required') : undefined);
  const ruleErrs = d.kind === 'smart' ? d.rules.map(validateRule) : [];
  const invalid = !d.name.ar.trim() || !d.name.en.trim() || (d.kind === 'smart' && (!d.rules.length || ruleErrs.some(Boolean)));
  const save = () => {
    setTried(true);
    if (invalid) return;
    const newId = stored ? stored.id : `col-${Date.now().toString(36)}`;
    const next: Collection = { ...d, id: newId, name: { ar: d.name.ar.trim(), en: d.name.en.trim() }, version: (stored?.version ?? 0) + 1 };
    collectionsStore.set((cs) => (stored ? cs.map((c) => (c.id === newId ? next : c)) : [...cs, next]));
    clear();
    toast({ tone: 'ok', text: tx(`حُفظت المجموعة · ${members.length} منتجات`, `Collection saved · ${members.length} products`) });
    if (!stored) replace(phref(`collections/${newId}`));
    else setD(next);
  };
  const setRule = (i: number, p: Partial<Rule>) => set({ rules: d.rules.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const fieldName: Record<RuleField, string> = { price: tx('السعر', 'Price'), compareAt: tx('عليه خصم', 'On sale'), category: tx('الفئة', 'Category'), tag: tx('الوسم', 'Tag'), stock: tx('المخزون', 'Stock'), status: tx('الحالة', 'Status') };
  const opName: Record<RuleOp, string> = { lt: tx('أقل من', 'less than'), gt: tx('أكثر من', 'more than'), is: tx('هو', 'is'), isNot: tx('ليس', 'is not'), inStock: tx('متوفر', 'in stock'), outOfStock: tx('نفد', 'sold out'), onSale: tx('نعم', 'yes') };
  const valueFor = (r: Rule, i: number) => {
    if (r.field === 'category') return <Select aria-label={tx('الفئة', 'Category')} value={r.value} onChange={(e) => setRule(i, { value: e.target.value })}><option value="">{tx('اختر…', 'Choose…')}</option>{categoryTree(cats).map(({ cat, depth }) => <option key={cat.id} value={cat.name.en.toLowerCase()}>{depth ? '— ' : ''}{cat.name[lang]}</option>)}</Select>;
    if (r.field === 'status') return <Select aria-label={tx('الحالة', 'Status')} value={r.value} onChange={(e) => setRule(i, { value: e.target.value })}><option value="">{tx('اختر…', 'Choose…')}</option>{(['active', 'draft', 'archived'] as const).map((s) => <option key={s} value={s}>{names.status(s)}</option>)}</Select>;
    if (r.field === 'stock' || r.field === 'compareAt') return null;
    return <Input aria-label={tx('القيمة', 'Value')} dir="ltr" inputMode={r.field === 'price' ? 'decimal' : 'text'} placeholder={r.field === 'price' ? '100' : 'ramadan'} value={r.value} onChange={(e) => setRule(i, { value: e.target.value })} />;
  };

  return (
    <div className="space-y-6">
      <PageHeader back={back} title={stored ? d.name[lang] || stored.name[lang] : tx('مجموعة جديدة', 'New collection')}
        meta={<>{dirty && <span className="text-[13px] text-amber-700 dark:text-amber-300">{tx('تغييرات غير محفوظة', 'Unsaved changes')}</span>}{!canEdit && roleBadge(tx)}</>}
        actions={canEdit && <>{stored && <Button variant="ghost" onClick={() => setDel(true)}><Trash2 className="size-4" aria-hidden="true" />{tx('احذف', 'Delete')}</Button>}<Button onClick={save} disabled={!dirty && !!stored}>{tx('احفظ', 'Save')}</Button></>} />
      {kept && dirty && <Alert tone="info" title={tx('استعدنا تعديلاتك غير المحفوظة', 'We restored your unsaved edits')} action={<Button variant="ghost" size="sm" onClick={discard}>{tx('تجاهلها', 'Discard them')}</Button>} />}
      <fieldset disabled={!canEdit} className="min-w-0">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="min-w-0 space-y-6">
            <Card>
              <CardHeader title={tx('الأساسيات', 'Basics')} />
              <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2">
                <Field label={tx('الاسم بالعربية', 'Name in Arabic')} error={nameErr('ar')}>{(p) => <Input {...p} dir="rtl" lang="ar" value={d.name.ar} onChange={(e) => set({ name: { ...d.name, ar: e.target.value } })} />}</Field>
                <Field label={tx('الاسم بالإنجليزية', 'Name in English')} error={nameErr('en')}>{(p) => <Input {...p} dir="ltr" lang="en" value={d.name.en} onChange={(e) => set({ name: { ...d.name, en: e.target.value } })} />}</Field>
                <div className="sm:col-span-2"><Segmented label={tx('نوع المجموعة', 'Collection type')} value={d.kind} onChange={(k) => set({ kind: k })}
                  options={[{ value: 'smart', label: tx('ذكية بشروط', 'Smart, by rules') }, { value: 'manual', label: tx('يدوية', 'Manual') }]} /></div>
              </div>
            </Card>
            {d.kind === 'smart' ? (
              <Card>
                <CardHeader title={tx('الشروط', 'Conditions')} hint={tx('تتحدّث المجموعة وحدها عندما تتغير المنتجات.', 'The collection updates itself when products change.')} />
                <div className="space-y-3 px-5 pb-5">
                  <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted">{tx('المنتج يطابق', 'Products match')}</span>
                    <Segmented label={tx('المطابقة', 'Match')} value={d.match} onChange={(m) => set({ match: m })} options={[{ value: 'all', label: tx('كل الشروط', 'all conditions') }, { value: 'any', label: tx('أي شرط', 'any condition') }]} />
                  </div>
                  <ul className="space-y-2">
                    {d.rules.map((r, i) => (
                      <li key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-border p-2 sm:grid-cols-[10rem_9rem_minmax(0,1fr)_auto] sm:items-center">
                        <Select aria-label={tx('الحقل', 'Field')} value={r.field} onChange={(e) => { const f = e.target.value as RuleField; setRule(i, { field: f, op: OPS[f][0], value: '' }); }}>{(Object.keys(OPS) as RuleField[]).map((f) => <option key={f} value={f}>{fieldName[f]}</option>)}</Select>
                        <Select aria-label={tx('الشرط', 'Condition')} value={r.op} onChange={(e) => setRule(i, { op: e.target.value as RuleOp })}>{OPS[r.field].map((o) => <option key={o} value={o}>{opName[o]}</option>)}</Select>
                        <div className="col-span-2 sm:col-span-1">{valueFor(r, i)}{tried && ruleErrs[i] && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{ruleErrs[i] === 'money' ? tx('مبلغ أكبر من صفر', 'An amount above zero') : tx('اختر قيمة', 'Choose a value')}</p>}</div>
                        <button type="button" onClick={() => set({ rules: d.rules.filter((_, j) => j !== i) })} aria-label={tx(`احذف الشرط ${i + 1}`, `Remove condition ${i + 1}`)} className="grid size-9 place-items-center justify-self-end rounded-lg text-muted hover:bg-surface-2 hover:text-fg"><X className="size-4" aria-hidden="true" /></button>
                      </li>
                    ))}
                  </ul>
                  {tried && !d.rules.length && <Alert tone="bad">{tx('أضف شرطًا واحدًا على الأقل.', 'Add at least one condition.')}</Alert>}
                  <Button variant="secondary" size="sm" onClick={() => set({ rules: [...d.rules, { field: 'stock', op: 'inStock', value: '' }] })}><Plus className="size-4" aria-hidden="true" />{tx('أضف شرطًا', 'Add condition')}</Button>
                </div>
              </Card>
            ) : null}
            <Card>
              <CardHeader title={d.kind === 'smart' ? tx(`المنتجات المطابقة الآن (${members.length})`, `Matching now (${members.length})`) : tx(`المنتجات (${members.length})`, `Products (${members.length})`)}
                hint={d.kind === 'smart' ? tx('معاينة قبل الحفظ، من الكتالوج الحالي.', 'A preview before saving, from the current catalogue.') : undefined}
                action={d.kind === 'manual' && canEdit ? <Button variant="secondary" size="sm" onClick={() => setPick(true)}><Plus className="size-4" aria-hidden="true" />{tx('أضف منتجات', 'Add products')}</Button> : undefined} />
              {members.length === 0 ? <p className="px-5 pb-6 text-sm text-muted">{d.kind === 'smart' ? (ruleErrs.some(Boolean) ? tx('أكمل الشروط لترى المطابقة.', 'Complete the conditions to see matches.') : tx('لا منتج يطابق هذه الشروط.', 'No product matches these conditions.')) : tx('لا منتجات بعد.', 'No products yet.')}</p> : (
                <ul className="divide-y divide-border border-t border-border">
                  {members.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                      <ProductImage src={listPhoto(p)} alt="" size={36} />
                      <a href={phref(p.id)} className="min-w-0 flex-1 truncate text-sm font-semibold text-fg hover:underline">{p.name[lang]}</a>
                      <Badge tone={p.status === 'active' ? 'green' : 'gray'}>{names.status(p.status)}</Badge>
                      {d.kind === 'manual' && canEdit && (
                        <span className="flex items-center gap-1">
                          <Mini label={tx('قدّم', 'Move up')} disabled={i === 0} onClick={() => set({ productIds: moveItem(d.productIds.filter((x) => members.some((m) => m.id === x)), i, -1) })}><ArrowUp className="size-4" /></Mini>
                          <Mini label={tx('أخّر', 'Move down')} disabled={i === members.length - 1} onClick={() => set({ productIds: moveItem(d.productIds.filter((x) => members.some((m) => m.id === x)), i, 1) })}><ArrowDown className="size-4" /></Mini>
                          <Mini label={tx(`أزل ${p.name.ar}`, `Remove ${p.name.en}`)} onClick={() => set({ productIds: d.productIds.filter((x) => x !== p.id) })}><X className="size-4" /></Mini>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          <aside className="space-y-6 lg:sticky lg:top-24">
            <Card>
              <CardHeader title={tx('الظهور', 'Visibility')} />
              <label className="mx-5 mb-5 flex items-center justify-between gap-3 text-sm font-medium text-fg">{tx('ظاهرة في المتجر', 'Visible in the store')}<Switch checked={d.visible} onChange={(v) => set({ visible: v })} label={tx('ظاهرة في المتجر', 'Visible in the store')} /></label>
            </Card>
          </aside>
        </div>
      </fieldset>
      <ReviewTools />
      {canEdit && <SaveBar dirty={dirty} onSave={save} onDiscard={discard} error={tried && invalid ? tx('أكمل الحقول المطلوبة', 'Complete the required fields') : undefined} />}
      {pick && <Picker selected={d.productIds} onClose={() => setPick(false)} onAdd={(ids) => { set({ productIds: [...d.productIds, ...ids.filter((x) => !d.productIds.includes(x))] }); setPick(false); }} />}
      {del && stored && (
        <Modal title={tx(`حذف «${stored.name.ar}»`, `Delete “${stored.name.en}”`)} onClose={() => setDel(false)}
          footer={<><Button variant="secondary" onClick={() => setDel(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => { collectionsStore.set((cs) => cs.filter((c) => c.id !== stored.id)); clear(); toast({ tone: 'ok', text: tx('حُذفت المجموعة. المنتجات لم تتغير.', 'Collection deleted. Products are unchanged.') }); navigate(phref('collections')); }}>{tx('احذف المجموعة', 'Delete collection')}</Button></>}>
          <p className="text-sm text-muted">{tx('لا يُحذف أي منتج.', 'No product is deleted.')}</p>
        </Modal>
      )}
    </div>
  );
}

function Mini({ label, children, ...p }: { label: string; children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return <button type="button" aria-label={label} title={label} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40 [&_svg]:pointer-events-none" {...p}>{children}</button>;
}

function Picker({ selected, onClose, onAdd }: { selected: string[]; onClose: () => void; onAdd: (ids: string[]) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const products = productsStore.use();
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const n = q.trim().toLowerCase();
  const list = products.filter((p) => !selected.includes(p.id) && (!n || p.name.en.toLowerCase().includes(n) || p.name.ar.includes(q.trim()) || p.sku.toLowerCase().includes(n)));
  return (
    <Modal title={tx('أضف منتجات', 'Add products')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => onAdd([...chosen])} disabled={!chosen.size}>{tx(`أضف ${chosen.size}`, `Add ${chosen.size}`)}</Button></>}>
      <label className="flex items-center gap-2 rounded-xl border border-border px-3"><Search className="size-4 text-muted" aria-hidden="true" /><input className="h-10 flex-1 bg-transparent text-sm outline-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx('ابحث بالاسم أو SKU', 'Search name or SKU')} aria-label={tx('ابحث', 'Search')} /></label>
      <ul className="scrollbar-thin max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border">
        {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{tx('لا نتائج', 'No results')}</li>}
        {list.map((p) => (
          <li key={p.id}><label className={cn('flex cursor-pointer items-center gap-3 px-3 py-2', chosen.has(p.id) && 'bg-brand-500/5')}>
            <input type="checkbox" className="size-4 accent-brand-600" checked={chosen.has(p.id)} onChange={(e) => setChosen((s) => { const x = new Set(s); if (e.target.checked) x.add(p.id); else x.delete(p.id); return x; })} />
            <ProductImage src={listPhoto(p)} alt="" size={32} /><span className="min-w-0 flex-1 truncate text-sm text-fg">{p.name[lang]}</span>
          </label></li>
        ))}
      </ul>
    </Modal>
  );
}
