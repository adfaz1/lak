// What shoppers see of the catalogue extras (types, brands, details, size charts, pre-orders, purchase limits) and the
// questions the checkout asks. Used by the online store (storefront/pages/Product.tsx, Checkout.tsx) AND by the product
// editor's "What the customer sees" card, so the merchant previews exactly what ships. Rules: merchant/catalog-extras.
import { useState, type ReactNode } from 'react';
import { CalendarClock, ChevronDown, Download, FileText, KeyRound, MapPin, PackageOpen, Ruler, ShieldCheck, Snowflake, Timer, UserCheck } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { cn, useTx } from '../../../ds/ui';
import { Field, Input, Select, Textarea } from '../../../ds/kit';
import { CITIES } from '../../storefront/domain';
import type { OrderExtras, Question, SizeChart, StoreX, ValueError } from '../../merchant/catalog-extras';
import { brandInitials, buildOrderExtras, checkAnswers, checkBasket, checkoutQuestions, riyadhToday } from '../../merchant/catalog-extras';
import { catalogXStore, ordersStore as merchantOrders, productsStore } from '../../merchant/stores';
import { skusOf } from '../../merchant/catalog';
import type { PricedLine, Product as StoreProduct } from '../../storefront/domain';
import { checkoutCustomerId, checkoutStore } from '../../storefront/state';

/** "1 Dec" / "١ ديسمبر" for a YYYY-MM-DD date. */
export function useDay() {
  const { lang } = useLang();
  return (d: string, weekday = false) => {
    const ms = Date.parse(`${d}T12:00:00Z`);
    if (Number.isNaN(ms)) return d;
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short', ...(weekday ? { weekday: 'short' } : {}), timeZone: 'UTC' }).format(ms);
  };
}
const money = (v: number, lang: 'ar' | 'en') => `⁨${(v / 100).toLocaleString('en-US', { minimumFractionDigits: v % 100 ? 2 : 0, maximumFractionDigits: 2 })}⁩ ${lang === 'ar' ? 'ر.س' : 'SAR'}`;
const cityName = (id: string, lang: 'ar' | 'en') => CITIES.find((c) => c.id === id)?.name[lang] ?? id;
export const minutesText = (n: number | undefined, tx: (a: string, e: string) => string) => {
  if (!n) return '';
  const h = Math.floor(n / 60), m = n % 60;
  return h ? tx(`${h} ساعة${m ? ` و${m} دقيقة` : ''}`, `${h} h${m ? ` ${m} min` : ''}`) : tx(`${m} دقيقة`, `${m} min`);
};

export function BrandMark({ b, size = 28 }: { b: NonNullable<StoreX['brand']>; size?: number }) {
  const { lang } = useLang();
  return b.logo
    ? <img src={b.logo} alt="" width={size} height={size} className="shrink-0 rounded-md object-cover" style={{ width: size, height: size }} />
    : <span aria-hidden="true" className="grid shrink-0 place-items-center rounded-md text-[11px] font-bold text-white" style={{ width: size, height: size, background: b.tone }}>{brandInitials(b, lang)}</span>;
}

const Row = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => <li className="flex gap-2.5 text-sm"><span className="mt-0.5 shrink-0 text-muted [&_svg]:size-4">{icon}</span><span className="min-w-0">{children}</span></li>;

/**
 * The lines a product page adds for its type, pre-order and limits. `brandHref` links the brand to the store's brand
 * filter (the editor preview passes none).
 */
export function ProductFacts({ x, price, brandHref }: { x: StoreX; price: number; brandHref?: string }) {
  const tx = useTx();
  const { lang } = useLang();
  const day = useDay();
  const lines: ReactNode[] = [];
  if (x.preorder) {
    const p = x.preorder;
    lines.push(<Row key="pre" icon={<CalendarClock />}><b>{tx('طلب مسبق', 'Pre-order')}</b> · {tx(`يُشحن نحو ${day(p.shipDate, true)}`, `ships around ${day(p.shipDate, true)}`)}
      <span className="block text-[13px] text-muted">{p.pay === 'deposit' ? tx(`تدفع الآن ${p.depositPct}٪ (${money(Math.round(price * p.depositPct / 100), 'ar')}) والباقي قبل الشحن.`, `Pay ${p.depositPct}% now (${money(Math.round(price * p.depositPct / 100), 'en')}), the rest before it ships.`) : tx('تدفع المبلغ كاملًا الآن.', 'You pay in full now.')}
        {p.left !== null && p.left <= 10 ? tx(` بقي ${p.left} فقط في الحملة.`, ` Only ${p.left} left in this campaign.`) : ''}</span></Row>);
  }
  switch (x.type) {
    case 'digital': lines.push(<Row key="t" icon={<Download />}>{tx('ملف للتنزيل يصلك رابطه بالبريد بعد الدفع', 'A download link is emailed after payment')}{x.file && <span className="block text-[13px] text-muted">{[x.file.limit ? tx(`${x.file.limit} تنزيلات`, `${x.file.limit} downloads`) : '', x.file.expiryDays ? tx(`صالح ${x.file.expiryDays} يومًا`, `valid ${x.file.expiryDays} days`) : ''].filter(Boolean).join(' · ')}</span>}</Row>); break;
    case 'code': lines.push(<Row key="t" icon={<KeyRound />}>{tx('رمز يصلك بالبريد فور الدفع، لا شحن', 'A code is emailed as soon as you pay; nothing is shipped')}</Row>); break;
    case 'service': lines.push(<Row key="t" icon={<UserCheck />}>{tx('خدمة', 'Service')}{x.minutes ? ` · ${minutesText(x.minutes, tx)}` : ''}{x.where && ` · ${x.where === 'store' ? tx('في المعرض', 'at the showroom') : x.where === 'online' ? tx('عن بُعد', 'online') : tx('عندك', 'at your place')}`}
      <span className="block text-[13px] text-muted">{x.appointment ? tx('تختار موعدك المفضّل عند الدفع ويؤكده المتجر.', 'Pick a preferred date at checkout; the store confirms it.') : tx('لا يحتاج شحنًا.', 'Nothing is shipped.')}</span></Row>); break;
    case 'booking': lines.push(<Row key="t" icon={<CalendarClock />}>{tx('حجز موعد', 'A booking')}{x.minutes ? ` · ${minutesText(x.minutes, tx)}` : ''}{x.where === 'store' ? ` · ${tx('في المعرض', 'at the showroom')}` : ''}<span className="block text-[13px] text-muted">{tx('اختر الموعد أدناه؛ المقاعد محدودة لكل موعد.', 'Choose a time below; places are limited per time.')}</span></Row>); break;
    case 'food': lines.push(<Row key="t" icon={<Timer />}>{x.prepMinutes ? tx(`يُحضَّر خلال ${minutesText(x.prepMinutes, tx)} من الطلب`, `Prepared within ${minutesText(x.prepMinutes, tx)} of your order`) : tx('يُحضَّر عند الطلب', 'Prepared to order')}{x.shelfDays ? <span className="block text-[13px] text-muted">{tx(`يُستهلك خلال ${x.shelfDays} أيام`, `Best within ${x.shelfDays} days`)}</span> : null}</Row>);
      if (x.perishable) lines.push(<Row key="cold" icon={<Snowflake />}>{tx('يُوصَّل مبرّدًا أو في اليوم نفسه أو تستلمه من الفرع فقط', 'Delivered chilled, same day, or picked up only')}</Row>); break;
    case 'bundle': if (x.bundle?.length) lines.push(<Row key="t" icon={<PackageOpen />}>{tx('حزمة فيها:', 'This bundle includes:')}
      <ul className="mt-1 space-y-0.5 text-[13px] text-muted">{x.bundle.map((b) => <li key={b.sku}>{b.qty > 1 && <bdi className="tabular-nums">{b.qty}× </bdi>}{b.name ? b.name[lang] : b.sku}</li>)}</ul>
      {x.partsSum && x.partsSum > price ? <span className="mt-1 block text-[13px] font-semibold text-emerald-700 dark:text-emerald-300">{tx(`توفّر ${money(x.partsSum - price, 'ar')} عن شرائها منفصلة`, `You save ${money(x.partsSum - price, 'en')} versus buying them apart`)}</span> : null}</Row>); break;
  }
  const lim = x.limits;
  if (lim?.max) lines.push(<Row key="max" icon={<ShieldCheck />}>{tx(`الحد ${lim.max} لكل عميل`, `Limit ${lim.max} per customer`)}</Row>);
  if (lim?.min) lines.push(<Row key="min" icon={<ShieldCheck />}>{tx(`أقل كمية للطلب ${lim.min}`, `Minimum ${lim.min} per order`)}</Row>);
  if (lim?.only?.length || lim?.except.length) lines.push(<Row key="city" icon={<MapPin />}>{lim.only?.length ? tx(`يُوصَّل إلى ${lim.only.map((c) => cityName(c, 'ar')).join('، ')} فقط`, `Delivered to ${lim.only.map((c) => cityName(c, 'en')).join(', ')} only`) : tx(`لا يُوصَّل إلى ${lim.except.map((c) => cityName(c, 'ar')).join('، ')}`, `Not delivered to ${lim.except.map((c) => cityName(c, 'en')).join(', ')}`)}</Row>);
  if (lim?.age) lines.push(<Row key="age" icon={<UserCheck />}>{tx(`للعمر ${lim.age} سنة فأكثر؛ تؤكد ذلك عند الدفع`, `For ages ${lim.age}+; you confirm at checkout`)}</Row>);
  if (!lines.length && !x.brand) return null;
  return (
    <div className="space-y-3">
      {x.brand && (brandHref
        ? <a href={brandHref} className="inline-flex items-center gap-2 text-[13px] font-semibold text-fg hover:underline"><BrandMark b={x.brand} size={22} />{x.brand.name[lang]}</a>
        : <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-fg"><BrandMark b={x.brand} size={22} />{x.brand.name[lang]}</span>)}
      {lines.length > 0 && <ul className="space-y-2.5">{lines}</ul>}
    </div>
  );
}

/** Product details (custom fields) and the size chart, as disclosure rows on the product page. */
export function ProductDetails({ x, size }: { x: StoreX; size?: string }) {
  const tx = useTx();
  const { lang } = useLang();
  if (!x.attrs.length && !x.chart) return null;
  return (
    <>
      {x.attrs.length > 0 && (
        <details className="group py-1" open>
          <summary className="flex h-12 cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">{tx('المواصفات', 'Specifications')}<ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 pb-4 text-sm">
            {x.attrs.map((a) => <div key={a.id} className="contents"><dt className="text-muted">{a.label[lang]}</dt><dd className="min-w-0 font-medium">{a.kind === 'file' ? <span className="inline-flex items-center gap-1.5"><FileText className="size-4 text-muted" aria-hidden="true" /><bdi dir="ltr">{a.value.en}</bdi><span className="text-xs font-normal text-subtle">({tx('تنزيل تجريبي', 'demo download')})</span></span> : a.value[lang]}</dd></div>)}
          </dl>
        </details>
      )}
      {x.chart && <SizeChartBlock chart={x.chart} size={size} />}
    </>
  );
}

export function SizeChartBlock({ chart, size }: { chart: SizeChart; size?: string }) {
  const tx = useTx();
  const { lang } = useLang();
  const on = (s: string) => !!size && s.trim().toUpperCase() === size.trim().toUpperCase();
  return (
    <details className="group py-1">
      <summary className="flex h-12 cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden"><span className="inline-flex items-center gap-2"><Ruler className="size-4 text-muted" aria-hidden="true" />{tx('دليل المقاسات', 'Size guide')}</span><ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
      <div className="pb-4">
        <div className="overflow-x-auto"><table className="w-full min-w-[18rem] text-[13px]">
          <caption className="pb-2 text-start text-xs text-muted">{chart.name[lang]} · {chart.unit === 'cm' ? tx('سم', 'cm') : tx('إنش', 'in')}{size ? ` · ${tx('مقاسك المختار مظلّل', 'your size is highlighted')}` : ''}</caption>
          <thead><tr className="border-b border-border"><th scope="col" className="py-2 pe-3 text-start font-semibold">{tx('القياس', 'Measure')}</th>{chart.sizes.map((s) => <th key={s} scope="col" className={cn('px-2 py-2 text-center font-semibold', on(s) && 'rounded-t-lg bg-brand-500/10 text-brand-800 dark:text-brand-200')}><bdi>{s}</bdi></th>)}</tr></thead>
          <tbody>{chart.rows.map((r, i) => <tr key={i} className="border-b border-border last:border-0"><th scope="row" className="py-2 pe-3 text-start font-medium text-muted">{r.label[lang]}</th>{chart.sizes.map((s, j) => <td key={s} className={cn('px-2 py-2 text-center tabular-nums', on(s) && 'bg-brand-500/10 font-semibold')}><bdi dir="ltr">{r.values[j] || '—'}</bdi></td>)}</tr>)}</tbody>
        </table></div>
        {chart.note[lang] && <p className="mt-2 text-xs text-muted">{chart.note[lang]}</p>}
      </div>
    </details>
  );
}

/** Booking slots grouped by day, as radio chips; full slots are shown crossed out. */
export function SlotPicker({ slots, value, onPick, error }: { slots: { id: string; size: string; left: number }[]; value?: string; onPick: (size: string) => void; error?: string }) {
  const tx = useTx();
  const day = useDay();
  const byDay = new Map<string, typeof slots>();
  for (const s of slots) { const d = s.size.split(' ')[0]; byDay.set(d, [...(byDay.get(d) ?? []), s]); }
  return (
    <fieldset aria-describedby={error ? 'sf-err-slot' : undefined}>
      <legend className="mb-3 text-sm font-semibold">{tx('اختر الموعد', 'Choose a time')}</legend>
      {!slots.length ? <p className="text-sm text-muted">{tx('لا مواعيد متاحة الآن.', 'No times available right now.')}</p> : (
        <div className="space-y-3">
          {[...byDay.entries()].map(([d, list]) => (
            <div key={d}>
              <p className="mb-1.5 text-[13px] text-muted">{day(d, true)}</p>
              <div className="flex flex-wrap gap-2">
                {list.map((s) => {
                  const full = s.left <= 0;
                  return (
                    <label key={s.id} className={cn('inline-flex h-11 min-w-20 cursor-pointer flex-col items-center justify-center rounded-xl border bg-surface px-3 text-sm font-medium transition-colors has-[:checked]:border-fg has-[:checked]:bg-fg has-[:checked]:text-bg has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500', error ? 'border-red-500' : 'border-border', full && 'cursor-not-allowed text-subtle line-through')}>
                      <input type="radio" name="sf-slot" className="sr-only" disabled={full} checked={value === s.size} onChange={() => onPick(s.size)} />
                      <bdi dir="ltr" className="tabular-nums">{s.size.split(' ')[1]}</bdi>
                      <span className="text-[10px] font-normal leading-none opacity-80">{full ? tx('مكتمل', 'Full') : tx(`${s.left} متاح`, `${s.left} left`)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <p id="sf-err-slot" role="alert" className="mt-2 text-[13px] font-medium text-red-600 dark:text-red-400">{error}</p>}
    </fieldset>
  );
}

/** The checkout's extra step: store questions, purchase-limit problems and the age confirmation. */
export function CheckoutQuestions({ questions, answers, onAnswer, errors, show, problems, age, ageOk, onAge, preorder }: {
  questions: Question[]; answers: Record<string, string>; onAnswer: (id: string, v: string) => void; errors: Record<string, ValueError | 'past'>; show: boolean;
  problems: { key: string; text: string }[]; age: number | null; ageOk: boolean; onAge: (v: boolean) => void;
  preorder?: { shipDate: string; deposit: number; balance: number; pay: 'full' | 'deposit' };
}) {
  const tx = useTx();
  const { lang } = useLang();
  const day = useDay();
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const msg = (e: ValueError | 'past') => ({ required: tx('مطلوب', 'Required'), number: tx('رقم فقط', 'A number'), date: tx('تاريخ صحيح', 'A valid date'), choice: tx('اختر من القائمة', 'Choose from the list'), long: tx('أقصر من 300 حرف', 'Under 300 characters'), past: tx('تاريخ من اليوم فصاعدًا', 'Today or later') })[e];
  if (!questions.length && !problems.length && !age && !preorder) return null;
  return (
    <div className="space-y-4">
      {preorder && (
        <div className="rounded-xl bg-brand-500/[.06] p-4 text-sm ring-1 ring-brand-500/20">
          <p className="flex items-center gap-2 font-semibold"><CalendarClock className="size-4" aria-hidden="true" />{tx('طلب مسبق', 'Pre-order')} · {tx(`يُشحن نحو ${day(preorder.shipDate, true)}`, `ships around ${day(preorder.shipDate, true)}`)}</p>
          {preorder.pay === 'deposit' && <p className="mt-1 text-muted">{tx(`الدفعة المقدمة الآن ${money(preorder.deposit, 'ar')}، والباقي ${money(preorder.balance, 'ar')} قبل الشحن.`, `Deposit now ${money(preorder.deposit, 'en')}; the remaining ${money(preorder.balance, 'en')} before shipping.`)} <span className="text-xs">({tx('محاكاة: الدفع التجريبي يمر بالمبلغ كاملًا', 'Simulated: the demo payment runs the full amount')})</span></p>}
        </div>
      )}
      {problems.length > 0 && (
        <ul role="alert" className="space-y-1.5 rounded-xl border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-800 dark:text-red-200">
          {problems.map((p) => <li key={p.key} className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{p.text}</li>)}
        </ul>
      )}
      {questions.map((q) => {
        const e = (show || touched[q.id]) ? errors[q.id] : undefined;
        const id = `sf-q-${q.id.replace(/[^a-z0-9-]/gi, '-')}`;
        const common = { onBlur: () => setTouched((t) => ({ ...t, [q.id]: true })) };
        return (
          <Field key={q.id} id={id} label={<span>{q.label[lang]}{q.why[lang] && <span className="ms-1 text-xs font-normal text-muted">· {q.why[lang]}</span>}</span>} optional={!q.required} error={e ? msg(e) : undefined} hint={q.help[lang] || undefined}>
            {(p) => q.kind === 'choice' ? (
              <Select {...p} {...common} className="h-11" value={answers[q.id] ?? ''} onChange={(ev) => onAnswer(q.id, ev.target.value)}>
                <option value="">{tx('اختر', 'Choose')}</option>
                {q.options.map((o) => <option key={o.en} value={o.en}>{o[lang]}</option>)}
              </Select>
            ) : q.kind === 'file' ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input {...p} {...common} type="file" className="h-11 py-2" onChange={(ev) => onAnswer(q.id, ev.target.files?.[0]?.name ?? '')} />
                {answers[q.id] && <span className="text-xs text-muted"><bdi dir="ltr">{answers[q.id]}</bdi> · {tx('يُرفق (محاكاة)', 'attached (simulated)')}</span>}
              </div>
            ) : q.kind === 'text' && !q.id.startsWith('appt:') ? (
              <Textarea {...p} {...common} className="min-h-0" rows={2} value={answers[q.id] ?? ''} onChange={(ev) => onAnswer(q.id, ev.target.value)} />
            ) : (
              <Input {...p} {...common} className="h-11" type={q.kind === 'date' ? 'date' : 'text'} inputMode={q.kind === 'number' ? 'decimal' : undefined} dir={q.kind === 'text' ? undefined : 'ltr'} value={answers[q.id] ?? ''} onChange={(ev) => onAnswer(q.id, ev.target.value)} />
            )}
          </Field>
        );
      })}
      {age ? (
        <label id="sf-age" className={cn('flex items-start gap-3 rounded-xl border p-3 text-sm', show && !ageOk ? 'border-red-500 bg-red-500/5' : 'border-border')}>
          <input type="checkbox" className="mt-0.5 size-[18px] shrink-0 accent-brand-600" checked={ageOk} onChange={(e) => onAge(e.target.checked)} />
          <span>{tx(`أؤكد أن عمري ${age} سنة أو أكثر.`, `I confirm I am ${age} or older.`)}<span className="block text-xs text-muted">{tx('بعض المنتجات في سلتك مقيدة بالعمر.', 'Some items in your bag are age-restricted.')}</span>
            {show && !ageOk && <span role="alert" className="block text-[13px] font-medium text-red-600 dark:text-red-400">{tx('أكّد العمر للمتابعة', 'Confirm your age to continue')}</span>}</span>
        </label>
      ) : null}
    </div>
  );
}


/** Units of each product a customer already bought in paid, not-cancelled orders (for "max per customer"). */
function priorQty(customerId: string | undefined): Record<string, number> {
  if (!customerId) return {};
  const bySku = new Map<string, string>();
  for (const p of productsStore.get()) for (const sku of skusOf(p)) bySku.set(sku, p.id);
  const out: Record<string, number> = {};
  for (const o of merchantOrders.get()) {
    if (o.customerId !== customerId || o.pay !== 'paid' || o.cancelled) continue;
    for (const it of o.items) { const id = bySku.get(it.sku); if (id && it.unit > 0) out[id] = (out[id] ?? 0) + it.qty; }
  }
  return out;
}

/**
 * Everything the checkout needs from the catalogue extras for this bag: the questions and their errors, purchase-limit
 * problems (max per customer, minimum, delivery city), the age to confirm, pre-order terms, and the order extras to keep.
 */
export function useCheckoutExtras(lines: PricedLine[], products: StoreProduct[], city: string | undefined): {
  questions: Question[]; answers: Record<string, string>; errors: Record<string, ValueError | 'past'>; problems: { key: string; text: string }[];
  age: number | null; ageOk: boolean; ok: boolean; extras: OrderExtras; preorder?: { shipDate: string; deposit: number; balance: number; pay: 'full' | 'deposit' };
} {
  const tx = useTx();
  const { lang } = useLang();
  const x = catalogXStore.use();
  const co = checkoutStore.use();
  merchantOrders.use();
  const merchant = productsStore.use();
  const ids = [...new Set(lines.map((l) => l.productId))];
  const items = ids.flatMap((id) => { const p = products.find((q) => q.id === id); return p?.x ? [{ productId: id, name: p.name, type: p.x.type, cat: p.catName, appointment: p.x.appointment }] : []; });
  const questions = checkoutQuestions(x.fields, items);
  const answers = co.answers ?? {};
  const errors = checkAnswers(questions, answers, riyadhToday());
  const basket = checkBasket(lines, { products: merchant, rules: x.restrictions, city, prior: priorQty(checkoutCustomerId()) });
  const problems = basket.problems.map((p) => ({
    key: `${p.productId}-${p.kind}`,
    text: p.kind === 'max' ? (p.limit ? tx(`«${p.name.ar}»: الحد ${p.limit} لك في هذا الطلب (لديك ${p.have}). عدّل الكمية من السلة.`, `“${p.name.en}”: you can buy ${p.limit} more (you have ${p.have}). Change the quantity in your bag.`) : tx(`«${p.name.ar}»: وصلت للحد المسموح لكل عميل. احذفه من السلة.`, `“${p.name.en}”: you’ve reached the per-customer limit. Remove it from your bag.`))
      : p.kind === 'min' ? tx(`«${p.name.ar}»: أقل كمية ${p.limit} (لديك ${p.have}).`, `“${p.name.en}”: minimum ${p.limit} (you have ${p.have}).`)
        : tx(`«${p.name.ar}» لا يُوصَّل إلى هذه المدينة.`, `“${p.name.en}” isn’t delivered to this city.`),
  }));
  const extras = buildOrderExtras(lines, products, questions, answers, co.ageOk ? basket.age : null);
  void lang;
  const ok = !Object.keys(errors).length && !problems.length && (!basket.age || !!co.ageOk);
  return {
    questions, answers, errors, problems, age: basket.age, ageOk: !!co.ageOk, ok, extras,
    preorder: extras.preorder && { shipDate: extras.preorder.shipDate, deposit: extras.preorder.deposit, balance: extras.preorder.balance, pay: extras.preorder.pay },
  };
}
