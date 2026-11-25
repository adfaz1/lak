// One influencer (`#/dashboard/marketing/influencers/<id>`): handles, tracked link & code, collaborations with brief,
// deliverables (planned → delivered/missed, late flagged), gifted products sent as zero-priced manual orders (the
// orders section's own createManual, stock held), the cost the merchant enters, and results (orders, sales, ROI).
import { useMemo, useState } from 'react';
import { CalendarClock, Check, Gift, Pencil, Plus, Trash2, UserX, X } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link } from '../../../core/router';
import { customersStore, levelsStore, logAction, ordersStore, productsStore, settingsStore } from '../../merchant/stores';
import { CITIES } from '../../merchant/domain';
import {
  DELIVERABLE_KINDS, SOCIAL_PLATFORMS, collabFromDraft, collabResults, deliverableState, numIn, validateCollab,
  type Collab, type CollabDraft, type CollabError, type DeliverableKind, type DeliverableState, type Partner, type SocialPlatform,
} from '../../merchant/growth';
import { Badge, Button, Card, CardHeader, EmptyState, IconButton, Money, Ref, useTx } from '../../../ds/ui';
import { Field, Input, Modal, PageHeader, Select, Simulated, Textarea, useToast } from '../../../ds/kit';
import { useUnsaved } from '../unsaved';
import { createManual, emptyManual, manualQuote, skuOptions, validPhone, type ManualDraft } from '../orders/model';
import { auditOrder, useActor } from '../orders/ui';
import { Kpi } from './loyalty';
import { TODAY } from './model';
import { ExampleTag, LinkCodeCard, PartnerModal, platformName, useCommission } from './affiliate-parts';
import { collabDraftStore, collabsStore, partnersStore } from './affiliates-store';
import { roiText } from './influencers';

const kindName = (k: DeliverableKind, tx: (a: string, e: string) => string) => ({ post: tx('منشور', 'Post'), story: tx('قصة', 'Story'), reel: tx('مقطع قصير', 'Reel'), video: tx('فيديو', 'Video'), live: tx('بث مباشر', 'Live') })[k];
const emptyCollab = (): CollabDraft => ({ title: '', brief: '', starts: TODAY, ends: '', fee: '', deliverables: [{ kind: 'post', platform: 'instagram', due: '' }] });

export default function InfluencerDetail({ id, canManage }: { id: string; canManage: boolean }) {
  const tx = useTx();
  const p = partnersStore.use().find((x) => x.id === id && x.kind === 'influencer');
  const collabs = collabsStore.use().filter((c) => c.partnerId === id);
  const products = productsStore.use();
  const orders = ordersStore.use();
  const { lines } = useCommission();
  const [edit, setEdit] = useState(false);
  const [newCollab, setNewCollab] = useState(false);
  const back = { href: link('/dashboard/marketing/influencers'), label: tx('المؤثرون', 'Influencers') };
  if (!p) return (
    <div className="space-y-6"><PageHeader back={back} title={tx('المؤثر غير موجود', 'Influencer not found')} />
      <Card><EmptyState as="h2" icon={<UserX className="size-6" aria-hidden="true" />} title={tx('ربما حُذف أو الرابط خاطئ', 'It may have been removed, or the link is wrong')} /></Card></div>
  );
  const now = Date.now();
  const res = collabs.filter((c) => c.status !== 'cancelled').map((c) => collabResults(c, lines, orders, now, TODAY));
  const sum = (f: (r: (typeof res)[number]) => number) => res.reduce((s, r) => s + f(r), 0);
  const cost = sum((r) => r.cost), revenue = sum((r) => r.revenue);
  return (
    <div className="space-y-6 pb-20">
      <PageHeader back={back} title={<span className="flex flex-wrap items-center gap-2">{p.name}{p.example && <ExampleTag />}</span>}
        meta={<span className="flex flex-wrap gap-2 text-xs text-muted">{p.handles.map((h) => <span key={h.handle + h.platform}>{platformName(h.platform, tx)} <bdi dir="ltr">{h.handle}</bdi></span>)}</span>}
        actions={canManage ? <div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={() => setEdit(true)}><Pencil className="size-4" aria-hidden="true" />{tx('تعديل', 'Edit')}</Button><Button onClick={() => setNewCollab(true)}><Plus className="size-4" aria-hidden="true" />{tx('تعاون جديد', 'New collaboration')}</Button></div> : undefined} />
      <section aria-label={tx('النتائج', 'Results')} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi label={tx('طلبات', 'Orders')} value={sum((r) => r.orders)} />
        <Kpi label={tx('مبيعات', 'Sales')} value={<Money v={revenue} />} />
        <Kpi label={tx('التكلفة', 'Cost')} hint={tx('الأجر + الهدايا + العمولة', 'Fee + gifts + commission')} value={<Money v={cost} />} />
        <Kpi label={tx('العائد على التكلفة', 'Return on cost')} hint={tx('(المبيعات − التكلفة) ÷ التكلفة. المبيعات قبل تكلفة البضاعة.', '(Sales − cost) ÷ cost. Sales before cost of goods.')} value={roiText(cost ? (revenue - cost) / cost : null, tx)} />
      </section>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {collabs.length === 0 ? <Card><EmptyState icon={<CalendarClock className="size-6" aria-hidden="true" />} title={tx('لا تعاونات بعد', 'No collaborations yet')} action={canManage ? <Button onClick={() => setNewCollab(true)}><Plus className="size-4" aria-hidden="true" />{tx('تعاون جديد', 'New collaboration')}</Button> : undefined}>{tx('اكتب الفكرة والمخرجات وتواريخها والأجر.', 'Write the brief, the deliverables with dates, and the fee.')}</EmptyState></Card>
            : collabs.map((c) => <CollabCard key={c.id} c={c} p={p} canManage={canManage} />)}
        </div>
        <Card aria-labelledby="h-ilink"><CardHeader id="h-ilink" title={tx('الرابط والكود', 'Link & code')} hint={tx('الطلبات بهذا الكود أو الرابط تُحتسب للمؤثر.', 'Orders with this code or link are credited to the influencer.')} /><LinkCodeCard p={p} products={products} /></Card>
      </div>
      {edit && <PartnerModal kind="influencer" editing={p} onClose={() => setEdit(false)} />}
      {newCollab && <CollabModal partner={p} onClose={() => setNewCollab(false)} />}
    </div>
  );
}

function CollabCard({ c, p, canManage }: { c: Collab; p: Partner; canManage: boolean }) {
  const tx = useTx();
  const toast = useToast();
  const orders = ordersStore.use();
  const { lines } = useCommission();
  const r = collabResults(c, lines, orders, Date.now(), TODAY);
  const [deliver, setDeliver] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [gift, setGift] = useState(false);
  const [fee, setFee] = useState<string | null>(null);
  const upd = (fn: (x: Collab) => Collab, what: { ar: string; en: string }) => { collabsStore.set((l) => l.map((x) => (x.id === c.id ? fn(x) : x))); logAction('marketing', what, { target: c.id }); };
  const stTone: Record<DeliverableState, Parameters<typeof Badge>[0]['tone']> = { planned: 'gray', due: 'amber', late: 'red', delivered: 'green', missed: 'gray' };
  const stText = (s: DeliverableState) => ({ planned: tx('مخطط', 'Planned'), due: tx('مستحق اليوم', 'Due today'), late: tx('متأخر', 'Late'), delivered: tx('نُشر', 'Delivered'), missed: tx('لم يُنشر', 'Missed') })[s];
  const statusText = { active: tx('نشط', 'Active'), done: tx('مكتمل', 'Done'), cancelled: tx('ملغى', 'Cancelled') }[c.status];
  const feeVal = fee === null ? null : numIn(fee);
  return (
    <Card aria-labelledby={`h-${c.id}`}>
      <CardHeader id={`h-${c.id}`} title={<span className="flex flex-wrap items-center gap-2">{c.title}{c.example && <ExampleTag />}<Badge tone={c.status === 'active' ? 'green' : 'gray'}>{statusText}</Badge></span>}
        hint={c.brief || undefined} action={<span className="text-xs text-muted tabular-nums" dir="ltr">{c.starts} → {c.ends}</span>} />
      <div className="space-y-4 px-5 pb-5">
        <ul className="divide-y divide-border rounded-xl border border-border text-sm">
          {c.deliverables.map((d) => { const s = deliverableState(d, TODAY); return (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span className="min-w-0">{kindName(d.kind, tx)} · {platformName(d.platform, tx)} <span className="text-xs text-muted tabular-nums" dir="ltr">{d.due}</span>{d.done?.url && <a className="ms-2 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300" href={d.done.url} target="_blank" rel="noopener noreferrer">{tx('الرابط', 'Link')}</a>}</span>
              <span className="flex items-center gap-1"><Badge tone={stTone[s]}>{stText(s)}</Badge>
                {canManage && c.status === 'active' && (s === 'delivered' || s === 'missed'
                  ? <Button size="sm" variant="ghost" onClick={() => upd((x) => ({ ...x, deliverables: x.deliverables.map((y) => (y.id === d.id ? { ...y, done: undefined, missed: undefined } : y)) }), { ar: `إعادة فتح مخرج في ${c.title}`, en: `Reopened a deliverable in ${c.title}` })}>{tx('تراجع', 'Undo')}</Button>
                  : <><IconButton label={tx('نُشر', 'Mark delivered')} onClick={() => { setDeliver(d.id); setUrl(''); }}><Check className="size-4" aria-hidden="true" /></IconButton>
                    <IconButton label={tx('لم يُنشر', 'Mark missed')} onClick={() => upd((x) => ({ ...x, deliverables: x.deliverables.map((y) => (y.id === d.id ? { ...y, missed: true } : y)) }), { ar: `مخرج لم يُنشر في ${c.title}`, en: `Deliverable missed in ${c.title}` })}><X className="size-4" aria-hidden="true" /></IconButton></>)}
              </span>
            </li>
          ); })}
        </ul>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-muted">{tx('طلبات · مبيعات', 'Orders · sales')}</dt><dd className="font-semibold text-fg tabular-nums">{r.orders} · <Money v={r.revenue} /></dd></div>
          <div><dt className="text-xs text-muted">{tx('الأجر', 'Fee')}</dt><dd className="font-semibold text-fg">{c.fee ? <Money v={c.fee} /> : tx('لم يُدخل', 'Not entered')}</dd></div>
          <div><dt className="text-xs text-muted">{tx('هدايا', 'Gifts')}</dt><dd className="font-semibold text-fg"><Money v={r.gifts} /> <span className="text-xs font-normal text-muted">{c.gifts.map((g) => <a key={g.ref} className="ms-1 hover:text-brand-700" href={link(`/dashboard/orders/${g.ref}`)}>#<Ref>{g.ref}</Ref></a>)}</span></dd></div>
          <div><dt className="text-xs text-muted">{tx('العائد', 'ROI')}</dt><dd className="font-semibold text-fg tabular-nums">{roiText(r.roi, tx)}</dd></div>
        </dl>
        {canManage && c.status === 'active' && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button size="sm" variant="secondary" onClick={() => setGift(true)}><Gift className="size-4" aria-hidden="true" />{tx('أرسل منتجًا هدية', 'Send a gifted product')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setFee(c.fee ? String(c.fee / 100) : '')}>{tx('أدخل الأجر', 'Enter the fee')}</Button>
            <Button size="sm" variant="ghost" className="ms-auto" onClick={() => { upd((x) => ({ ...x, status: 'done' }), { ar: `إنهاء التعاون ${c.title}`, en: `Completed collaboration ${c.title}` }); toast({ tone: 'ok', text: tx('اكتمل التعاون. النتائج تبقى ظاهرة.', 'Collaboration completed. Results stay visible.') }); }}>{tx('أنهِ التعاون', 'Complete')}</Button>
          </div>
        )}
      </div>
      {deliver && (
        <Modal title={tx('تسجيل النشر', 'Record delivery')} onClose={() => setDeliver(null)} footer={<><Button variant="secondary" onClick={() => setDeliver(null)}>{tx('إلغاء', 'Cancel')}</Button><Button disabled={!!url.trim() && !/^https?:\/\/\S+$/.test(url.trim())} onClick={() => { upd((x) => ({ ...x, deliverables: x.deliverables.map((y) => (y.id === deliver ? { ...y, done: { at: TODAY, url: url.trim() || undefined } } : y)) }), { ar: `تسجيل نشر مخرج في ${c.title}`, en: `Recorded a delivered deliverable in ${c.title}` }); setDeliver(null); }}>{tx('سجّل', 'Record')}</Button></>}>
          <Field label={tx('رابط المنشور', 'Post link')} optional error={url.trim() && !/^https?:\/\/\S+$/.test(url.trim()) ? tx('رابط يبدأ بـ https://', 'A link starting with https://') : null}>{(f) => <Input {...f} dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />}</Field>
        </Modal>
      )}
      {fee !== null && (
        <Modal title={tx('أجر التعاون', 'Collaboration fee')} onClose={() => setFee(null)} footer={<><Button variant="secondary" onClick={() => setFee(null)}>{tx('إلغاء', 'Cancel')}</Button><Button disabled={!(feeVal! >= 0)} onClick={() => { upd((x) => ({ ...x, fee: Math.round(feeVal! * 100) }), { ar: `أجر ${c.title}: ${feeVal} ر.س`, en: `Fee for ${c.title}: SAR ${feeVal}` }); setFee(null); }}>{tx('احفظ', 'Save')}</Button></>}>
          <Field label={tx('المبلغ الذي تدفعه للمؤثر (ر.س)', 'What you pay the influencer (SAR)')} hint={tx('يُستخدم لحساب العائد فقط', 'Used only for the return')} error={fee.trim() && !(feeVal! >= 0) ? tx('مبلغ غير صالح', 'Invalid amount') : null}>{(f) => <Input {...f} dir="ltr" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />}</Field>
        </Modal>
      )}
      {gift && <GiftModal c={c} p={p} onClose={() => setGift(false)} />}
    </Card>
  );
}

/** Gifted product: a zero-priced manual order (full discount, free delivery), created by the orders section's createManual. */
function GiftModal({ c, p, onClose }: { c: Collab; p: Partner; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const who = useActor();
  const products = productsStore.use();
  const levels = levelsStore.use();
  const customers = customersStore.use();
  const zones = settingsStore.use().zones;
  const options = useMemo(() => skuOptions(products, levels, undefined, true).filter((o) => o.total > 0), [products, levels]);
  const [sku, setSku] = useState(options[0]?.sku ?? '');
  const [qty, setQty] = useState('1');
  const [phone, setPhone] = useState(p.phone ?? '');
  const [city, setCity] = useState('Riyadh');
  const [address, setAddress] = useState('');
  const [step, setStep] = useState<'form' | 'preview'>('form');
  const [tried, setTried] = useState(false);
  const base: ManualDraft = { ...emptyManual(), newName: p.name.replace(/^مثال:\s*/, ''), newPhone: phone, newEmail: p.email ?? '', city, address, lines: sku ? [{ sku, qty }] : [], freeShipping: true, pay: 'cash', customerNote: `إهداء ضمن تعاون «${c.title}» · Gift for “${c.title}”` };
  const q0 = manualQuote(base, options, zones, customers);
  const d: ManualDraft = { ...base, discount: (q0.subtotal / 100).toFixed(2) };
  const q = manualQuote(d, options, zones, customers);
  const opt = options.find((o) => o.sku === sku);
  const prod = products.find((x) => x.id === opt?.productId);
  const n = Number(qty.replace(/[٠-٩]/g, (x) => String(x.charCodeAt(0) - 0x0660))) || 0;
  const value = opt ? n * (prod?.cost ?? Math.round(opt.unit / 1.15)) : 0;
  const errs = q.errors;
  const errText = errs.map((e) => ({ phone: tx('جوال سعودي صالح للتوصيل', 'A valid Saudi mobile for delivery'), address: tx('العنوان', 'The address'), city: tx('المدينة', 'The city'), lines: tx('اختر منتجًا', 'Choose a product'), qty: tx('كمية صحيحة', 'A whole quantity'), stock: tx('الكمية أكبر من المتاح', 'More than available') } as Record<string, string>)[e]).filter(Boolean);
  const create = () => {
    const r = createManual(d, { orders: ordersStore.get(), levels: levelsStore.get(), customers: customersStore.get(), products: productsStore.get() }, options, zones, who, Date.now());
    if (!r.order) { setStep('form'); setTried(true); return; }
    const order = { ...r.order, tags: [...(r.order.tags ?? []), 'إهداء مؤثر'] };
    customersStore.set(r.customers);
    levelsStore.set(r.levels);
    if (r.products && r.products !== productsStore.get()) productsStore.set(r.products);
    ordersStore.set((all) => [order, ...all]);
    auditOrder(undefined, order);
    collabsStore.set((l) => l.map((x) => (x.id === c.id ? { ...x, gifts: [...x.gifts, { ref: order.ref, value }] } : x)));
    logAction('marketing', { ar: `إهداء للمؤثر ${p.name} بالطلب #${order.ref} ضمن ${c.title}`, en: `Gift to ${p.name}, order #${order.ref}, for ${c.title}` }, { target: c.id, after: order.ref });
    toast({ tone: 'ok', text: tx(`أُنشئ الطلب #${order.ref} بقيمة صفر وحُجز المخزون.`, `Order #${order.ref} created at zero price; stock held.`) });
    onClose();
  };
  return (
    <Modal title={tx('إرسال منتج هدية', 'Send a gifted product')} onClose={onClose} size="lg"
      footer={step === 'form' ? <><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => { setTried(true); if (!errs.length) setStep('preview'); }}>{tx('راجع', 'Review')}</Button></>
        : <><Button variant="secondary" onClick={() => setStep('form')}>{tx('رجوع', 'Back')}</Button><Button onClick={create}><Gift className="size-4" aria-hidden="true" />{tx('أنشئ طلب الهدية', 'Create the gift order')}</Button></>}>
      {step === 'form' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={tx('المنتج', 'Product')} className="sm:col-span-2">{(f) => <Select {...f} value={sku} onChange={(e) => setSku(e.target.value)}>{options.map((o) => <option key={o.sku} value={o.sku}>{o.name[lang]}{o.variant ? ` · ${o.variant[lang]}` : ''} ({tx(`متاح ${o.total}`, `${o.total} available`)})</option>)}</Select>}</Field>
          <Field label={tx('الكمية', 'Quantity')}>{(f) => <Input {...f} dir="ltr" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />}</Field>
          <Field label={tx('جوال المستلم', 'Recipient mobile')} error={tried && !validPhone(phone) ? tx('جوال سعودي صالح', 'A valid Saudi mobile') : null}>{(f) => <Input {...f} dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}</Field>
          <Field label={tx('المدينة', 'City')}>{(f) => <Select {...f} value={city} onChange={(e) => setCity(e.target.value)}>{CITIES.map((x) => <option key={x.en} value={x.en}>{x[lang]}</option>)}</Select>}</Field>
          <Field label={tx('العنوان', 'Address')} error={tried && !address.trim() ? tx('اكتب العنوان', 'Enter the address') : null}>{(f) => <Input {...f} value={address} onChange={(e) => setAddress(e.target.value)} />}</Field>
          {tried && errText.length > 0 && <p className="text-xs text-red-600 sm:col-span-2 dark:text-red-400">{tx('ناقص: ', 'Missing: ')}{errText.join('، ')}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <dl className="divide-y divide-border rounded-xl border border-border text-sm">
            {[[tx('المستلم', 'Recipient'), `${d.newName} · ${phone}`], [tx('المنتج', 'Product'), `${opt?.name[lang] ?? ''} × ${n}`], [tx('سعر البيع', 'Retail price'), <Money key="s" v={q.subtotal} />], [tx('خصم الإهداء', 'Gift discount'), <span key="d">−<Money v={q.discount} /></span>], [tx('الشحن', 'Shipping'), tx('مجاني', 'Free')], [tx('الإجمالي على المستلم', 'Total to recipient'), <Money key="t" v={q.total} />], [tx('التكلفة المحتسبة على التعاون', 'Cost counted to the collaboration'), <Money key="c" v={value} />]].map(([k, v], i) => (
              <div key={i} className="flex justify-between gap-2 px-4 py-2.5"><dt className="text-muted">{k}</dt><dd className="font-semibold text-fg">{v}</dd></div>
            ))}
          </dl>
          <p className="flex items-start gap-2 text-xs text-muted"><Simulated />{tx('يُنشأ طلب يدوي بقيمة صفر في الطلبات بوسم «إهداء مؤثر» ويُحجز المخزون؛ تجهّزه وتشحنه كأي طلب. لا رسالة للمستلم.', 'A zero-priced manual order is created in Orders, tagged «إهداء مؤثر», stock held; fulfil and ship it like any order. No message is sent.')}</p>
          <p className="text-xs text-muted">{prod?.cost ? tx('التكلفة من تكلفة المنتج.', 'Cost from the product cost.') : tx('لا تكلفة للمنتج؛ استُخدم السعر قبل الضريبة.', 'No product cost; price before VAT used.')}</p>
        </div>
      )}
    </Modal>
  );
}

/** New collaboration: brief, dates, fee and deliverables. The draft stays in the session until added or discarded. */
function CollabModal({ partner, onClose }: { partner: Partner; onClose: () => void }) {
  const tx = useTx();
  const toast = useToast();
  const saved = collabDraftStore.use();
  const d: CollabDraft = saved && saved.partnerId === partner.id ? saved : emptyCollab();
  const dirty = JSON.stringify({ ...d, partnerId: undefined }) !== JSON.stringify({ ...emptyCollab(), partnerId: undefined });
  useUnsaved(dirty, { ar: 'مسودة تعاون', en: 'Collaboration draft' });
  const [tried, setTried] = useState(false);
  const set = (p: Partial<CollabDraft>) => collabDraftStore.set({ ...d, ...p, partnerId: partner.id });
  const errs = validateCollab(d);
  const err = (k: CollabError) => tried && errs.includes(k);
  const add = () => {
    setTried(true);
    if (errs.length) return;
    const c = collabFromDraft(d, `CO-${Date.now().toString(36).toUpperCase()}`, partner.id, tx('أنت', 'You'), TODAY);
    collabsStore.set((l) => [c, ...l]);
    collabDraftStore.set(null);
    logAction('marketing', { ar: `تعاون جديد «${c.title}» مع ${partner.name} (${c.deliverables.length} مخرجات)`, en: `New collaboration “${c.title}” with ${partner.name} (${c.deliverables.length} deliverables)` }, { target: c.id });
    toast({ tone: 'ok', text: tx('أُضيف التعاون. تابع المخرجات من هنا.', 'Collaboration added. Track deliverables here.') });
    onClose();
  };
  return (
    <Modal title={tx(`تعاون جديد مع ${partner.name}`, `New collaboration with ${partner.name}`)} size="lg" onClose={onClose}
      footer={<>{dirty && <Button variant="ghost" className="me-auto" onClick={() => { collabDraftStore.set(null); onClose(); }}>{tx('امسح المسودة', 'Discard draft')}</Button>}<Button variant="secondary" onClick={onClose}>{tx('إغلاق', 'Close')}</Button><Button onClick={add}>{tx('أضف التعاون', 'Add collaboration')}</Button></>}>
      <div className="space-y-4">
        <Field label={tx('العنوان', 'Title')} error={err('title') ? tx('3 أحرف على الأقل', 'At least 3 characters') : null}>{(f) => <Input {...f} value={d.title} onChange={(e) => set({ title: e.target.value })} />}</Field>
        <Field label={tx('الفكرة (Brief)', 'Brief')} optional>{(f) => <Textarea {...f} value={d.brief} onChange={(e) => set({ brief: e.target.value })} />}</Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={tx('من', 'From')} error={err('dates') ? tx('النهاية قبل البداية', 'End before start') : null}>{(f) => <Input {...f} type="date" value={d.starts} onChange={(e) => set({ starts: e.target.value })} />}</Field>
          <Field label={tx('إلى', 'To')}>{(f) => <Input {...f} type="date" value={d.ends} onChange={(e) => set({ ends: e.target.value })} />}</Field>
          <Field label={tx('الأجر (ر.س)', 'Fee (SAR)')} optional error={err('fee') ? tx('مبلغ غير صالح', 'Invalid amount') : null}>{(f) => <Input {...f} dir="ltr" inputMode="decimal" value={d.fee} onChange={(e) => set({ fee: e.target.value })} />}</Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-fg">{tx('المخرجات', 'Deliverables')}</legend>
          {d.deliverables.map((x, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <Select aria-label={tx('النوع', 'Kind')} value={x.kind} onChange={(e) => set({ deliverables: d.deliverables.map((y, j) => (j === i ? { ...y, kind: e.target.value as DeliverableKind } : y)) })}>{DELIVERABLE_KINDS.map((k) => <option key={k} value={k}>{kindName(k, tx)}</option>)}</Select>
              <Select aria-label={tx('المنصة', 'Platform')} value={x.platform} onChange={(e) => set({ deliverables: d.deliverables.map((y, j) => (j === i ? { ...y, platform: e.target.value as SocialPlatform } : y)) })}>{SOCIAL_PLATFORMS.map((s) => <option key={s} value={s}>{platformName(s, tx)}</option>)}</Select>
              <Input aria-label={tx('موعد النشر', 'Due date')} type="date" value={x.due} onChange={(e) => set({ deliverables: d.deliverables.map((y, j) => (j === i ? { ...y, due: e.target.value } : y)) })} />
              <IconButton label={tx('احذف', 'Remove')} onClick={() => set({ deliverables: d.deliverables.filter((_, j) => j !== i) })}><Trash2 className="size-4" aria-hidden="true" /></IconButton>
            </div>
          ))}
          {(err('deliverables') || err('due')) && <p className="text-xs text-red-600 dark:text-red-400">{err('deliverables') ? tx('أضف مخرجًا واحدًا على الأقل', 'Add at least one deliverable') : tx('كل موعد داخل فترة التعاون', 'Every due date inside the collaboration dates')}</p>}
          <Button type="button" size="sm" variant="ghost" onClick={() => set({ deliverables: [...d.deliverables, { kind: 'story', platform: d.deliverables[0]?.platform ?? 'instagram', due: '' }] })}><Plus className="size-4" aria-hidden="true" />{tx('مخرج', 'Deliverable')}</Button>
        </fieldset>
      </div>
    </Modal>
  );
}
