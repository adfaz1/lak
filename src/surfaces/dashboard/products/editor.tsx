// Product editor (`#/dashboard/products/<id>` and `/new`). Typing is kept as a session draft (never counted as saved);
// "saved" only after the simulated server round trip succeeds, with the new version number.
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, PackageSearch, Star, Trash2, X, Plus, Boxes, Copy } from 'lucide-react';
import { navigate, replace } from '../../../core/router';
import { useLang } from '../../../core/lang';
import { useReviewMode } from '../../../core/review';
import { LOCATIONS, LOC_IDS, type Channel, type LocId } from '../../merchant/domain';
import { colorText, parseMoney, takenSkus, variantText, type DraftError, type Product, type ProductDraft } from '../../merchant/catalog';
import { available, levelOf } from '../../merchant/inventory';
import { can } from '../../merchant/perms';
import { categoriesStore, draftsStore, levelsStore, productsStore } from '../../merchant/stores';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, InfoHint, Money, ProductImage, Ref, Segmented, Skeleton, cn, useTx } from '../../../ds/ui';
import { Alert, Field, Input, PageHeader, SaveBar, Select, Simulated, Switch, Textarea, inputClass, useToast } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { sectionHref } from '../pages';
import {
  CHANNELS, TAG_MAX, categoryKey, categoryOptions, checkImage, discountPct, duplicateDraft, fieldId, fromEditDraft, hiddenReason, levelsForNew, makePrimary, mediaSrc,
  moveItem, nextProductId, normaliseTags, orderErrors, previewPrice, profitOf, rebuildEditVariants, rememberUrl, removeMedia, restoreMedia, seoPreview, slugify, toEditDraft,
  validateEdit, type EditDraft, type EditVariant, type FileProblem,
} from './model';
import { LeaveModal, ReviewTools, STATUS_TONE, phref, roleBadge, useLeaveGuard, useNames, useRole } from './common';

type SaveState = 'clean' | 'dirty' | 'saving' | 'failed' | 'saved';
/** The last successful save, so the page can still say "Saved · version n" after a new product gets its id. */
let lastSaved: { id: string; version: number; at: string } | null = null;
const draftKey = (id: string) => `dash:${id}`;

export default function Editor({ id }: { id: string }) {
  const tx = useTx();
  const state = useDashState();
  const products = productsStore.use();
  const isNew = id === 'new';
  const product = products.find((p) => p.id === id);
  const back = { href: phref(), label: tx('المنتجات', 'Products') };

  if (state === 'loading') return <div className="space-y-6" aria-busy="true"><PageHeader back={back} title={<Skeleton className="h-8 w-64" />} /><EditorSkeleton /></div>;
  if (state === 'error') return (
    <div className="space-y-6"><PageHeader back={back} title={tx('المنتج', 'Product')} />
      <Card><ErrorState as="h2" title={tx('تعذّر تحميل المنتج', 'The product could not load')} onRetry={() => setDashState('live')}>{tx('لم يتغير شيء. المرجع SIM-PRD-504.', 'Nothing changed. Ref SIM-PRD-504.')}</ErrorState></Card>
    </div>
  );
  if (!isNew && !product) return (
    <div className="space-y-6"><PageHeader back={back} title={tx('المنتج غير موجود', 'Product not found')} />
      <Card><EmptyState icon={<PackageSearch className="size-6" aria-hidden="true" />} title={tx('لا يوجد منتج بهذا المعرف', 'No product with this id')} action={<a className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300" href={phref()}>{tx('كل المنتجات', 'All products')}</a>}>
        {tx('ربما حُذف أو أن الرابط غير صحيح.', 'It may have been removed, or the link is wrong.')}
      </EmptyState></Card>
    </div>
  );
  return <Form id={id} product={product} />;
}

function Form({ id, product }: { id: string; product: Product | undefined }) {
  const tx = useTx();
  const { lang } = useLang();
  const names = useNames();
  const toast = useToast();
  const review = useReviewMode();
  const role = useRole();
  const canEdit = can(role, 'product.edit');
  const products = productsStore.use();
  const levels = levelsStore.use();
  const isNew = !product;
  const key = draftKey(id);

  const base = useMemo(() => toEditDraft(product), [product?.id, product?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const stored = draftsStore.get()[key] as unknown as EditDraft | undefined;
  const [draft, setDraft] = useState<EditDraft>(() => (stored ? { ...base, ...stored } : base));
  const justSaved = lastSaved?.id === id ? lastSaved : null;
  const [state, setState] = useState<SaveState>(() => (stored ? 'dirty' : justSaved ? 'saved' : 'clean'));
  const [restored, setRestored] = useState(!!stored);
  const [savedInfo, setSavedInfo] = useState(justSaved);
  const [showErr, setShowErr] = useState(false);
  const [failNext, setFailNext] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const summaryRef = useRef<HTMLDivElement>(null);

  const known = useMemo(() => new Set(levels.map((l) => l.sku)), [levels]);
  const cats = categoriesStore.use();
  const catOpts = categoryOptions(cats);
  const errors = useMemo(() => validateEdit(draft, takenSkus(products, product?.id), known), [draft, products, product?.id, known]);
  const errorKeys = orderErrors(Object.keys(errors));
  const dirty = state === 'dirty' || state === 'failed' || state === 'saving';
  useLeaveGuard(dirty && canEdit, setLeaveTo);

  const set = (patch: Partial<EditDraft>) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    draftsStore.set((d) => ({ ...d, [key]: next as unknown as ProductDraft }));
    setState((s) => (s === 'saving' ? s : 'dirty'));
  };
  const clearStored = () => draftsStore.set((d) => { const n = { ...d }; delete n[key]; return n; });
  const duplicate = (p: Product) => {
    draftsStore.set((x) => ({ ...x, [draftKey('new')]: { ...duplicateDraft(p, productsStore.get()), copyOf: p.name[lang] } as unknown as ProductDraft }));
    navigate(phref('new'));
  };
  const discard = () => { setDraft(base); draftRef.current = base; clearStored(); setState('clean'); setShowErr(false); setRestored(false); };

  const save = () => {
    if (state === 'saving' || !canEdit) return;
    setShowErr(true);
    if (errorKeys.length) { setTimeout(() => summaryRef.current?.focus(), 0); return; }
    setState('saving');
    const willFail = failNext;
    const d = draftRef.current;
    setTimeout(() => {
      if (willFail) { setState('failed'); setFailNext(false); return; }
      const all = productsStore.get();
      const newId = isNew ? nextProductId(all) : product!.id;
      const version = (product?.version ?? 0) + 1;
      const saved = fromEditDraft(d, newId, version);
      productsStore.set(isNew ? [saved, ...all] : all.map((p) => (p.id === newId ? saved : p)));
      const fresh = levelsForNew(d, new Set(levelsStore.get().map((l) => l.sku)));
      if (fresh.length) levelsStore.set((ls) => [...ls, ...fresh]);
      clearStored();
      const info = { id: newId, version, at: new Date().toLocaleTimeString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) };
      lastSaved = info;
      setSavedInfo(info);
      setState('saved');
      setShowErr(false);
      setRestored(false);
      toast({ tone: 'ok', text: tx(`حُفظ المنتج · الإصدار ${version}`, `Product saved · version ${version}`) });
      if (isNew) replace(phref(newId));
    }, 900);
  };

  const errText = (e?: DraftError) => e && ({
    required: tx('مطلوب', 'Required'), money: tx('مبلغ أكبر من صفر، مثل 290 أو 290.50', 'An amount above zero, e.g. 290 or 290.50'),
    compareAt: tx('يجب أن يكون أعلى من السعر', 'Must be higher than the price'), skuTaken: tx('مستخدم لمنتج آخر', 'Used by another product'),
    skuFormat: tx('3–32 حرفًا لاتينيًا أو رقمًا أو شرطة', '3–32 Latin letters, digits or hyphens'), weight: tx('بالغرام، من 1 إلى 30000', 'Grams, 1–30000'),
    slug: tx('حروف لاتينية صغيرة وأرقام وشرطات', 'Lowercase letters, digits and hyphens'), alt: tx('صف الصورة لمن لا يراها', 'Describe the image for people who can’t see it'),
    duplicate: tx('قيمة مكررة', 'Duplicate value'), stock: tx('عدد صحيح 0 أو أكثر', 'A whole number, 0 or more'), skuRepeated: tx('مكرر في المتغيرات', 'Repeated in variants'),
  })[e];
  const fe = (k: string) => (showErr ? errText(errors[k]) : undefined);
  const fieldLabel = (k: string): string => {
    const [a, b, c, d] = k.split('.');
    const loc = (x?: string) => (x ? LOCATIONS[x as LocId]?.[lang] ?? x : '');
    const map: Record<string, string> = { nameAr: tx('الاسم بالعربية', 'Arabic name'), nameEn: tx('الاسم بالإنجليزية', 'English name'), price: tx('السعر', 'Price'), compareAt: tx('السعر قبل الخصم', 'Compare-at price'), cost: tx('التكلفة', 'Cost'), sku: 'SKU', weight: tx('الوزن', 'Weight'), slug: tx('الرابط', 'URL handle'), colors: tx('الألوان', 'Colours'), sizes: tx('المقاسات', 'Sizes') };
    if (a === 'media') return tx(`النص البديل للصورة ${Number(b) + 1}`, `Alt text, image ${Number(b) + 1}`);
    if (a === 'stock') return tx(`الكمية · ${loc(b)}`, `Quantity · ${loc(b)}`);
    if (a === 'v') { const v = draft.variants[Number(b)]; const n = v ? variantText(v.color, v.size)[lang] : b; return `${n} · ${c === 'stock' ? `${tx('الكمية', 'Qty')} ${loc(d)}` : c === 'price' ? tx('السعر', 'Price') : 'SKU'}`; }
    return map[a] ?? k;
  };

  const status = draft.status;
  const version = product?.version ?? null;
  const stateLine: Record<SaveState, ReactNode> = {
    clean: isNew ? tx('لم يُحفظ بعد', 'Not saved yet') : tx(`محفوظ · الإصدار ${version}`, `Saved · version ${version}`),
    dirty: tx('تغييرات غير محفوظة', 'Unsaved changes'),
    saving: tx('جارٍ الحفظ…', 'Saving…'),
    failed: tx('لم يُحفظ: انقطع الاتصال', 'Not saved: connection lost'),
    saved: savedInfo ? tx(`حُفظ ${savedInfo.at} · الإصدار ${savedInfo.version}`, `Saved at ${savedInfo.at} · version ${savedInfo.version}`) : '',
  };
  const title = isNew ? tx('منتج جديد', 'New product') : (lang === 'ar' ? draft.nameAr || draft.nameEn : draft.nameEn || draft.nameAr) || product!.name[lang];

  return (
    <div className="space-y-6">
      <PageHeader back={{ href: phref(), label: tx('المنتجات', 'Products') }} title={title}
        meta={<>
          <Badge tone={STATUS_TONE[status]}>{names.status(status)}</Badge>
          <span role="status" aria-live="polite" className={cn('text-[13px]', state === 'failed' ? 'font-semibold text-red-600 dark:text-red-400' : state === 'dirty' ? 'text-amber-700 dark:text-amber-300' : 'text-muted')}>{stateLine[state]}</span>
          {!canEdit && roleBadge(tx)}
        </>}
        actions={canEdit && <>{!isNew && <Button variant="secondary" onClick={() => duplicate(product!)} disabled={dirty}><Copy className="size-4" aria-hidden="true" />{tx('انسخ', 'Duplicate')}</Button>}<Button onClick={save} disabled={state === 'saving' || (!dirty && !isNew)}>{state === 'saving' ? tx('جارٍ الحفظ…', 'Saving…') : state === 'failed' ? tx('أعد المحاولة', 'Try again') : tx('احفظ', 'Save')}</Button></>} />

      {draft.copyOf && isNew && <Alert tone="info" title={tx('نسخة غير محفوظة', 'Unsaved copy')} action={<Button variant="ghost" size="sm" onClick={discard}>{tx('ألغِ النسخة', 'Discard copy')}</Button>}>{tx(`من «${draft.copyOf}». الحالة مسودة وSKU جديد؛ أدخل المخزون الأولي.`, `Of “${draft.copyOf}”. Draft status and a new SKU; enter initial stock.`)}</Alert>}
      {restored && state === 'dirty' && !draft.copyOf && <Alert tone="info" title={tx('استعدنا تعديلاتك غير المحفوظة', 'We restored your unsaved edits')} action={<Button variant="ghost" size="sm" onClick={discard}>{tx('تجاهلها', 'Discard them')}</Button>}>{tx('من هذه الجلسة. لم تُحفظ بعد.', 'From this session. Not saved yet.')}</Alert>}
      {state === 'failed' && (
        <Alert tone="bad" title={tx('لم يُحفظ المنتج', 'The product was not saved')}>
          {tx('انقطع الاتصال بالخادم. كل ما كتبته باقٍ هنا.', 'The connection to the server dropped. Everything you typed is still here.')} <Simulated />
        </Alert>
      )}
      {showErr && errorKeys.length > 0 && (
        <div ref={summaryRef} tabIndex={-1} className="outline-none">
          <Alert tone="bad" title={tx(`صحّح ${errorKeys.length} حقول قبل الحفظ`, `Fix ${errorKeys.length} fields before saving`)}>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {errorKeys.slice(0, 8).map((k) => <li key={k}><button type="button" className="text-start font-medium underline underline-offset-2" onClick={() => document.getElementById(fieldId(k))?.focus()}>{fieldLabel(k)}</button></li>)}
              {errorKeys.length > 8 && <li>{tx(`و${errorKeys.length - 8} أخرى`, `and ${errorKeys.length - 8} more`)}</li>}
            </ul>
          </Alert>
        </div>
      )}

      <fieldset disabled={!canEdit} className="min-w-0">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="min-w-0 space-y-6">
            <Basics draft={draft} set={set} fe={fe} />
            <MediaSection draft={draft} set={set} fe={fe} get={() => draftRef.current} />
            <Pricing draft={draft} set={set} fe={fe} />
            <InventorySection draft={draft} set={set} fe={fe} known={known} />
            <Variants draft={draft} set={set} fe={fe} known={known} />
            {draft.type === 'physical' && (
              <Card aria-labelledby="pe-h-ship">
                <CardHeader id="pe-h-ship" title={tx('الشحن', 'Shipping')} />
                <div className="px-5 pb-5"><Field id={fieldId('weight')} label={tx('الوزن (غرام)', 'Weight (grams)')} error={fe('weight')} className="max-w-xs">{(p) => <Input {...p} dir="ltr" inputMode="numeric" value={draft.weight} onChange={(e) => set({ weight: e.target.value })} />}</Field></div>
              </Card>
            )}
            <Seo draft={draft} set={set} fe={fe} />
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24" aria-label={tx('النشر', 'Publishing')}>
            <Card aria-labelledby="pe-h-status">
              <CardHeader id="pe-h-status" title={tx('الحالة', 'Status')} hint={tx('المسودة والمؤرشف لا يظهران للعملاء.', 'Drafts and archived products are hidden from shoppers.')} />
              <div className="space-y-4 px-5 pb-5">
                <Field label={tx('حالة المنتج', 'Product status')}>{(p) => <Select {...p} value={draft.status} onChange={(e) => set({ status: e.target.value as EditDraft['status'] })}>{(['active', 'draft', 'archived'] as const).map((s) => <option key={s} value={s}>{names.status(s)}</option>)}</Select>}</Field>
                <Field label={<span className="flex w-full items-center justify-between gap-2">{tx('الفئة', 'Category')}<a href={phref('categories')} className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('إدارة الفئات', 'Manage')}</a></span>}>{(p) => (
                  <Select {...p} value={categoryKey(draft.category)} onChange={(e) => set({ category: catOpts.find((c) => c.key === e.target.value)?.name ?? draft.category })}>
                    {[...catOpts, ...(catOpts.some((c) => c.key === categoryKey(draft.category)) ? [] : [{ key: categoryKey(draft.category), name: draft.category, depth: 0 as const, id: null }])].map((c) => <option key={c.key} value={c.key}>{c.depth ? '— ' : ''}{c.name[lang]}</option>)}
                  </Select>
                )}</Field>
                <TagsField tags={draft.tags ?? []} onChange={(t) => set({ tags: t })} />
              </div>
            </Card>
            <PreviewCard draft={draft} />
            <Card aria-labelledby="pe-h-ch">
              <CardHeader id="pe-h-ch" title={tx('القنوات', 'Channels')} hint={tx('سوق لك يراجع أهلية كل منتج قبل ظهوره.', 'LAK marketplace reviews each product’s eligibility before it appears.')} />
              <ul className="space-y-3 px-5 pb-5">
                {CHANNELS.map((c) => (
                  <li key={c} className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-fg">{names.channel(c)}</span>
                    <Switch checked={draft.channels[c]} label={names.channel(c)} onChange={(v) => set({ channels: { ...draft.channels, [c]: v } as Record<Channel, boolean> })} />
                  </li>
                ))}
              </ul>
            </Card>
          </aside>
        </div>
      </fieldset>

      {review && (
        <ReviewTools>
          <label className="flex items-center gap-2 text-muted"><Switch checked={failNext} onChange={setFailNext} label={tx('حاكِ انقطاع الشبكة عند الحفظ التالي', 'Simulate a network drop on the next save')} />{tx('انقطاع الشبكة عند الحفظ التالي', 'Network drop on next save')}</label>
        </ReviewTools>
      )}

      {canEdit && <SaveBar dirty={dirty} saving={state === 'saving'} onSave={save} onDiscard={discard}
        error={state === 'failed' ? tx('لم يُحفظ. تعديلاتك باقية.', 'Not saved. Your edits are kept.') : showErr && errorKeys.length ? tx(`${errorKeys.length} حقول تحتاج تصحيحًا`, `${errorKeys.length} fields need fixing`) : undefined}
        saveLabel={state === 'failed' ? tx('أعد المحاولة', 'Try again') : undefined} />}
      {leaveTo && <LeaveModal to={leaveTo} onStay={() => setLeaveTo(null)} onKeep={() => { setLeaveTo(null); setState('clean'); }} onDiscard={() => { setLeaveTo(null); discard(); }} />}
    </div>
  );
}

type SecProps = { draft: EditDraft; set: (p: Partial<EditDraft>) => void; fe: (k: string) => string | undefined };

function Basics({ draft, set, fe }: SecProps) {
  const tx = useTx();
  return (
    <Card aria-labelledby="pe-h-basics">
      <CardHeader id="pe-h-basics" title={tx('الأساسيات', 'Basics')} action={
        <Segmented label={tx('نوع المنتج', 'Product type')} value={draft.type} onChange={(v) => set({ type: v })}
          options={[{ value: 'physical', label: tx('ملموس', 'Physical') }, { value: 'digital', label: tx('رقمي', 'Digital') }]} />} />
      <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2">
        <Field id={fieldId('nameAr')} label={tx('الاسم بالعربية', 'Name in Arabic')} error={fe('nameAr')}>{(p) => <Input {...p} dir="rtl" lang="ar" value={draft.nameAr} onChange={(e) => set({ nameAr: e.target.value })} />}</Field>
        <Field id={fieldId('nameEn')} label={tx('الاسم بالإنجليزية', 'Name in English')} error={fe('nameEn')}>{(p) => <Input {...p} dir="ltr" lang="en" value={draft.nameEn} onChange={(e) => set({ nameEn: e.target.value })} />}</Field>
        <Field label={tx('الوصف بالعربية', 'Description in Arabic')} optional>{(p) => <Textarea {...p} dir="rtl" lang="ar" value={draft.descAr} onChange={(e) => set({ descAr: e.target.value })} />}</Field>
        <Field label={tx('الوصف بالإنجليزية', 'Description in English')} optional>{(p) => <Textarea {...p} dir="ltr" lang="en" value={draft.descEn} onChange={(e) => set({ descEn: e.target.value })} />}</Field>
      </div>
    </Card>
  );
}

interface Upload { id: string; name: string; size: number; src: string; progress: number; status: 'uploading' | 'failed'; problem?: FileProblem }
/** Review switch: the first file of the next batch fails mid-upload (a simulated network error), so retry can be checked. */
let failNextUpload = false;

function MediaSection({ draft, set, fe, get }: SecProps & { get: () => EditDraft }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const review = useReviewMode();
  const media = draft.media;
  const input = useRef<HTMLInputElement>(null);
  const [ups, setUps] = useState<Upload[]>([]);
  const [over, setOver] = useState(false);
  const [failSwitch, setFailSwitch] = useState(failNextUpload);
  const upd = (id: string, p: Partial<Upload>) => setUps((l) => l.map((u) => (u.id === id ? { ...u, ...p } : u)));
  const run = (u: Upload, fail: boolean) => {
    let pct = 0;
    const t = setInterval(() => {
      pct += 12 + Math.round(Math.random() * 10);
      if (fail && pct >= 60) { clearInterval(t); upd(u.id, { status: 'failed', progress: 60 }); return; }
      if (pct >= 100) {
        clearInterval(t);
        setUps((l) => l.filter((x) => x.id !== u.id));
        set({ media: [...get().media, { id: u.id, label: { ar: 'صورة مرفوعة', en: 'Uploaded image' }, alt: '', src: u.src }] });
        return;
      }
      upd(u.id, { progress: pct });
    }, 140);
  };
  const addFiles = (files: FileList | File[]) => {
    const list = [...files];
    if (!list.length) return;
    const fresh: Upload[] = list.map((f, i) => {
      const problem = checkImage(f);
      return { id: `up-${Date.now().toString(36)}-${i}`, name: f.name, size: f.size, src: problem ? '' : rememberUrl(URL.createObjectURL(f)), progress: 0, status: problem ? 'failed' : 'uploading', problem: problem ?? undefined };
    });
    setUps((l) => [...l, ...fresh]);
    let failed = false;
    fresh.forEach((u) => { if (u.status === 'uploading') { const f = failNextUpload && !failed; if (f) failed = true; run(u, f); } });
    if (failed) { failNextUpload = false; setFailSwitch(false); }
  };
  const retry = (u: Upload) => { upd(u.id, { status: 'uploading', progress: 0 }); run(u, false); };
  const drop = (u: Upload) => setUps((l) => l.filter((x) => x.id !== u.id));
  const remove = (i: number) => {
    const r = removeMedia(get().media, i);
    if (!r.removed) return;
    set({ media: r.list });
    const removed = r.removed;
    toast({ tone: 'info', text: tx(`حُذفت الصورة ${i + 1}`, `Image ${i + 1} removed`), action: { label: tx('تراجع', 'Undo'), run: () => set({ media: restoreMedia(get().media, removed) }) } });
  };
  const problemText = (u: Upload) => (u.problem === 'type' ? tx('ليس صورة (JPG أو PNG أو WebP)', 'Not an image (JPG, PNG or WebP)') : u.problem === 'size' ? tx('أكبر من 10 ميغابايت', 'Over 10 MB') : u.problem === 'empty' ? tx('ملف فارغ', 'Empty file') : tx('انقطع الرفع', 'Upload interrupted'));
  return (
    <Card aria-labelledby="pe-h-media">
      <CardHeader id="pe-h-media" title={tx('الصور', 'Media')} hint={tx('الصورة الأولى هي الرئيسية في المتجر والقوائم. النص البديل مطلوب لكل صورة.', 'The first image is the main one in the store and lists. Every image needs alt text.')}
        action={<span className="flex items-center gap-2"><InfoHint>{tx('المعاينة محلية في هذه الجلسة؛ الحفظ الدائم يحتاج خادمًا.', 'Previews are local to this session; permanent storage needs a server.')}</InfoHint><Button variant="secondary" size="sm" onClick={() => input.current?.click()}><ImagePlus className="size-4" aria-hidden="true" />{tx('ارفع صورًا', 'Upload images')}</Button></span>} />
      <div className="space-y-3 px-5 pb-5">
        <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="sr-only" tabIndex={-1} aria-label={tx('صور المنتج', 'Product images')} onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
        <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
          className={cn('flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 text-center text-sm text-muted transition-colors', media.length ? 'py-4' : 'py-8', over ? 'border-brand-400 bg-brand-500/5 text-fg' : 'border-border')}>
          <ImagePlus className="size-6" aria-hidden="true" />
          <span>{tx('اسحب الصور هنا أو', 'Drag images here or')} <button type="button" className="font-semibold text-brand-700 hover:underline dark:text-brand-300" onClick={() => input.current?.click()}>{tx('اختر من جهازك', 'choose from your device')}</button></span>
          <span className="text-xs text-subtle">{tx('JPG أو PNG أو WebP حتى 10 ميغابايت', 'JPG, PNG or WebP up to 10 MB')}</span>
        </div>
        {ups.length > 0 && (
          <ul className="space-y-2" aria-live="polite" aria-label={tx('الرفع', 'Uploads')}>
            {ups.map((u) => (
              <li key={u.id} className={cn('flex flex-wrap items-center gap-3 rounded-xl border p-3', u.status === 'failed' ? 'border-red-500/40 bg-red-500/5' : 'border-border')}>
                <ProductImage src={u.src || undefined} alt="" size={44} />
                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate text-sm font-semibold text-fg"><bdi dir="ltr">{u.name}</bdi></p>
                  {u.status === 'uploading' ? (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={u.progress} aria-label={tx(`رفع ${u.name}`, `Uploading ${u.name}`)}><div className="h-full rounded-full bg-brand-gradient transition-[width]" style={{ width: `${u.progress}%` }} /></div>
                  ) : <p className="text-xs font-medium text-red-700 dark:text-red-300">{problemText(u)}</p>}
                </div>
                {u.status === 'uploading' ? <span className="text-xs tabular-nums text-muted">{u.progress}%</span> : (
                  <span className="flex gap-1">{!u.problem && <Button size="sm" variant="secondary" onClick={() => retry(u)}>{tx('أعد المحاولة', 'Retry')}</Button>}<Button size="sm" variant="ghost" onClick={() => drop(u)}>{tx('أزل', 'Remove')}</Button></span>
                )}
              </li>
            ))}
          </ul>
        )}
        {media.length > 0 && (
          <ol className="space-y-3">
            {media.map((m, i) => (
              <li key={m.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-border p-3 sm:flex-nowrap">
                <div className="relative">
                  <ProductImage src={mediaSrc(m)} alt={m.alt || tx('صورة بلا وصف', 'Image without description')} size={72} />
                  {i === 0 && <span className="absolute -top-1.5 start-1.5"><Badge tone="brand" className="h-5 px-2 text-[10px]">{tx('رئيسية', 'Main')}</Badge></span>}
                </div>
                <div className="min-w-0 flex-1 basis-48 space-y-2">
                  <Field id={fieldId(`media.${i}`)} label={tx(`النص البديل · صورة ${i + 1}`, `Alt text · image ${i + 1}`)} error={fe(`media.${i}`)}>
                    {(p) => <Input {...p} value={m.alt} onChange={(e) => set({ media: media.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)) })} />}
                  </Field>
                  {draft.colors.length > 0 && (
                    <label className="flex flex-wrap items-center gap-2 text-xs text-muted">{tx('تُعرض عند اختيار اللون', 'Shown when the colour is')}
                      <Select className="h-8 w-auto text-xs" value={m.variant ?? ''} onChange={(e) => set({ media: media.map((x, j) => (j === i ? { ...x, variant: e.target.value || undefined } : x)) })}>
                        <option value="">{tx('كل الألوان', 'Any colour')}</option>
                        {draft.colors.map((c) => <option key={c} value={c}>{colorText(c, lang)}</option>)}
                      </Select>
                    </label>
                  )}
                </div>
                <div className="flex items-center gap-1 sm:pt-6">
                  <IconBtn label={tx(`اجعل الصورة ${i + 1} رئيسية`, `Make image ${i + 1} the main image`)} disabled={i === 0} onClick={() => set({ media: makePrimary(media, i) })}><Star className="size-4" /></IconBtn>
                  <IconBtn label={tx(`قدّم الصورة ${i + 1}`, `Move image ${i + 1} earlier`)} disabled={i === 0} onClick={() => set({ media: moveItem(media, i, -1) })}><ArrowUp className="size-4" /></IconBtn>
                  <IconBtn label={tx(`أخّر الصورة ${i + 1}`, `Move image ${i + 1} later`)} disabled={i === media.length - 1} onClick={() => set({ media: moveItem(media, i, 1) })}><ArrowDown className="size-4" /></IconBtn>
                  <IconBtn label={tx(`احذف الصورة ${i + 1}`, `Remove image ${i + 1}`)} onClick={() => remove(i)}><Trash2 className="size-4" /></IconBtn>
                </div>
              </li>
            ))}
          </ol>
        )}
        {review && <label className="flex items-center gap-2 rounded-xl border border-dashed border-border p-2.5 text-xs text-muted"><Switch checked={failSwitch} onChange={(v) => { failNextUpload = v; setFailSwitch(v); }} label={tx('حاكِ فشل رفع صورة واحدة', 'Simulate one failed upload')} />{tx('أداة مراجعة: يفشل رفع أول صورة في الدفعة التالية', 'Review tool: the first image of the next batch fails')}<Simulated /></label>}
      </div>
    </Card>
  );
}

function IconBtn({ label, children, ...p }: { label: string; children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return <button type="button" aria-label={label} title={label} className="grid size-9 place-items-center rounded-lg border border-border text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40 [&_svg]:pointer-events-none" {...p}>{children}</button>;
}

function Pricing({ draft, set, fe }: SecProps) {
  const tx = useTx();
  const profit = profitOf(draft.price, draft.cost);
  const off = discountPct(draft.price, draft.compareAt);
  return (
    <Card aria-labelledby="pe-h-price">
      <CardHeader id="pe-h-price" title={tx('التسعير', 'Pricing')} hint={tx('الأسعار بالريال وشاملة ضريبة القيمة المضافة.', 'Prices are in riyals and include VAT.')} />
      <div className="grid grid-cols-1 gap-4 px-5 sm:grid-cols-3">
        <Field id={fieldId('price')} label={tx('السعر', 'Price')} error={fe('price')}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" placeholder="0.00" value={draft.price} onChange={(e) => set({ price: e.target.value })} />}</Field>
        <Field id={fieldId('compareAt')} label={tx('السعر قبل الخصم', 'Compare-at price')} optional error={fe('compareAt')}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={draft.compareAt} onChange={(e) => set({ compareAt: e.target.value })} />}</Field>
        <Field id={fieldId('cost')} label={tx('تكلفة القطعة', 'Cost per item')} optional error={fe('cost')} hint={tx('لا يراها العملاء', 'Not shown to shoppers')}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={draft.cost} onChange={(e) => set({ cost: e.target.value })} />}</Field>
      </div>
      <dl className="m-5 mt-4 grid grid-cols-3 gap-3 rounded-xl bg-surface-2 p-3 text-sm" aria-live="polite">
        <div><dt className="flex items-center gap-1 text-xs text-muted">{tx('الربح للقطعة', 'Profit per item')}<InfoHint>{tx('السعر − التكلفة، قبل الشحن والرسوم. ليس ربحًا صافيًا.', 'Price − cost, before shipping and fees. Not net profit.')}</InfoHint></dt><dd className="mt-0.5 font-bold text-fg">{profit ? <Money v={profit.amount} /> : <span className="text-xs font-normal text-subtle">{tx('أدخل التكلفة', 'Add a cost')}</span>}</dd></div>
        <div><dt className="text-xs text-muted">{tx('الهامش', 'Margin')}</dt><dd className="mt-0.5 font-bold text-fg tabular-nums">{profit ? <bdi dir="ltr">{profit.pct}%</bdi> : '—'}</dd></div>
        <div><dt className="text-xs text-muted">{tx('الخصم الظاهر', 'Shown discount')}</dt><dd className="mt-0.5 font-bold text-fg tabular-nums">{off !== null ? <bdi dir="ltr">−{off}%</bdi> : '—'}</dd></div>
      </dl>
    </Card>
  );
}

function InventorySection({ draft, set, fe, known }: SecProps & { known: Set<string> }) {
  const tx = useTx();
  const { lang } = useLang();
  const levels = levelsStore.use();
  const sku = draft.sku.trim();
  const physical = draft.type === 'physical';
  return (
    <Card aria-labelledby="pe-h-inv">
      <CardHeader id="pe-h-inv" title={tx('المخزون', 'Inventory')} hint={tx('الكمية الأولية تُدخل للـSKU الجديد فقط؛ تغيير الموجود يتم من المخزون مع سبب ويُسجَّل.', 'Initial quantity is entered for new SKUs only; changing existing stock happens in Inventory, with a reason, and is logged.')} />
      <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2">
        <Field id={fieldId('sku')} label="SKU" error={fe('sku')} hint={draft.variants.length ? tx('أساس SKU المتغيرات', 'Base for variant SKUs') : undefined}>{(p) => <Input {...p} dir="ltr" value={draft.sku} onChange={(e) => set({ sku: e.target.value.toUpperCase() })} />}</Field>
        <Field label={tx('الباركود', 'Barcode')} optional>{(p) => <Input {...p} dir="ltr" inputMode="numeric" value={draft.barcode} onChange={(e) => set({ barcode: e.target.value })} />}</Field>
        {!physical ? <p className="text-sm text-muted sm:col-span-2">{tx('منتج رقمي: لا مخزون ولا وزن.', 'Digital product: no stock and no weight.')}</p>
          : draft.variants.length ? <p className="text-sm text-muted sm:col-span-2">{tx('المخزون لكل متغير في جدول المتغيرات.', 'Stock is per variant, in the variants table.')}</p>
            : known.has(sku) ? (
              <div className="sm:col-span-2">
                <p className="mb-2 text-[13px] font-semibold text-fg">{tx('المتاح لكل مستودع', 'Available per warehouse')}</p>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {LOC_IDS.map((loc) => { const lv = levelOf(levels, sku, loc); return (
                    <li key={loc} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm"><span className="text-muted">{LOCATIONS[loc][lang]}</span><span className="font-semibold tabular-nums text-fg">{lv ? available(lv) : 0}<span className="ms-1 text-xs font-normal text-subtle">/ {lv?.onHand ?? 0} {tx('موجود', 'on hand')}</span></span></li>
                  ); })}
                </ul>
                <a href={sectionHref('inventory', '', { q: sku })} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300"><Boxes className="size-4" aria-hidden="true" />{tx('عدّل المخزون مع سبب', 'Adjust stock with a reason')}</a>
              </div>
            ) : LOC_IDS.map((loc) => (
              <Field key={loc} id={fieldId(`stock.${loc}`)} label={tx(`الكمية الأولية · ${LOCATIONS[loc].ar}`, `Initial quantity · ${LOCATIONS[loc].en}`)} error={fe(`stock.${loc}`)}>
                {(p) => <Input {...p} dir="ltr" inputMode="numeric" value={draft.stockBy[loc]} onChange={(e) => set({ stockBy: { ...draft.stockBy, [loc]: e.target.value } })} />}
              </Field>
            ))}
      </div>
    </Card>
  );
}

function Variants({ draft, set, fe, known }: SecProps & { known: Set<string> }) {
  const tx = useTx();
  const { lang } = useLang();
  const levels = levelsStore.use();
  const [typed, setTyped] = useState<{ colors: string; sizes: string }>({ colors: '', sizes: '' });
  const physical = draft.type === 'physical';
  const add = (kind: 'colors' | 'sizes') => {
    const v = typed[kind].trim();
    if (!v) return;
    const next = { ...draft, [kind]: [...draft[kind], v] };
    set({ [kind]: next[kind], variants: rebuildEditVariants(next) });
    setTyped((t) => ({ ...t, [kind]: '' }));
  };
  const remove = (kind: 'colors' | 'sizes', i: number) => {
    const next = { ...draft, [kind]: draft[kind].filter((_, j) => j !== i) };
    set({ [kind]: next[kind], variants: rebuildEditVariants(next) });
  };
  const setV = (i: number, patch: Partial<EditVariant>) => set({ variants: draft.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  const cellErr = (k: string) => { const m = fe(k); return m ? <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{m}</p> : null; };
  return (
    <Card aria-labelledby="pe-h-var">
      <CardHeader id="pe-h-var" title={tx('المتغيرات', 'Variants')} hint={tx('كل لون × مقاس متغير له SKU وسعر ومخزون. حذف متغير له طلبات سابقة لا يغيّر سجل تلك الطلبات.', 'Each colour × size is a variant with its own SKU, price and stock. Removing a variant with past orders does not change those orders.')} />
      <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2">
        {(['colors', 'sizes'] as const).map((kind) => (
          <div key={kind}>
            <Field id={fieldId(kind)} label={kind === 'colors' ? tx('الألوان', 'Colours') : tx('المقاسات', 'Sizes')} error={fe(kind)}>
              {(p) => (
                <div className="flex gap-2">
                  <input {...p} className={inputClass} value={typed[kind]} placeholder={kind === 'colors' ? tx('مثل: أسود', 'e.g. Black') : tx('مثل: M', 'e.g. M')}
                    onChange={(e) => setTyped((t) => ({ ...t, [kind]: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(kind); } }} />
                  <Button variant="secondary" onClick={() => add(kind)} aria-label={kind === 'colors' ? tx('أضف اللون', 'Add colour') : tx('أضف المقاس', 'Add size')}><Plus className="size-4" aria-hidden="true" /></Button>
                </div>
              )}
            </Field>
            {draft[kind].length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {draft[kind].map((v, i) => (
                  <li key={`${v}-${i}`} className="inline-flex h-7 items-center gap-1 rounded-full bg-surface-2 ps-3 pe-1 text-[13px] font-medium text-fg">
                    {v}<button type="button" onClick={() => remove(kind, i)} aria-label={tx(`احذف ${v}`, `Remove ${v}`)} className="grid size-5 place-items-center rounded-full text-muted hover:bg-border hover:text-fg"><X className="size-3" aria-hidden="true" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      {draft.variants.length > 0 ? (
        <>
          <div className="scrollbar-thin overflow-x-auto border-t border-border">
            <table className="w-full min-w-[560px] text-sm" aria-label={tx('مصفوفة المتغيرات', 'Variant matrix')}>
              <thead><tr className="border-b border-border text-xs text-muted">
                <th scope="col" className="px-4 py-3 text-start font-semibold">{tx('المتغير', 'Variant')}</th>
                <th scope="col" className="px-2 py-3 text-start font-semibold">SKU</th>
                <th scope="col" className="px-2 py-3 text-start font-semibold">{tx('السعر', 'Price')}</th>
                {physical && <th scope="col" className="px-4 py-3 text-start font-semibold">{tx('المخزون', 'Stock')}{draft.variants.some((v) => !known.has(v.sku.trim())) && <span className="font-normal text-subtle"> · {LOC_IDS.map((l) => LOCATIONS[l][lang]).join(' / ')}</span>}</th>}
              </tr></thead>
              <tbody className="divide-y divide-border">
                {draft.variants.map((v, i) => {
                  const label = variantText(v.color, v.size)[lang];
                  const isFresh = !known.has(v.sku.trim());
                  const total = LOC_IDS.reduce((s, loc) => { const lv = levelOf(levels, v.sku, loc); return s + (lv ? available(lv) : 0); }, 0);
                  return (
                    <tr key={`${v.color}|${v.size}`} className="align-top">
                      <th scope="row" className="whitespace-nowrap px-4 py-3 text-start font-semibold text-fg">{label}{v.isNew && <span className="ms-2"><Badge tone="sky" className="h-5 px-2 text-[10px]">{tx('جديد', 'New')}</Badge></span>}</th>
                      <td className="px-2 py-2"><input id={fieldId(`v.${i}.sku`)} className={inputClass} style={{ width: '10rem' }} dir="ltr" value={v.sku} aria-label={tx(`SKU لـ ${label}`, `SKU for ${label}`)} aria-invalid={!!fe(`v.${i}.sku`) || undefined} onChange={(e) => setV(i, { sku: e.target.value.toUpperCase() })} />{cellErr(`v.${i}.sku`)}</td>
                      <td className="px-2 py-2"><input id={fieldId(`v.${i}.price`)} className={inputClass} style={{ width: '7rem' }} dir="ltr" inputMode="decimal" value={v.price} aria-label={tx(`سعر ${label}`, `Price for ${label}`)} aria-invalid={!!fe(`v.${i}.price`) || undefined} onChange={(e) => setV(i, { price: e.target.value })} />{cellErr(`v.${i}.price`)}</td>
                      {physical && (
                        <td className="px-4 py-2">
                          {isFresh ? (
                            <div className="flex gap-2">
                              {LOC_IDS.map((loc) => (
                                <div key={loc}>
                                  <input id={fieldId(`v.${i}.stock.${loc}`)} className={inputClass} style={{ width: '4.5rem' }} dir="ltr" inputMode="numeric" value={v.stockBy[loc]} aria-label={tx(`كمية ${label} · ${LOCATIONS[loc].ar}`, `Quantity for ${label} · ${LOCATIONS[loc].en}`)} aria-invalid={!!fe(`v.${i}.stock.${loc}`) || undefined}
                                    onChange={(e) => setV(i, { stockBy: { ...v.stockBy, [loc]: e.target.value } })} />
                                  {cellErr(`v.${i}.stock.${loc}`)}
                                </div>
                              ))}
                            </div>
                          ) : <span className="inline-block pt-2 text-muted"><span className="font-semibold text-fg tabular-nums">{total}</span> {tx('متاح', 'available')}</span>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-3">
            <Button variant="secondary" size="sm" onClick={() => set({ variants: draft.variants.map((v) => ({ ...v, price: draft.price })) })} disabled={!draft.price.trim()}>{tx('طبّق السعر الأساسي على الكل', 'Use the base price for all')}</Button>
            <span className="text-xs text-muted">{tx(`${draft.variants.length} متغيرات`, `${draft.variants.length} variants`)}{physical && draft.variants.some((v) => !known.has(v.sku.trim())) ? ` · ${tx('أدخل كمية الجديد لكل مستودع', 'enter new stock per warehouse')}` : ''}</span>
          </div>
        </>
      ) : <p className="px-5 pb-5 text-sm text-muted">{tx('بلا ألوان أو مقاسات: سعر وSKU واحد.', 'No colours or sizes: one price and one SKU.')}</p>}
    </Card>
  );
}

function Seo({ draft, set, fe }: SecProps) {
  const tx = useTx();
  const { lang } = useLang();
  const s = seoPreview(draft, lang);
  return (
    <Card aria-labelledby="pe-h-seo">
      <CardHeader id="pe-h-seo" title={tx('الظهور في محركات البحث', 'Search engine listing')} hint={tx('معاينة تقريبية؛ لا نضمن ترتيبًا في نتائج البحث.', 'An approximate preview; search ranking is not guaranteed.')} />
      <div className="space-y-4 px-5 pb-5">
        <figure className="rounded-xl border border-border p-4" aria-label={tx('معاينة نتيجة البحث', 'Search result preview')}>
          <p className="truncate text-xs text-emerald-700 dark:text-emerald-400" dir="ltr">lak.store/demo{s.path}</p>
          <p className="mt-1 truncate text-[17px] text-sky-700 dark:text-sky-300">{s.title || <span className="text-subtle">{tx('عنوان الصفحة', 'Page title')}</span>}</p>
          <p className="mt-1 line-clamp-2 text-[13px] text-muted">{s.desc || tx('بلا وصف.', 'No description.')}</p>
        </figure>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={tx('عنوان الصفحة', 'Page title')} optional hint={<bdi dir="ltr">{draft.seoTitle.length}/70</bdi>}>{(p) => <Input {...p} maxLength={70} value={draft.seoTitle} onChange={(e) => set({ seoTitle: e.target.value })} />}</Field>
          <Field id={fieldId('slug')} label={tx('الرابط المختصر', 'URL handle')} error={fe('slug')}>
            {(p) => <div className="flex gap-2"><Input {...p} dir="ltr" value={draft.slug} onChange={(e) => set({ slug: e.target.value })} />{!draft.slug && draft.nameEn && <Button variant="secondary" onClick={() => set({ slug: slugify(draft.nameEn) })}>{tx('اقترح', 'Suggest')}</Button>}</div>}
          </Field>
          <Field className="sm:col-span-2" label={tx('الوصف', 'Description')} optional hint={<bdi dir="ltr">{draft.seoDesc.length}/160</bdi>}>{(p) => <Textarea {...p} maxLength={160} className="min-h-20" value={draft.seoDesc} onChange={(e) => set({ seoDesc: e.target.value })} />}</Field>
        </div>
      </div>
    </Card>
  );
}

function PreviewCard({ draft }: { draft: EditDraft }) {
  const tx = useTx();
  const { lang } = useLang();
  const names = useNames();
  const name = (lang === 'ar' ? draft.nameAr || draft.nameEn : draft.nameEn || draft.nameAr);
  const price = previewPrice(draft);
  const cmp = draft.compareAt.trim() ? parseMoney(draft.compareAt) : null;
  const off = discountPct(draft.price, draft.compareAt);
  const hidden = hiddenReason(draft);
  const first = draft.media[0];
  return (
    <Card aria-labelledby="pe-h-prev">
      <CardHeader id="pe-h-prev" title={tx('معاينة في المتجر', 'Storefront preview')} hint={tx('تستخدم ما في النموذج الآن، حتى قبل الحفظ.', 'Uses what is in the form now, even before saving.')} />
      <div className="px-5 pb-5">
        <figure className="overflow-hidden rounded-xl border border-border">
          <div className="relative">
            <ProductImage src={first ? mediaSrc(first, 'large') : undefined} alt={first?.alt ?? ''} size={280} className="!h-auto !w-full rounded-none ring-0 aspect-square" />
            {off !== null && <span className="absolute top-2 start-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white"><bdi dir="ltr">−{off}%</bdi></span>}
          </div>
          <figcaption className="space-y-1 p-3">
            <p className="text-[11px] text-subtle">{draft.category[lang]}</p>
            <p className="truncate text-sm font-semibold text-fg">{name || <span className="text-subtle">{tx('اسم المنتج', 'Product name')}</span>}</p>
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
              {price.amount ? <span className="font-bold text-fg">{price.from && <span className="me-1 text-xs font-normal text-muted">{tx('من', 'From')}</span>}<Money v={price.amount} /></span> : <span className="text-subtle">—</span>}
              {off !== null && cmp !== null && <s className="text-xs text-subtle"><Money v={cmp} /></s>}
            </p>
          </figcaption>
        </figure>
        {hidden && <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-300">{hidden === 'offline' ? tx('غير ظاهر: المتجر الإلكتروني متوقف لهذا المنتج', 'Not visible: online store is off for this product') : tx(`غير ظاهر للعملاء: ${names.status(hidden)}`, `Not visible to shoppers: ${names.status(hidden).toLowerCase()}`)}</p>}
        {!hidden && <p className="mt-3 text-xs text-muted">{tx('ظاهر في المتجر بعد الحفظ.', 'Visible in the store once saved.')} <Ref>{draft.sku || '—'}</Ref></p>}
      </div>
    </Card>
  );
}

function EditorSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" role="status" aria-label="Loading">
      <div className="space-y-6">{[0, 1, 2].map((i) => <div key={i} className="space-y-4 rounded-2xl border border-border bg-surface p-5"><Skeleton className="h-5 w-28" /><div className="grid grid-cols-2 gap-4"><Skeleton className="h-10 rounded-xl" /><Skeleton className="h-10 rounded-xl" /></div><Skeleton className="h-24 rounded-xl" /></div>)}</div>
      <div className="space-y-6"><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-80 rounded-2xl" /></div>
    </div>
  );
}

function TagsField({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const tx = useTx();
  const [typed, setTyped] = useState('');
  const add = () => { const v = typed.trim(); if (!v) return; onChange(normaliseTags([...tags, v])); setTyped(''); };
  return (
    <Field label={tx('الوسوم', 'Tags')} optional hint={tx('للتصفية والمجموعات الذكية', 'For filters and smart collections')}>
      {(p) => (
        <div>
          <div className="flex gap-2">
            <input {...p} className={inputClass} value={typed} maxLength={TAG_MAX} placeholder={tx('مثل: رمضان', 'e.g. ramadan')} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }} />
            <Button variant="secondary" onClick={add} aria-label={tx('أضف الوسم', 'Add tag')}><Plus className="size-4" aria-hidden="true" /></Button>
          </div>
          {tags.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5">{tags.map((t) => (
            <li key={t} className="inline-flex h-7 items-center gap-1 rounded-full bg-surface-2 ps-3 pe-1 text-[13px] font-medium text-fg">{t}<button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={tx(`احذف ${t}`, `Remove ${t}`)} className="grid size-5 place-items-center rounded-full text-muted hover:bg-border hover:text-fg"><X className="size-3" aria-hidden="true" /></button></li>
          ))}</ul>}
        </div>
      )}
    </Field>
  );
}
