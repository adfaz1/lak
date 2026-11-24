// Manual order (`#/dashboard/orders/new`): customer → items with stock per location → delivery → discount → payment →
// review → create (stock held). The draft is kept in the session, so leaving and coming back restores it.
import { useMemo, useState } from 'react';
import { Lock, Minus, PackagePlus, Plus, Search, Trash2, UserPlus } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { createStore } from '../../../core/store';
import { navigate } from '../../../core/router';
import { customersStore, levelsStore, ordersStore, productsStore, settingsStore, testStore } from '../../merchant/stores';
import { CITIES, LOCATIONS, LOC_IDS } from '../../merchant/domain';
import { Alert, Field, Input, Modal, PageHeader, Select, Simulated, Switch, Textarea, useToast } from '../../../ds/kit';
import { Badge, Button, Card, CardHeader, EmptyState, IconButton, InfoHint, Money, ProductImage, Ref, Segmented, cn, useTx } from '../../../ds/ui';
import { skuPhoto } from '../model/media';
import { useUnsaved } from '../unsaved';
import { createManual, emptyManual, manualQuote, orderPerms, skuOptions, type DraftError, type ManualDraft, type ManualPay } from './model';
import { Row, ohref, useActor } from './ui';


export const manualDraftStore = createStore.key('dashboard.orders.manualDraft')<ManualDraft>(emptyManual);

export default function NewOrder() {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const who = useActor();
  const perms = orderPerms(testStore.use().role);
  const d = manualDraftStore.use();
  const customers = customersStore.use();
  const levels = levelsStore.use();
  const products = productsStore.use();
  const zones = settingsStore.use().zones;
  const options = useMemo(() => skuOptions(products, levels), [products, levels]);
  const q = manualQuote(d, options, zones, customers);
  const [tried, setTried] = useState(false);
  const [review, setReview] = useState(false);
  const [newCustomer, setNewCustomer] = useState(!d.customerId && !!(d.newName || d.newPhone));
  const [find, setFind] = useState('');
  const [pick, setPick] = useState('');
  const dirty = JSON.stringify(d) !== JSON.stringify(emptyManual());
  useUnsaved(dirty, { ar: 'مسودة الطلب اليدوي', en: 'Manual order draft' });
  const set = (p: Partial<ManualDraft>) => manualDraftStore.set((x) => ({ ...x, ...p }));
  const err = (k: DraftError) => tried && q.errors.includes(k);
  const back = { href: ohref(), label: tx('الطلبات', 'Orders') };

  if (!perms.fulfil) return (
    <div className="space-y-6"><PageHeader back={back} title={tx('طلب يدوي', 'Manual order')} />
      <Card><EmptyState as="h2" icon={<Lock className="size-6" aria-hidden="true" />} title={tx('إنشاء الطلبات يحتاج دور المالك أو التجهيز', 'Creating orders needs the owner or fulfilment role')} /></Card>
    </div>
  );

  const found = find.trim() ? customers.filter((c) => c.name.ar.includes(find.trim()) || c.name.en.toLowerCase().includes(find.trim().toLowerCase()) || c.phone.replace(/\s/g, '').includes(find.replace(/\s/g, ''))).slice(0, 6) : [];
  const chosen = customers.find((c) => c.id === d.customerId);
  const addLine = () => {
    if (!pick) return;
    if (d.lines.some((l) => l.sku === pick)) set({ lines: d.lines.map((l) => (l.sku === pick ? { ...l, qty: String((Number(l.qty) || 0) + 1) } : l)) });
    else set({ lines: [...d.lines, { sku: pick, qty: '1' }] });
    setPick('');
  };
  const toReview = () => { setTried(true); if (!q.errors.length) setReview(true); };
  const create = () => {
    const r = createManual(d, { orders: ordersStore.get(), levels: levelsStore.get(), customers: customersStore.get() }, options, zones, who, Date.now());
    if (!r.order) { setReview(false); setTried(true); return; }
    customersStore.set(r.customers);
    levelsStore.set(r.levels);
    ordersStore.set((all) => [r.order!, ...all]);
    manualDraftStore.set(emptyManual());
    setReview(false);
    toast({ tone: 'ok', text: tx(`أُنشئ الطلب #${r.order.ref} وحُجز المخزون`, `Order #${r.order.ref} created; stock held`) });
    navigate(ohref(r.order.ref));
  };
  const payLabel: Record<ManualPay, string> = { cash: tx('مدفوع نقدًا', 'Paid in cash'), transfer: tx('مدفوع بتحويل', 'Paid by transfer'), cod: tx('عند الاستلام', 'Cash on delivery'), link: tx('رابط دفع', 'Payment link') };

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <PageHeader back={back} title={tx('طلب يدوي', 'Manual order')}
        meta={dirty ? <span className="text-xs text-muted">{tx('المسودة محفوظة في هذه الجلسة', 'Draft saved in this session')}</span> : undefined}
        actions={<div className="hidden gap-2 md:flex">{dirty && <Button variant="ghost" onClick={() => { manualDraftStore.set(emptyManual()); setTried(false); setNewCustomer(false); }}>{tx('امسح المسودة', 'Discard draft')}</Button>}<Button className="bg-brand-gradient hover:opacity-95" onClick={toReview}>{tx('راجع الطلب', 'Review order')}</Button></div>} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card aria-labelledby="h-c">
            <CardHeader id="h-c" title={tx('العميل', 'Customer')} action={<Button size="sm" variant="ghost" onClick={() => { setNewCustomer(!newCustomer); set({ customerId: '' }); }}>{newCustomer ? tx('اختر عميلًا', 'Pick a customer') : <><UserPlus className="size-4" aria-hidden="true" />{tx('عميل جديد', 'New customer')}</>}</Button>} />
            <div className="space-y-3 px-5 pb-5">
              {newCustomer ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={tx('الاسم', 'Name')} error={err('customer') ? tx('اكتب الاسم', 'Enter the name') : null}>{(p) => <Input {...p} value={d.newName} onChange={(e) => set({ newName: e.target.value })} />}</Field>
                  <Field label={tx('الجوال', 'Mobile')} hint="05xxxxxxxx" error={err('phone') ? tx('جوال سعودي يبدأ بـ 5', 'A Saudi mobile starting with 5') : null}>{(p) => <Input {...p} dir="ltr" inputMode="tel" value={d.newPhone} onChange={(e) => set({ newPhone: e.target.value })} />}</Field>
                  <Field label={tx('البريد', 'Email')} optional error={err('email') ? tx('بريد غير صحيح', 'Invalid email') : null} className="sm:col-span-2">{(p) => <Input {...p} dir="ltr" type="email" value={d.newEmail} onChange={(e) => set({ newEmail: e.target.value })} />}</Field>
                </div>
              ) : chosen ? (
                <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                  <span className="min-w-0 flex-1 text-sm"><span className="font-semibold text-fg">{chosen.name[lang]}</span><span className="block text-xs text-muted"><bdi dir="ltr">{chosen.phone}</bdi> · {chosen.city[lang]}</span></span>
                  <Button size="sm" variant="ghost" onClick={() => set({ customerId: '' })}>{tx('غيّر', 'Change')}</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="relative block">
                    <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                    <Input className="ps-9" value={find} onChange={(e) => setFind(e.target.value)} placeholder={tx('ابحث بالاسم أو الجوال', 'Search by name or mobile')} aria-label={tx('ابحث عن عميل', 'Find a customer')} aria-invalid={err('customer') || undefined} />
                  </label>
                  {err('customer') && <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{tx('اختر عميلًا أو أضف عميلًا جديدًا', 'Pick a customer or add a new one')}</p>}
                  {found.length > 0 && <ul className="divide-y divide-border rounded-xl border border-border">{found.map((c) => (
                    <li key={c.id}><button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm hover:bg-surface-2" onClick={() => { set({ customerId: c.id, city: CITIES.find((x) => c.city.en.startsWith(x.en))?.en ?? d.city }); setFind(''); }}>
                      <span className="flex-1 text-fg">{c.name[lang]}<span className="block text-xs text-muted"><bdi dir="ltr">{c.phone}</bdi> · {c.city[lang]}</span></span><Ref>{c.id}</Ref></button></li>
                  ))}</ul>}
                  {find.trim() && !found.length && <p className="text-xs text-muted">{tx('لا نتائج. أضفه كعميل جديد.', 'No match. Add them as a new customer.')}</p>}
                </div>
              )}
            </div>
          </Card>

          <Card aria-labelledby="h-i">
            <CardHeader id="h-i" title={tx('المنتجات', 'Items')} hint={tx('المتاح = المخزون ناقص المحجوز، لكل موقع.', 'Available = on hand minus reserved, per location.')} />
            <div className="space-y-3 px-5 pb-5">
              <div className="flex flex-wrap gap-2">
                <Select className="min-w-0 flex-1" value={pick} onChange={(e) => setPick(e.target.value)} aria-label={tx('اختر منتجًا', 'Choose a product')} aria-invalid={err('lines') || undefined}>
                  <option value="">{tx('اختر منتجًا أو متغيرًا…', 'Choose a product or variant…')}</option>
                  {options.map((o) => <option key={o.sku} value={o.sku} disabled={o.total === 0}>{o.name[lang]}{o.variant ? ` · ${o.variant[lang]}` : ''} — {o.sku} ({o.total === 0 ? tx('نفد', 'sold out') : tx(`متاح ${o.total}`, `${o.total} available`)})</option>)}
                </Select>
                <Button variant="secondary" disabled={!pick} onClick={addLine}><Plus className="size-4" aria-hidden="true" />{tx('أضف', 'Add')}</Button>
              </div>
              {err('lines') && <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{tx('أضف منتجًا واحدًا على الأقل', 'Add at least one item')}</p>}
              {q.lines.length > 0 && (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {q.lines.map((l, i) => (
                    <li key={l.opt.sku} className="flex flex-wrap items-center gap-3 px-3 py-3">
                      <ProductImage src={skuPhoto(l.opt.sku)} alt={l.opt.name[lang]} size={44} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-fg">{l.opt.name[lang]}{l.opt.variant && <span className="font-normal text-muted"> · {l.opt.variant[lang]}</span>}</p>
                        <p className="flex flex-wrap gap-1.5 pt-1">{LOC_IDS.map((loc) => <Badge key={loc} tone={(l.opt.avail[loc] ?? 0) ? 'sky' : 'gray'}>{LOCATIONS[loc][lang]} <b className="tabular-nums">{l.opt.avail[loc] ?? 0}</b></Badge>)}</p>
                        {l.error && tried && <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{l.error === 'stock' ? tx(`المتاح ${l.opt.total} فقط`, `Only ${l.opt.total} available`) : tx('كمية صحيحة من 1', 'A whole number from 1')}</p>}
                      </div>
                      <span className="inline-flex h-10 items-center overflow-hidden rounded-xl border border-border">
                        <IconButton label={tx('إنقاص', 'Decrease')} className="rounded-none" onClick={() => set({ lines: d.lines.map((x, j) => (j === i ? { ...x, qty: String(Math.max(1, (Number(x.qty) || 1) - 1)) } : x)) })}><Minus className="size-4" /></IconButton>
                        <input dir="ltr" inputMode="numeric" aria-label={tx(`كمية ${l.opt.name.ar}`, `Quantity of ${l.opt.name.en}`)} value={d.lines[i].qty} onChange={(e) => set({ lines: d.lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)) })} className="h-full w-12 border-x border-border bg-transparent text-center text-sm font-semibold tabular-nums text-fg focus:outline-none" />
                        <IconButton label={tx('زيادة', 'Increase')} className="rounded-none" onClick={() => set({ lines: d.lines.map((x, j) => (j === i ? { ...x, qty: String((Number(x.qty) || 0) + 1) } : x)) })}><Plus className="size-4" /></IconButton>
                      </span>
                      <Money v={l.amount} className="w-24 text-end text-sm font-semibold text-fg" />
                      <IconButton label={tx('احذف السطر', 'Remove line')} onClick={() => set({ lines: d.lines.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></IconButton>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card aria-labelledby="h-d">
            <CardHeader id="h-d" title={tx('التوصيل', 'Delivery')} />
            <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
              <Field label={tx('المدينة', 'City')} error={err('city') ? tx('اختر المدينة', 'Choose the city') : err('zone') ? tx('لا منطقة شحن تغطيها', 'No shipping zone covers it') : null}>
                {(p) => <Select {...p} value={d.city} onChange={(e) => set({ city: e.target.value })}><option value="">{tx('اختر…', 'Choose…')}</option>{CITIES.map((c) => <option key={c.en} value={c.en}>{c[lang]}</option>)}</Select>}
              </Field>
              <Field label={tx('العنوان', 'Address')} error={err('address') ? tx('اكتب الحي والشارع والمبنى', 'Enter district, street and building') : null}>{(p) => <Input {...p} value={d.address} onChange={(e) => set({ address: e.target.value })} placeholder={tx('الحي، الشارع، المبنى', 'District, street, building')} />}</Field>
              <Field label={tx('ملاحظة العنوان', 'Address note')} optional>{(p) => <Input {...p} value={d.addressNote} onChange={(e) => set({ addressNote: e.target.value })} />}</Field>
              <div className="flex items-end gap-3 pb-1">
                <span className="flex-1 text-sm text-fg">{tx('شحن مجاني', 'Free shipping')}<span className="block text-xs text-muted">{q.zone ? <>{q.zone.name[lang]} · {d.freeShipping ? tx('بلا رسوم', 'no fee') : <Money v={q.shipping} />}</> : tx('حسب منطقة المدينة', 'By the city’s zone')}</span></span>
                <Switch checked={d.freeShipping} onChange={(v) => set({ freeShipping: v })} label={tx('شحن مجاني', 'Free shipping')} />
              </div>
              <Field label={tx('ملاحظة العميل', 'Customer note')} optional className="sm:col-span-2">{(p) => <Textarea {...p} className="min-h-16" value={d.customerNote} onChange={(e) => set({ customerNote: e.target.value.slice(0, 300) })} />}</Field>
            </div>
          </Card>

          <Card aria-labelledby="h-p">
            <CardHeader id="h-p" title={tx('الدفع والخصم', 'Payment & discount')} />
            <div className="space-y-4 px-5 pb-5">
              <Segmented label={tx('طريقة الدفع', 'Payment')} value={d.pay} onChange={(v) => set({ pay: v })} options={(['cash', 'transfer', 'cod', 'link'] as ManualPay[]).map((v) => ({ value: v, label: payLabel[v] }))} />
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted">{d.pay === 'link' ? <>{tx('يبقى الطلب «بانتظار الدفع» ولا يُجهّز قبله. إرسال الرابط يحتاج مزوّدًا من الخادم.', 'The order stays “awaiting payment” and is not fulfilled before it. Sending the link needs a server-side provider.')}<Simulated /></> : d.pay === 'cod' ? tx('يُحصّل عند التسليم؛ لا يُحتسب محصّلًا قبله.', 'Collected on delivery; not counted as collected before.') : tx('سجّل المبلغ الذي استلمته فعلًا.', 'Record money you have actually received.')}</p>
              <Field label={tx('خصم (ر.س)', 'Discount (SAR)')} optional hint={tx('شامل الضريبة', 'VAT included')} error={err('discount') ? tx('مبلغ صحيح لا يتجاوز المجموع', 'A valid amount up to the subtotal') : null} className="max-w-56">
                {(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.discount} onChange={(e) => set({ discount: e.target.value })} placeholder="0" />}
              </Field>
            </div>
          </Card>
        </div>

        <aside className="min-w-0 space-y-6">
          <Card aria-labelledby="h-s" className="xl:sticky xl:top-20">
            <CardHeader id="h-s" title={tx('الملخص', 'Summary')} />
            <dl className="px-5 pb-5">
              <Row label={tx(`المنتجات (${q.lines.reduce((s, l) => s + l.qty, 0)})`, `Items (${q.lines.reduce((s, l) => s + l.qty, 0)})`)}><Money v={q.subtotal} /></Row>
              {q.discount > 0 && <Row label={tx('الخصم', 'Discount')}><span className="inline-flex">−<Money v={q.discount} /></span></Row>}
              <Row label={tx('الشحن', 'Shipping')}>{q.shipping ? <Money v={q.shipping} /> : tx('مجاني', 'Free')}</Row>
              <Row label={tx('منها ضريبة 15%', 'Incl. 15% VAT')} tone="muted"><Money v={q.vat} /></Row>
              <div className="my-1 border-t border-border" />
              <Row label={tx('الإجمالي', 'Total')} strong><Money v={q.total} /></Row>
            </dl>
            <div className="border-t border-border px-5 py-4"><Button className="w-full" onClick={toReview}><PackagePlus className="size-4" aria-hidden="true" />{tx('راجع الطلب', 'Review order')}</Button>
              {tried && q.errors.length > 0 && <p role="alert" className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{tx('أكمل الحقول المعلّمة', 'Complete the marked fields')}</p>}</div>
          </Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur md:hidden" role="region" aria-label={tx('إجراءات الطلب', 'Order actions')}>
        <span className="min-w-0 flex-1 text-sm font-semibold text-fg"><Money v={q.total} /></span>
        <Button onClick={toReview}>{tx('راجع الطلب', 'Review order')}</Button>
      </div>

      {review && (
        <Modal size="lg" title={tx('راجع قبل الإنشاء', 'Review before creating')} onClose={() => setReview(false)}
          footer={<><Button variant="secondary" onClick={() => setReview(false)}>{tx('عدّل', 'Edit')}</Button><Button onClick={create}>{tx('أنشئ الطلب', 'Create order')}</Button></>}>
          <dl className="divide-y divide-border !rounded-xl !border !border-border !px-4">
            <Row label={tx('العميل', 'Customer')}>{chosen ? chosen.name[lang] : d.newName}{!chosen && <Badge tone="brand" className="ms-2">{tx('جديد', 'New')}</Badge>}</Row>
            <Row label={tx('إلى', 'To')}>{d.address} · {CITIES.find((c) => c.en === d.city)?.[lang]}</Row>
            <Row label={tx('الدفع', 'Payment')}>{payLabel[d.pay]}</Row>
            <Row label={tx('الإجمالي', 'Total')} strong><Money v={q.total} /></Row>
            <Row label={tx('منها ضريبة', 'Incl. VAT')} tone="muted"><Money v={q.vat} /></Row>
          </dl>
          <div>
            <p className="mb-2 flex items-center gap-1 text-[13px] font-semibold text-fg">{tx('حجز المخزون', 'Stock to hold')}<InfoHint>{tx('السطر كاملًا من أول مستودع يكفيه، وإلا يُقسم.', 'Each line from the first warehouse that covers it, else split.')}</InfoHint></p>
            <ul className="space-y-1.5 text-sm">{q.lines.map((l) => <li key={l.opt.sku} className="flex items-center justify-between gap-2"><span className="truncate text-fg">{l.opt.name[lang]}{l.opt.variant && ` · ${l.opt.variant[lang]}`}</span><b className="tabular-nums">× {l.qty}</b></li>)}</ul>
          </div>
          {d.pay === 'link' && <Alert tone="warn">{tx('يُحجز المخزون والطلب غير مدفوع. ألغِه إن لم يدفع العميل.', 'Stock is held while the order is unpaid. Cancel it if the customer does not pay.')}</Alert>}
          <p className={cn('text-xs text-muted')}>{tx('لا رسالة للعميل من هنا. يُسجّل في سجل الطلب باسمك.', 'No message is sent to the customer. Logged on the order under your name.')}</p>
        </Modal>
      )}
    </div>
  );
}
