// Pieces shared by the cart sequence and reorder reminders: template editor with placeholders, discount picker,
// customer preview, and the results figures. Presentation only; rules live in merchant/growth.ts.
import { useRef, useState } from 'react';
import { Mail, MessageSquare } from 'lucide-react';
import type { L } from '../../merchant/domain';
import { renderTemplate, toLatin, type Coupon, type MsgChannel, type ReminderDiscount, type StepStats } from '../../merchant/growth';
import { Badge, InfoHint, Money, Segmented, cn, useTx } from '../../../ds/ui';
import { Field, Input, Select, Simulated, Textarea } from '../../../ds/kit';
import { MESSAGE_MAX, couponState } from './model';

export const PLACEHOLDERS = ['name', 'store', 'items', 'code', 'expiry'] as const;
export type Lang = 'ar' | 'en';

export function usePlaceholderLabel() {
  const tx = useTx();
  return (k: (typeof PLACEHOLDERS)[number]) => ({ name: tx('اسم العميل', 'Customer name'), store: tx('اسم المتجر', 'Store name'), items: tx('المنتجات', 'Items'), code: tx('كود الخصم', 'Discount code'), expiry: tx('انتهاء الكود', 'Code expiry') })[k];
}

/** Arabic and English text of one message, with placeholder chips that insert at the cursor. */
export function TemplateEditor({ value, onChange, channel, disabled, errors, onFocus, lang, setLang }: {
  value: L; onChange: (v: L) => void; channel: MsgChannel; disabled?: boolean; errors: { ar?: string | null; en?: string | null; other?: string | null };
  onFocus?: () => void; lang: Lang; setLang: (l: Lang) => void;
}) {
  const tx = useTx();
  const label = usePlaceholderLabel();
  const idRef = useRef('');
  const insert = (k: string) => {
    const el = document.getElementById(idRef.current) as HTMLTextAreaElement | null, t = `{${k}}`, cur = value[lang];
    const at = el ? el.selectionStart : cur.length;
    onChange({ ...value, [lang]: cur.slice(0, at) + t + cur.slice(el ? el.selectionEnd : at) });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + t.length, at + t.length); });
  };
  const err = errors[lang] ?? errors.other ?? null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-[13px] font-semibold text-fg">{tx('نص الرسالة', 'Message text')}<InfoHint>{tx('اكتب النص بالعربية والإنجليزية؛ يصل العميل بلغة المتجر التي يتصفح بها.', 'Write it in Arabic and English; each customer gets the language they browse the store in.')}</InfoHint></p>
        <Segmented label={tx('لغة النص', 'Text language')} value={lang} onChange={setLang} options={[{ value: 'ar', label: `${tx('عربي', 'Arabic')}${errors.ar ? ' •' : ''}` }, { value: 'en', label: `${tx('إنجليزي', 'English')}${errors.en ? ' •' : ''}` }]} />
      </div>
      <Field label={lang === 'ar' ? tx('النص العربي', 'Arabic text') : tx('النص الإنجليزي', 'English text')} error={err} hint={<bdi dir="ltr">{value[lang].length} / {MESSAGE_MAX[channel]}</bdi>}>
        {(p) => { idRef.current = p.id; return <Textarea {...p} dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} value={value[lang]} disabled={disabled} onFocus={onFocus} onChange={(e) => onChange({ ...value, [lang]: e.target.value })} className="min-h-20" />; }}
      </Field>
      {!disabled && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label={tx('إدراج متغير', 'Insert a field')}>
          {PLACEHOLDERS.map((k) => (
            <button key={k} type="button" onClick={() => insert(k)} className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted hover:border-brand-400 hover:text-fg">
              + {label(k)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** None / an existing code-based coupon live today / a single-use code generated for each customer. */
export function DiscountPicker({ value, onChange, coupons, disabled, errors }: {
  value: ReminderDiscount; onChange: (v: ReminderDiscount) => void; coupons: Coupon[]; disabled?: boolean; errors: { coupon?: string | null; pct?: string | null; days?: string | null };
}) {
  const tx = useTx();
  const usable = coupons.filter((c) => !c.auto && !c.origin && c.type !== 'bogo' && couponState(c) === 'active');
  const [pct, setPct] = useState(value.kind === 'generated' ? String(value.pct) : '10');
  const [days, setDays] = useState(value.kind === 'generated' ? String(value.validDays) : '3');
  const num = (s: string) => (/^\d+$/.test(toLatin(s)) ? Number(toLatin(s)) : NaN);
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1 text-[13px] font-semibold text-fg">{tx('خصم', 'Discount')}<InfoHint>{tx('الكود الفردي: كود مختلف لكل عميل، يُستخدم مرة واحدة وينتهي بعد المدة. لا يُحسم شيء إلا إذا اشترى العميل به.', 'Single-use: a different code per customer, usable once, expiring after the period. Nothing is taken unless the customer buys with it.')}</InfoHint></p>
      <Segmented label={tx('خصم', 'Discount')} value={value.kind} onChange={(k) => !disabled && onChange(k === 'none' ? { kind: 'none' } : k === 'existing' ? { kind: 'existing', code: usable[0]?.code ?? '' } : { kind: 'generated', pct: num(pct), validDays: num(days) })}
        options={[{ value: 'none', label: tx('بلا خصم', 'None') }, { value: 'existing', label: tx('كوبون قائم', 'Existing coupon') }, { value: 'generated', label: tx('كود فردي', 'Single-use code') }]} />
      {value.kind === 'existing' && (
        <Field label={tx('الكوبون', 'Coupon')} error={errors.coupon} className="max-w-xs">
          {(p) => <Select {...p} value={value.code} disabled={disabled} onChange={(e) => onChange({ kind: 'existing', code: e.target.value })}>
            {!usable.some((c) => c.code === value.code) && <option value={value.code}>{value.code || tx('اختر كوبونًا', 'Choose a coupon')}</option>}
            {usable.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.type === 'percent' ? `${c.value}%` : c.type === 'fixed' ? tx('مبلغ ثابت', 'fixed') : tx('شحن مجاني', 'free shipping')}</option>)}
          </Select>}
        </Field>
      )}
      {value.kind === 'generated' && (
        <div className="grid max-w-sm grid-cols-2 gap-3">
          <Field label={tx('النسبة %', 'Percent %')} error={errors.pct}>
            {(p) => <Input {...p} dir="ltr" inputMode="numeric" value={pct} disabled={disabled} onChange={(e) => { setPct(e.target.value); onChange({ ...value, pct: num(e.target.value) }); }} />}
          </Field>
          <Field label={tx('صالح (أيام)', 'Valid (days)')} error={errors.days}>
            {(p) => <Input {...p} dir="ltr" inputMode="numeric" value={days} disabled={disabled} onChange={(e) => { setDays(e.target.value); onChange({ ...value, validDays: num(e.target.value) }); }} />}
          </Field>
        </div>
      )}
    </div>
  );
}

/** The message as the customer would receive it, filled with a real cart or order from the store. */
export function MessagePreview({ text, channel, lang, vars, title, subject }: { text: L; channel: MsgChannel; lang: Lang; vars: Record<string, string>; title?: string; subject?: L }) {
  const tx = useTx();
  const body = renderTemplate(text[lang], vars);
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">{channel === 'email' ? <Mail className="size-3.5" aria-hidden="true" /> : <MessageSquare className="size-3.5" aria-hidden="true" />}{title ?? tx('كما يراها العميل', 'As the customer sees it')}</p>
      <div className="rounded-2xl bg-surface-2 p-3" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
        {channel === 'email' && <p className="mb-2 text-xs text-muted">{vars.store} · <bdi>{(subject ?? { ar: 'سلتك بانتظارك', en: 'Your cart is waiting' })[lang]}</bdi></p>}
        <p className={cn('max-w-[92%] whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed text-fg shadow-card', channel === 'sms' ? 'rounded-2xl rounded-ss-sm bg-surface' : 'rounded-xl bg-surface')}>{body.trim() || '—'}</p>
        <p className="mt-2 text-[11px] text-subtle">{lang === 'ar' ? 'يُضاف رابط السلة ورابط إلغاء الاشتراك تلقائيًا' : 'A cart link and an unsubscribe link are added automatically'}</p>
      </div>
    </div>
  );
}

/** Results of one step or rule: what went out and what came back. Opens only for email (SMS cannot be measured). */
export function StatFigures({ s, recoveredLabel }: { s: StepStats; recoveredLabel: string }) {
  const tx = useTx();
  const rate = (a: number, b: number) => (b ? `${Math.round((a * 100) / b)}%` : '—');
  return (
    <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
      <div className="rounded-xl bg-surface-2 px-3 py-2"><dt className="text-xs text-muted">{tx('أُرسلت', 'Sent')}</dt><dd className="font-semibold tabular-nums text-fg">{s.sent}</dd></div>
      <div className="rounded-xl bg-surface-2 px-3 py-2"><dt className="flex items-center gap-1 text-xs text-muted">{tx('فُتحت', 'Opened')}<InfoHint>{tx('تُقاس للبريد فقط؛ الرسائل النصية لا تُقاس.', 'Measured for email only; SMS opens cannot be measured.')}</InfoHint></dt><dd className="font-semibold tabular-nums text-fg">{s.openable ? `${s.opened} · ${rate(s.opened, s.openable)}` : '—'}</dd></div>
      <div className="rounded-xl bg-emerald-500/8 px-3 py-2"><dt className="text-xs text-emerald-800 dark:text-emerald-300">{recoveredLabel}</dt><dd className="font-semibold tabular-nums text-fg">{s.recovered}{s.sent > 0 && ` · ${rate(s.recovered, s.sent)}`}</dd></div>
      <div className="rounded-xl bg-surface-2 px-3 py-2"><dt className="text-xs text-muted">{tx('الإيراد', 'Revenue')}</dt><dd className="font-semibold text-fg"><Money v={s.revenue} /></dd></div>
      <div className="col-span-2 rounded-xl bg-surface-2 px-3 py-2 sm:col-span-1"><dt className="text-xs text-muted">{tx('خصم مُنح', 'Discount given')}</dt><dd className="font-semibold text-fg"><Money v={s.discount} /></dd></div>
    </dl>
  );
}

export function StatusBadge({ status }: { status: 'active' | 'paused' | 'draft' }) {
  const tx = useTx();
  return status === 'active' ? <Badge tone="green">{tx('يعمل', 'Running')}</Badge> : status === 'paused' ? <Badge tone="amber">{tx('موقوف', 'Paused')}</Badge> : <Badge tone="gray">{tx('غير مفعّل', 'Not active')}</Badge>;
}

export function SimNote() {
  const tx = useTx();
  return <span className="flex flex-wrap items-center gap-2 text-xs text-muted"><Simulated />{tx('لا يخرج شيء فعليًا؛ النتائج محاكاة', 'Nothing actually leaves; results are simulated')}</span>;
}
