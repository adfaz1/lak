// Product types in the editor (Phase C, catalogue depth): the type chooser for a new product (nothing is created until
// Save), the type switch with "what you lose" before changing, the type-specific section, brand and product details,
// and the live "What the customer sees" card. Rules: merchant/catalog-extras.ts (single source of truth).
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, CalendarClock, CalendarPlus, Download, FileUp, KeyRound, Package, PackageOpen, Plus, Trash2, UtensilsCrossed, UserCheck } from 'lucide-react';
import { useLang } from '../../../core/lang';
import type { L } from '../../merchant/domain';
import { parseMoney, type Product, type ProductType } from '../../merchant/catalog';
import {
  PRODUCT_TYPES, bundleParts, bundleSaving, checkValue, checkoutQuestions, generateSlots, parseCodes, productFields, riyadhToday, storeX, traits, typeChangeLoss,
  type CustomField, type SpecDraft, type SpecError, type ValueError,
} from '../../merchant/catalog-extras';
import { catalogXStore, levelsStore, productsStore } from '../../merchant/stores';
import { available } from '../../merchant/inventory';
import { Badge, Button, Card, CardHeader, InfoHint, Money, cn, useTx } from '../../../ds/ui';
import { Alert, Field, Input, Modal, PageHeader, Select, Simulated, Switch, Textarea } from '../../../ds/kit';
import { emptySpecDraft } from '../../merchant/catalog-extras';
import { fieldId, fromEditDraft, type EditDraft } from './model';
import { CatalogNav, ReviewTools, phref } from './common';
import { ProductFacts, minutesText, useDay } from './storefront-parts';

const ICON: Record<ProductType, typeof Package> = { physical: Package, food: UtensilsCrossed, digital: Download, code: KeyRound, service: UserCheck, booking: CalendarClock, bundle: PackageOpen };

export function useTypeInfo() {
  const tx = useTx();
  return (t: ProductType): { name: string; desc: string; asks: string; customer: string } => ({
    physical: { name: tx('منتج ملموس', 'Physical product'), desc: tx('يُشحن من مستودعاتك', 'Shipped from your warehouses'), asks: tx('الوزن، والمخزون لكل مستودع، والمتغيرات', 'Weight, stock per warehouse, variants'), customer: tx('يختار طريقة التوصيل ويدفع الشحن', 'Chooses a delivery method and pays shipping') },
    food: { name: tx('أكل ومشروبات', 'Food & drink'), desc: tx('يُحضَّر عند الطلب ويُوصَّل طازجًا', 'Prepared to order, delivered fresh'), asks: tx('وقت التحضير، ومدة الصلاحية، والوزن والمخزون', 'Prep time, shelf life, weight and stock'), customer: tx('يرى وقت التحضير؛ التوصيل مبرّد أو في اليوم نفسه أو استلام فقط', 'Sees the prep time; only chilled, same-day or pickup delivery') },
    digital: { name: tx('منتج رقمي للتنزيل', 'Digital download'), desc: tx('ملف يصل رابطه بعد الدفع', 'A file whose link is sent after payment'), asks: tx('الملف، وعدد التنزيلات، ومدة الرابط', 'The file, download limit, link lifetime'), customer: tx('رابط تنزيل بالبريد، بلا رسوم شحن', 'A download link by email, no shipping fee') },
    code: { name: tx('بطاقة أو كود رقمي', 'Digital code or card'), desc: tx('أكواد جاهزة تُسلَّم بعد الدفع', 'Ready codes delivered after payment'), asks: tx('مخزون الأكواد؛ الكمية = الأكواد المتبقية', 'A code pool; stock = codes left'), customer: tx('الكود بالبريد فور الدفع', 'The code by email as soon as they pay') },
    service: { name: tx('خدمة', 'Service'), desc: tx('عمل تقدّمه، بلا شحن', 'Work you do; nothing shipped'), asks: tx('المدة، والمكان، وموعد اختياري', 'Length, place, optional appointment'), customer: tx('بلا شحن؛ يقترح موعدًا عند الدفع إن طلبت', 'No shipping; proposes a date at checkout if you ask') },
    booking: { name: tx('حجوزات', 'Booking'), desc: tx('مواعيد بعدد مقاعد محدد', 'Time slots with set capacity'), asks: tx('المواعيد وسعة كل موعد', 'Slots and the capacity of each'), customer: tx('يختار موعدًا متاحًا في صفحة المنتج', 'Picks an open time on the product page') },
    bundle: { name: tx('حزمة منتجات', 'Bundle'), desc: tx('منتجاتك معًا بسعر واحد', 'Your products together at one price'), asks: tx('المكونات وكميتها؛ المخزون من المكونات', 'Components and quantities; stock comes from them'), customer: tx('سعر واحد وما يوفّره، ويُشحن كحزمة', 'One price, what they save; ships as one') },
  })[t];
}

/** `#/dashboard/products/new` before a type is chosen. Choosing a type only opens the form: nothing is created until Save. */
export function TypeChooser() {
  const tx = useTx();
  const info = useTypeInfo();
  const { lang } = useLang();
  const Arrow = lang === 'ar' ? ArrowLeft : ArrowRight;
  return (
    <div className="space-y-6">
      <PageHeader back={{ href: phref(), label: tx('المنتجات', 'Products') }} title={tx('منتج جديد: ما نوعه؟', 'New product: what kind?')}
        description={tx('النوع يحدد ما نطلبه منك وما يراه العميل عند الشراء. لا يُنشأ شيء قبل أن تحفظ.', 'The type sets what we ask you and what the customer sees at checkout. Nothing is created until you save.')} />
      <CatalogNav />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={tx('أنواع المنتجات', 'Product types')}>
        {PRODUCT_TYPES.map((t) => {
          const I = ICON[t];
          const i = info(t);
          return (
            <li key={t}>
              <a href={phref('new', { type: t })} className="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-brand-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
                <span className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-700 dark:text-brand-300"><I className="size-5" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1"><span className="block font-semibold text-fg">{i.name}</span><span className="block text-[13px] text-muted">{i.desc}</span></span>
                  <Arrow className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" aria-hidden="true" />
                </span>
                <dl className="space-y-1.5 border-t border-border pt-3 text-[13px]">
                  <div><dt className="inline font-semibold text-fg">{tx('نطلب منك: ', 'You add: ')}</dt><dd className="inline text-muted">{i.asks}</dd></div>
                  <div><dt className="inline font-semibold text-fg">{tx('يرى العميل: ', 'Customer sees: ')}</dt><dd className="inline text-muted">{i.customer}</dd></div>
                </dl>
              </a>
            </li>
          );
        })}
      </ul>
      <ReviewTools />
    </div>
  );
}

/** Type shown in the Basics header with a change action; an existing product lists what changing loses before it does. */
export function TypeSwitch({ draft, set, isNew, savedType, known }: { draft: EditDraft; set: (p: Partial<EditDraft>) => void; isNew: boolean; savedType: ProductType | null; known: Set<string> }) {
  const tx = useTx();
  const info = useTypeInfo();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<ProductType>(draft.type);
  const I = ICON[draft.type];
  const levels = levelsStore.use();
  const skuHasStock = known.has(draft.sku.trim()) && levels.some((l) => l.sku === draft.sku.trim() && l.onHand > 0);
  const loss = typeChangeLoss(savedType ?? draft.type, pick, { spec: draft.spec ?? emptySpecDraft(), weight: draft.weight, variants: draft.variants.length, skuHasStock });
  const { lang } = useLang();
  const apply = () => {
    const patch: Partial<EditDraft> = { type: pick };
    if (pick === 'code' || pick === 'booking' || pick === 'bundle' || pick === 'service') Object.assign(patch, { colors: [], sizes: [], variants: [] });
    set(patch);
    setOpen(false);
  };
  return (
    <>
      <span className="flex items-center gap-2">
        <Badge tone="brand" icon={<I className="size-3.5" aria-hidden="true" />}>{info(draft.type).name}</Badge>
        <Button variant="ghost" size="sm" onClick={() => { setPick(draft.type); setOpen(true); }}>{tx('غيّر النوع', 'Change type')}</Button>
      </span>
      {open && (
        <Modal title={tx('نوع المنتج', 'Product type')} onClose={() => setOpen(false)} description={isNew ? tx('يتغير ما نطلبه في النموذج فورًا.', 'The form changes what it asks right away.') : tx('يُطبَّق عند الحفظ. راجع ما سيُفقد.', 'Applies when you save. Review what is lost.')}
          footer={<><Button variant="secondary" onClick={() => setOpen(false)}>{tx('إلغاء', 'Cancel')}</Button><Button variant={loss.length ? 'danger' : 'primary'} disabled={pick === draft.type} onClick={apply}>{loss.length ? tx('غيّر النوع وأفقد ما سبق', 'Change and lose the above') : tx('غيّر النوع', 'Change type')}</Button></>}>
          <fieldset className="space-y-2">
            <legend className="sr-only">{tx('اختر النوع', 'Choose a type')}</legend>
            {PRODUCT_TYPES.map((t) => { const TI = ICON[t]; return (
              <label key={t} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-500/5">
                <input type="radio" name="pe-type" className="mt-1 accent-brand-600" checked={pick === t} onChange={() => setPick(t)} />
                <TI className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 text-sm"><span className="block font-semibold text-fg">{info(t).name}{t === draft.type && <span className="ms-2 text-xs font-normal text-muted">{tx('الحالي', 'Current')}</span>}</span><span className="block text-[13px] text-muted">{info(t).asks}</span></span>
              </label>
            ); })}
          </fieldset>
          {pick !== draft.type && loss.length > 0 && (
            <div className="mt-4"><Alert tone="warn" title={tx('سيُفقد عند الحفظ', 'Lost when you save')}>
              <ul className="mt-1 list-disc space-y-0.5 ps-5">{loss.map((x, i) => <li key={i}>{(x as L)[lang]}</li>)}</ul>
            </Alert></div>
          )}
          {pick !== draft.type && !loss.length && <p className="mt-4 text-sm text-muted">{tx('لا يُفقد شيء من البيانات المحفوظة.', 'Nothing saved is lost.')}</p>}
        </Modal>
      )}
    </>
  );
}

type SecProps = { draft: EditDraft; set: (p: Partial<EditDraft>) => void; fe: (k: string) => string | undefined };

export function specErrorText(e: SpecError | ValueError | undefined, tx: (a: string, b: string) => string): string | undefined {
  if (!e) return undefined;
  return ({
    required: tx('مطلوب', 'Required'), number: tx('رقم صحيح في الحدود', 'A whole number within range'), past: tx('تاريخ مضى', 'A past date'), repeated: tx('مكرر', 'Repeated'),
    cap: tx('من 1 إلى 500', '1 to 500'), component: tx('SKU غير موجود في منتجاتك', 'No product has this SKU'), self: tx('لا تضع الحزمة داخل نفسها', 'A bundle can’t contain itself'),
    few: tx('أضف مكوّنين على الأقل', 'Add at least two components'), codes: tx('أكواد مكررة أو مباعة أو بصيغة خاطئة', 'Repeated, sold or malformed codes'), time: tx('بصيغة 17:30', 'As 17:30'),
    booked: tx('أقل من المحجوز', 'Below what is booked'), date: tx('تاريخ صحيح', 'A valid date'), choice: tx('اختر من القائمة', 'Choose from the list'), long: tx('أقصر من 300 حرف', 'Under 300 characters'),
  } as Record<string, string>)[e];
}

/** The section only the chosen type needs. */
export function TypeSection({ draft, set, fe }: SecProps) {
  const tx = useTx();
  const s = draft.spec ?? emptySpecDraft();
  const sp = (p: Partial<SpecDraft>) => set({ spec: { ...s, ...p } });
  const info = useTypeInfo();
  if (draft.type === 'physical') return null;
  return (
    <Card aria-labelledby="pe-h-type">
      <CardHeader id="pe-h-type" title={info(draft.type).name} hint={info(draft.type).asks} />
      <div className="space-y-4 px-5 pb-5">
        {draft.type === 'digital' && <DigitalFields s={s} sp={sp} fe={fe} />}
        {draft.type === 'code' && <CodeFields s={s} sp={sp} fe={fe} />}
        {(draft.type === 'service' || draft.type === 'booking') && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id={fieldId('spec.minutes')} label={tx('المدة (دقيقة)', 'Length (minutes)')} error={fe('spec.minutes')} hint={minutesText(Number(s.minutes) || 0, tx)}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" value={s.minutes} onChange={(e) => sp({ minutes: e.target.value })} />}</Field>
            <Field label={tx('المكان', 'Where')}>{(p) => <Select {...p} value={s.where} onChange={(e) => sp({ where: e.target.value as SpecDraft['where'] })}><option value="store">{tx('في المعرض', 'At the showroom')}</option><option value="online">{tx('عن بُعد', 'Online')}</option><option value="customer">{tx('عند العميل', 'At the customer’s')}</option></Select>}</Field>
            {draft.type === 'service' && (
              <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 sm:col-span-2">
                <span className="text-sm"><span className="font-medium text-fg">{tx('اطلب موعدًا مفضّلًا عند الدفع', 'Ask for a preferred date at checkout')}</span><span className="block text-xs text-muted">{tx('سؤال تاريخ إلزامي يظهر للعميل ويُحفظ في الطلب.', 'A required date question; saved on the order.')}</span></span>
                <Switch checked={s.appointment} onChange={(v) => sp({ appointment: v })} label={tx('موعد مفضّل', 'Preferred date')} />
              </label>
            )}
          </div>
        )}
        {draft.type === 'booking' && <SlotFields s={s} sp={sp} fe={fe} />}
        {draft.type === 'bundle' && <BundleFields draft={draft} s={s} sp={sp} fe={fe} />}
        {draft.type === 'food' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id={fieldId('spec.prep')} label={tx('وقت التحضير (دقيقة)', 'Preparation (minutes)')} error={fe('spec.prep')} hint={minutesText(Number(s.prepMinutes) || 0, tx)}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" value={s.prepMinutes} onChange={(e) => sp({ prepMinutes: e.target.value })} />}</Field>
            <Field id={fieldId('spec.shelf')} label={tx('الصلاحية (أيام)', 'Shelf life (days)')} optional error={fe('spec.shelf')}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" value={s.shelfDays} onChange={(e) => sp({ shelfDays: e.target.value })} />}</Field>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 sm:col-span-2">
              <span className="text-sm"><span className="font-medium text-fg">{tx('سريع التلف', 'Perishable')}</span><span className="block text-xs text-muted">{tx('يظهر في الدفع التوصيل المبرّد أو في اليوم نفسه أو الاستلام فقط (الإعدادات ← الشحن).', 'Checkout offers only chilled, same-day or pickup methods (Settings → Shipping).')}</span></span>
              <Switch checked={s.perishable} onChange={(v) => sp({ perishable: v })} label={tx('سريع التلف', 'Perishable')} />
            </label>
          </div>
        )}
      </div>
    </Card>
  );
}

type SpecProps = { s: SpecDraft; sp: (p: Partial<SpecDraft>) => void; fe: (k: string) => string | undefined };

function DigitalFields({ s, sp, fe }: SpecProps) {
  const tx = useTx();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pickFile = (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setTimeout(() => { sp({ fileName: f.name, fileSize: f.size }); setBusy(false); }, 700);
  };
  const kb = Math.max(1, Math.round(s.fileSize / 1024));
  return (
    <>
      <div id={fieldId('spec.file')} tabIndex={-1} className={cn('flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-3 outline-none', fe('spec.file') ? 'border-red-500' : 'border-border')}>
        <FileUp className="size-5 text-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-sm">{s.fileName ? <><bdi dir="ltr" className="font-semibold text-fg">{s.fileName}</bdi><span className="ms-2 text-xs text-muted">{kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`}</span></> : <span className="text-muted">{busy ? tx('جارٍ الرفع…', 'Uploading…') : tx('لم يُرفع ملف بعد', 'No file yet')}</span>}
          {fe('spec.file') && <span className="block text-xs font-medium text-red-600 dark:text-red-400">{tx('ارفع الملف الذي يحصل عليه العميل', 'Upload the file the customer gets')}</span>}</span>
        <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-label={tx('ملف المنتج', 'Product file')} onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}>{s.fileName ? tx('استبدل الملف', 'Replace file') : tx('ارفع الملف', 'Upload file')}</Button>
        <Simulated />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id={fieldId('spec.limit')} label={tx('عدد التنزيلات المسموح', 'Downloads allowed')} optional error={fe('spec.limit')}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" value={s.limit} onChange={(e) => sp({ limit: e.target.value })} />}</Field>
        <Field id={fieldId('spec.expiry')} label={tx('صلاحية الرابط (أيام)', 'Link valid for (days)')} optional error={fe('spec.expiry')}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" value={s.expiryDays} onChange={(e) => sp({ expiryDays: e.target.value })} />}</Field>
      </div>
    </>
  );
}

function CodeFields({ s, sp, fe }: SpecProps) {
  const tx = useTx();
  const p = parseCodes(s.codesText, s.sold);
  return (
    <>
      <Field id={fieldId('spec.codes')} label={tx('الأكواد (كود في كل سطر)', 'Codes (one per line)')} error={fe('spec.codes')} hint={tx('تُخفى عن الموظفين بلا صلاحية المنتجات، وتُسلَّم بالبريد عند الدفع.', 'Hidden from staff without Products access; delivered by email on payment.')}>
        {(pp) => <Textarea {...pp} dir="ltr" rows={5} className="font-mono text-[13px]" value={s.codesText} onChange={(e) => sp({ codesText: e.target.value })} placeholder="ABCD-1234-XY" />}
      </Field>
      <dl className="grid grid-cols-3 gap-3 rounded-xl bg-surface-2 p-3 text-sm" aria-live="polite">
        <div><dt className="text-xs text-muted">{tx('متاحة للبيع', 'Available')}</dt><dd className="font-bold tabular-nums text-fg">{p.codes.length}</dd></div>
        <div><dt className="text-xs text-muted">{tx('مُسلَّمة', 'Delivered')}</dt><dd className="font-bold tabular-nums text-fg">{s.sold.length}</dd></div>
        <div><dt className="text-xs text-muted">{tx('تحتاج تصحيحًا', 'Need fixing')}</dt><dd className={cn('font-bold tabular-nums', p.repeated.length + p.bad.length + p.alreadySold.length ? 'text-red-600 dark:text-red-400' : 'text-fg')}>{p.repeated.length + p.bad.length + p.alreadySold.length}</dd></div>
      </dl>
      {(p.repeated.length > 0 || p.bad.length > 0 || p.alreadySold.length > 0) && (
        <Alert tone="warn" title={tx('أكواد تحتاج تصحيحًا', 'Codes to fix')} action={<Button size="sm" variant="secondary" onClick={() => sp({ codesText: p.codes.join('\n') })}>{tx('احذفها كلها', 'Remove them all')}</Button>}>
          <ul className="mt-1 space-y-0.5 text-[13px]">
            {p.repeated.length > 0 && <li>{tx('مكررة: ', 'Repeated: ')}<bdi dir="ltr">{p.repeated.join(', ')}</bdi></li>}
            {p.alreadySold.length > 0 && <li>{tx('مُسلَّمة سابقًا: ', 'Already delivered: ')}<bdi dir="ltr">{p.alreadySold.join(', ')}</bdi></li>}
            {p.bad.length > 0 && <li>{tx('صيغة خاطئة (4–40 حرفًا لاتينيًا أو رقمًا أو شرطة): ', 'Malformed (4–40 Latin letters, digits, hyphens): ')}<bdi dir="ltr">{p.bad.join(', ')}</bdi></li>}
          </ul>
        </Alert>
      )}
      {p.codes.length > 0 && p.codes.length <= 3 && <p className="text-[13px] text-amber-800 dark:text-amber-300">{tx('الأكواد قليلة: عند نفادها يظهر المنتج «نفد» في المتجر.', 'Few codes left: when they run out the store shows it as sold out.')}</p>}
    </>
  );
}

function SlotFields({ s, sp, fe }: SpecProps) {
  const tx = useTx();
  const day = useDay();
  const today = riyadhToday();
  const [gen, setGen] = useState({ from: today, to: today, times: '17:00, 19:30', cap: '4' });
  const [genErr, setGenErr] = useState<string | null>(null);
  const add = () => {
    const fresh = generateSlots(gen.from, gen.to, gen.times.split(/[,،\s]+/), Number(gen.cap) || 0, s.slots, `s${Date.now().toString(36)}`);
    if (!(Number(gen.cap) >= 1)) { setGenErr(tx('السعة من 1 فأكثر', 'Capacity 1 or more')); return; }
    if (!fresh.length) { setGenErr(tx('لا مواعيد جديدة: تحقق من التاريخين والأوقات (مثل 17:00).', 'No new slots: check the dates and times (e.g. 17:00).')); return; }
    setGenErr(null);
    sp({ slots: [...s.slots, ...fresh].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)) });
  };
  const setSlot = (i: number, p: Partial<SpecDraft['slots'][number]>) => sp({ slots: s.slots.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const open = s.slots.filter((x) => x.date >= today);
  const cap = open.reduce((n, x) => n + (Number(x.cap) || 0), 0), booked = open.reduce((n, x) => n + x.booked, 0);
  return (
    <>
      <div className="rounded-xl border border-border p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-fg"><CalendarPlus className="size-4" aria-hidden="true" />{tx('أضف مواعيد لعدة أيام', 'Add slots for several days')}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label={tx('من', 'From')}>{(p) => <Input {...p} type="date" dir="ltr" value={gen.from} min={today} onChange={(e) => setGen({ ...gen, from: e.target.value })} />}</Field>
          <Field label={tx('إلى', 'To')}>{(p) => <Input {...p} type="date" dir="ltr" value={gen.to} min={gen.from} onChange={(e) => setGen({ ...gen, to: e.target.value })} />}</Field>
          <Field label={tx('الأوقات', 'Times')}>{(p) => <Input {...p} dir="ltr" value={gen.times} onChange={(e) => setGen({ ...gen, times: e.target.value })} />}</Field>
          <Field label={tx('السعة لكل موعد', 'Places per slot')}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" value={gen.cap} onChange={(e) => setGen({ ...gen, cap: e.target.value })} />}</Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3"><Button size="sm" variant="secondary" onClick={add}><Plus className="size-4" aria-hidden="true" />{tx('أضف المواعيد', 'Add slots')}</Button>{genErr && <span role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{genErr}</span>}</div>
      </div>
      <p id={fieldId('spec.slots')} tabIndex={-1} className={cn('text-sm outline-none', fe('spec.slots') ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted')}>
        {fe('spec.slots') ? tx('أضف موعدًا قادمًا واحدًا على الأقل', 'Add at least one upcoming slot') : tx(`${open.length} موعدًا قادمًا · ${booked} محجوز من ${cap} مقعدًا`, `${open.length} upcoming slots · ${booked} of ${cap} places booked`)}
      </p>
      {s.slots.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {s.slots.map((x, i) => (
            <li key={x.id} className={cn('flex flex-wrap items-center gap-2 px-3 py-2', x.date < today && 'opacity-60')}>
              <span className="w-28 text-sm font-medium text-fg">{day(x.date, true)}</span>
              <Input aria-label={tx('الوقت', 'Time')} id={fieldId(`spec.slot.${i}.time`)} dir="ltr" className="h-9 w-20" value={x.time} onChange={(e) => setSlot(i, { time: e.target.value })} aria-invalid={!!fe(`spec.slot.${i}.time`)} />
              <Input aria-label={tx('السعة', 'Capacity')} id={fieldId(`spec.slot.${i}.cap`)} dir="ltr" inputMode="numeric" className="h-9 w-16" value={x.cap} onChange={(e) => setSlot(i, { cap: e.target.value })} aria-invalid={!!fe(`spec.slot.${i}.cap`)} />
              <span className="text-xs text-muted">{tx(`${x.booked} محجوز`, `${x.booked} booked`)}</span>
              {(fe(`spec.slot.${i}.time`) || fe(`spec.slot.${i}.cap`) || fe(`spec.slot.${i}.date`)) && <span className="text-xs font-medium text-red-600 dark:text-red-400">{fe(`spec.slot.${i}.time`) ?? fe(`spec.slot.${i}.cap`) ?? fe(`spec.slot.${i}.date`)}</span>}
              <button type="button" className="ms-auto grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40" disabled={x.booked > 0} title={x.booked > 0 ? tx('له حجوزات: خفّض السعة بدل الحذف', 'Has bookings: lower capacity instead') : tx('احذف الموعد', 'Remove slot')} aria-label={tx('احذف الموعد', 'Remove slot')} onClick={() => sp({ slots: s.slots.filter((_, j) => j !== i) })}><Trash2 className="size-4" aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function BundleFields({ draft, s, sp, fe }: SpecProps & { draft: EditDraft }) {
  const tx = useTx();
  const { lang } = useLang();
  const products = productsStore.use();
  const levels = levelsStore.use();
  const [pick, setPick] = useState('');
  const options = useMemo(() => products.filter((p) => p.status !== 'archived' && p.type !== 'bundle' && p.sku !== draft.sku).flatMap((p) => (p.variants.length ? p.variants.map((v) => ({ sku: v.sku, label: `${p.name[lang]} · ${[v.color, v.size].filter(Boolean).join(' / ')}` })) : [{ sku: p.sku, label: p.name[lang] }])), [products, draft.sku, lang]);
  const items = s.bundle.filter((b) => b.sku.trim()).map((b) => ({ sku: b.sku.trim(), qty: Number(b.qty) || 1 }));
  const parts = bundleParts(items, products);
  const save = bundleSaving(items, products, parseMoney(draft.price));
  const avail = (sku: string) => levels.filter((l) => l.sku === sku).reduce((n, l) => n + Math.max(0, available(l)), 0);
  const stock = items.length ? Math.min(...items.map((b) => Math.floor(avail(b.sku) / Math.max(1, b.qty)))) : 0;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Select aria-label={tx('أضف مكوّنًا', 'Add a component')} className="min-w-0 flex-1 basis-56" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">{tx('اختر منتجًا من متجرك', 'Choose one of your products')}</option>
          {options.filter((o) => !s.bundle.some((b) => b.sku === o.sku)).map((o) => <option key={o.sku} value={o.sku}>{o.label} ({o.sku})</option>)}
        </Select>
        <Button variant="secondary" disabled={!pick} onClick={() => { sp({ bundle: [...s.bundle, { sku: pick, qty: '1' }] }); setPick(''); }}><Plus className="size-4" aria-hidden="true" />{tx('أضف', 'Add')}</Button>
      </div>
      <p id={fieldId('spec.bundle')} tabIndex={-1} className={cn('text-sm outline-none', fe('spec.bundle') ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted')}>{fe('spec.bundle') ?? tx('المخزون يُحسب من المكوّن الأقل توفرًا، ويُحجز كل مكوّن عند البيع.', 'Stock comes from the scarcest component; each component is held when it sells.')}</p>
      {s.bundle.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {s.bundle.map((b, i) => {
            const part = parts.find((x) => x.sku === b.sku.trim());
            return (
              <li key={i} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 basis-40 text-sm"><span className="block font-medium text-fg">{part?.name?.[lang] ?? b.sku}</span><span className="text-xs text-muted"><bdi dir="ltr">{b.sku}</bdi> · {tx(`المتاح ${avail(b.sku.trim())}`, `${avail(b.sku.trim())} available`)}{part?.unit != null && <> · <Money v={part.unit} /></>}</span>
                  {fe(`spec.bundle.${i}`) && <span className="block text-xs font-medium text-red-600 dark:text-red-400">{fe(`spec.bundle.${i}`)}</span>}</span>
                <label className="flex items-center gap-1.5 text-xs text-muted">{tx('الكمية', 'Qty')}<Input id={fieldId(`spec.bundle.${i}`)} dir="ltr" inputMode="numeric" className="h-9 w-16" value={b.qty} onChange={(e) => sp({ bundle: s.bundle.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)) })} /></label>
                <button type="button" aria-label={tx('احذف المكوّن', 'Remove component')} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg" onClick={() => sp({ bundle: s.bundle.filter((_, j) => j !== i) })}><Trash2 className="size-4" aria-hidden="true" /></button>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > 0 && (
        <dl className="grid grid-cols-3 gap-3 rounded-xl bg-surface-2 p-3 text-sm" aria-live="polite">
          <div><dt className="text-xs text-muted">{tx('منفصلة بـ', 'Apart')}</dt><dd className="font-bold text-fg">{save ? <Money v={save.sum} /> : '—'}</dd></div>
          <div><dt className="flex items-center gap-1 text-xs text-muted">{tx('يوفّر العميل', 'Customer saves')}<InfoHint>{tx('مجموع أسعار المكوّنات − سعر الحزمة.', 'Sum of component prices − bundle price.')}</InfoHint></dt><dd className={cn('font-bold', save && save.save < 0 ? 'text-red-600 dark:text-red-400' : 'text-fg')}>{save ? <Money v={save.save} /> : '—'}</dd></div>
          <div><dt className="text-xs text-muted">{tx('حزم ممكنة الآن', 'Bundles possible now')}</dt><dd className="font-bold tabular-nums text-fg">{stock}</dd></div>
        </dl>
      )}
      {save && save.save < 0 && <p className="text-[13px] font-medium text-red-700 dark:text-red-300">{tx('سعر الحزمة أعلى من شراء مكوّناتها منفصلة.', 'The bundle costs more than its parts bought apart.')}</p>}
    </>
  );
}

/** Brand and the product details (product custom fields) that apply to this type and category. */
export function DetailsCard({ draft, set, fe }: SecProps) {
  const tx = useTx();
  const { lang } = useLang();
  const x = catalogXStore.use();
  const fields = productFields(x.fields, { type: draft.type, category: draft.category, attrs: draft.attrs });
  const setAttr = (id: string, v: string) => set({ attrs: { ...(draft.attrs ?? {}), [id]: v } });
  return (
    <Card aria-labelledby="pe-h-det">
      <CardHeader id="pe-h-det" title={tx('العلامة والمواصفات', 'Brand and details')} hint={tx('المواصفات حقول تعرّفها مرة وتظهر في صفحة المنتج، ويمكن جعل بعضها مرشحًا في المتجر.', 'Details are fields you define once; they show on the product page and some can be store filters.')} />
      <div className="space-y-4 px-5 pb-5">
        <Field id={fieldId('brand')} label={<span className="flex w-full items-center justify-between gap-2">{tx('العلامة التجارية', 'Brand')}<a href={phref('brands')} className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('إدارة العلامات', 'Manage')}</a></span>} optional>
          {(p) => <Select {...p} value={draft.brand ?? ''} onChange={(e) => set({ brand: e.target.value })}><option value="">{tx('بلا علامة', 'No brand')}</option>{x.brands.map((b) => <option key={b.id} value={b.id}>{b.name[lang]}</option>)}</Select>}
        </Field>
        {fields.length === 0 ? <p className="text-[13px] text-muted">{tx('لا حقول مواصفات لهذا النوع أو الفئة.', 'No detail fields for this type or category.')} <a className="font-semibold text-brand-700 hover:underline dark:text-brand-300" href={phref('options', { tab: 'fields' })}>{tx('أضف حقلًا', 'Add a field')}</a></p>
          : fields.map(({ field }) => <AttrInput key={field.id} field={field} value={draft.attrs?.[field.id] ?? ''} onChange={(v) => setAttr(field.id, v)} error={fe(`attr.${field.id}`)} />)}
      </div>
    </Card>
  );
}

function AttrInput({ field, value, onChange, error }: { field: CustomField; value: string; onChange: (v: string) => void; error?: string }) {
  const tx = useTx();
  const { lang } = useLang();
  const ref = useRef<HTMLInputElement>(null);
  const id = fieldId(`attr.${field.id}`);
  const label = <span className="inline-flex items-center gap-1">{field.label[lang]}{field.filterable && <Badge tone="sky" className="h-5 px-1.5 text-[10px]">{tx('مرشح', 'Filter')}</Badge>}</span>;
  return (
    <Field id={id} label={label} optional={!field.required} error={error} hint={field.help[lang] || undefined}>
      {(p) => field.kind === 'choice' ? (
        <Select {...p} value={value} onChange={(e) => onChange(e.target.value)}><option value="">{tx('—', '—')}</option>{field.options.map((o) => <option key={o.en} value={o.en}>{o[lang]}</option>)}</Select>
      ) : field.kind === 'file' ? (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={ref} type="file" className="sr-only" tabIndex={-1} aria-label={field.label[lang]} onChange={(e) => { onChange(e.target.files?.[0]?.name ?? value); e.target.value = ''; }} />
          <Button {...p} variant="secondary" size="sm" onClick={() => ref.current?.click()}><FileUp className="size-4" aria-hidden="true" />{value ? tx('استبدل', 'Replace') : tx('ارفع ملفًا', 'Upload a file')}</Button>
          {value && <><bdi dir="ltr" className="text-sm text-fg">{value}</bdi><button type="button" className="text-xs font-semibold text-muted hover:text-fg" onClick={() => onChange('')}>{tx('أزل', 'Remove')}</button></>}
          <Simulated />
        </div>
      ) : (
        <Input {...p} type={field.kind === 'date' ? 'date' : 'text'} dir={field.kind === 'text' ? undefined : 'ltr'} inputMode={field.kind === 'number' ? 'decimal' : undefined} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}

/** Errors the editor adds for the type and the detail fields (on top of the catalogue validation). */
export function attrErrors(draft: EditDraft, fields: CustomField[]): Record<string, ValueError> {
  const e: Record<string, ValueError> = {};
  for (const { field, value } of productFields(fields, { type: draft.type, category: draft.category, attrs: draft.attrs })) {
    if (field.kind === 'file') { if (field.required && !value) e[`attr.${field.id}`] = 'required'; continue; }
    const err = checkValue(field, value);
    if (err) e[`attr.${field.id}`] = err;
  }
  return e;
}

/** Live "what the customer will see": the product page facts and the questions checkout will ask, from the form as it is. */
export function CustomerSees({ draft }: { draft: EditDraft }) {
  const tx = useTx();
  const { lang } = useLang();
  const x = catalogXStore.use();
  const products = productsStore.use();
  const preview: Product = useMemo(() => fromEditDraft(draft, '__preview__', 0), [draft]);
  const sx = storeX(preview, x, riyadhToday(), products);
  const qs = checkoutQuestions(x.fields, [{ productId: preview.id, name: preview.name, type: preview.type, cat: preview.category, appointment: preview.spec?.appointment }]);
  const t = traits(draft.type);
  const delivery: ReactNode = !t.ships ? tx('لا رسوم توصيل: يظهر «لا يحتاج توصيلًا»', 'No delivery fee: shows “No delivery needed”')
    : draft.type === 'food' && sx.perishable ? tx('التوصيل المبرّد أو في اليوم نفسه أو الاستلام فقط', 'Only chilled, same-day or pickup delivery')
      : tx('طرق التوصيل حسب المدينة والوزن', 'Delivery methods by city and weight');
  return (
    <Card aria-labelledby="pe-h-sees">
      <CardHeader id="pe-h-sees" title={tx('ما يراه العميل', 'What the customer sees')} hint={tx('من النموذج الآن، قبل الحفظ.', 'From the form now, before saving.')} />
      <div className="space-y-4 px-5 pb-5 text-sm">
        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 text-xs font-semibold text-muted">{tx('في صفحة المنتج', 'On the product page')}</p>
          <ProductFacts x={sx} price={parseMoney(draft.price) ?? 0} />
          {sx.attrs.length > 0 && <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">{sx.attrs.map((a) => <div key={a.id} className="contents"><dt className="text-muted">{a.label[lang]}</dt><dd className="font-medium">{a.value[lang]}</dd></div>)}</dl>}
          {sx.chart && <p className="mt-2 text-[13px] text-muted">{tx(`+ دليل المقاسات «${sx.chart.name.ar}»`, `+ Size guide “${sx.chart.name.en}”`)}</p>}
          {!sx.brand && !sx.attrs.length && !sx.chart && draft.type === 'physical' && !sx.limits && !sx.preorder && <p className="text-[13px] text-muted">{tx('الاسم والسعر والصور والوصف فقط.', 'Name, price, images and description only.')}</p>}
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 text-xs font-semibold text-muted">{tx('عند الدفع', 'At checkout')}</p>
          <ul className="space-y-1.5 text-[13px]">
            <li>{delivery}</li>
            {qs.map((q) => <li key={q.id}>{tx('يُسأل: ', 'Asked: ')}<b className="font-semibold">{q.label[lang]}</b>{q.required ? tx(' (إلزامي)', ' (required)') : ''}</li>)}
            {sx.limits?.age ? <li>{tx(`يؤكد أن عمره ${sx.limits.age}+`, `Confirms they are ${sx.limits.age}+`)}</li> : null}
            {sx.preorder?.pay === 'deposit' && <li>{tx(`يدفع ${sx.preorder.depositPct}٪ الآن والباقي قبل الشحن`, `Pays ${sx.preorder.depositPct}% now, the rest before shipping`)}</li>}
          </ul>
        </div>
        <p className="text-xs text-muted"><a className="font-semibold text-brand-700 hover:underline dark:text-brand-300" href={phref('options', { tab: 'fields' })}>{tx('أسئلة الطلب', 'Order questions')}</a> · <a className="font-semibold text-brand-700 hover:underline dark:text-brand-300" href={phref('restrictions')}>{tx('القيود', 'Restrictions')}</a> · <a className="font-semibold text-brand-700 hover:underline dark:text-brand-300" href={phref('preorders')}>{tx('الطلب المسبق', 'Pre-orders')}</a></p>
      </div>
    </Card>
  );
}
