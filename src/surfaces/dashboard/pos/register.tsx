// The counter (`#/dashboard/pos`): sign in with a PIN at a location, open the drawer, then scan or search, build the
// cart (variants, customer or walk-in, discount with reason), hold or charge. Phone and tablet first: one column with
// a sticky charge bar on phones, two columns from `lg`. Rules live in merchant/pos.ts.
import { useMemo, useRef, useState } from 'react';
import { Lock, Minus, PauseCircle, Percent, Plus, ScanLine, Search, Trash2, User, UserPlus, X } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { useReviewMode } from '../../../core/review';
import { allLocations } from '../../merchant/domain';
import { customersStore, levelsStore, logAction, productsStore, teamStore } from '../../merchant/stores';
import { parseMoney } from '../../merchant/catalog';
import {
  addToCart, canApprove, canSell, checkDiscount, emptyCart, lookup, nextHeldId, nextShiftId, openShiftAt, pinMatches, posSkus, sellableAt,
  setQty, shortLines, totals, validPin, type PosDiscount, type PosSku,
} from '../../merchant/pos';
import type { Product } from '../../merchant/catalog';
import { Button, Card, CardHeader, EmptyState, IconButton, InfoHint, Money, ProductImage, Ref, Segmented, cn, useTx } from '../../../ds/ui';
import { Alert, Field, Input, Modal, Select, useToast } from '../../../ds/kit';
import { listPhoto } from '../products/model';
import { useUnsaved } from '../unsaved';
import { posStore, setPos } from './state';
import { PayModal } from './pay';

export const now = () => Date.now();
const memberOf = (id: string | undefined) => teamStore.get().members.find((m) => m.id === id);

/** Sign in at the counter: location, cashier, PIN. */
export function SignIn() {
  const tx = useTx();
  const { lang } = useLang();
  const review = useReviewMode();
  const team = teamStore.use();
  const s = posStore.use();
  const locs = allLocations().filter((l) => l.active);
  const cashiers = team.members.filter((m) => m.status === 'active' && canSell(m.role));
  const [loc, setLoc] = useState(locs.find((l) => l.kind === 'branch')?.id ?? locs[0]?.id ?? '');
  const [who, setWho] = useState(cashiers[0]?.id ?? '');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = () => {
    if (!validPin(pin)) return setErr(tx('الرمز من 4 إلى 6 أرقام', 'PIN is 4 to 6 digits'));
    if (!s.pins[who]) return setErr(tx('لا رمز لهذا الموظف. يضبطه المالك من إعدادات نقطة البيع.', 'No PIN for this member. The owner sets it in POS settings.'));
    if (!pinMatches(s.pins, who, pin)) { setPin(''); return setErr(tx('الرمز غير صحيح', 'Wrong PIN')); }
    setPos(() => ({ session: { memberId: who, loc } }));
    logAction('orders', { ar: `دخول نقطة البيع: ${memberOf(who)?.name} في ${allLocations().find((l) => l.id === loc)?.name.ar}`, en: `POS sign-in: ${memberOf(who)?.name} at ${allLocations().find((l) => l.id === loc)?.name.en}` });
  };
  if (!cashiers.length) return <Card><EmptyState as="h2" icon={<User className="size-6" aria-hidden="true" />} title={tx('لا يوجد موظف يمكنه البيع', 'No one can sell at the counter')}>{tx('أضف عضوًا بدور المالك أو التجهيز من الفريق.', 'Add a member with the owner or fulfilment role in Team.')}</EmptyState></Card>;
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader title={<span className="inline-flex items-center gap-2"><Lock className="size-4" aria-hidden="true" />{tx('افتح الكاشير', 'Open the register')}</span>} hint={tx('كل بيع يُسجَّل باسم الموظف وموقعه. الرمز يُحفظ في الجلسة كمحاكاة؛ المنصة الحقيقية تشفّره في الخادم.', 'Every sale is recorded with the cashier and location. The PIN is kept in this session as a simulation; the real platform hashes it on the server.')} />
      <div className="space-y-4 px-5 pb-5">
        <Field label={tx('الفرع أو الموقع', 'Branch or location')} hint={locs.some((l) => l.kind === 'branch') ? undefined : tx('لا فروع بعد؛ أضفها من المخزون ← المواقع', 'No branches yet; add them in Inventory → Locations')}>
          {(p) => <Select {...p} value={loc} onChange={(e) => setLoc(e.target.value)}>{locs.map((l) => <option key={l.id} value={l.id}>{l.name[lang]}{l.kind === 'branch' ? '' : ` · ${tx('مستودع', 'warehouse')}`}</option>)}</Select>}
        </Field>
        <Field label={tx('الكاشير', 'Cashier')}>
          {(p) => <Select {...p} value={who} onChange={(e) => { setWho(e.target.value); setErr(null); }}>{cashiers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>}
        </Field>
        <Field label={tx('الرمز السري', 'PIN')} error={err} hint={review ? tx('تجريبي: سارة 1234، فيصل 2468', 'Demo: سارة 1234, فيصل 2468') : undefined}>
          {(p) => <Input {...p} type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => { setPin(e.target.value); setErr(null); }} onKeyDown={(e) => e.key === 'Enter' && submit()} dir="ltr" className="text-center text-lg tracking-[.5em]" />}
        </Field>
        <Button className="w-full" size="lg" onClick={submit} disabled={!loc || !who}>{tx('دخول', 'Sign in')}</Button>
      </div>
    </Card>
  );
}

/** Opening float: cash in the drawer when the shift starts. */
export function OpenShift() {
  const tx = useTx();
  const { lang } = useLang();
  const s = posStore.use();
  const toast = useToast();
  const [v, setV] = useState('');
  const amount = parseMoney(v);
  const m = memberOf(s.session?.memberId);
  const loc = allLocations().find((l) => l.id === s.session?.loc);
  const open = () => {
    if (amount === null || !s.session || !m) return;
    const id = nextShiftId(s.shifts);
    setPos((x) => ({ shifts: [{ id, loc: s.session!.loc, cashier: { id: m.id, name: m.name }, openedAt: now(), float: amount, moves: [], cashRefunds: [] }, ...x.shifts] }));
    logAction('finance', { ar: `فتح وردية ${id} بعهدة ${(amount / 100).toFixed(2)} ر.س`, en: `Opened shift ${id} with a ${(amount / 100).toFixed(2)} SAR float` }, { target: id });
    toast({ tone: 'ok', text: tx(`فُتحت الوردية ${id}`, `Shift ${id} opened`) });
  };
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader title={tx('افتح الوردية', 'Open the shift')} hint={tx('عُدّ النقد في الدرج قبل أول بيع. يُقارن به عند الإغلاق.', 'Count the cash in the drawer before the first sale. It is compared at close.')} />
      <div className="space-y-4 px-5 pb-5">
        <p className="text-sm text-muted">{m?.name} · {loc?.name[lang]}</p>
        <Field label={tx('النقد الافتتاحي (ر.س)', 'Opening cash (SAR)')} error={v && amount === null ? tx('مبلغ غير صحيح', 'Invalid amount') : null}>
          {(p) => <Input {...p} inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="0.00" dir="ltr" />}
        </Field>
        <Button className="w-full" size="lg" onClick={open} disabled={amount === null}>{tx('افتح الوردية', 'Open shift')}</Button>
      </div>
    </Card>
  );
}

/** Variant picker for products with variants. */
function VariantPick({ p, loc, onPick, onClose }: { p: Product; loc: string; onPick: (s: PosSku) => void; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const levels = levelsStore.use();
  return (
    <Modal title={p.name[lang]} description={tx('اختر الخيار', 'Pick an option')} onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button>}>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {posSkus(p).map((v) => {
          const st = sellableAt(levels, v.sku, loc);
          return (
            <li key={v.sku}>
              <button type="button" disabled={!st} onClick={() => onPick(v)} className="w-full rounded-xl border border-border p-3 text-start transition-colors hover:border-brand-300 disabled:opacity-40">
                <span className="block text-sm font-semibold text-fg">{v.variant?.[lang]}</span>
                <span className="mt-1 flex items-center justify-between text-xs text-muted"><Money v={v.unit} /><span>{st ? tx(`${st} متاح`, `${st} left`) : tx('نفد هنا', 'Out here')}</span></span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

/** Customer: search by phone or name, add a new one, or sell as walk-in. */
function CustomerPick({ onClose }: { onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const customers = customersStore.use();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const qn = q.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\s+/g, '');
  const hits = q.trim() ? customers.filter((c) => c.phone.replace(/\s+/g, '').includes(qn) || c.name.ar.includes(q.trim()) || c.name.en.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  const phoneOk = /^(?:\+?966|0)5\d{8}$/.test(phone.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[\s-]/g, ''));
  const pick = (id: string | null) => { setPos((s) => ({ cart: { ...s.cart, customerId: id } })); onClose(); };
  const add = () => {
    if (!name.trim() || !phoneOk) return;
    const id = `C-${customers.reduce((m, c) => Math.max(m, Number(c.id.replace(/\D/g, '')) || 0), 1000) + 1}`;
    const loc = allLocations().find((l) => l.id === posStore.get().session?.loc);
    customersStore.set((l) => [...l, { id, name: { ar: name.trim(), en: name.trim() }, city: loc?.city ?? { ar: '', en: '' }, email: '', phone: phone.trim(), consent: { email: false, sms: false }, since: new Date().toISOString().slice(0, 10) }]);
    logAction('orders', { ar: `أضاف عميلًا من نقطة البيع: ${name.trim()}`, en: `Added a customer at POS: ${name.trim()}` }, { target: id });
    pick(id);
  };
  return (
    <Modal title={tx('العميل', 'Customer')} onClose={onClose} footer={<><Button variant="secondary" onClick={() => pick(null)}>{tx('عميل حضوري', 'Walk-in')}</Button>{adding && <Button onClick={add} disabled={!name.trim() || !phoneOk}>{tx('أضف واختر', 'Add and select')}</Button>}</>}>
      {!adding ? (
        <>
          <Field label={tx('جوال أو اسم', 'Mobile or name')}>{(p) => <Input {...p} value={q} onChange={(e) => setQ(e.target.value)} placeholder="05…" />}</Field>
          <ul className="divide-y divide-border">
            {hits.map((c) => <li key={c.id}><button type="button" onClick={() => pick(c.id)} className="flex w-full items-center justify-between gap-3 py-2.5 text-start text-sm hover:text-brand-700"><span className="font-semibold text-fg">{c.name[lang]}</span><Ref>{c.phone}</Ref></button></li>)}
          </ul>
          {q.trim() && !hits.length && <p className="text-sm text-muted">{tx('لا عميل بهذا البحث.', 'No customer matches.')}</p>}
          <Button variant="soft" onClick={() => { setAdding(true); if (/^[\d٠-٩+\s]+$/.test(q)) setPhone(q); else setName(q); }}><UserPlus className="size-4" aria-hidden="true" />{tx('عميل جديد', 'New customer')}</Button>
        </>
      ) : (
        <>
          <Field label={tx('الاسم', 'Name')}>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label={tx('الجوال', 'Mobile')} error={phone && !phoneOk ? tx('مثال: 05xxxxxxxx', 'e.g. 05xxxxxxxx') : null}>{(p) => <Input {...p} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" dir="ltr" />}</Field>
          <p className="text-xs text-muted">{tx('لا موافقة تسويقية تلقائيًا؛ يُسأل العميل لاحقًا.', 'No marketing consent by default; the customer is asked later.')}</p>
        </>
      )}
    </Modal>
  );
}

/** Discount with a reason. Above the cashier's role limit, a manager approves with their PIN. */
function DiscountModal({ onClose }: { onClose: () => void }) {
  const tx = useTx();
  const s = posStore.use();
  const team = teamStore.use();
  const cashier = memberOf(s.session?.memberId);
  const [kind, setKind] = useState<'pct' | 'amount'>(s.cart.discount?.kind ?? 'pct');
  const [v, setV] = useState(s.cart.discount ? (s.cart.discount.kind === 'pct' ? String(s.cart.discount.value) : (s.cart.discount.value / 100).toFixed(2)) : '');
  const [reason, setReason] = useState(s.cart.discount?.reason ?? '');
  const [mgr, setMgr] = useState('');
  const [pin, setPin] = useState('');
  const [tried, setTried] = useState(false);
  if (!cashier) return null;
  const value = kind === 'pct' ? Number(v.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))) : parseMoney(v) ?? NaN;
  const d: PosDiscount = { kind, value, reason };
  const base = checkDiscount(s.cart, d, cashier.role, s.limits);
  const sub = totals(s.cart).subtotal;
  const pct = kind === 'pct' ? value : sub ? (value * 100) / sub : 0;
  const managers = team.members.filter((m) => m.status === 'active' && m.id !== cashier.id && canApprove(m.role, 'discount', s.limits, pct));
  const approvedBy = base === 'overLimit' && mgr && pinMatches(s.pins, mgr, pin) ? memberOf(mgr)?.name : undefined;
  const err = base === 'overLimit' && approvedBy ? null : base;
  const apply = () => {
    setTried(true);
    if (err) return;
    setPos((x) => ({ cart: { ...x.cart, discount: { ...d, reason: reason.trim(), approvedBy } } }));
    logAction('orders', { ar: `خصم في نقطة البيع ${kind === 'pct' ? `${value}%` : `${(value / 100).toFixed(2)} ر.س`}: ${reason.trim()}${approvedBy ? ` (اعتمده ${approvedBy})` : ''}`, en: `POS discount ${kind === 'pct' ? `${value}%` : `${(value / 100).toFixed(2)} SAR`}: ${reason.trim()}${approvedBy ? ` (approved by ${approvedBy})` : ''}` });
    onClose();
  };
  const msg = (e: typeof err) => e && ({ value: tx('قيمة غير صحيحة', 'Invalid value'), reason: tx('اكتب السبب', 'Give a reason'), overLimit: tx(`حدّك ${s.limits[cashier.role]}٪. يلزم اعتماد مدير.`, `Your limit is ${s.limits[cashier.role]}%. A manager must approve.`), exceedsTotal: tx('أكبر من قيمة السلة', 'More than the cart') })[e];
  return (
    <Modal title={tx('خصم على السلة', 'Cart discount')} onClose={onClose}
      footer={<>{s.cart.discount && <Button variant="ghost" onClick={() => { setPos((x) => ({ cart: { ...x.cart, discount: null } })); onClose(); }}>{tx('أزل الخصم', 'Remove discount')}</Button>}<Button onClick={apply}>{tx('طبّق الخصم', 'Apply discount')}</Button></>}>
      <Segmented label={tx('نوع الخصم', 'Discount type')} value={kind} onChange={setKind} options={[{ value: 'pct', label: tx('نسبة ٪', 'Percent %') }, { value: 'amount', label: tx('مبلغ', 'Amount') }]} />
      <Field label={kind === 'pct' ? tx('النسبة', 'Percent') : tx('المبلغ (ر.س)', 'Amount (SAR)')} error={tried && (err === 'value' || err === 'exceedsTotal') ? msg(err) : null} hint={tx(`حد دورك: ${s.limits[cashier.role]}٪`, `Your role's limit: ${s.limits[cashier.role]}%`)}>
        {(p) => <Input {...p} inputMode="decimal" dir="ltr" value={v} onChange={(e) => setV(e.target.value)} />}
      </Field>
      <Field label={tx('السبب', 'Reason')} error={tried && err === 'reason' ? msg(err) : null}>{(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tx('مثال: منتج معروض', 'e.g. display item')} />}</Field>
      {base === 'overLimit' && (
        <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-sm font-semibold text-fg">{msg('overLimit')}</p>
          {managers.length ? <>
            <Field label={tx('المدير', 'Manager')}>{(p) => <Select {...p} value={mgr} onChange={(e) => setMgr(e.target.value)}><option value="">{tx('اختر', 'Choose')}</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>}</Field>
            <Field label={tx('رمز المدير', 'Manager PIN')} error={tried && mgr && pin && !approvedBy ? tx('الرمز غير صحيح', 'Wrong PIN') : null}>{(p) => <Input {...p} type="password" inputMode="numeric" dir="ltr" value={pin} onChange={(e) => setPin(e.target.value)} />}</Field>
          </> : <p className="text-sm text-muted">{tx('لا يوجد مدير بحد كافٍ. خفّض الخصم.', 'No manager has a high enough limit. Lower the discount.')}</p>}
        </div>
      )}
    </Modal>
  );
}

export function Register() {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const s = posStore.use();
  const products = productsStore.use();
  const levels = levelsStore.use();
  const customers = customersStore.use();
  const [q, setQ] = useState('');
  const [variantOf, setVariantOf] = useState<Product | null>(null);
  const [dialog, setDialog] = useState<'customer' | 'discount' | 'pay' | 'hold' | null>(null);
  const [holdNote, setHoldNote] = useState('');
  const scan = useRef<HTMLInputElement>(null);
  const loc = s.session!.loc;
  const cashier = memberOf(s.session!.memberId)!;
  const shift = openShiftAt(s.shifts, loc)!;
  const found = useMemo(() => lookup(products, q), [products, q]);
  const t = totals(s.cart);
  const customer = customers.find((c) => c.id === s.cart.customerId);
  const short = shortLines(s.cart, levels, loc);
  useUnsaved(s.cart.lines.length > 0, { ar: 'بيع غير مكتمل في نقطة البيع', en: 'Unfinished POS sale' });

  const add = (sku: PosSku) => {
    const r = addToCart(s.cart, sku, sellableAt(levels, sku.sku, loc));
    if (r.error) return toast({ tone: 'bad', text: r.error === 'noStock' ? tx('نفد هذا المنتج في هذا الموقع', 'Out of stock at this location') : tx('لا يوجد مخزون إضافي هنا', 'No more stock here') });
    setPos(() => ({ cart: r.cart }));
  };
  const tap = (p: Product) => (p.variants.length ? setVariantOf(p) : add(posSkus(p)[0]));
  const onScan = () => {
    if (found.exact) { add(found.exact); setQ(''); }
    else if (found.products.length === 1 && q.trim()) { tap(found.products[0]); setQ(''); }
  };
  const qty = (sku: string, n: number) => {
    const r = setQty(s.cart, sku, n, sellableAt(levels, sku, loc));
    if (r.error) return toast({ tone: 'bad', text: tx('لا يوجد مخزون إضافي هنا', 'No more stock here') });
    setPos(() => ({ cart: r.cart }));
  };
  const hold = () => {
    const id = nextHeldId(s.held);
    setPos((x) => ({ held: [{ id, cart: x.cart, loc, by: cashier.name, at: now(), note: holdNote.trim() }, ...x.held], cart: emptyCart(), tenders: [], exchange: null }));
    logAction('orders', { ar: `علّق بيعًا ${id} في نقطة البيع`, en: `Held POS sale ${id}` }, { target: id });
    toast({ tone: 'ok', text: tx(`عُلّق البيع ${id}`, `Sale ${id} held`) });
    setDialog(null); setHoldNote('');
  };

  const cartPanel = (
    <Card className="lg:sticky lg:top-20">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button type="button" onClick={() => setDialog('customer')} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-start text-sm hover:text-brand-700">
          <User className="size-4 shrink-0 text-muted" aria-hidden="true" />
          <span className="truncate font-semibold text-fg">{customer ? customer.name[lang] : tx('عميل حضوري', 'Walk-in customer')}</span>
          {customer && <Ref>{customer.phone}</Ref>}
        </button>
        {customer && <IconButton label={tx('إزالة العميل', 'Remove customer')} onClick={() => setPos((x) => ({ cart: { ...x.cart, customerId: null } }))}><X className="size-4" aria-hidden="true" /></IconButton>}
      </div>
      {s.exchange && <div className="px-4 pt-3"><Alert tone="info" title={tx(`استبدال من الطلب ${s.exchange.orderRef}`, `Exchange from order ${s.exchange.orderRef}`)}>{tx('رصيد الاستبدال: ', 'Exchange credit: ')}<Money v={s.exchange.credit} /> <Button size="sm" variant="ghost" onClick={() => setPos(() => ({ exchange: null, tenders: [] }))}>{tx('إلغاء الاستبدال', 'Cancel exchange')}</Button></Alert></div>}
      {s.cart.lines.length === 0 ? (
        <EmptyState icon={<ScanLine className="size-6" aria-hidden="true" />} title={tx('السلة فارغة', 'Cart is empty')}>{tx('امسح الباركود أو ابحث عن منتج.', 'Scan a barcode or search for a product.')}</EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {s.cart.lines.map((l) => {
            const max = sellableAt(levels, l.sku, loc);
            return (
              <li key={l.sku} className={cn('flex items-center gap-3 px-4 py-3', short.includes(l.sku) && 'bg-red-500/5')}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-fg">{l.name[lang]}</p>
                  <p className="text-xs text-muted">{l.variant?.[lang] && <span>{l.variant[lang]} · </span>}<Ref>{l.sku}</Ref>{short.includes(l.sku) && <span className="text-red-600"> · {tx(`المتاح ${max}`, `${max} available`)}</span>}</p>
                </div>
                <div className="flex items-center gap-1">
                  <IconButton label={tx('أنقص', 'Decrease')} className="size-8" onClick={() => qty(l.sku, l.qty - 1)}>{l.qty === 1 ? <Trash2 className="size-4" aria-hidden="true" /> : <Minus className="size-4" aria-hidden="true" />}</IconButton>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">{l.qty}</span>
                  <IconButton label={tx('زد', 'Increase')} className="size-8" onClick={() => qty(l.sku, l.qty + 1)} disabled={l.qty >= max}><Plus className="size-4" aria-hidden="true" /></IconButton>
                </div>
                <Money v={l.unit * l.qty} className="w-20 justify-end text-sm font-semibold text-fg" />
              </li>
            );
          })}
        </ul>
      )}
      <div className="space-y-1 border-t border-border px-4 py-3 text-sm">
        <div className="flex justify-between text-muted"><span>{tx('المجموع', 'Subtotal')}</span><Money v={t.subtotal} /></div>
        <div className="flex items-center justify-between text-muted">
          <button type="button" onClick={() => setDialog('discount')} disabled={!s.cart.lines.length} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline disabled:opacity-40 dark:text-brand-300"><Percent className="size-3.5" aria-hidden="true" />{s.cart.discount ? tx('الخصم', 'Discount') : tx('أضف خصمًا', 'Add discount')}</button>
          {t.discount > 0 && <span className="flex items-center gap-1">−<Money v={t.discount} /></span>}
        </div>
        {s.cart.discount && <p className="text-xs text-subtle">{s.cart.discount.reason}{s.cart.discount.approvedBy && ` · ${tx('اعتمده', 'approved by')} ${s.cart.discount.approvedBy}`}</p>}
        <div className="flex justify-between text-muted"><span>{tx('ضريبة القيمة المضافة (مشمولة)', 'VAT (included)')}</span><Money v={t.vat} /></div>
        <div className="flex justify-between pt-1 text-lg font-bold text-fg"><span>{tx('الإجمالي', 'Total')}</span><Money v={t.total} /></div>
      </div>
      <div className="flex gap-2 border-t border-border p-4">
        <Button variant="secondary" onClick={() => setDialog('hold')} disabled={!s.cart.lines.length}><PauseCircle className="size-4" aria-hidden="true" />{tx('علّق', 'Hold')}</Button>
        <Button size="lg" className="flex-1 bg-brand-gradient" onClick={() => setDialog('pay')} disabled={!s.cart.lines.length || short.length > 0}>{tx('ادفع', 'Charge')} <Money v={t.total} /></Button>
      </div>
    </Card>
  );

  return (
    <div className="grid grid-cols-1 gap-4 pb-24 lg:grid-cols-[minmax(0,1fr)_400px] lg:pb-0">
      <div className="min-w-0 space-y-4">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <ScanLine className="pointer-events-none absolute top-1/2 start-3 size-5 -translate-y-1/2 text-subtle" aria-hidden="true" />
            <input ref={scan} type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onScan()}
              aria-label={tx('امسح الباركود أو ابحث بالاسم أو SKU', 'Scan a barcode or search by name or SKU')} placeholder={tx('امسح الباركود أو ابحث بالاسم أو SKU', 'Scan barcode or search name / SKU')}
              className="h-12 w-full rounded-xl border border-border bg-surface ps-11 pe-3 text-[15px] text-fg placeholder:text-subtle focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15" />
          </div>
          <InfoHint>{tx('قارئ الباركود يكتب الرمز ثم Enter فيُضاف المنتج مباشرة. يقبل الأرقام العربية.', 'A barcode scanner types the code then Enter, adding the item at once. Arabic digits work.')}</InfoHint>
        </div>
        {short.length > 0 && <Alert tone="bad" title={tx('تغيّر المخزون', 'Stock changed')}>{tx('بعض الأصناف أكثر من المتاح هنا الآن. عدّل الكمية.', 'Some lines exceed what is available here now. Adjust the quantity.')}</Alert>}
        {found.products.length === 0 ? (
          <Card><EmptyState icon={<Search className="size-6" aria-hidden="true" />} title={tx('لا نتائج', 'No results')} action={<Button variant="secondary" onClick={() => setQ('')}>{tx('امسح البحث', 'Clear search')}</Button>}>{tx('جرّب SKU أو جزءًا من الاسم.', 'Try a SKU or part of the name.')}</EmptyState></Card>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {found.products.map((p) => {
              const st = posSkus(p).reduce((a, x) => a + Math.max(0, sellableAt(levels, x.sku, loc) - (s.cart.lines.find((l) => l.sku === x.sku)?.qty ?? 0)), 0);
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => tap(p)} disabled={!st} className="flex h-full w-full flex-col rounded-2xl border border-border bg-surface p-3 text-start shadow-card transition-colors hover:border-brand-300 disabled:opacity-50">
                    <ProductImage src={listPhoto(p)} alt={p.name[lang]} size={64} className="w-full !h-24" />
                    <span className="mt-2 line-clamp-2 text-[13px] font-semibold text-fg">{p.name[lang]}</span>
                    <span className="mt-auto flex items-center justify-between gap-2 pt-1.5 text-xs text-muted"><Money v={p.price} className="font-semibold text-fg" /><span>{st ? (p.variants.length ? tx(`${p.variants.length} خيارات`, `${p.variants.length} options`) : tx(`${st} متاح`, `${st} left`)) : tx('نفد هنا', 'Out here')}</span></span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div id="pos-cart">{cartPanel}</div>
      {s.cart.lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 p-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <a href="#pos-cart" onClick={(e) => { e.preventDefault(); document.getElementById('pos-cart')?.scrollIntoView({ behavior: 'smooth' }); }} className="min-w-0 flex-1 text-sm"><span className="block text-muted">{tx(`${t.units} قطعة`, `${t.units} items`)}</span><Money v={t.total} className="text-base font-bold text-fg" /></a>
            <Button size="lg" className="bg-brand-gradient" onClick={() => setDialog('pay')} disabled={short.length > 0}>{tx('ادفع', 'Charge')}</Button>
          </div>
        </div>
      )}
      {variantOf && <VariantPick p={variantOf} loc={loc} onClose={() => setVariantOf(null)} onPick={(v) => { add(v); setVariantOf(null); }} />}
      {dialog === 'customer' && <CustomerPick onClose={() => setDialog(null)} />}
      {dialog === 'discount' && <DiscountModal onClose={() => setDialog(null)} />}
      {dialog === 'hold' && (
        <Modal title={tx('علّق البيع', 'Hold this sale')} description={tx('تُحفظ السلة ويُفرَّغ الكاشير لعميل آخر. لا يُحجز المخزون أثناء التعليق.', 'The cart is saved and the register is free for the next customer. Stock is not held while on hold.')} onClose={() => setDialog(null)}
          footer={<><Button variant="secondary" onClick={() => setDialog(null)}>{tx('رجوع', 'Back')}</Button><Button onClick={hold}>{tx('علّق البيع', 'Hold sale')}</Button></>}>
          <Field label={tx('ملاحظة', 'Note')} optional>{(p) => <Input {...p} value={holdNote} onChange={(e) => setHoldNote(e.target.value)} placeholder={tx('مثال: سيعود بعد قليل', 'e.g. coming back shortly')} />}</Field>
          <p className="text-sm text-muted">{tx(`${t.units} قطعة · `, `${t.units} items · `)}<Money v={t.total} /></p>
        </Modal>
      )}
      {dialog === 'pay' && <PayModal shift={shift} cashier={cashier} onClose={() => setDialog(null)} />}
    </div>
  );
}
