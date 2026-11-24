// Bulk edit by field (`#/dashboard/products` → select → "Bulk edit"): choose a field and an operation, preview
// before/after for every selected product, save the valid rows, then undo from the toast or the banner.
// Rules: ./model (bulkOpError, previewBulk, applyBulk, undoBulk). Undo is kept for this session.
import { useMemo, useState, type ReactNode } from 'react';
import { Undo2, X } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { createStore } from '../../../core/store';
import { LOCATIONS, LOC_IDS, type Channel, type L } from '../../merchant/domain';
import { ADJ_REASONS, type AdjReason } from '../../merchant/inventory';
import { categoryTree, type Product, type ProductStatus } from '../../merchant/catalog';
import { categoriesStore, levelsStore, productsStore, stockLogStore } from '../../merchant/stores';
import { Button, InfoHint, Money, ProductImage, Segmented, cn, useTx } from '../../../ds/ui';
import { Alert, Field, Input, Modal, Select, Simulated, useToast } from '../../../ds/kit';
import { useInvNames } from '../inventory/parts';
import {
  BULK_FIELDS, CHANNELS, STATUSES, applyBulk, bulkOpError, listPhoto, previewBulk, undoBulk, type BulkField, type BulkMode, type BulkOp, type BulkOpError,
  type BulkUndo, type BulkVal,
} from './model';
import { productCount, useNames } from './common';

/** The last bulk edit that can still be undone in this session. */
export const undoStore = createStore.key('dashboard.productsBulkUndo')<(BulkUndo & { n: number }) | null>(() => null);
let seq = 0;
const nextRef = () => `BULK-${Date.now().toString(36).slice(-5).toUpperCase()}${++seq}`;

/** Run undo for the stored edit and report what happened. */
export function useUndo() {
  const tx = useTx();
  const toast = useToast();
  return () => {
    const u = undoStore.get();
    if (!u) return;
    const r = undoBulk(productsStore.get(), levelsStore.get(), u, 'You');
    productsStore.set(r.products);
    levelsStore.set(r.levels);
    if (r.log.length) stockLogStore.set((lg) => [...r.log, ...lg]);
    undoStore.set(null);
    toast(r.skipped
      ? { tone: 'info', text: tx(`أُعيد ${r.restored}. ${r.skipped} تغيّر بعد التعديل فتُرك كما هو.`, `Restored ${r.restored}. ${r.skipped} changed since, so they were left as they are.`) }
      : { tone: 'ok', text: tx(`تراجعنا عن التعديل الجماعي (${r.restored})`, `Bulk edit undone (${r.restored})`) });
  };
}

export function UndoBanner() {
  const tx = useTx();
  const u = undoStore.use();
  const run = useUndo();
  if (!u) return null;
  return (
    <Alert tone="info" title={`${tx('آخر تعديل جماعي', 'Last bulk edit')}: ${productCount(tx, u.n)}`}
      action={<span className="flex items-center gap-1"><Button size="sm" variant="secondary" onClick={run}><Undo2 className="size-3.5" aria-hidden="true" />{tx('تراجع', 'Undo')}</Button>
        <button type="button" onClick={() => undoStore.set(null)} aria-label={tx('إخفاء', 'Dismiss')} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2"><X className="size-4" aria-hidden="true" /></button></span>}>
      {tx('يعيد القيم السابقة لما لم يتغير بعده.', 'Puts back the previous values of anything not changed since.')} <span className="font-mono text-xs">{u.id}</span>
    </Alert>
  );
}

/** Record a finished edit for undo (also used by the price & status table). */
export function rememberUndo(u: BulkUndo, n: number) { undoStore.set({ ...u, n }); }

const MODES: Record<BulkField, BulkMode[]> = {
  price: ['set', 'pct'], compareAt: ['set', 'pct', 'clear'], cost: ['set', 'pct', 'clear'], status: ['set'], category: ['set'],
  channel: ['on', 'off'], tag: ['add', 'remove'], stock: ['set', 'add'],
};

export function BulkOpModal({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const names = useNames();
  const inv = useInvNames();
  const toast = useToast();
  const run = useUndo();
  const products = productsStore.use();
  const levels = levelsStore.use();
  const cats = categoriesStore.use();
  const [op, setOp] = useState<BulkOp>({ field: 'price', mode: 'pct', value: '', loc: LOC_IDS[0], channel: 'online', reason: '' });
  const [step, setStep] = useState<'edit' | 'preview'>('edit');
  const opErr = bulkOpError(op, cats);
  const rows = useMemo(() => (opErr ? [] : previewBulk(products, levels, ids, op, cats)), [products, levels, ids, op, cats, opErr]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const changing = rows.filter((r) => r.changed);
  const invalid = rows.filter((r) => r.error);
  const set = (p: Partial<BulkOp>) => setOp((o) => ({ ...o, ...p }));
  const fieldName: Record<BulkField, string> = {
    price: tx('السعر', 'Price'), compareAt: tx('السعر قبل الخصم', 'Compare-at price'), cost: tx('التكلفة', 'Cost'), status: tx('الحالة', 'Status'),
    category: tx('الفئة', 'Category'), channel: tx('القنوات', 'Channels'), tag: tx('الوسوم', 'Tags'), stock: tx('الكمية في موقع', 'Stock at a location'),
  };
  const modeName: Record<BulkMode, string> = {
    set: op.field === 'stock' ? tx('اجعلها', 'Set to') : tx('حدّد قيمة', 'Set a value'), pct: op.field === 'compareAt' ? tx('السعر + نسبة', 'Price + percent') : tx('غيّر بنسبة', 'Change by percent'),
    add: op.field === 'stock' ? tx('أضف أو اطرح', 'Add or subtract') : tx('أضف', 'Add'), clear: tx('امسح', 'Clear'), on: tx('أظهر', 'Turn on'), off: tx('أخفِ', 'Turn off'), remove: tx('احذف', 'Remove'),
  };
  const errText = (e: BulkOpError | null) => e && ({
    money: tx('مبلغ غير صالح', 'Invalid amount'), pct: tx('نسبة بين −95 و500، مثل -10', 'A percent between −95 and 500, e.g. -10'), compareAt: tx('ليس أعلى من السعر', 'Not above the price'),
    priceZero: tx('السعر يصبح صفرًا', 'Price would be zero'), qty: tx('عدد صحيح', 'A whole number'), belowZero: tx('الموجود يصبح أقل من صفر', 'On hand would go below zero'),
    digital: tx('منتج رقمي بلا مخزون', 'Digital, no stock'), value: tx('اختر قيمة', 'Choose a value'), reason: tx('اختر سببًا', 'Choose a reason'), loc: tx('اختر موقعًا', 'Choose a location'),
  })[e];
  const fmt = (v: BulkVal): ReactNode => {
    if (op.field === 'price' || op.field === 'compareAt' || op.field === 'cost') return v === null ? <span className="text-subtle">—</span> : <Money v={v as number} />;
    if (op.field === 'status') return names.status(v as ProductStatus);
    if (op.field === 'category') return (v as L)[lang];
    if (op.field === 'channel') return v ? tx('ظاهر', 'On') : tx('مخفي', 'Off');
    if (op.field === 'tag') return (v as string[]).length ? (v as string[]).join('، ') : <span className="text-subtle">—</span>;
    return <span className="tabular-nums">{String(v)}</span>;
  };
  const save = () => {
    const ref = nextRef();
    const r = applyBulk(productsStore.get(), levelsStore.get(), ids, op, cats, ref, 'You');
    productsStore.set(r.products);
    levelsStore.set(r.levels);
    if (r.log.length) stockLogStore.set((lg) => [...r.log, ...lg]);
    rememberUndo(r.undo, r.changed);
    toast({ tone: 'ok', text: `${tx('حُفظ', 'Saved')}: ${fieldName[op.field]} · ${productCount(tx, r.changed)}`, action: { label: tx('تراجع', 'Undo'), run } });
    onDone();
  };
  const tree = categoryTree(cats);

  const valueInput = () => {
    switch (op.field) {
      case 'status': return <Select aria-label={fieldName.status} value={op.value} onChange={(e) => set({ value: e.target.value })}><option value="">{tx('اختر…', 'Choose…')}</option>{STATUSES.map((s) => <option key={s} value={s}>{names.status(s)}</option>)}</Select>;
      case 'category': return <Select aria-label={fieldName.category} value={op.value} onChange={(e) => set({ value: e.target.value })}><option value="">{tx('اختر…', 'Choose…')}</option>{tree.map(({ cat, depth }) => <option key={cat.id} value={cat.id}>{depth ? '— ' : ''}{cat.name[lang]}</option>)}</Select>;
      case 'channel': return <Select aria-label={tx('القناة', 'Channel')} value={op.channel} onChange={(e) => set({ channel: e.target.value as Channel })}>{CHANNELS.map((c) => <option key={c} value={c}>{names.channel(c)}</option>)}</Select>;
      default:
        if (op.mode === 'clear') return null;
        return <Input dir="ltr" inputMode={op.field === 'tag' ? 'text' : 'decimal'} aria-label={tx('القيمة', 'Value')} value={op.value} onChange={(e) => set({ value: e.target.value })}
          placeholder={op.mode === 'pct' ? '-10' : op.field === 'tag' ? tx('مثل: رمضان', 'e.g. ramadan') : op.field === 'stock' ? (op.mode === 'add' ? '+5' : '10') : '0.00'} />;
    }
  };

  return (
    <Modal size="lg" title={`${tx('تعديل جماعي', 'Bulk edit')} · ${productCount(tx, ids.length)}`} onClose={onClose}
      description={<span className="inline-flex items-center gap-1">{step === 'edit' ? tx('اختر الحقل والعملية، ثم راجع قبل الحفظ.', 'Choose a field and an operation, then review before saving.') : tx('راجع القيم قبل وبعد.', 'Review values before and after.')}<InfoHint>{tx('الأسطر التي فيها خطأ لا تُحفظ. يمكنك التراجع بعد الحفظ ما لم يتغير المنتج بعدها.', 'Rows with an error are not saved. You can undo after saving unless a product changed since.')}</InfoHint></span>}
      footer={step === 'edit'
        ? <><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => setStep('preview')} disabled={!!opErr}>{tx('عاين التغيير', 'Preview change')}</Button></>
        : <><Button variant="ghost" onClick={() => setStep('edit')}>{tx('رجوع', 'Back')}</Button><Button onClick={save} disabled={changing.length === 0}>{changing.length ? `${tx('احفظ', 'Save')} · ${productCount(tx, changing.length)}` : tx('لا تغييرات', 'No changes')}</Button></>}>
      {step === 'edit' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={tx('الحقل', 'Field')}>{(p) => (
            <Select {...p} value={op.field} onChange={(e) => { const f = e.target.value as BulkField; set({ field: f, mode: MODES[f][0], value: '' }); }}>
              {BULK_FIELDS.map((f) => <option key={f} value={f}>{fieldName[f]}</option>)}
            </Select>
          )}</Field>
          {MODES[op.field].length > 1 && <div><p className="mb-1.5 text-[13px] font-semibold text-fg">{tx('العملية', 'Operation')}</p><Segmented label={tx('العملية', 'Operation')} value={op.mode} onChange={(m) => set({ mode: m, value: '' })} options={MODES[op.field].map((m) => ({ value: m, label: modeName[m] }))} /></div>}
          {op.field === 'stock' && (
            <>
              <Field label={tx('الموقع', 'Location')}>{(p) => <Select {...p} value={op.loc} onChange={(e) => set({ loc: e.target.value })}>{LOC_IDS.map((l) => <option key={l} value={l}>{LOCATIONS[l][lang]}</option>)}</Select>}</Field>
              <Field label={tx('السبب', 'Reason')} error={op.value && !op.reason ? errText('reason') : undefined}>{(p) => <Select {...p} value={op.reason} onChange={(e) => set({ reason: e.target.value as AdjReason })}><option value="">{tx('اختر…', 'Choose…')}</option>{ADJ_REASONS.map((r) => <option key={r} value={r}>{inv.reason(r)}</option>)}</Select>}</Field>
            </>
          )}
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-[13px] font-semibold text-fg">{op.field === 'channel' ? tx('القناة', 'Channel') : tx('القيمة', 'Value')}</p>
            <div className="max-w-xs">{valueInput()}</div>
            {op.value && opErr && opErr !== 'reason' && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{errText(opErr)}</p>}
            {op.field === 'stock' && <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">{tx('لكل SKU في المنتج، ويُسجَّل في سجل الحركة.', 'Per SKU of each product, and logged in the stock log.')}</p>}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-[13px]">
            <span className="rounded-full bg-brand-500/10 px-3 py-1 font-semibold text-brand-700 dark:text-brand-300">{tx(`سيتغير ${changing.length}`, `${changing.length} will change`)}</span>
            <span className="rounded-full bg-surface-2 px-3 py-1 text-muted">{tx(`بلا تغيير ${rows.length - changing.length - invalid.length}`, `${rows.length - changing.length - invalid.length} unchanged`)}</span>
            {invalid.length > 0 && <span className="rounded-full bg-red-500/10 px-3 py-1 font-semibold text-red-700 dark:text-red-300">{tx(`يُتخطى ${invalid.length} (خطأ)`, `${invalid.length} skipped (error)`)}</span>}
            {op.field === 'stock' && <Simulated />}
          </div>
          <ul className="scrollbar-thin max-h-[50vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {rows.map((r) => {
              const p = byId.get(r.id) as Product;
              return (
                <li key={r.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm', r.error ? 'bg-red-500/5' : !r.changed && 'opacity-70')}>
                  <ProductImage src={listPhoto(p)} alt="" size={32} />
                  <span className="min-w-0 flex-1 basis-40 truncate font-semibold text-fg">{p.name[lang]}</span>
                  <span className="flex items-center gap-2 text-[13px]">
                    <span className="text-muted">{fmt(r.before)}</span><span className="text-subtle" aria-hidden="true">{tx('←', '→')}</span>
                    <span className={cn('font-semibold', r.changed ? 'text-fg' : 'text-muted')}>{r.error ? <span className="text-red-600 dark:text-red-400">{errText(r.error)}</span> : fmt(r.after)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Modal>
  );
}
