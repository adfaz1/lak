// Product list tools (Salla audit MATRIX #33, #35): quick filters, sort, columns, saved views, and the quality pill
// with its "what is missing" drawer. Rules are in ./views and ./quality; this file is layout and interaction.
import { useState, type ReactNode } from 'react';
import { Bookmark, BookmarkPlus, Columns3, Pin, PinOff, Pencil, Trash2, CheckCircle2, ArrowUpRight } from 'lucide-react';
import { useLang } from '../../../core/lang';
import type { Category, Product } from '../../merchant/catalog';
import { currentActor, logAction } from '../../merchant/stores';
import { Badge, Button, EmptyState, LinkButton, cn, useTx } from '../../../ds/ui';
import { Alert, Checkbox, Drawer, Field, Input, Modal, Select, Switch, useToast } from '../../../ds/kit';
import { phref, useNames } from './common';
import { productQuality, type Quality, type QualityImpact, type QualityKey } from './quality';
import {
  COLS, MAX_PINNED, QUICK_FILTERS, SORTS, VIEW_NAME_MAX, canPin, deleteView, restoreView, saveView, updateView, viewsFor,
  type ColKey, type QuickFilter, type SavedView, type SortKey, type ViewNameError, type ViewQuery,
} from './views';
import { productViewsStore } from './views-store';

export function useListNames() {
  const tx = useTx();
  return {
    quick: (f: QuickFilter) => ({
      needsWork: tx('تحتاج تحسينًا', 'Needs work'), noImage: tx('بلا صور', 'No image'), noDesc: tx('بلا وصف', 'No description'), uncategorised: tx('غير مصنفة', 'Uncategorised'),
      noPrice: tx('غير مسعّرة', 'No price'), hidden: tx('مخفية', 'Hidden'), soldOut: tx('نفدت', 'Sold out'), low: tx('قاربت على النفاد', 'Running low'),
      discounted: tx('مخفّضة', 'Discounted'), taxable: tx('خاضعة للضريبة', 'Taxable'), noTax: tx('معفاة من الضريبة', 'Not taxed'), shipping: tx('تتطلب شحنًا', 'Requires shipping'),
    })[f],
    quickHint: (f: QuickFilter) => ({
      needsWork: tx('جودة أقل من 85٪: ينقصها ما يؤثر في البيع أو الظهور.', 'Quality under 85%: missing something that affects sales or visibility.'),
      noImage: tx('لا صورة في المتجر.', 'No image in the store.'), noDesc: tx('ينقصها الوصف بالعربية أو بالإنجليزية.', 'Missing the Arabic or English description.'),
      uncategorised: tx('في «مستورد» أو فئة ليست في قائمة فئاتك.', 'In “Imported” or a category not in your list.'), noPrice: tx('سعرها صفر، غالبًا من الاستيراد.', 'Price is zero, usually from an import.'),
      hidden: tx('نشطة لكن المتجر الإلكتروني متوقف لها، أو مسودة.', 'Active with the online store off, or a draft.'), soldOut: tx('المتاح صفر في كل المواقع.', 'Zero available at every location.'),
      low: tx('عند حد إعادة الطلب في موقع واحد على الأقل، ولم تنفد.', 'At the reorder point in at least one location, not sold out.'),
      discounted: tx('لها سعر قبل الخصم.', 'Have a compare-at price.'), taxable: tx('تُطبق عليها ضريبة القيمة المضافة.', 'VAT applies.'),
      noTax: tx('عُلّمت معفاة أو بنسبة صفر.', 'Marked exempt or zero-rated.'), shipping: tx('منتجات ملموسة تُشحن.', 'Physical products that ship.'),
    })[f],
    sort: (s: SortKey) => ({
      catalogue: tx('ترتيب الكتالوج', 'Catalogue order'), name: tx('الاسم', 'Name'), priceAsc: tx('السعر: الأقل أولًا', 'Price: low to high'), priceDesc: tx('السعر: الأعلى أولًا', 'Price: high to low'),
      stockAsc: tx('المتاح: الأقل أولًا', 'Available: lowest first'), qualityAsc: tx('الجودة: الأضعف أولًا', 'Quality: weakest first'), newest: tx('الأحدث', 'Newest'),
    })[s],
    col: (c: ColKey) => ({ sku: 'SKU', status: tx('الحالة', 'Status'), price: tx('السعر', 'Price'), stock: tx('المتاح', 'Available'), quality: tx('الجودة', 'Quality'), category: tx('الفئة', 'Category'), channels: tx('القنوات', 'Channels') })[c],
    item: (k: QualityKey) => ({
      price: tx('السعر', 'Price'), image: tx('صورة المنتج', 'Product image'), descAr: tx('وصف بالعربية (20 حرفًا فأكثر)', 'Arabic description (20+ characters)'), descEn: tx('وصف بالإنجليزية (20 حرفًا فأكثر)', 'English description (20+ characters)'),
      nameEn: tx('الاسم بالإنجليزية', 'English name'), category: tx('فئة من قائمة فئاتك', 'A category from your list'), alt: tx('نص بديل لكل صورة', 'Alt text on every image'),
      images3: tx('ثلاث صور أو أكثر', 'Three or more images'), seo: tx('وصف لمحركات البحث', 'Search engine description'), cost: tx('التكلفة (لحساب الهامش)', 'Cost (for margin)'),
      weight: tx('الوزن (لتسعير الشحن)', 'Weight (for shipping rates)'), barcode: tx('الباركود (للسوق والجرد)', 'Barcode (for marketplace and counts)'),
    })[k],
    impact: (i: QualityImpact) => ({ sales: tx('يمنع البيع', 'Blocks sales'), shoppers: tx('يقنع المتسوق', 'Convinces shoppers'), search: tx('الظهور في البحث', 'Search visibility'), access: tx('سهولة الوصول', 'Accessibility'), profit: tx('الربحية', 'Profit'), shipping: tx('دقة الشحن', 'Shipping accuracy'), marketplace: tx('السوق والجرد', 'Marketplace & counts') })[i],
  };
}

/* ---------- Quick filter bar ---------- */

export function QuickBar({ value, counts, onToggle }: { value: QuickFilter[]; counts: Record<QuickFilter, number>; onToggle: (f: QuickFilter) => void }) {
  const tx = useTx();
  const n = useListNames();
  return (
    <div role="group" aria-label={tx('فلاتر سريعة', 'Quick filters')} className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {QUICK_FILTERS.map((f) => {
        const on = value.includes(f);
        return (
          <button key={f} type="button" aria-pressed={on} title={n.quickHint(f)} onClick={() => onToggle(f)}
            className={cn('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors',
              on ? 'border-brand-400 bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'border-border bg-surface text-muted hover:text-fg', !on && counts[f] === 0 && 'opacity-60')}>
            {on && <CheckCircle2 className="size-3.5" aria-hidden="true" />}{n.quick(f)}<span className="tabular-nums text-[11px] opacity-80">{counts[f]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SortSelect({ value, onChange }: { value: SortKey; onChange: (s: SortKey) => void }) {
  const tx = useTx();
  const n = useListNames();
  return (
    <Select className={cn('h-10 w-auto text-[13px] font-medium', value !== 'catalogue' && 'border-brand-300 text-brand-700 dark:text-brand-300')} aria-label={tx('الترتيب', 'Sort')} value={value} onChange={(e) => onChange(e.target.value as SortKey)}>
      {SORTS.map((s) => <option key={s} value={s}>{tx('ترتيب: ', 'Sort: ')}{n.sort(s)}</option>)}
    </Select>
  );
}

export function ColumnsModal({ value, onApply, onClose }: { value: ColKey[]; onApply: (c: ColKey[]) => void; onClose: () => void }) {
  const tx = useTx();
  const n = useListNames();
  const [cols, setCols] = useState<ColKey[]>(value);
  return (
    <Modal title={tx('أعمدة الجدول', 'Table columns')} description={tx('الاسم يظهر دائمًا. تُحفظ في الرابط وفي العرض المحفوظ.', 'The name is always shown. Kept in the link and in saved views.')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button disabled={!cols.length} onClick={() => { onApply(cols); onClose(); }}>{tx('طبّق', 'Apply')}</Button></>}>
      <div className="grid grid-cols-2 gap-2">
        {COLS.map((c) => (
          <label key={c} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-[13px] text-fg">
            <Checkbox checked={cols.includes(c)} label={n.col(c)} onChange={(on) => setCols((x) => (on ? [...x, c] : x.filter((y) => y !== c)))} />{n.col(c)}
          </label>
        ))}
      </div>
      {!cols.length && <Alert tone="bad">{tx('اختر عمودًا واحدًا على الأقل.', 'Choose at least one column.')}</Alert>}
    </Modal>
  );
}
export const ColumnsIcon = Columns3;

/* ---------- Saved views ---------- */

/** Short human description of what a view shows, for the save dialog and the views list. */
export function useViewSummary() {
  const tx = useTx();
  const n = useListNames();
  const names = useNames();
  const { lang } = useLang();
  return (q: ViewQuery, cats: Category[]): string[] => {
    const out: string[] = [];
    if (q.tab) out.push(names.status(q.tab as Product['status']));
    if (q.q) out.push(tx(`بحث «${q.q}»`, `Search “${q.q}”`));
    if (q.cat) out.push(cats.find((c) => c.name.en.trim().toLowerCase() === q.cat)?.name[lang] ?? q.cat);
    if (q.ch) out.push(names.channel(q.ch as 'online'));
    if (q.tag) out.push(`#${q.tag}`);
    for (const f of (q.qf ?? '').split(',').filter(Boolean)) out.push(n.quick(f as QuickFilter));
    if (q.sort) out.push(n.sort(q.sort as SortKey));
    if (q.cols) out.push(tx(`${q.cols.split(',').length} أعمدة`, `${q.cols.split(',').length} columns`));
    return out.length ? out : [tx('كل المنتجات', 'All products')];
  };
}

const nameErr = (tx: (a: string, b: string) => string, e: ViewNameError | 'pins' | 'missing' | null) => e && ({
  required: tx('اكتب اسمًا', 'Enter a name'), long: tx(`حتى ${VIEW_NAME_MAX} حرفًا`, `Up to ${VIEW_NAME_MAX} characters`), taken: tx('لديك عرض بهذا الاسم', 'You already have a view with this name'),
  pins: tx(`الحد ${MAX_PINNED} تبويبات مثبتة؛ ألغِ تثبيت أحدها أولًا`, `Up to ${MAX_PINNED} pinned tabs; unpin one first`), missing: tx('حُذف العرض', 'The view was deleted'),
})[e];

/** Save the current list as a named view (new), or overwrite the open view's filters. */
export function SaveViewModal({ query, cats, editing, onSaved, onClose }: { query: ViewQuery; cats: Category[]; editing?: SavedView; onSaved: (v: SavedView) => void; onClose: () => void }) {
  const tx = useTx();
  const summary = useViewSummary();
  const all = productViewsStore.use();
  const owner = currentActor().id;
  const [mode, setMode] = useState<'new' | 'update'>(editing ? 'update' : 'new');
  const [name, setName] = useState('');
  const [pinned, setPinned] = useState(canPin(all, owner));
  const [err, setErr] = useState<string | null>(null);
  const save = () => {
    if (mode === 'update' && editing) {
      const r = updateView(all, editing.id, { query });
      if ('error' in r) { setErr(nameErr(tx, r.error)); return; }
      productViewsStore.set(r.views);
      logAction('products', { ar: `حدّث العرض المحفوظ «${editing.name}»`, en: `Updated saved view “${editing.name}”` }, { target: editing.id });
      onSaved({ ...editing, query });
      return;
    }
    const r = saveView(all, { owner, name, query, pinned }, Date.now());
    if ('error' in r) { setErr(nameErr(tx, r.error)); return; }
    productViewsStore.set(r.views);
    logAction('products', { ar: `حفظ عرض المنتجات «${r.view.name}»`, en: `Saved product view “${r.view.name}”` }, { target: r.view.id });
    onSaved(r.view);
  };
  return (
    <Modal title={tx('احفظ هذا العرض', 'Save this view')} onClose={onClose}
      description={tx('يُحفظ لك وحدك. يفتح القائمة بنفس الفلاتر والترتيب والأعمدة، والمنتجات دائمًا محدثة.', 'Saved for you only. Opens the list with the same filters, sort and columns; products are always current.')}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={save}><BookmarkPlus className="size-4" aria-hidden="true" />{mode === 'update' ? tx('حدّث العرض', 'Update view') : tx('احفظ العرض', 'Save view')}</Button></>}>
      {editing && (
        <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <legend className="sr-only">{tx('طريقة الحفظ', 'How to save')}</legend>
          {(['update', 'new'] as const).map((m) => (
            <label key={m} className={cn('flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm', mode === m ? 'border-brand-400 bg-brand-500/5 text-fg' : 'border-border text-muted')}>
              <input type="radio" name="vmode" checked={mode === m} onChange={() => { setMode(m); setErr(null); }} className="accent-brand-600" />
              {m === 'update' ? tx(`حدّث «${editing.name}»`, `Update “${editing.name}”`) : tx('عرض جديد', 'New view')}
            </label>
          ))}
        </fieldset>
      )}
      {mode === 'new' && <>
        <Field label={tx('اسم العرض', 'View name')} error={err} hint={<bdi dir="ltr">{name.trim().length}/{VIEW_NAME_MAX}</bdi>}>{(p) => <Input {...p} maxLength={VIEW_NAME_MAX + 5} value={name} placeholder={tx('مثل: عطور بلا صور', 'e.g. Fragrance without images')} onChange={(e) => { setName(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />}</Field>
        <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-medium text-fg">
          <span className="inline-flex items-center gap-2"><Pin className="size-4 text-muted" aria-hidden="true" />{tx('ثبّته كتبويب فوق القائمة', 'Pin it as a tab above the list')}</span>
          <Switch checked={pinned} onChange={setPinned} label={tx('ثبّته كتبويب', 'Pin as a tab')} disabled={!pinned && !canPin(all, owner)} />
        </label>
      </>}
      {mode === 'update' && err && <Alert tone="bad">{err}</Alert>}
      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-fg">{tx('ما يُحفظ', 'What is saved')}</p>
        <ul className="flex flex-wrap gap-1.5">{summary(query, cats).map((s) => <li key={s}><Badge tone="gray">{s}</Badge></li>)}</ul>
      </div>
    </Modal>
  );
}

/** Every view of the current viewer: open, pin/unpin, rename, delete (with undo). */
export function ViewsDrawer({ cats, onClose }: { cats: Category[]; onClose: () => void }) {
  const tx = useTx();
  const toast = useToast();
  const summary = useViewSummary();
  const all = productViewsStore.use();
  const owner = currentActor().id;
  const mine = viewsFor(all, owner);
  const [edit, setEdit] = useState<{ id: string; name: string; err: string | null } | null>(null);
  const run = (r: { views: SavedView[] } | { error: ViewNameError | 'pins' | 'missing' }, what?: { ar: string; en: string }, target?: string): boolean => {
    if ('error' in r) { toast({ tone: 'bad', text: nameErr(tx, r.error)! }); return false; }
    productViewsStore.set(r.views);
    if (what) logAction('products', what, { target });
    return true;
  };
  const remove = (v: SavedView) => {
    const index = all.findIndex((x) => x.id === v.id);
    productViewsStore.set(deleteView(all, v.id));
    logAction('products', { ar: `حذف العرض المحفوظ «${v.name}»`, en: `Deleted saved view “${v.name}”` }, { target: v.id });
    toast({ tone: 'info', text: tx(`حُذف «${v.name}»`, `Deleted “${v.name}”`), action: { label: tx('تراجع', 'Undo'), run: () => productViewsStore.set((x) => restoreView(x, v, index)) } });
  };
  const rename = () => {
    if (!edit) return;
    const v = all.find((x) => x.id === edit.id);
    const r = updateView(all, edit.id, { name: edit.name });
    if ('error' in r) { setEdit({ ...edit, err: nameErr(tx, r.error) }); return; }
    productViewsStore.set(r.views);
    logAction('products', { ar: `أعاد تسمية العرض «${v?.name}» إلى «${edit.name.trim()}»`, en: `Renamed view “${v?.name}” to “${edit.name.trim()}”` }, { target: edit.id });
    setEdit(null);
  };
  return (
    <Drawer title={tx('العروض المحفوظة', 'Saved views')} onClose={onClose} footer={<Button variant="secondary" className="flex-1" onClick={onClose}>{tx('تم', 'Done')}</Button>}>
      <p className="text-[13px] text-muted">{tx(`لك وحدك · المثبت يظهر تبويبًا (حتى ${MAX_PINNED})`, `Yours only · pinned ones show as tabs (up to ${MAX_PINNED})`)}</p>
      {!mine.length ? (
        <EmptyState icon={<Bookmark className="size-6" aria-hidden="true" />} title={tx('لا عروض محفوظة', 'No saved views')}>{tx('اختر فلاتر وترتيبًا ثم «احفظ العرض».', 'Choose filters and a sort, then “Save view”.')}</EmptyState>
      ) : (
        <ul className="space-y-2">
          {mine.map((v) => (
            <li key={v.id} className="space-y-2 rounded-xl border border-border p-3">
              {edit?.id === v.id ? (
                <div className="space-y-2">
                  <Field label={tx('الاسم', 'Name')} error={edit.err}>{(p) => <Input {...p} autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value, err: null })} onKeyDown={(e) => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setEdit(null); }} />}</Field>
                  <div className="flex gap-2"><Button size="sm" onClick={rename}>{tx('احفظ الاسم', 'Save name')}</Button><Button size="sm" variant="ghost" onClick={() => setEdit(null)}>{tx('إلغاء', 'Cancel')}</Button></div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <a href={phref('', { ...v.query, view: v.id })} onClick={onClose} className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-semibold text-fg">{v.pinned && <Pin className="size-3.5 text-brand-600" aria-hidden="true" />}{v.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">{summary(v.query, cats).join(' · ')}</span>
                  </a>
                  <span className="flex shrink-0 items-center">
                    <IconAct label={v.pinned ? tx(`ألغِ تثبيت ${v.name}`, `Unpin ${v.name}`) : tx(`ثبّت ${v.name}`, `Pin ${v.name}`)} onClick={() => run(updateView(all, v.id, { pinned: !v.pinned }))}>{v.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}</IconAct>
                    <IconAct label={tx(`أعد تسمية ${v.name}`, `Rename ${v.name}`)} onClick={() => setEdit({ id: v.id, name: v.name, err: null })}><Pencil className="size-4" /></IconAct>
                    <IconAct label={tx(`احذف ${v.name}`, `Delete ${v.name}`)} onClick={() => remove(v)}><Trash2 className="size-4" /></IconAct>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
function IconAct({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg [&_svg]:pointer-events-none">{children}</button>;
}

/* ---------- Quality ---------- */

const LEVEL_TONE = { good: 'green', fair: 'amber', poor: 'red' } as const;
const LEVEL_BAR = { good: 'bg-emerald-500', fair: 'bg-amber-500', poor: 'bg-red-500' } as const;

export function QualityMeter({ q, className }: { q: Quality; className?: string }) {
  return <span className={cn('block h-1.5 w-14 overflow-hidden rounded-full bg-surface-2', className)} aria-hidden="true"><span className={cn('block h-full rounded-full', LEVEL_BAR[q.level])} style={{ width: `${q.score}%` }} /></span>;
}

/** Score plus the number of missing items; opens the list of exact fixes. */
export function QualityPill({ p, cats, onOpen }: { p: Product; cats: Category[]; onOpen: (p: Product) => void }) {
  const tx = useTx();
  const q = productQuality(p, cats);
  return (
    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(p); }} aria-label={tx(`الجودة ${q.score}٪، ينقص ${q.missing.length}. اعرض ما ينقص`, `Quality ${q.score}%, ${q.missing.length} missing. Show what is missing`)}
      className="inline-flex flex-col items-start gap-1 rounded-lg px-1.5 py-1 text-start hover:bg-surface-2">
      <span className="flex items-center gap-1.5"><span className={cn('text-[13px] font-bold tabular-nums', q.level === 'good' ? 'text-emerald-700 dark:text-emerald-400' : q.level === 'fair' ? 'text-amber-700 dark:text-amber-300' : 'text-red-600 dark:text-red-400')}><bdi dir="ltr">{q.score}%</bdi></span>
        {q.missing.length > 0 && <span className="text-[11px] text-muted">{tx(`ينقص ${q.missing.length}`, `${q.missing.length} missing`)}</span>}</span>
      <QualityMeter q={q} />
    </button>
  );
}

/** The missing items, biggest effect first, each with a link straight to the field that fixes it. */
export function QualityList({ q, fixHref, onFix }: { q: Quality; fixHref?: (field: string) => string; onFix?: (field: string) => void }) {
  const tx = useTx();
  const n = useListNames();
  if (!q.missing.length) return <p className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-sm font-medium text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="size-4" aria-hidden="true" />{tx('مكتمل: لا شيء ينقص.', 'Complete: nothing is missing.')}</p>;
  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {q.missing.map((m) => (
        <li key={m.key} className="flex items-center gap-3 px-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-fg">{n.item(m.key)}</span>
            <span className="block text-xs text-muted">{n.impact(m.impact)} · <bdi dir="ltr">+{Math.round((m.weight * 100) / q.items.reduce((s, i) => s + i.weight, 0))}%</bdi></span>
          </span>
          {fixHref ? <LinkButton size="sm" variant="secondary" href={fixHref(m.field)}>{tx('أصلحه', 'Fix')}<ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" /></LinkButton>
            : onFix ? <Button size="sm" variant="secondary" onClick={() => onFix(m.field)}>{tx('اذهب إليه', 'Go to it')}</Button> : null}
        </li>
      ))}
    </ul>
  );
}

export function QualityDrawer({ p, cats, onClose }: { p: Product; cats: Category[]; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const q = productQuality(p, cats);
  return (
    <Drawer title={tx('جودة المنتج', 'Product quality')} onClose={onClose}
      footer={<LinkButton className="flex-1" href={phref(p.id, q.missing[0] ? { focus: q.missing[0].field } : undefined)}>{q.missing.length ? tx('ابدأ بأهمها', 'Fix the most important') : tx('افتح المنتج', 'Open the product')}</LinkButton>}>
      <div className="space-y-2">
        <p className="font-semibold text-fg">{p.name[lang]}</p>
        <div className="flex items-center gap-3"><Badge tone={LEVEL_TONE[q.level]}><bdi dir="ltr">{q.score}%</bdi></Badge><QualityMeter q={q} className="w-32" /><span className="text-xs text-muted">{tx(`${q.items.length - q.missing.length} من ${q.items.length} مكتملة`, `${q.items.length - q.missing.length} of ${q.items.length} done`)}</span></div>
      </div>
      <QualityList q={q} fixHref={(field) => phref(p.id, { focus: field })} />
    </Drawer>
  );
}
