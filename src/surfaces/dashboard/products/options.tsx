// Fields, size charts and shopper filters (`#/dashboard/products/options?tab=fields|sizes|filters`).
// Fields: product details (shown on the product page, optionally a store filter) and order questions (asked at checkout,
// kept on the order, its invoice and exports), each linked to product types and/or categories, with a live preview of
// exactly what the shopper sees. Size charts per category with a check against the sizes your products really sell.
// Filters: which ones the store shows and in what order, previewed with real counts. Rules: merchant/catalog-extras.ts.
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ListChecks, Pencil, Plus, Ruler, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { Route } from '../../../core/router';
import { useLang } from '../../../core/lang';
import type { L } from '../../merchant/domain';
import { catKey, categoryTree, type ProductType } from '../../merchant/catalog';
import {
  FIELD_KINDS, PRODUCT_TYPES, chartGaps, filterKeys, filterPreview, productFields, validateChart, validateFieldDef,
  type CustomField, type FieldKind, type FilterKey, type FilterSettings, type SizeChart,
} from '../../merchant/catalog-extras';
import { can } from '../../merchant/perms';
import { catalogXStore, categoriesStore, levelsStore, logAction, productsStore } from '../../merchant/stores';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, InfoHint, Skeleton, cn, useTx } from '../../../ds/ui';
import { Alert, Field, Input, Modal, PageHeader, SaveBar, Select, Switch, Tabs, Textarea, useToast } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { useUnsaved } from '../unsaved';
import { CatalogNav, ReviewTools, phref, productCount, roleBadge, useRole } from './common';
import { CheckoutQuestions, SizeChartBlock } from './storefront-parts';
import { useTypeInfo } from './types';
import { stockOf } from './model';

type Tab = 'fields' | 'sizes' | 'filters';
const readTab = (v: string | null): Tab => (v === 'sizes' || v === 'filters' ? v : 'fields');

export default function Options({ route }: { route: Route }) {
  const tx = useTx();
  const state = useDashState();
  const role = useRole();
  const canEdit = can(role, 'product.edit');
  const tab = readTab(route.query.get('tab'));
  const x = catalogXStore.use();
  const header = (
    <PageHeader back={{ href: phref(), label: tx('المنتجات', 'Products') }} title={tx('الحقول والمقاسات والمرشحات', 'Fields, sizes & filters')}
      description={tx('ما يظهر في صفحة المنتج، وما يُسأل عند الدفع، وكيف يصفّي العملاء متجرك.', 'What shows on product pages, what checkout asks, and how shoppers filter your store.')}
      meta={!canEdit ? roleBadge(tx) : undefined} />
  );
  const tabs = <Tabs label={tx('الأقسام', 'Sections')} items={[
    { href: phref('options', { tab: 'fields' }), label: tx('الحقول المخصصة', 'Custom fields'), current: tab === 'fields', count: x.fields.length },
    { href: phref('options', { tab: 'sizes' }), label: tx('جداول المقاسات', 'Size charts'), current: tab === 'sizes', count: x.charts.length },
    { href: phref('options', { tab: 'filters' }), label: tx('مرشحات المتجر', 'Store filters'), current: tab === 'filters' },
  ]} />;
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<CatalogNav />{tabs}<Skeleton className="h-80 rounded-2xl" /></div>;
  if (state === 'error') return <div className="space-y-6">{header}<CatalogNav />{tabs}<Card><ErrorState as="h2" title={tx('تعذّر التحميل', 'Could not load')} onRetry={() => setDashState('live')}>{tx('لم يتغير شيء. المرجع SIM-OPT-503.', 'Nothing changed. Ref SIM-OPT-503.')}</ErrorState></Card></div>;
  return (
    <div className="space-y-6">
      {header}
      <CatalogNav />
      {tabs}
      {tab === 'fields' && <FieldsTab canEdit={canEdit} empty={state === 'empty'} />}
      {tab === 'sizes' && <SizesTab canEdit={canEdit} empty={state === 'empty'} />}
      {tab === 'filters' && <FiltersTab canEdit={canEdit} />}
      <ReviewTools />
    </div>
  );
}

function IconBtn({ label, children, ...p }: { label: string; children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return <button type="button" aria-label={label} title={label} className="grid size-9 place-items-center rounded-lg border border-border text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40 [&_svg]:pointer-events-none" {...p}>{children}</button>;
}

function useKindName() {
  const tx = useTx();
  return (k: FieldKind) => ({ text: tx('نص', 'Text'), number: tx('رقم', 'Number'), choice: tx('خيارات', 'Choice'), date: tx('تاريخ', 'Date'), file: tx('ملف', 'File') })[k];
}
function useScopeText() {
  const tx = useTx();
  const { lang } = useLang();
  const info = useTypeInfo();
  const cats = categoriesStore.use();
  return (f: Pick<CustomField, 'types' | 'cats'>) => {
    const parts: string[] = [];
    if (f.types.length) parts.push(f.types.map((t) => info(t).name).join(lang === 'ar' ? '، ' : ', '));
    if (f.cats.length) parts.push(f.cats.map((k) => cats.find((c) => catKey(c.name) === k)?.name[lang] ?? k).join(lang === 'ar' ? '، ' : ', '));
    return parts.length ? parts.join(' · ') : tx('كل المنتجات', 'All products');
  };
}

/* ───────────── Custom fields ───────────── */

let keptField: CustomField | null = null;
const newField = (scope: CustomField['scope']): CustomField => ({ id: '', scope, label: { ar: '', en: '' }, help: { ar: '', en: '' }, kind: 'text', options: [], required: false, types: [], cats: [], active: true, ...(scope === 'order' ? { onInvoice: true } : {}) });

function FieldsTab({ canEdit, empty }: { canEdit: boolean; empty: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const x = catalogXStore.use();
  const products = productsStore.use();
  const kind = useKindName();
  const scopeText = useScopeText();
  const [form, setForm] = useState<CustomField | null>(keptField);
  const fields = empty ? [] : x.fields;
  const toggle = (f: CustomField) => {
    catalogXStore.set((s) => ({ ...s, fields: s.fields.map((y) => (y.id === f.id ? { ...y, active: !y.active } : y)) }));
    logAction('products', f.active ? { ar: `أوقف الحقل ${f.label.ar}`, en: `Turned off field ${f.label.en}` } : { ar: `فعّل الحقل ${f.label.ar}`, en: `Turned on field ${f.label.en}` }, { target: f.id });
  };
  const remove = (f: CustomField) => {
    const before = catalogXStore.get().fields;
    catalogXStore.set((s) => ({ ...s, fields: s.fields.filter((y) => y.id !== f.id), filters: { ...s.filters, order: s.filters.order.filter((k) => k !== `field:${f.id}`) } }));
    logAction('products', { ar: `حذف الحقل ${f.label.ar}`, en: `Deleted field ${f.label.en}` }, { target: f.id });
    toast({ tone: 'info', text: f.scope === 'product' ? tx('حُذف الحقل. القيم المحفوظة في المنتجات لا تُعرض بعد الآن.', 'Field deleted. Values saved on products are no longer shown.') : tx('حُذف السؤال. إجابات الطلبات السابقة باقية فيها.', 'Question deleted. Answers on past orders stay on them.'), action: { label: tx('تراجع', 'Undo'), run: () => catalogXStore.set((s) => ({ ...s, fields: before })) } });
  };
  const section = (scope: CustomField['scope'], title: string, hint: string, icon: ReactNode) => {
    const list = fields.filter((f) => f.scope === scope);
    return (
      <Card aria-labelledby={`of-${scope}`}>
        <CardHeader id={`of-${scope}`} title={title} hint={hint} action={canEdit && <Button size="sm" variant="secondary" onClick={() => setForm(newField(scope))}><Plus className="size-4" aria-hidden="true" />{scope === 'product' ? tx('حقل مواصفات', 'Detail field') : tx('سؤال طلب', 'Order question')}</Button>} />
        {list.length === 0 ? <EmptyState icon={icon} title={scope === 'product' ? tx('لا حقول مواصفات', 'No detail fields') : tx('لا أسئلة عند الدفع', 'No checkout questions')}>{scope === 'product' ? tx('مثل الخامة أو بلد الصنع أو دليل العناية.', 'Such as material, country of origin or a care guide.') : tx('مثل اسم المُهدى إليه أو يوم التوصيل المفضّل.', 'Such as a gift recipient’s name or a preferred delivery day.')}</EmptyState> : (
          <ul className="divide-y divide-border">
            {list.map((f) => {
              const used = scope === 'product' ? products.filter((p) => productFields([f], p).some((a) => a.value)).length : null;
              return (
                <li key={f.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5', !f.active && 'opacity-60')}>
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-fg">{f.label[lang]}<Badge tone="gray">{kind(f.kind)}</Badge>{f.required && <Badge tone="amber">{tx('إلزامي', 'Required')}</Badge>}{f.filterable && <Badge tone="sky">{tx('مرشح في المتجر', 'Store filter')}</Badge>}{scope === 'order' && f.onInvoice !== false && <Badge tone="gray">{tx('في الفاتورة', 'On invoice')}</Badge>}</p>
                    <p className="text-xs text-muted">{scopeText(f)}{used !== null && ` · ${tx(`له قيمة في ${productCount(tx, used)}`, `set on ${productCount(tx, used)}`)}`}</p>
                  </div>
                  {canEdit && <div className="flex items-center gap-1">
                    <Switch checked={f.active} onChange={() => toggle(f)} label={tx(`تفعيل ${f.label.ar}`, `${f.label.en} on`)} />
                    <IconBtn label={tx(`عدّل ${f.label.ar}`, `Edit ${f.label.en}`)} onClick={() => setForm(f)}><Pencil className="size-4" /></IconBtn>
                    <IconBtn label={tx(`احذف ${f.label.ar}`, `Delete ${f.label.en}`)} onClick={() => remove(f)}><Trash2 className="size-4" /></IconBtn>
                  </div>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    );
  };
  return (
    <>
      {section('product', tx('مواصفات المنتج', 'Product details'), tx('تعبئها لكل منتج في المحرر وتظهر في صفحة المنتج.', 'Filled per product in the editor; shown on the product page.'), <ListChecks className="size-6" aria-hidden="true" />)}
      {section('order', tx('أسئلة عند الدفع', 'Checkout questions'), tx('تُسأل فقط إذا كانت السلة فيها نوع أو فئة مرتبطة، وتُحفظ في الطلب والفاتورة والتصدير.', 'Asked only when the bag holds a linked type or category; saved on the order, invoice and export.'), <ListChecks className="size-6" aria-hidden="true" />)}
      {form && <FieldForm initial={form} onClose={() => { keptField = null; setForm(null); }} onKeep={(f) => { keptField = f; }} />}
    </>
  );
}

function FieldForm({ initial, onClose, onKeep }: { initial: CustomField; onClose: () => void; onKeep: (f: CustomField) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const x = catalogXStore.use();
  const cats = categoriesStore.use();
  const products = productsStore.use();
  const info = useTypeInfo();
  const kindName = useKindName();
  const [f, setF] = useState(initial);
  const [tried, setTried] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const orig = x.fields.find((y) => y.id === f.id);
  useUnsaved(JSON.stringify(f) !== JSON.stringify(orig ?? initial), { ar: 'نموذج الحقل', en: 'Field form' });
  const set = (p: Partial<CustomField>) => { const n = { ...f, ...p }; setF(n); onKeep(n); };
  const id = f.id || `${f.scope === 'product' ? 'f' : 'o'}-${(f.label.en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || Date.now().toString(36)).slice(0, 24)}`;
  const def: CustomField = { ...f, id, options: f.options.filter((o) => o.ar.trim() || o.en.trim()), ...(f.filterable && !(f.scope === 'product' && (f.kind === 'choice' || f.kind === 'number')) ? { filterable: false } : {}) };
  const errs = validateFieldDef(def, x.fields.filter((y) => y.id !== f.id || !!orig));
  const msg = (k: keyof typeof errs) => (tried && errs[k] ? ({ required: tx('مطلوب', 'Required'), taken: tx('مستخدم لحقل آخر', 'Used by another field'), options: tx('خياران على الأقل، بالعربية والإنجليزية، بلا تكرار', 'At least two options, Arabic and English, no repeats'), filter: tx('المرشح لحقول الخيارات والأرقام فقط', 'Filters are for choice and number fields only') })[errs[k]!] : undefined);
  const reach = f.scope === 'product' ? products.filter((p) => p.status !== 'archived' && productFields([{ ...def, active: true }], p).length).length : null;
  const save = () => {
    setTried(true);
    if (Object.keys(errs).length) return;
    catalogXStore.set((s) => ({ ...s, fields: orig ? s.fields.map((y) => (y.id === id ? def : y)) : [...s.fields, def] }));
    logAction('products', orig ? { ar: `عدّل الحقل ${def.label.ar}`, en: `Edited field ${def.label.en}` } : { ar: `أضاف الحقل ${def.label.ar}`, en: `Added field ${def.label.en}` }, { target: id });
    toast({ tone: 'ok', text: tx('حُفظ الحقل', 'Field saved') });
    onClose();
  };
  const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((y) => y !== v) : [...list, v]);
  const chip = 'inline-flex h-8 cursor-pointer select-none items-center rounded-full border border-border px-3 text-[13px] font-medium has-[:checked]:border-brand-500 has-[:checked]:bg-brand-500/10 has-[:checked]:text-brand-800 dark:has-[:checked]:text-brand-200';
  return (
    <Modal size="lg" title={orig ? tx('تعديل الحقل', 'Edit field') : f.scope === 'product' ? tx('حقل مواصفات جديد', 'New detail field') : tx('سؤال جديد عند الدفع', 'New checkout question')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={save}>{tx('احفظ', 'Save')}</Button></>}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={tx('الاسم بالعربية', 'Arabic label')} error={msg('labelAr')}>{(p) => <Input {...p} value={f.label.ar} onChange={(e) => set({ label: { ...f.label, ar: e.target.value } })} />}</Field>
            <Field label={tx('الاسم بالإنجليزية', 'English label')} error={msg('labelEn')}>{(p) => <Input {...p} dir="ltr" value={f.label.en} onChange={(e) => set({ label: { ...f.label, en: e.target.value } })} />}</Field>
            <Field label={tx('النوع', 'Kind')}>{(p) => <Select {...p} value={f.kind} onChange={(e) => set({ kind: e.target.value as FieldKind })}>{FIELD_KINDS.map((k) => <option key={k} value={k}>{kindName(k)}{k === 'file' ? tx(' (محاكاة)', ' (simulated)') : ''}</option>)}</Select>}</Field>
            <Field label={tx('تلميح', 'Help text')} optional>{(p) => <Input {...p} value={f.help[lang]} onChange={(e) => set({ help: { ...f.help, [lang]: e.target.value } as L })} />}</Field>
          </div>
          {f.kind === 'choice' && (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-[13px] font-semibold text-fg">{tx('الخيارات', 'Options')}</legend>
              {f.options.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <Input aria-label={tx(`الخيار ${i + 1} بالعربية`, `Option ${i + 1}, Arabic`)} value={o.ar} onChange={(e) => set({ options: f.options.map((y, j) => (j === i ? { ...y, ar: e.target.value } : y)) })} />
                  <Input aria-label={tx(`الخيار ${i + 1} بالإنجليزية`, `Option ${i + 1}, English`)} dir="ltr" value={o.en} onChange={(e) => set({ options: f.options.map((y, j) => (j === i ? { ...y, en: e.target.value } : y)) })} />
                  <IconBtn label={tx('احذف الخيار', 'Remove option')} onClick={() => set({ options: f.options.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></IconBtn>
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={() => set({ options: [...f.options, { ar: '', en: '' }] })}><Plus className="size-4" aria-hidden="true" />{tx('أضف خيارًا', 'Add option')}</Button>
              {msg('options') && <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{msg('options')}</p>}
            </fieldset>
          )}
          <fieldset><legend className="mb-2 text-[13px] font-semibold text-fg">{tx('لأنواع المنتجات', 'For product types')} <span className="font-normal text-muted">({tx('بلا اختيار = الكل', 'none = all')})</span></legend>
            <div className="flex flex-wrap gap-1.5">{PRODUCT_TYPES.map((t) => <label key={t} className={chip}><input type="checkbox" className="sr-only" checked={f.types.includes(t)} onChange={() => set({ types: toggleIn<ProductType>(f.types, t) })} />{info(t).name}</label>)}</div>
          </fieldset>
          <fieldset><legend className="mb-2 text-[13px] font-semibold text-fg">{tx('للفئات', 'For categories')} <span className="font-normal text-muted">({tx('بلا اختيار = الكل', 'none = all')})</span></legend>
            <div className="flex flex-wrap gap-1.5">{categoryTree(cats).map(({ cat }) => <label key={cat.id} className={chip}><input type="checkbox" className="sr-only" checked={f.cats.includes(catKey(cat.name))} onChange={() => set({ cats: toggleIn(f.cats, catKey(cat.name)) })} />{cat.name[lang]}</label>)}</div>
          </fieldset>
          <div className="space-y-2">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"><span className="text-sm text-fg">{f.scope === 'product' ? tx('إلزامي في المحرر', 'Required in the editor') : tx('إلزامي عند الدفع', 'Required at checkout')}</span><Switch checked={f.required} onChange={(v) => set({ required: v })} label={tx('إلزامي', 'Required')} /></label>
            {f.scope === 'product' && (f.kind === 'choice' || f.kind === 'number') && <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"><span className="text-sm text-fg">{tx('مرشح في المتجر', 'Store filter')}<span className="block text-xs text-muted">{tx('يظهر في مرشحات المتجر بعدد المنتجات لكل قيمة.', 'Shows in store filters with a product count per value.')}</span></span><Switch checked={!!f.filterable} onChange={(v) => set({ filterable: v })} label={tx('مرشح', 'Filter')} /></label>}
            {f.scope === 'order' && <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"><span className="text-sm text-fg">{tx('يُطبع في الفاتورة وقائمة التعبئة', 'Printed on invoice and packing slip')}</span><Switch checked={f.onInvoice !== false} onChange={(v) => set({ onInvoice: v })} label={tx('في الفاتورة', 'On invoice')} /></label>}
          </div>
        </div>
        <aside className="space-y-3 rounded-xl bg-surface-2 p-3" aria-label={tx('معاينة', 'Preview')}>
          <p className="text-xs font-semibold text-muted">{f.scope === 'product' ? tx('في صفحة المنتج', 'On the product page') : tx('كما يراه العميل عند الدفع', 'As the shopper sees it at checkout')}</p>
          {f.scope === 'order' ? (
            <CheckoutQuestions questions={[{ id: 'preview', label: { ar: f.label.ar || '…', en: f.label.en || '…' }, help: f.help, kind: f.kind, options: def.options, required: f.required, onInvoice: f.onInvoice !== false, why: { ar: '', en: '' } }]}
              answers={answers} onAnswer={(k, v) => setAnswers({ ...answers, [k]: v })} errors={{}} show={false} problems={[]} age={null} ageOk={false} onAge={() => {}} />
          ) : (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 text-sm"><dt className="text-muted">{f.label[lang] || '…'}</dt><dd className="font-medium">{f.kind === 'choice' ? def.options[0]?.[lang] ?? '…' : f.kind === 'file' ? 'guide.pdf' : f.kind === 'date' ? '2026-12-01' : f.kind === 'number' ? '42' : tx('قيمة', 'Value')}</dd></dl>
          )}
          <p className="text-xs text-muted">{f.scope === 'product' ? tx(`ينطبق على ${productCount(tx, reach ?? 0)}.`, `Applies to ${productCount(tx, reach ?? 0)}.`) : tx('يظهر فقط عندما تحتوي السلة منتجًا من النوع أو الفئة المختارة.', 'Shown only when the bag holds a product of the chosen type or category.')}</p>
        </aside>
      </div>
    </Modal>
  );
}

/* ───────────── Size charts ───────────── */

let keptChart: SizeChart | null = null;
const newChart = (): SizeChart => ({ id: '', name: { ar: '', en: '' }, cats: [], unit: 'cm', sizes: ['S', 'M', 'L'], rows: [{ label: { ar: 'الصدر', en: 'Chest' }, values: ['', '', ''] }], note: { ar: '', en: '' }, active: true });

function SizesTab({ canEdit, empty }: { canEdit: boolean; empty: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const x = catalogXStore.use();
  const products = productsStore.use();
  const cats = categoriesStore.use();
  const [form, setForm] = useState<SizeChart | null>(keptChart);
  const charts = empty ? [] : x.charts;
  const catName = (k: string) => cats.find((c) => catKey(c.name) === k)?.name[lang] ?? k;
  const remove = (c: SizeChart) => {
    const before = catalogXStore.get().charts;
    catalogXStore.set((s) => ({ ...s, charts: s.charts.filter((y) => y.id !== c.id) }));
    logAction('products', { ar: `حذف جدول المقاسات ${c.name.ar}`, en: `Deleted size chart ${c.name.en}` }, { target: c.id });
    toast({ tone: 'info', text: tx('حُذف الجدول من صفحات المنتجات', 'Chart removed from product pages'), action: { label: tx('تراجع', 'Undo'), run: () => catalogXStore.set((s) => ({ ...s, charts: before })) } });
  };
  return (
    <Card aria-labelledby="sc-h">
      <CardHeader id="sc-h" title={tx('جداول المقاسات', 'Size charts')} hint={tx('جدول لكل فئة يظهر في صفحة كل منتج فيها له مقاسات، مع تظليل المقاس الذي اختاره العميل.', 'One chart per category, shown on each of its products with sizes, highlighting the size the shopper picked.')}
        action={canEdit && <Button size="sm" variant="secondary" onClick={() => setForm(newChart())}><Plus className="size-4" aria-hidden="true" />{tx('جدول جديد', 'New chart')}</Button>} />
      {charts.length === 0 ? <EmptyState icon={<Ruler className="size-6" aria-hidden="true" />} title={tx('لا جداول مقاسات', 'No size charts')} action={canEdit ? <Button onClick={() => setForm(newChart())}>{tx('أنشئ جدولًا', 'Create a chart')}</Button> : undefined}>{tx('يقلل الإرجاع بسبب المقاس.', 'Cuts returns caused by fit.')}</EmptyState> : (
        <ul className="divide-y divide-border">
          {charts.map((c) => {
            const g = chartGaps(c, products);
            return (
              <li key={c.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5', !c.active && 'opacity-60')}>
                <div className="min-w-0 flex-1 basis-56">
                  <p className="font-semibold text-fg">{c.name[lang]} <span className="text-xs font-normal text-muted">· {c.cats.map(catName).join(lang === 'ar' ? '، ' : ', ')} · <bdi dir="ltr">{c.sizes.join(' / ')}</bdi></span></p>
                  <p className="text-xs text-muted">{tx(`يظهر في ${productCount(tx, g.products)}`, `Shown on ${productCount(tx, g.products)}`)}
                    {g.missing.length > 0 && <span className="font-medium text-amber-700 dark:text-amber-300"> · {tx('مقاسات تبيعها وليست في الجدول: ', 'Sizes you sell that it doesn’t cover: ')}<bdi dir="ltr">{g.missing.join(', ')}</bdi></span>}</p>
                </div>
                {canEdit && <div className="flex items-center gap-1">
                  <Switch checked={c.active} onChange={(v) => { catalogXStore.set((s) => ({ ...s, charts: s.charts.map((y) => (y.id === c.id ? { ...y, active: v } : y)) })); logAction('products', { ar: `${v ? 'فعّل' : 'أوقف'} جدول ${c.name.ar}`, en: `${v ? 'Turned on' : 'Turned off'} chart ${c.name.en}` }, { target: c.id }); }} label={tx('مفعّل', 'Active')} />
                  <IconBtn label={tx('عدّل', 'Edit')} onClick={() => setForm(c)}><Pencil className="size-4" /></IconBtn>
                  <IconBtn label={tx('احذف', 'Delete')} onClick={() => remove(c)}><Trash2 className="size-4" /></IconBtn>
                </div>}
              </li>
            );
          })}
        </ul>
      )}
      {form && <ChartForm initial={form} onClose={() => { keptChart = null; setForm(null); }} onKeep={(c) => { keptChart = c; }} />}
    </Card>
  );
}

function ChartForm({ initial, onClose, onKeep }: { initial: SizeChart; onClose: () => void; onKeep: (c: SizeChart) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const x = catalogXStore.use();
  const cats = categoriesStore.use();
  const products = productsStore.use();
  const [c, setC] = useState(initial);
  const [sizesText, setSizesText] = useState(initial.sizes.join(', '));
  const [tried, setTried] = useState(false);
  const orig = x.charts.find((y) => y.id === c.id);
  useUnsaved(JSON.stringify(c) !== JSON.stringify(orig ?? initial), { ar: 'جدول المقاسات', en: 'Size chart' });
  const set = (p: Partial<SizeChart>) => { const n = { ...c, ...p }; setC(n); onKeep(n); };
  const setSizes = (text: string) => {
    setSizesText(text);
    const sizes = text.split(/[,،]/).map((s) => s.trim()).filter(Boolean);
    set({ sizes, rows: c.rows.map((r) => ({ ...r, values: sizes.map((s) => r.values[c.sizes.indexOf(s)] ?? '') })) });
  };
  const id = c.id || `sc-${Date.now().toString(36)}`;
  const errs = validateChart({ ...c, id }, x.charts);
  const gaps = chartGaps(c, products);
  const save = () => {
    setTried(true);
    if (Object.keys(errs).length) return;
    const def = { ...c, id };
    catalogXStore.set((s) => ({ ...s, charts: orig ? s.charts.map((y) => (y.id === id ? def : y)) : [...s.charts, def] }));
    logAction('products', orig ? { ar: `عدّل جدول المقاسات ${def.name.ar}`, en: `Edited size chart ${def.name.en}` } : { ar: `أنشأ جدول المقاسات ${def.name.ar}`, en: `Created size chart ${def.name.en}` }, { target: id });
    toast({ tone: 'ok', text: tx('حُفظ الجدول وظهر في صفحات المنتجات', 'Chart saved and live on product pages') });
    onClose();
  };
  const e = (k: string) => (tried ? errs[k] : undefined);
  const em = (k: string) => { const v = e(k); return v ? ({ required: tx('مطلوب', 'Required'), sizes: tx('مقاسات بلا تكرار، مفصولة بفاصلة', 'Sizes without repeats, comma-separated'), rows: tx('أضف قياسًا واحدًا على الأقل', 'Add at least one measure'), value: tx('رقم أو مدى مثل 88-92', 'A number or range like 88-92'), cats: tx('اختر فئة', 'Choose a category'), taken: tx('فئة لها جدول آخر مفعّل', 'A category already has an active chart') } as Record<string, string>)[v] : undefined; };
  return (
    <Modal size="lg" title={orig ? tx('تعديل جدول المقاسات', 'Edit size chart') : tx('جدول مقاسات جديد', 'New size chart')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={save}>{tx('احفظ', 'Save')}</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={tx('الاسم بالعربية', 'Arabic name')} error={em('nameAr')}>{(p) => <Input {...p} value={c.name.ar} onChange={(ev) => set({ name: { ...c.name, ar: ev.target.value } })} />}</Field>
          <Field label={tx('الاسم بالإنجليزية', 'English name')} error={em('nameEn')}>{(p) => <Input {...p} dir="ltr" value={c.name.en} onChange={(ev) => set({ name: { ...c.name, en: ev.target.value } })} />}</Field>
          <Field label={tx('الوحدة', 'Unit')}>{(p) => <Select {...p} value={c.unit} onChange={(ev) => set({ unit: ev.target.value as SizeChart['unit'] })}><option value="cm">{tx('سنتيمتر', 'Centimetres')}</option><option value="in">{tx('إنش', 'Inches')}</option></Select>}</Field>
        </div>
        <fieldset><legend className="mb-2 text-[13px] font-semibold text-fg">{tx('الفئات', 'Categories')}</legend>
          <div className="flex flex-wrap gap-1.5">{categoryTree(cats).map(({ cat }) => { const k = catKey(cat.name); return <label key={cat.id} className="inline-flex h-8 cursor-pointer items-center rounded-full border border-border px-3 text-[13px] font-medium has-[:checked]:border-brand-500 has-[:checked]:bg-brand-500/10"><input type="checkbox" className="sr-only" checked={c.cats.includes(k)} onChange={() => set({ cats: c.cats.includes(k) ? c.cats.filter((y) => y !== k) : [...c.cats, k] })} />{cat.name[lang]}</label>; })}</div>
          {em('cats') && <p role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{em('cats')}</p>}
        </fieldset>
        <Field label={tx('المقاسات (بالترتيب، مفصولة بفاصلة)', 'Sizes (in order, comma-separated)')} error={em('sizes')}>{(p) => <Input {...p} dir="ltr" value={sizesText} onChange={(ev) => setSizes(ev.target.value)} />}</Field>
        {(gaps.missing.length > 0 || gaps.unused.length > 0) && c.cats.length > 0 && (
          <Alert tone="warn" title={tx('مقارنة بمنتجاتك', 'Compared with your products')} action={gaps.missing.length ? <Button size="sm" variant="secondary" onClick={() => setSizes([...c.sizes, ...gaps.missing].join(', '))}>{tx('أضف الناقص', 'Add missing')}</Button> : undefined}>
            {gaps.missing.length > 0 && <p>{tx('تبيعها ولا يشرحها الجدول: ', 'You sell these but the chart doesn’t cover them: ')}<bdi dir="ltr">{gaps.missing.join(', ')}</bdi></p>}
            {gaps.unused.length > 0 && <p>{tx('في الجدول ولا يبيعها أي منتج: ', 'In the chart but no product sells them: ')}<bdi dir="ltr">{gaps.unused.join(', ')}</bdi></p>}
          </Alert>
        )}
        <div className="overflow-x-auto"><table className="w-full min-w-[30rem] text-sm">
          <thead><tr><th scope="col" className="pb-2 text-start text-[13px] font-semibold">{tx('القياس (عربي / إنجليزي)', 'Measure (Arabic / English)')}</th>{c.sizes.map((s) => <th key={s} scope="col" className="pb-2 text-center text-[13px] font-semibold"><bdi>{s}</bdi></th>)}<th /></tr></thead>
          <tbody>{c.rows.map((r, i) => (
            <tr key={i}>
              <td className="py-1 pe-2"><div className="flex gap-1"><Input aria-label={tx('القياس بالعربية', 'Measure, Arabic')} className="h-9" value={r.label.ar} onChange={(ev) => set({ rows: c.rows.map((y, j) => (j === i ? { ...y, label: { ...y.label, ar: ev.target.value } } : y)) })} aria-invalid={!!e(`row.${i}.label`)} /><Input aria-label={tx('القياس بالإنجليزية', 'Measure, English')} dir="ltr" className="h-9" value={r.label.en} onChange={(ev) => set({ rows: c.rows.map((y, j) => (j === i ? { ...y, label: { ...y.label, en: ev.target.value } } : y)) })} aria-invalid={!!e(`row.${i}.label`)} /></div></td>
              {c.sizes.map((s, j) => <td key={s} className="px-1 py-1"><Input aria-label={`${r.label[lang]} · ${s}`} dir="ltr" inputMode="decimal" className="h-9 w-20 text-center" value={r.values[j] ?? ''} aria-invalid={!!e(`row.${i}.${j}`)} onChange={(ev) => set({ rows: c.rows.map((y, k) => (k === i ? { ...y, values: c.sizes.map((_, m) => (m === j ? ev.target.value : y.values[m] ?? '')) } : y)) })} /></td>)}
              <td><IconBtn label={tx('احذف القياس', 'Remove measure')} onClick={() => set({ rows: c.rows.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></IconBtn></td>
            </tr>
          ))}</tbody>
        </table></div>
        {tried && Object.keys(errs).some((k) => k.startsWith('row.')) && <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{tx('صحّح الخلايا المظللة: رقم أو مدى مثل 88-92، وأسماء القياسات باللغتين.', 'Fix the marked cells: a number or a range like 88-92, and measure names in both languages.')}</p>}
        <Button size="sm" variant="ghost" onClick={() => set({ rows: [...c.rows, { label: { ar: '', en: '' }, values: c.sizes.map(() => '') }] })}><Plus className="size-4" aria-hidden="true" />{tx('أضف قياسًا', 'Add measure')}</Button>
        <Field label={tx('ملاحظة للعميل', 'Note for shoppers')} optional>{(p) => <Textarea {...p} rows={2} className="min-h-0" value={c.note[lang]} onChange={(ev) => set({ note: { ...c.note, [lang]: ev.target.value } as L })} />}</Field>
        <div className="rounded-xl bg-surface-2 px-3"><SizeChartBlock chart={c} size={c.sizes[1]} /></div>
      </div>
    </Modal>
  );
}

/* ───────────── Store filters ───────────── */

function FiltersTab({ canEdit }: { canEdit: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const x = catalogXStore.use();
  const products = productsStore.use();
  const levels = levelsStore.use();
  const [draft, setDraft] = useState<FilterSettings>(x.filters);
  const dirty = JSON.stringify(draft) !== JSON.stringify(x.filters);
  useUnsaved(dirty, { ar: 'مرشحات المتجر', en: 'Store filters' });
  const keys = filterKeys(draft, x.fields);
  const live = useMemo(() => products.filter((p) => p.status === 'active' && p.channels.online), [products]);
  const items = live.map((p) => ({ brand: p.brand, colors: p.colors, sizes: p.type === 'booking' ? [] : p.sizes, attrs: p.attrs, inStock: (stockOf(p, levels) ?? 1) > 0, price: Math.min(p.price, ...p.variants.map((v) => v.price)) }));
  const preview = filterPreview(items, keys, draft, { brands: x.brands, fields: x.fields });
  const name = (k: FilterKey): string => {
    if (k === 'price') return tx('السعر', 'Price');
    if (k === 'availability') return tx('التوفر', 'Availability');
    if (k === 'brand') return tx('العلامة التجارية', 'Brand');
    if (k === 'color') return tx('اللون', 'Colour');
    if (k === 'size') return tx('المقاس', 'Size');
    return x.fields.find((f) => `field:${f.id}` === k)?.label[lang] ?? k;
  };
  const move = (i: number, d: -1 | 1) => { const order = [...keys]; const j = i + d; if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; setDraft({ ...draft, order }); };
  const save = () => {
    catalogXStore.set((s) => ({ ...s, filters: { ...draft, order: keys } }));
    logAction('products', { ar: 'عدّل مرشحات المتجر', en: 'Edited store filters' }, { after: keys.filter((k) => !draft.off.includes(k)).join(', ') });
    toast({ tone: 'ok', text: tx('حُفظت المرشحات وظهرت في المتجر', 'Filters saved and live in the store') });
  };
  return (
    <>
      <Card aria-labelledby="ft-h">
        <CardHeader id="ft-h" title={tx('مرشحات المتجر', 'Store filters')} hint={tx('ما يصفّي به العملاء القوائم، بالترتيب. الأرقام عدد المنتجات المنشورة لكل قيمة الآن.', 'What shoppers filter lists by, in order. Numbers are published products per value right now.')}
          action={<label className="flex items-center gap-2 text-xs text-muted">{tx('أخفِ المرشح إذا قلّت قيمه عن', 'Hide a filter with fewer than')}<InfoHint>{tx('مرشح بقيمة واحدة لا يساعد العميل.', 'A filter with one value doesn’t help shoppers.')}</InfoHint>
            <Select className="h-8 w-16" value={String(draft.minValues)} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, minValues: Number(e.target.value) })}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</Select></label>} />
        <ol className="divide-y divide-border">
          {preview.map((f, i) => (
            <li key={f.key} className={cn('flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 sm:px-5', f.hiddenWhy && 'opacity-70')}>
              <span className="mt-1 w-5 text-center text-xs tabular-nums text-subtle">{i + 1}</span>
              <div className="min-w-0 flex-1 basis-56">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-fg">{name(f.key)}{f.key.startsWith('field:') && <Badge tone="sky">{tx('حقل مخصص', 'Custom field')}</Badge>}
                  {f.hiddenWhy === 'few' && <Badge tone="amber">{tx(`مخفي: ${f.values.length} قيمة فقط`, `Hidden: only ${f.values.length} value(s)`)}</Badge>}{f.hiddenWhy === 'off' && <Badge tone="gray">{tx('موقوف', 'Off')}</Badge>}</p>
                <p className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted">{f.values.length ? f.values.slice(0, 8).map((v) => <span key={v.value} className="rounded-full bg-surface-2 px-2 py-0.5">{v.label[lang]} <bdi className="tabular-nums">{v.count}</bdi></span>) : tx('لا قيم في المنتجات المنشورة', 'No values in published products')}{f.values.length > 8 && <span>+{f.values.length - 8}</span>}</p>
              </div>
              {canEdit && <div className="flex items-center gap-1">
                <IconBtn label={tx('قدّم', 'Move up')} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></IconBtn>
                <IconBtn label={tx('أخّر', 'Move down')} disabled={i === preview.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></IconBtn>
                <Switch checked={!draft.off.includes(f.key)} onChange={(v) => setDraft({ ...draft, off: v ? draft.off.filter((k) => k !== f.key) : [...draft.off, f.key] })} label={tx(`إظهار ${name(f.key)}`, `Show ${name(f.key)}`)} />
              </div>}
            </li>
          ))}
        </ol>
        <p className="border-t border-border px-4 py-3 text-xs text-muted sm:px-5"><SlidersHorizontal className="me-1 inline size-3.5" aria-hidden="true" />{tx('لإضافة مرشح جديد: أنشئ حقل مواصفات من نوع «خيارات» أو «رقم» وفعّل «مرشح في المتجر».', 'To add a filter: create a Choice or Number detail field and turn on “Store filter”.')} <a className="font-semibold text-brand-700 hover:underline dark:text-brand-300" href="#/store/c/all" target="_blank" rel="noreferrer">{tx('افتح المتجر', 'Open the store')}</a></p>
      </Card>
      {canEdit && <SaveBar dirty={dirty} onSave={save} onDiscard={() => setDraft(x.filters)} />}
    </>
  );
}
