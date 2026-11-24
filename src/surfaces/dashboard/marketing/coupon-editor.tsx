// Create / edit an offer: a typed code or an automatic offer (no code), value (percent, amount, free shipping or
// buy X get Y), items in scope, conditions, limits, schedule; live preview on a sample basket and conflict check.
// Unsaved input is kept for the session (navigating away does not lose it). Editing a live offer is reviewed in a Modal.
import { useState, type ReactNode } from 'react';
import { ArrowLeft, Pause, Play, ReceiptText, SearchX, Sparkles, Ticket } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { createStore } from '../../../core/store';
import { link, navigate } from '../../../core/router';
import { parseMoney } from '../../merchant/catalog';
import { couponsStore, productsStore } from '../../merchant/stores';
import { logAction } from '../../merchant/stores';
import type { Coupon, CouponDraft, CouponError, CouponType } from '../../merchant/growth';
import { Badge, Button, Card, CardHeader, EmptyState, InfoHint, LinkButton, Money, ProductImage, Ref, Segmented, cn, useTx } from '../../../ds/ui';
import { Alert, Checkbox, Field, Input, Modal, PageHeader, SaveBar, Select, useToast } from '../../../ds/kit';
import { skuPhoto, productIdForSku } from '../model/media';
import { can } from '../../merchant/perms';
import { useUnsaved } from '../unsaved';
import { SAMPLES, buildCoupon, checkDraft, couponActions, couponConflicts, couponDiff, couponState, draftFromCoupon, emptyDraft, previewOffer, scopeOptions, type CouponField } from './model';
import { useCouponText } from './coupons';
import { Locked, useRole } from './access';

/** Unsaved coupon input for this tab session, keyed by code ('new' for a new coupon). */
const draftsStore = createStore.key('dashboard.couponDrafts')<Record<string, CouponDraft>>(() => ({}));
const LIST = link('/dashboard/marketing');

export default function CouponEditor({ code, auto }: { code: string; auto?: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const ct = useCouponText();
  const toast = useToast();
  const role = useRole();
  const all = couponsStore.use();
  const products = productsStore.use();
  const drafts = draftsStore.use();
  const isNew = code === 'new';
  const base = isNew ? undefined : all.find((c) => c.code === code);
  const initial = base ? draftFromCoupon(base) : emptyDraft(undefined, !!auto);
  const d = drafts[code] ?? initial;
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const [tried, setTried] = useState(false);
  // Start on the first sample the offer applies to, so a scoped or buy-X-get-Y offer shows its effect at once.
  const [sampleId, setSampleId] = useState(() => (base && SAMPLES.find((x) => !previewOffer(base, x, products).block)?.id) || SAMPLES[0].id);
  const [review, setReview] = useState(false);
  const [statusTo, setStatusTo] = useState<'activate' | 'pause' | null>(null);
  const canManage = can(role, 'marketing.manage');
  useUnsaved(dirty, { ar: 'تعديلات العرض', en: 'Offer edits' });

  if (!isNew && !base) return (
    <Card><EmptyState as="h1" icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا يوجد كوبون بهذا الكود', 'No coupon with this code')}
      action={<LinkButton variant="secondary" href={LIST}>{tx('كل الكوبونات', 'All coupons')}</LinkButton>}><Ref>{code}</Ref></EmptyState></Card>
  );

  const set = (p: Partial<CouponDraft>) => draftsStore.set((x) => ({ ...x, [code]: { ...d, ...p } }));
  const discard = () => { draftsStore.set((x) => { const n = { ...x }; delete n[code]; return n; }); setTried(false); };
  const errors = checkDraft(d, all, parseMoney, base?.code);
  const nErr = Object.keys(errors).length;
  const coupon = nErr ? null : buildCoupon(d, parseMoney, base);
  const sample = SAMPLES.find((s) => s.id === sampleId) ?? SAMPLES[0];
  const eff = coupon ? previewOffer(coupon, sample, products) : null;
  const scope = scopeOptions(products);
  const isAuto = !!d.auto;
  const conflicts = coupon ? couponConflicts(coupon, all) : [];
  const live = base && ['active', 'scheduled'].includes(couponState(base));
  const changes = base && coupon ? couponDiff(base, coupon) : [];

  const msg: Record<CouponError, string> = {
    code: tx('من 4 إلى 16 حرفًا لاتينيًا كبيرًا أو رقمًا', '4–16 capital Latin letters or digits'), codeTaken: tx('الكود مستخدم', 'Code already in use'),
    value: tx('قيمة غير صالحة', 'Invalid value'), percent: tx('نسبة من 1 إلى 90', 'A percentage from 1 to 90'), money: tx('مبلغ غير صالح', 'Invalid amount'),
    limit: tx('عدد صحيح 1 أو أكثر', 'A whole number, 1 or more'), dates: tx('النهاية بعد البداية', 'End must be after start'),
    scope: tx('اختر تصنيفًا أو منتجًا واحدًا على الأقل', 'Choose at least one category or product'), bogo: tx('اشترِ وخذ من 1 إلى 10، والخصم من 1 إلى 100%', 'Buy and get 1–10, discount 1–100%'),
  };
  const err = (k: string) => (tried && errors[k] ? msg[errors[k]] : null);

  const commit = () => {
    if (!coupon) return;
    couponsStore.set((cs) => (base ? cs.map((c) => (c.code === base.code ? coupon : c)) : [coupon, ...cs]));
    logAction('marketing', base ? { ar: `عدّل العرض ${coupon.code}`, en: `Edited offer ${coupon.code}` } : { ar: `أنشأ العرض ${coupon.code} (مسودة)`, en: `Created offer ${coupon.code} (draft)` }, { target: coupon.code });
    discard();
    setReview(false);
    toast({ tone: 'ok', text: base ? tx(`حُفظ ${coupon.code}`, `${coupon.code} saved`) : tx(`حُفظ ${coupon.code} مسودة. فعّله من القائمة.`, `${coupon.code} saved as a draft. Activate it from the list.`) });
    if (!base) navigate(link('/dashboard/marketing', { view: 'drafts' }));
  };
  const save = () => {
    setTried(true);
    if (!coupon) return;
    if (live && changes.length) setReview(true); else commit();
  };

  const fieldName: Record<CouponField, string> = {
    type: tx('النوع', 'Type'), value: tx('القيمة', 'Value'), minSpend: tx('الحد الأدنى', 'Minimum'), limitTotal: tx('حد الاستخدام', 'Usage limit'),
    limitPerCustomer: tx('لكل عميل', 'Per customer'), starts: tx('البداية', 'Start'), ends: tx('النهاية', 'End'), scope: tx('المنتجات المشمولة', 'Items in scope'), bogo: tx('اشترِ واحصل', 'Buy and get'),
  };
  const show = (c: Coupon, k: CouponField): ReactNode => {
    if (k === 'scope') return c.scope ? `${c.scope.ids.length} ${c.scope.kind === 'category' ? tx('تصنيف', 'categories') : tx('منتج', 'products')}` : tx('كل المنتجات', 'All items');
    if (k === 'bogo') return c.bogo ? tx(`اشترِ ${c.bogo.buy} وخذ ${c.bogo.get} بخصم ${c.bogo.pct}%`, `Buy ${c.bogo.buy}, get ${c.bogo.get} at ${c.bogo.pct}% off`) : tx('بلا', 'None');
    const v = c[k];
    if (v === null || v === '' || v === undefined) return tx('بلا', 'None');
    if (k === 'type') return ct.type(c.type);
    if (k === 'minSpend' || (k === 'value' && c.type === 'fixed')) return <Money v={v as number} />;
    if (k === 'value' && c.type === 'percent') return `${v}%`;
    return <Ref>{String(v)}</Ref>;
  };
  const block = eff?.block;
  const blockText = block && ({ minSpend: tx('لا ينطبق: المنتجات أقل من الحد الأدنى', 'Does not apply: items below the minimum'), perCustomer: tx('لا ينطبق: العميل بلغ حده', 'Does not apply: customer reached their limit'), limit: tx('لا ينطبق: بلغ حد الاستخدام الكلي', 'Does not apply: total usage limit reached'), inactive: tx('لا ينطبق: خارج فترة الصلاحية', 'Does not apply: outside its dates'), scope: tx('لا ينطبق: لا منتجات مشمولة في هذه السلة', 'Does not apply: no items in scope in this basket'), qty: tx('لا ينطبق: عدد القطع المشمولة أقل من المطلوب', 'Does not apply: not enough items in scope') })[block];
  const types: CouponType[] = isAuto ? ['percent', 'fixed', 'freeShip', 'bogo'] : ['percent', 'fixed', 'freeShip'];
  const toggleId = (id: string, on: boolean) => set({ scopeIds: on ? [...(d.scopeIds ?? []), id] : (d.scopeIds ?? []).filter((x) => x !== id) });

  return (
    <div className="space-y-6 pb-20">
      <PageHeader back={{ href: LIST, label: tx('الكوبونات والعروض', 'Coupons & offers') }}
        title={isNew ? (isAuto ? tx('عرض تلقائي جديد', 'New automatic offer') : tx('كوبون جديد', 'New coupon')) : <Ref>{code}</Ref>}
        meta={base ? <><Badge tone={live ? 'green' : 'gray'}>{ct.state(couponState(base))}</Badge><span className="text-xs text-muted tabular-nums">{tx(`استُخدم ${base.used} مرة`, `Used ${base.used} times`)}</span></> : undefined}
        actions={base && canManage && !dirty && couponActions(base).length ? (couponActions(base)[0] === 'activate'
          ? <Button onClick={() => setStatusTo('activate')}><Play className="size-4" aria-hidden="true" />{tx('فعّل', 'Activate')}</Button>
          : <Button variant="secondary" onClick={() => setStatusTo('pause')}><Pause className="size-4" aria-hidden="true" />{tx('أوقف', 'Pause')}</Button>) : undefined} />
      {statusTo && base && (
        <Modal title={statusTo === 'activate' ? tx(`تفعيل ${base.code}`, `Activate ${base.code}`) : tx(`إيقاف ${base.code}`, `Pause ${base.code}`)} onClose={() => setStatusTo(null)}
          footer={<><Button variant="secondary" onClick={() => setStatusTo(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => {
            couponsStore.set((cs) => cs.map((x) => (x.code === base.code ? { ...x, status: statusTo === 'activate' ? 'active' : 'paused' } : x)));
            logAction('marketing', statusTo === 'activate' ? { ar: `فعّل العرض ${base.code}`, en: `Activated offer ${base.code}` } : { ar: `أوقف العرض ${base.code}`, en: `Paused offer ${base.code}` }, { target: base.code });
            toast({ tone: 'ok', text: statusTo === 'activate' ? tx(`فُعّل ${base.code}`, `${base.code} activated`) : tx(`أُوقف ${base.code}`, `${base.code} paused`) });
            setStatusTo(null);
          }}>{statusTo === 'activate' ? tx('فعّل', 'Activate') : tx('أوقف', 'Pause')}</Button></>}>
          <ul className="space-y-1.5 text-sm text-fg">
            {statusTo === 'activate'
              ? <><li>{base.auto ? tx('يُطبَّق تلقائيًا في سلة المتجر على كل سلة تحقق شروطه.', 'Applies automatically in the store bag to every basket that meets it.') : tx('يُقبل الكود عند الدفع في كل القنوات.', 'The code is accepted at checkout in every channel.')}</li><li>{tx('لا يُرسل للعملاء تلقائيًا.', 'It is not sent to customers automatically.')}</li></>
              : <><li>{tx('يتوقف في الطلبات الجديدة.', 'It stops for new orders.')}</li><li>{tx('الطلبات السابقة لا تتغير.', 'Past orders do not change.')}</li></>}
          </ul>
        </Modal>
      )}
      {drafts[code] && dirty && <Alert tone="info" title={tx('استعدنا تعديلاتك غير المحفوظة', 'We kept your unsaved edits')} action={<Button variant="ghost" size="sm" onClick={discard}>{tx('تجاهلها', 'Discard')}</Button>} />}
      {!canManage && <Locked>{tx('دورك يعرض الكوبون فقط.', 'Your role can only view this coupon.')}</Locked>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <fieldset disabled={!canManage} className="min-w-0 space-y-6 lg:col-span-2">
          <Card aria-labelledby="h-disc">
            <CardHeader id="h-disc" title={tx('الخصم', 'Discount')} />
            <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <p className="flex items-center gap-1 text-[13px] font-semibold text-fg">{tx('كيف يحصل عليه العميل', 'How the customer gets it')}<InfoHint>{tx('الكوبون يكتبه العميل عند الدفع. العرض التلقائي يُطبَّق في السلة دون كود، ويُختار الأفضل للعميل إن انطبق أكثر من عرض. لا يجتمع عرضان في طلب.', 'A coupon is typed at checkout. An automatic offer applies in the bag with no code; if several apply, the best one for the customer wins. Two offers never stack.')}</InfoHint></p>
                <Segmented label={tx('كيف يحصل عليه العميل', 'How the customer gets it')} value={isAuto ? 'auto' : 'code'}
                  onChange={(v) => isNew && set({ auto: v === 'auto', ...(v === 'code' && d.type === 'bogo' ? { type: 'percent' as const, value: '10' } : {}) })}
                  options={[{ value: 'code', label: tx('كود يكتبه العميل', 'Code the customer types') }, { value: 'auto', label: tx('تلقائي بلا كود', 'Automatic, no code') }]} />
              </div>
              <Field label={isAuto ? tx('اسم العرض (لاتيني)', 'Offer name (Latin)') : tx('الكود', 'Code')} error={err('code')} hint={!isNew ? tx('لا يتغير بعد الإنشاء', 'Fixed after creation') : isAuto ? tx('يظهر بجانب الخصم في السلة', 'Shown next to the discount in the bag') : tx('يكتبه العميل عند الدفع', 'Typed by the customer at checkout')}>
                {(p) => <Input {...p} dir="ltr" value={d.code} disabled={!isNew} autoComplete="off" onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s/g, '') })} />}
              </Field>
              <Field label={tx('النوع', 'Type')}>
                {(p) => <Select {...p} value={d.type} onChange={(e) => { const t = e.target.value as CouponType; set({ type: t, value: t === 'percent' ? '10' : t === 'fixed' ? '50' : '' }); }}>
                  {types.map((t) => <option key={t} value={t}>{ct.type(t)}</option>)}
                </Select>}
              </Field>
              {(d.type === 'percent' || d.type === 'fixed') && (
                <Field label={d.type === 'percent' ? tx('النسبة %', 'Percent %') : tx('المبلغ (ر.س)', 'Amount (SAR)')} error={err('value')}>
                  {(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.value} onChange={(e) => set({ value: e.target.value })} />}
                </Field>
              )}
              {d.type === 'bogo' && (
                <div className="grid grid-cols-3 gap-3 sm:col-span-2">
                  <Field label={tx('اشترِ', 'Buy')} error={err('value')}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" value={d.buy ?? ''} onChange={(e) => set({ buy: e.target.value })} />}</Field>
                  <Field label={tx('واحصل على', 'Get')}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" value={d.get ?? ''} onChange={(e) => set({ get: e.target.value })} />}</Field>
                  <Field label={tx('بخصم %', 'At % off')} hint={tx('100 = مجانًا', '100 = free')}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" value={d.getPct ?? ''} onChange={(e) => set({ getPct: e.target.value })} />}</Field>
                </div>
              )}
            </div>
          </Card>

          <Card aria-labelledby="h-scope">
            <CardHeader id="h-scope" title={tx('المنتجات المشمولة', 'Items in scope')} hint={tx('الخصم يُحسب على المنتجات المشمولة فقط. في «اشترِ واحصل» تُحسب القطع المشمولة من الأغلى للأرخص، والأرخص هي المخصومة.', 'The discount counts only items in scope. For buy-and-get, items in scope are ordered dearest first and the cheapest are discounted.')} />
            <div className="space-y-4 px-5 pb-5">
              <Segmented label={tx('المنتجات المشمولة', 'Items in scope')} value={d.scopeKind ?? 'all'} onChange={(k) => set({ scopeKind: k, scopeIds: [] })}
                options={[{ value: 'all', label: tx('كل المنتجات', 'All items') }, { value: 'category', label: tx('تصنيفات', 'Categories') }, { value: 'product', label: tx('منتجات', 'Products') }]} />
              {d.scopeKind === 'category' && (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {scope.categories.map((c) => (
                    <li key={c.id}><label className={cn('flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm', d.scopeIds?.includes(c.id) ? 'border-brand-300 bg-brand-500/5' : 'border-border')}>
                      <Checkbox label={c.name[lang]} checked={!!d.scopeIds?.includes(c.id)} onChange={(on) => toggleId(c.id, on)} /><span className="flex-1 text-fg">{c.name[lang]}</span><span className="text-xs text-muted tabular-nums">{c.count}</span>
                    </label></li>
                  ))}
                </ul>
              )}
              {d.scopeKind === 'product' && (
                <ul className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                  {scope.products.map((x) => (
                    <li key={x.id}><label className={cn('flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm', d.scopeIds?.includes(x.id) ? 'border-brand-300 bg-brand-500/5' : 'border-border')}>
                      <Checkbox label={x.name[lang]} checked={!!d.scopeIds?.includes(x.id)} onChange={(on) => toggleId(x.id, on)} />
                      <ProductImage src={skuPhoto(x.sku)} alt={x.name[lang]} size={28} /><span className="min-w-0 flex-1 truncate text-fg">{x.name[lang]}</span>
                    </label></li>
                  ))}
                </ul>
              )}
              {tried && errors.scope && <p className="text-xs font-medium text-red-600 dark:text-red-400">{msg.scope}</p>}
            </div>
          </Card>

          <Card aria-labelledby="h-cond">
            <CardHeader id="h-cond" title={tx('الشروط والحدود', 'Conditions and limits')} hint={tx('الحد الأدنى يُقاس على مجموع المنتجات قبل الشحن. حدود الاستخدام تُحسب على الطلبات المدفوعة.', 'The minimum is measured on the items subtotal before shipping. Usage limits count paid orders.')} />
            <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-3">
              <Field label={tx('حد أدنى للمنتجات (ر.س)', 'Minimum items (SAR)')} optional error={err('minSpend')}>
                {(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.minSpend} onChange={(e) => set({ minSpend: e.target.value })} />}
              </Field>
              <Field label={tx('حد الاستخدام الكلي', 'Total uses')} optional error={err('limitTotal')}>
                {(p) => <Input {...p} dir="ltr" inputMode="numeric" value={d.limitTotal} onChange={(e) => set({ limitTotal: e.target.value })} />}
              </Field>
              <Field label={tx('لكل عميل', 'Per customer')} optional error={err('limitPerCustomer')}>
                {(p) => <Input {...p} dir="ltr" inputMode="numeric" value={d.limitPerCustomer} onChange={(e) => set({ limitPerCustomer: e.target.value })} />}
              </Field>
            </div>
          </Card>

          <Card aria-labelledby="h-sched">
            <CardHeader id="h-sched" title={tx('الجدولة', 'Schedule')} hint={tx('بتوقيت الرياض. بلا تاريخ نهاية يبقى الكوبون حتى توقفه.', 'Riyadh time. With no end date the coupon runs until you pause it.')} />
            <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2">
              <Field label={tx('يبدأ', 'Starts')} error={err('dates')}>{(p) => <Input {...p} type="date" dir="ltr" value={d.starts} onChange={(e) => set({ starts: e.target.value })} />}</Field>
              <Field label={tx('ينتهي', 'Ends')} optional>{(p) => <Input {...p} type="date" dir="ltr" value={d.ends} min={d.starts} onChange={(e) => set({ ends: e.target.value })} />}</Field>
            </div>
          </Card>
        </fieldset>

        <div className="min-w-0 space-y-6">
          <Card aria-labelledby="h-prev" className="lg:sticky lg:top-24">
            <CardHeader id="h-prev" title={tx('المعاينة على طلب مثال', 'Preview on a sample order')} hint={tx('توضح أثر الكوبون على طلب مثال، وليست توقعًا للمبيعات. الأسعار شاملة الضريبة، وتُحسب الضريبة على المبلغ بعد الخصم.', 'Shows the effect on a sample order; not a sales forecast. Prices include VAT, which applies to the amount after discount.')} />
            <div className="space-y-4 px-5 pb-5">
              <div role="radiogroup" aria-label={tx('طلب مثال', 'Sample order')} className="space-y-2">
                {SAMPLES.map((s) => (
                  <button key={s.id} type="button" role="radio" aria-checked={s.id === sampleId} onClick={() => setSampleId(s.id)}
                    className={cn('flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-start transition-colors', s.id === sampleId ? 'border-brand-400 bg-brand-500/5' : 'border-border hover:border-brand-300')}>
                    <span className="flex -space-x-2 rtl:space-x-reverse">{s.skus.map((k, i) => <ProductImage key={`${k}-${i}`} src={skuPhoto(k)} alt={products.find((p) => p.id === productIdForSku(k))?.name[lang] ?? k} size={32} className="ring-2 ring-surface" />)}</span>
                    <span className="min-w-0 flex-1 text-[13px] font-medium text-fg">{s.label[lang]}</span>
                    <Money v={s.subtotal} className="text-xs text-muted" />
                  </button>
                ))}
              </div>
              {!eff ? (
                <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">{tx('أكمل الحقول لعرض الأثر', 'Complete the fields to see the effect')}</p>
              ) : (
                <dl className="space-y-2 text-sm">
                  <Line k={tx('المنتجات', 'Items')} v={<Money v={eff.subtotal} />} />
                  {(d.scopeKind ?? 'all') !== 'all' && <Line k={tx('منها مشمول', 'Of which in scope')} v={<Money v={eff.eligible} />} />}
                  {eff.freeUnits > 0 && <Line k={tx('قطع مخصومة', 'Discounted items')} v={<span className="tabular-nums">{eff.freeUnits}</span>} />}
                  <Line k={tx('الشحن', 'Shipping')} v={sample.shipping ? <Money v={sample.shipping} /> : tx('مجاني', 'Free')} />
                  <Line k={tx('الخصم', 'Discount')} v={<span className={cn(eff.discount + eff.shippingOff ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted')}><Money v={eff.discount + eff.shippingOff} /></span>} />
                  <div className="flex items-center justify-between border-t border-border pt-2"><dt className="font-semibold text-fg">{tx('يدفع العميل', 'Customer pays')}</dt><dd className="text-lg font-bold text-fg"><Money v={eff.total} /></dd></div>
                </dl>
              )}
              {blockText && <Alert tone="warn">{blockText}</Alert>}
              {conflicts.length > 0 && (
                <Alert tone="warn" title={tx('تعارض', 'Conflict')}>
                  {tx('كوبونات من النوع نفسه في الفترة نفسها: ', 'Same-kind coupons in the same period: ')}<Ref>{conflicts.map((c) => c.code).join(', ')}</Ref>
                </Alert>
              )}
              {coupon && conflicts.length === 0 && <p className="flex items-center gap-1.5 text-xs text-muted"><ReceiptText className="size-3.5" aria-hidden="true" />{tx('لا تعارض مع كوبونات أخرى', 'No conflict with other coupons')}</p>}
              {coupon && (
                <div className="rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] text-fg">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">{isAuto ? <Sparkles className="size-3.5" aria-hidden="true" /> : <Ticket className="size-3.5" aria-hidden="true" />}{tx('ما يراه العميل', 'What the customer sees')}</p>
                  {isAuto
                    ? tx(`سطر «خصم · ${coupon.code}» في السلة والدفع تلقائيًا عند تحقق الشروط.`, `A “Discount · ${coupon.code}” line in the bag and checkout, automatically when the conditions are met.`)
                    : tx(`يكتب ${coupon.code} في خانة الكوبون عند الدفع.`, `Types ${coupon.code} in the coupon box at checkout.`)}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {canManage && <SaveBar dirty={dirty} onSave={save} onDiscard={discard} saveLabel={isNew ? tx('احفظ مسودة', 'Save draft') : tx('احفظ', 'Save')}
        error={tried && nErr ? tx(`صحّح ${nErr} حقول قبل الحفظ`, `Fix ${nErr} field(s) before saving`) : undefined} />}

      {review && coupon && base && (
        <Modal title={tx(`حفظ تعديلات ${base.code}`, `Save changes to ${base.code}`)} description={tx('الكوبون يعمل الآن؛ التعديل يسري على الطلبات الجديدة فورًا.', 'This coupon is live; changes apply to new orders immediately.')} onClose={() => setReview(false)}
          footer={<><Button variant="secondary" onClick={() => setReview(false)}>{tx('رجوع', 'Back')}</Button><Button onClick={commit}>{tx('احفظ وطبّق', 'Save and apply')}</Button></>}>
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {changes.map((k) => (
              <li key={k} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="text-muted">{fieldName[k]}</span>
                <span className="flex items-center gap-2 text-fg"><span className="text-muted line-through">{show(base, k)}</span><ArrowLeft className="size-3.5 text-subtle ltr:rotate-180" aria-hidden="true" /><span className="font-semibold">{show(coupon, k)}</span></span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">{tx('الطلبات السابقة لا تتغير.', 'Past orders do not change.')}</p>
          {conflicts.length > 0 && <Alert tone="warn">{tx('يتنافس مع: ', 'Competes with: ')}<Ref>{conflicts.map((c) => c.code).join(', ')}</Ref></Alert>}
        </Modal>
      )}
    </div>
  );
}

function Line({ k, v }: { k: string; v: ReactNode }) {
  return <div className="flex items-center justify-between"><dt className="text-muted">{k}</dt><dd className="text-fg">{v}</dd></div>;
}

