// Brands (`#/dashboard/products/brands`): list with logo and product count, add/edit (names, URL, logo, description),
// merge likely duplicates, delete after choosing where its products go (with undo). Shoppers filter the store by brand
// and every brand has its own store page. Rules: merchant/catalog-extras.ts (validateBrand, similarBrands, reassignBrand).
import { useRef, useState, type ReactNode } from 'react';
import { BadgeCheck, ExternalLink, GitMerge, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { BRAND_TONES, brandCount, reassignBrand, similarBrands, validateBrand, type Brand } from '../../merchant/catalog-extras';
import { can } from '../../merchant/perms';
import { catalogXStore, logAction, productsStore } from '../../merchant/stores';
import { Button, Card, EmptyState, ErrorState, Skeleton, cn, useTx } from '../../../ds/ui';
import { Alert, Field, Input, Modal, PageHeader, Select, Textarea, useToast } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { useUnsaved } from '../unsaved';
import { CatalogNav, ReviewTools, phref, productCount, roleBadge, useRole } from './common';
import { BrandMark } from './storefront-parts';
import { slugify } from './model';

interface Draft { id: string | null; nameAr: string; nameEn: string; slug: string; descAr: string; descEn: string; logo: string; tone: string }
const blank = (): Draft => ({ id: null, nameAr: '', nameEn: '', slug: '', descAr: '', descEn: '', logo: '', tone: BRAND_TONES[1] });
const toDraft = (b: Brand): Draft => ({ id: b.id, nameAr: b.name.ar, nameEn: b.name.en, slug: b.slug, descAr: b.desc.ar, descEn: b.desc.en, logo: b.logo, tone: b.tone });
/** An unsaved brand form survives leaving the page in this session. */
let kept: Draft | null = null;

export default function Brands() {
  const tx = useTx();
  const { lang } = useLang();
  const state = useDashState();
  const role = useRole();
  const canEdit = can(role, 'product.edit');
  const x = catalogXStore.use();
  const products = productsStore.use();
  const toast = useToast();
  const [form, setForm] = useState<Draft | null>(kept);
  const [del, setDel] = useState<Brand | null>(null);
  const [merge, setMerge] = useState<[Brand, Brand] | null>(null);
  const header = (
    <PageHeader back={{ href: phref(), label: tx('المنتجات', 'Products') }} title={tx('العلامات التجارية', 'Brands')}
      description={state === 'live' ? tx('تظهر في صفحة المنتج، ومرشحًا في المتجر، ولكل علامة صفحة.', 'Shown on product pages, as a store filter, and each has its own page.') : undefined}
      meta={!canEdit ? roleBadge(tx) : undefined}
      actions={canEdit && <Button onClick={() => setForm(blank())}><Plus className="size-4" aria-hidden="true" />{tx('أضف علامة', 'Add brand')}</Button>} />
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<CatalogNav /><Skeleton className="h-72 rounded-2xl" /></div>;
  if (state === 'error') return <div className="space-y-6">{header}<CatalogNav /><Card><ErrorState as="h2" title={tx('تعذّر تحميل العلامات', 'Brands could not load')} onRetry={() => setDashState('live')}>{tx('لم يتغير شيء. المرجع SIM-BRD-503.', 'Nothing changed. Ref SIM-BRD-503.')}</ErrorState></Card></div>;
  const list = state === 'empty' ? [] : x.brands;
  const dupes = similarBrands(list);
  const unbranded = products.filter((p) => p.status !== 'archived' && !p.brand).length;

  return (
    <div className="space-y-6">
      {header}
      <CatalogNav />
      {dupes.length > 0 && canEdit && (
        <Alert tone="warn" title={tx('علامات تبدو مكررة', 'Brands that look like duplicates')}>
          <ul className="mt-1 space-y-1">{dupes.map(([a, b]) => <li key={a.id + b.id} className="flex flex-wrap items-center gap-2">«{a.name[lang]}» {tx('و', 'and')} «{b.name[lang]}»<Button size="sm" variant="secondary" onClick={() => setMerge([a, b])}><GitMerge className="size-3.5" aria-hidden="true" />{tx('ادمجهما', 'Merge')}</Button></li>)}</ul>
        </Alert>
      )}
      <Card>
        {list.length === 0 ? (
          <EmptyState as="h2" icon={<BadgeCheck className="size-6" aria-hidden="true" />} title={tx('لا علامات بعد', 'No brands yet')}
            action={canEdit ? <Button onClick={() => setForm(blank())}>{tx('أضف علامة', 'Add brand')}</Button> : undefined}>{tx('أضف العلامات التي تبيعها ليصفّي العملاء بها.', 'Add the brands you sell so shoppers can filter by them.')}</EmptyState>
        ) : (
          <ul className="divide-y divide-border" aria-label={tx('العلامات', 'Brands')}>
            {list.map((b) => {
              const n = brandCount(products, b.id);
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
                  <BrandMark b={b} size={40} />
                  <div className="min-w-0 flex-1 basis-44">
                    <p className="font-semibold text-fg">{b.name[lang]} <span className="text-[13px] font-normal text-muted">· {b.name[lang === 'ar' ? 'en' : 'ar']}</span></p>
                    <p className="text-xs text-muted">{productCount(tx, n)} · <a className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline dark:text-brand-300" href={`#/store/c/all?brand=${b.id}`} target="_blank" rel="noreferrer">{tx('صفحتها في المتجر', 'Store page')}<ExternalLink className="size-3" aria-hidden="true" /></a></p>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <IconBtn label={tx(`عدّل ${b.name.ar}`, `Edit ${b.name.en}`)} onClick={() => setForm(toDraft(b))}><Pencil className="size-4" /></IconBtn>
                      <IconBtn label={tx(`احذف ${b.name.ar}`, `Delete ${b.name.en}`)} onClick={() => setDel(b)}><Trash2 className="size-4" /></IconBtn>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {list.length > 0 && unbranded > 0 && <p className="text-sm text-muted">{tx(`${unbranded} منتجًا بلا علامة؛ اختر العلامة من محرر المنتج.`, `${unbranded} products have no brand; set it in the product editor.`)}</p>}
      <ReviewTools />
      {form && <BrandForm initial={form} onClose={() => { kept = null; setForm(null); }} onKeep={(d) => { kept = d; }} />}
      {del && <DeleteModal brand={del} onClose={() => setDel(null)} onDone={(undo) => { setDel(null); toast({ tone: 'info', text: tx('حُذفت العلامة', 'Brand deleted'), action: { label: tx('تراجع', 'Undo'), run: undo } }); }} />}
      {merge && <MergeModal pair={merge} onClose={() => setMerge(null)} />}
    </div>
  );
}

function IconBtn({ label, children, onClick }: { label: string; children: ReactNode; onClick: () => void }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className="grid size-9 place-items-center rounded-lg border border-border text-muted transition-colors hover:bg-surface-2 hover:text-fg [&_svg]:pointer-events-none">{children}</button>;
}

function BrandForm({ initial, onClose, onKeep }: { initial: Draft; onClose: () => void; onKeep: (d: Draft) => void }) {
  const tx = useTx();
  const toast = useToast();
  const x = catalogXStore.use();
  const [d, setD] = useState(initial);
  const [tried, setTried] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const orig = d.id ? x.brands.find((b) => b.id === d.id) : undefined;
  useUnsaved(JSON.stringify(d) !== JSON.stringify(orig ? toDraft(orig) : blank()), { ar: 'نموذج العلامة', en: 'Brand form' });
  const set = (p: Partial<Draft>) => { const n = { ...d, ...p }; setD(n); onKeep(n); };
  const id = d.id ?? `b-${slugify(d.nameEn) || Date.now().toString(36)}`;
  const brand: Brand = { id, name: { ar: d.nameAr.trim(), en: d.nameEn.trim() }, slug: d.slug.trim() || slugify(d.nameEn), desc: { ar: d.descAr.trim(), en: d.descEn.trim() }, logo: d.logo, tone: d.tone };
  const errs = validateBrand(brand, x.brands);
  const msg = (k: keyof typeof errs) => (tried && errs[k] ? ({ required: tx('مطلوب', 'Required'), taken: tx('مستخدم لعلامة أخرى', 'Used by another brand'), slug: tx('حروف لاتينية صغيرة وأرقام وشرطات', 'Lowercase letters, digits and hyphens') })[errs[k]!] : undefined);
  const save = () => {
    setTried(true);
    if (Object.keys(errs).length) return;
    catalogXStore.set((s) => ({ ...s, brands: orig ? s.brands.map((b) => (b.id === id ? brand : b)) : [...s.brands, brand] }));
    logAction('products', orig ? { ar: `عدّل العلامة ${brand.name.ar}`, en: `Edited brand ${brand.name.en}` } : { ar: `أضاف العلامة ${brand.name.ar}`, en: `Added brand ${brand.name.en}` }, { target: id });
    toast({ tone: 'ok', text: orig ? tx('حُفظت العلامة', 'Brand saved') : tx(`أُضيفت «${brand.name.ar}»`, `“${brand.name.en}” added`) });
    onClose();
  };
  return (
    <Modal title={orig ? tx('تعديل العلامة', 'Edit brand') : tx('علامة جديدة', 'New brand')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={save}>{tx('احفظ', 'Save')}</Button></>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <BrandMark b={brand} size={56} />
          <input ref={file} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" tabIndex={-1} aria-label={tx('شعار العلامة', 'Brand logo')} onChange={(e) => { const f = e.target.files?.[0]; if (f) set({ logo: URL.createObjectURL(f) }); e.target.value = ''; }} />
          <Button variant="secondary" size="sm" onClick={() => file.current?.click()}><ImagePlus className="size-4" aria-hidden="true" />{d.logo ? tx('استبدل الشعار', 'Replace logo') : tx('ارفع شعارًا', 'Upload logo')}</Button>
          {d.logo ? <Button variant="ghost" size="sm" onClick={() => set({ logo: '' })}>{tx('استخدم الأحرف', 'Use initials')}</Button> : (
            <span className="flex gap-1" role="radiogroup" aria-label={tx('لون الأحرف', 'Initials colour')}>{BRAND_TONES.map((t) => <button key={t} type="button" role="radio" aria-checked={d.tone === t} aria-label={t} onClick={() => set({ tone: t })} className={cn('size-6 rounded-full ring-offset-2 ring-offset-surface', d.tone === t && 'ring-2 ring-fg')} style={{ background: t }} />)}</span>
          )}
        </div>
        <p className="text-xs text-muted">{tx('الشعار معاينة محلية في هذه الجلسة؛ الحفظ الدائم يحتاج خادمًا.', 'The logo is a local preview in this session; permanent storage needs a server.')}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={tx('الاسم بالعربية', 'Arabic name')} error={msg('nameAr')}>{(p) => <Input {...p} dir="rtl" value={d.nameAr} onChange={(e) => set({ nameAr: e.target.value })} />}</Field>
          <Field label={tx('الاسم بالإنجليزية', 'English name')} error={msg('nameEn')}>{(p) => <Input {...p} dir="ltr" value={d.nameEn} onChange={(e) => set({ nameEn: e.target.value })} />}</Field>
          <Field label={tx('الرابط', 'URL handle')} optional error={msg('slug')} hint={<bdi dir="ltr">/brand/{brand.slug || '…'}</bdi>} className="sm:col-span-2">{(p) => <Input {...p} dir="ltr" value={d.slug} placeholder={slugify(d.nameEn)} onChange={(e) => set({ slug: e.target.value })} />}</Field>
          <Field label={tx('نبذة بالعربية', 'About, Arabic')} optional>{(p) => <Textarea {...p} rows={2} className="min-h-0" value={d.descAr} onChange={(e) => set({ descAr: e.target.value })} />}</Field>
          <Field label={tx('نبذة بالإنجليزية', 'About, English')} optional>{(p) => <Textarea {...p} dir="ltr" rows={2} className="min-h-0" value={d.descEn} onChange={(e) => set({ descEn: e.target.value })} />}</Field>
        </div>
      </div>
    </Modal>
  );
}

function DeleteModal({ brand, onClose, onDone }: { brand: Brand; onClose: () => void; onDone: (undo: () => void) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const x = catalogXStore.use();
  const products = productsStore.use();
  const n = brandCount(products, brand.id);
  const [to, setTo] = useState('');
  const run = () => {
    const beforeX = catalogXStore.get(), beforeP = productsStore.get();
    productsStore.set((ps) => reassignBrand(ps, brand.id, to || null));
    catalogXStore.set((s) => ({ ...s, brands: s.brands.filter((b) => b.id !== brand.id) }));
    logAction('products', { ar: `حذف العلامة ${brand.name.ar}${n ? ` ونقل ${n} منتجًا` : ''}`, en: `Deleted brand ${brand.name.en}${n ? `, moved ${n} products` : ''}` }, { target: brand.id });
    onDone(() => { catalogXStore.set((s) => ({ ...s, brands: beforeX.brands })); productsStore.set(beforeP); logAction('products', { ar: `تراجع عن حذف العلامة ${brand.name.ar}`, en: `Undid deleting brand ${brand.name.en}` }, { target: brand.id }); });
  };
  return (
    <Modal title={tx(`حذف «${brand.name.ar}»`, `Delete “${brand.name.en}”`)} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={run}>{tx('احذف', 'Delete')}</Button></>}>
      {n === 0 ? <p className="text-sm text-muted">{tx('لا منتجات بهذه العلامة.', 'No products use this brand.')}</p> : (
        <div className="space-y-3">
          <p className="text-sm text-fg">{tx(`${productCount(tx, n)} بهذه العلامة. إلى أين تنتقل؟`, `${productCount(tx, n)} use this brand. Where should they go?`)}</p>
          <Field label={tx('انقل المنتجات إلى', 'Move products to')}>{(p) => <Select {...p} value={to} onChange={(e) => setTo(e.target.value)}><option value="">{tx('بلا علامة', 'No brand')}</option>{x.brands.filter((b) => b.id !== brand.id).map((b) => <option key={b.id} value={b.id}>{b.name[lang]}</option>)}</Select>}</Field>
          <p className="text-xs text-muted">{tx('يمكنك التراجع من الإشعار بعد الحذف.', 'You can undo from the notice after deleting.')}</p>
        </div>
      )}
    </Modal>
  );
}

function MergeModal({ pair, onClose }: { pair: [Brand, Brand]; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const products = productsStore.use();
  const [keep, setKeep] = useState(pair[0].id);
  const drop = pair.find((b) => b.id !== keep)!;
  const kept = pair.find((b) => b.id === keep)!;
  const run = () => {
    const beforeX = catalogXStore.get(), beforeP = productsStore.get();
    productsStore.set((ps) => reassignBrand(ps, drop.id, keep));
    catalogXStore.set((s) => ({ ...s, brands: s.brands.filter((b) => b.id !== drop.id) }));
    logAction('products', { ar: `دمج العلامة ${drop.name.ar} في ${kept.name.ar}`, en: `Merged brand ${drop.name.en} into ${kept.name.en}` }, { target: keep });
    toast({ tone: 'ok', text: tx('دُمجت العلامتان', 'Brands merged'), action: { label: tx('تراجع', 'Undo'), run: () => { catalogXStore.set((s) => ({ ...s, brands: beforeX.brands })); productsStore.set(beforeP); } } });
    onClose();
  };
  return (
    <Modal title={tx('دمج علامتين', 'Merge two brands')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={run}>{tx('ادمج', 'Merge')}</Button></>}>
      <fieldset className="space-y-2"><legend className="mb-2 text-sm text-fg">{tx('أي اسم تبقي؟', 'Which one do you keep?')}</legend>
        {pair.map((b) => <label key={b.id} className="flex items-center gap-3 rounded-xl border border-border p-3 has-[:checked]:border-brand-500"><input type="radio" name="keep" className="accent-brand-600" checked={keep === b.id} onChange={() => setKeep(b.id)} /><BrandMark b={b} />{b.name[lang]}<span className="ms-auto text-xs text-muted">{productCount(tx, brandCount(products, b.id))}</span></label>)}
      </fieldset>
      <p className="mt-3 text-sm text-muted">{tx(`تنتقل ${productCount(tx, brandCount(products, drop.id))} إلى «${kept.name.ar}» وتُحذف «${drop.name.ar}».`, `${productCount(tx, brandCount(products, drop.id))} move to “${kept.name.en}” and “${drop.name.en}” is removed.`)}</p>
    </Modal>
  );
}
