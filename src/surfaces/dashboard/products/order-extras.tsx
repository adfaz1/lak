// What the checkout added to an order (catalogue extras): answers to the store's questions, pre-order terms, delivered
// codes, bookings, bundle parts, download links and the age confirmation. Shown on the order page and its printouts.
import { CalendarClock, Download, KeyRound, ListChecks, PackageOpen, UserCheck } from 'lucide-react';
import { useLang } from '../../../core/lang';
import type { Order } from '../../merchant/domain';
import { Money, cn, useTx } from '../../../ds/ui';
import { Simulated } from '../../../ds/kit';
import { useDay } from './storefront-parts';

export function OrderExtrasCard({ o, canSeeCodes = true }: { o: Order; canSeeCodes?: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const day = useDay();
  const e = o.extras;
  if (!e) return null;
  const row = 'flex items-start gap-2 rounded-xl px-3 py-2 text-xs text-fg';
  return (
    <div className="space-y-2">
      {e.preorder && <p className={cn(row, 'bg-brand-500/10')}><CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /><span><b>{tx('طلب مسبق', 'Pre-order')}</b> · {e.preorder.name[lang]} · {tx(`الشحن نحو ${day(e.preorder.shipDate)}`, `ships around ${day(e.preorder.shipDate)}`)}
        {e.preorder.pay === 'deposit' && <span className="block">{tx('دفعة مقدمة ', 'Deposit ')}<Money v={e.preorder.deposit} />{tx(' · الباقي ', ' · balance ')}<Money v={e.preorder.balance} />{tx(' يُحصَّل قبل الشحن', ' due before shipping')}</span>}</span></p>}
      {e.fields && e.fields.length > 0 && (
        <div className={cn(row, 'block bg-surface-2')}>
          <p className="mb-1 flex items-center gap-1.5 font-semibold"><ListChecks className="size-3.5" aria-hidden="true" />{tx('إجابات العميل', 'Customer’s answers')}</p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">{e.fields.map((f) => <div key={f.id} className="contents"><dt className="text-muted">{f.label[lang]}</dt><dd className="min-w-0 break-words font-medium">{f.value[lang]}</dd></div>)}</dl>
        </div>
      )}
      {e.bookings?.map((b, i) => <p key={i} className={cn(row, 'bg-surface-2')}><CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /><span>{tx('حجز', 'Booking')} · {day(b.date, true)} <bdi dir="ltr">{b.time}</bdi> · {tx(`${b.qty} مقعد`, `${b.qty} place(s)`)}</span></p>)}
      {e.codes?.map((c) => <p key={c.sku} className={cn(row, 'bg-surface-2')}><KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /><span>{tx(`أُرسلت ${c.codes.length} أكواد بالبريد`, `${c.codes.length} code(s) emailed`)} <Simulated />{canSeeCodes ? <bdi dir="ltr" className="block font-mono">{c.codes.join(' · ')}</bdi> : <span className="block text-muted">{tx('الأكواد مخفية لدورك', 'Codes are hidden for your role')}</span>}</span></p>)}
      {e.downloads?.map((d) => <p key={d.sku} className={cn(row, 'bg-surface-2')}><Download className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /><span>{tx('رابط تنزيل أُرسل', 'Download link sent')} · <bdi dir="ltr">{d.file}</bdi> <Simulated /></span></p>)}
      {e.bundles?.map((b) => <p key={b.sku} className={cn(row, 'bg-surface-2')}><PackageOpen className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /><span>{tx('حزمة: تُجهَّز مكوّناتها كسطور مستقلة', 'Bundle: its parts are picked as separate lines')}</span></p>)}
      {e.age && <p className={cn(row, 'bg-surface-2')}><UserCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{tx(`أكّد العميل أن عمره ${e.age}+`, `Customer confirmed age ${e.age}+`)}</p>}
    </div>
  );
}

/** For printouts: answers marked "on invoice", pre-order terms and bookings, in the document language. */
export function OrderExtrasPrint({ o, lang }: { o: Order; lang: 'ar' | 'en' }) {
  const e = o.extras;
  if (!e) return null;
  const fields = (e.fields ?? []).filter((f) => f.onInvoice);
  if (!fields.length && !e.preorder && !e.bookings?.length) return null;
  return (
    <section className="mt-4 rounded border border-neutral-300 p-2 text-[12px]">
      {e.preorder && <p className="font-semibold">{lang === 'ar' ? `طلب مسبق · الشحن المتوقع ${e.preorder.shipDate}` : `Pre-order · expected ship date ${e.preorder.shipDate}`}{e.preorder.pay === 'deposit' && (lang === 'ar' ? ` · مدفوع مقدمًا ${(e.preorder.deposit / 100).toFixed(2)} ر.س، المتبقي ${(e.preorder.balance / 100).toFixed(2)} ر.س` : ` · deposit paid SAR ${(e.preorder.deposit / 100).toFixed(2)}, balance SAR ${(e.preorder.balance / 100).toFixed(2)}`)}</p>}
      {e.bookings?.map((b, i) => <p key={i}>{lang === 'ar' ? 'حجز' : 'Booking'}: <bdi dir="ltr">{b.date} {b.time}</bdi> × {b.qty}</p>)}
      {fields.length > 0 && <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">{fields.map((f) => <div key={f.id} className="contents"><dt className="text-neutral-500">{f.label[lang]}</dt><dd>{f.value[lang]}</dd></div>)}</dl>}
    </section>
  );
}
