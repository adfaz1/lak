// Shared pieces for affiliates and influencers: live commission lines, state badges, the add/edit partner dialog
// (input → preview → add), and the tracked link & code card.
import { useMemo, useState } from 'react';
import { Check, Copy, Link2, Plus, Send, Trash2 } from 'lucide-react';
import { logAction, couponsStore, ordersStore, productsStore, settingsStore } from '../../merchant/stores';
import { returnDaysFrom } from '../../storefront/bridge';
import {
  SOCIAL_PLATFORMS, commissionLines, emptyPartnerDraft, partnerCoupon, partnerFromDraft, partnerLink, rateFromDraft, suggestCode, validatePartner, numIn,
  type CommissionLine, type CommissionState, type Partner, type PartnerDraft, type PartnerError, type PartnerKind, type Rate, type SocialPlatform,
} from '../../merchant/growth';
import { Badge, Button, IconButton, Money, Ref, useTx } from '../../../ds/ui';
import { Field, Input, Modal, Select, Simulated, Switch, useToast } from '../../../ds/kit';
import { useUnsaved } from '../unsaved';
import { TODAY } from './model';
import { attributionsStore, commissionRulesStore, partnerDraftStore, partnersStore, payoutsStore } from './affiliates-store';

/** Every commission line now, from the order book, the attributions and payouts. */
export function useCommission(): { lines: CommissionLine[]; returnDays: number } {
  const orders = ordersStore.use();
  const atts = attributionsStore.use();
  const partners = partnersStore.use();
  const products = productsStore.use();
  const payouts = payoutsStore.use();
  const policies = settingsStore.use().policies;
  const returnDays = returnDaysFrom(policies);
  const lines = useMemo(() => commissionLines(orders, atts, partners, products, payouts, returnDays, Date.now()), [orders, atts, partners, products, payouts, returnDays]);
  return { lines, returnDays };
}

export function StateBadge({ s }: { s: CommissionState }) {
  const tx = useTx();
  const m: Record<CommissionState, [Parameters<typeof Badge>[0]['tone'], string, string]> = {
    pending: ['amber', 'معلّقة', 'Pending'], approved: ['sky', 'معتمدة', 'Approved'], held: ['red', 'موقوفة للمراجعة', 'Held'],
    paid: ['green', 'مدفوعة', 'Paid'], reversed: ['gray', 'ملغاة', 'Reversed'], clawback: ['red', 'تُخصم لاحقًا', 'Clawback'],
  };
  const [tone, ar, en] = m[s];
  return <Badge tone={tone}>{tx(ar, en)}</Badge>;
}
export const ExampleTag = () => { const tx = useTx(); return <Badge tone="gray">{tx('مثال', 'Example')}</Badge>; };
export function platformName(p: SocialPlatform, tx: (a: string, e: string) => string) {
  return { instagram: tx('إنستغرام', 'Instagram'), tiktok: tx('تيك توك', 'TikTok'), snapchat: tx('سناب شات', 'Snapchat'), x: 'X', youtube: tx('يوتيوب', 'YouTube') }[p];
}
export function rateLabel(r: Rate | null | undefined, base: Rate, tx: (a: string, e: string) => string): string {
  const one = (x: Rate) => (x.kind === 'percent' ? `${x.value}%` : tx(`${(x.value / 100).toLocaleString('en-US')} ر.س/قطعة`, `SAR ${(x.value / 100).toLocaleString('en-US')}/unit`));
  if (r === null) return tx('بلا عمولة', 'No commission');
  return r ? one(r) : tx(`أساسية ${one(base)}`, `Base ${one(base)}`);
}

/** Add or edit a partner. Adding previews the link, code, coupon and invitation before anything is created. */
export function PartnerModal({ kind, editing, onClose, onDone }: { kind: PartnerKind; editing?: Partner; onClose: () => void; onDone?: (p: Partner) => void }) {
  const tx = useTx();
  const toast = useToast();
  const partners = partnersStore.use();
  const coupons = couponsStore.use();
  const rules = commissionRulesStore.use();
  const saved = partnerDraftStore.use();
  const fromEdit = (p: Partner): PartnerDraft => ({ kind: p.kind, name: p.name, email: p.email ?? '', phone: p.phone ?? '', code: p.code, handles: p.handles.length ? p.handles : [], discount: !!p.coupon, discountPct: '', rateMode: p.rate === null ? 'none' : p.rate ? p.rate.kind : '', rateValue: p.rate ? (p.rate.kind === 'percent' ? String(p.rate.value) : String(p.rate.value / 100)) : '' });
  const initial = editing ? fromEdit(editing) : emptyPartnerDraft(kind);
  const d = !editing && saved && saved.kind === kind ? saved : null;
  const [local, setLocal] = useState<PartnerDraft>(d ?? initial);
  const [tried, setTried] = useState(false);
  const [step, setStep] = useState<'form' | 'preview'>('form');
  const dirty = JSON.stringify(local) !== JSON.stringify(initial);
  useUnsaved(dirty, kind === 'affiliate' ? { ar: 'مسودة مسوّق', en: 'Affiliate draft' } : { ar: 'مسودة مؤثر', en: 'Influencer draft' });
  const set = (p: Partial<PartnerDraft>) => { const n = { ...local, ...p }; setLocal(n); if (!editing) partnerDraftStore.set(n); };
  const errs = validatePartner(local, partners, coupons, editing?.id);
  const err = (k: PartnerError) => tried && errs.includes(k);
  const close = () => { onClose(); };
  const discard = () => { partnerDraftStore.set(null); onClose(); };
  const code = local.code.trim() ? local.code.trim().toUpperCase() : '';
  const next = () => { setTried(true); if (!errs.length) setStep('preview'); };
  const by = tx('أنت', 'You');
  const commit = () => {
    if (errs.length) return;
    if (editing) {
      const upd: Partner = { ...editing, name: local.name.trim(), email: local.email.trim() || undefined, phone: local.phone.trim() ? local.phone.replace(/\D/g, '') : undefined, handles: partnerFromDraft(local, editing.id, by, TODAY).handles, rate: rateFromDraft(local) };
      partnersStore.set((l) => l.map((p) => (p.id === editing.id ? upd : p)));
      logAction('marketing', { ar: `تعديل الشريك ${upd.name} (${upd.code})`, en: `Edited partner ${upd.name} (${upd.code})` }, { target: upd.id });
      toast({ tone: 'ok', text: tx('حُفظت التعديلات. العمولة الجديدة تسري على الطلبات الجديدة.', 'Saved. A new rate applies to new orders.') });
      onDone?.(upd); onClose(); return;
    }
    const id = `${kind === 'affiliate' ? 'AF' : 'IN'}-${Date.now().toString(36).toUpperCase()}`;
    const p = partnerFromDraft(local, id, by, TODAY);
    partnersStore.set((l) => [p, ...l]);
    if (p.coupon) couponsStore.set((l) => [partnerCoupon(p.code, numIn(local.discountPct), TODAY), ...l]);
    logAction('marketing', { ar: `إضافة ${kind === 'affiliate' ? 'مسوّق' : 'مؤثر'} ${p.name} برمز ${p.code}${p.coupon ? ' وكوبون' : ''}`, en: `Added ${kind} ${p.name} with code ${p.code}${p.coupon ? ' and a coupon' : ''}` }, { target: p.id });
    partnerDraftStore.set(null);
    toast({ tone: 'ok', text: kind === 'affiliate' ? tx('أُضيف المسوّق وأُرسلت الدعوة (محاكاة).', 'Affiliate added; invitation sent (simulated).') : tx('أُضيف المؤثر. أنشئ تعاونًا من صفحته.', 'Influencer added. Create a collaboration from their page.') });
    onDone?.(p); onClose();
  };
  const title = editing ? tx('تعديل', 'Edit') + ` · ${editing.name}` : kind === 'affiliate' ? tx('أضف مسوّقًا', 'Add an affiliate') : tx('أضف مؤثرًا تعمل معه', 'Add an influencer you work with');
  const pct = numIn(local.discountPct);
  return (
    <Modal title={title} size="lg" onClose={close}
      footer={step === 'form' ? <>
        {!editing && dirty && <Button variant="ghost" className="me-auto" onClick={discard}>{tx('امسح المسودة', 'Discard draft')}</Button>}
        <Button variant="secondary" onClick={close}>{tx('إغلاق', 'Close')}</Button>
        {editing ? <Button onClick={() => { setTried(true); if (!errs.length) commit(); }}>{tx('احفظ', 'Save')}</Button> : <Button onClick={next}>{tx('راجع', 'Review')}</Button>}
      </> : <>
        <Button variant="secondary" onClick={() => setStep('form')}>{tx('رجوع', 'Back')}</Button>
        <Button onClick={commit}>{kind === 'affiliate' ? <><Send className="size-4" aria-hidden="true" />{tx('أضف وأرسل الدعوة', 'Add and invite')}</> : tx('أضف المؤثر', 'Add influencer')}</Button>
      </>}>
      {step === 'form' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={tx('الاسم', 'Name')} error={err('name') ? tx('اكتب الاسم', 'Enter the name') : null}>{(p) => <Input {...p} value={local.name} onChange={(e) => set({ name: e.target.value })} />}</Field>
            <Field label={tx('الرمز', 'Code')} hint={tx('للرابط والكود', 'For the link and code')} error={err('code') ? tx('3–16 حرفًا لاتينيًا أو رقمًا', '3–16 latin letters or digits') : err('codeTaken') ? tx('الرمز مستخدم لشريك أو كوبون', 'Used by a partner or coupon') : null}>
              {(p) => <div className="flex gap-2"><Input {...p} dir="ltr" disabled={!!editing} value={local.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} />
                {!editing && <Button type="button" variant="secondary" onClick={() => set({ code: suggestCode(local.email.split('@')[0] || local.handles[0]?.handle || local.name, [...partners.map((x) => x.code), ...coupons.map((c) => c.code)]) })}>{tx('اقترح', 'Suggest')}</Button>}</div>}
            </Field>
            <Field label={tx('البريد', 'Email')} optional error={err('email') ? tx('بريد غير صالح', 'Invalid email') : err('contact') ? tx('بريد أو جوال للدعوة', 'Email or mobile for the invitation') : null}>{(p) => <Input {...p} dir="ltr" type="email" value={local.email} onChange={(e) => set({ email: e.target.value })} />}</Field>
            <Field label={tx('الجوال', 'Mobile')} optional hint="05XXXXXXXX" error={err('phone') ? tx('رقم سعودي غير صالح', 'Invalid Saudi mobile') : null}>{(p) => <Input {...p} dir="ltr" inputMode="tel" value={local.phone} onChange={(e) => set({ phone: e.target.value })} />}</Field>
          </div>
          {(kind === 'influencer' || local.handles.length > 0) && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-fg">{tx('الحسابات', 'Handles')}</legend>
              {local.handles.map((h, i) => (
                <div key={i} className="flex gap-2">
                  <Select aria-label={tx('المنصة', 'Platform')} className="w-36 shrink-0" value={h.platform} onChange={(e) => set({ handles: local.handles.map((x, j) => (j === i ? { ...x, platform: e.target.value as SocialPlatform } : x)) })}>
                    {SOCIAL_PLATFORMS.map((s) => <option key={s} value={s}>{platformName(s, tx)}</option>)}
                  </Select>
                  <Input aria-label={tx('اسم الحساب', 'Handle')} dir="ltr" placeholder="@handle" value={h.handle} onChange={(e) => set({ handles: local.handles.map((x, j) => (j === i ? { ...x, handle: e.target.value } : x)) })} />
                  <IconButton label={tx('احذف', 'Remove')} onClick={() => set({ handles: local.handles.filter((_, j) => j !== i) })}><Trash2 className="size-4" aria-hidden="true" /></IconButton>
                </div>
              ))}
              {err('handle') && <p className="text-xs text-red-600 dark:text-red-400">{tx('أضف حسابًا واحدًا على الأقل', 'Add at least one handle')}</p>}
              <Button type="button" size="sm" variant="ghost" onClick={() => set({ handles: [...local.handles, { platform: 'instagram', handle: '' }] })}><Plus className="size-4" aria-hidden="true" />{tx('حساب', 'Handle')}</Button>
            </fieldset>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={tx('العمولة', 'Commission')} hint={tx('تحددها أنت', 'You set it')}>
              {(p) => <Select {...p} value={local.rateMode} onChange={(e) => set({ rateMode: e.target.value as PartnerDraft['rateMode'] })}>
                <option value="">{rateLabel(undefined, rules.base, tx)}</option>
                <option value="percent">{tx('نسبة خاصة %', 'Own percent %')}</option>
                <option value="fixed">{tx('مبلغ ثابت لكل قطعة', 'Fixed per unit')}</option>
                <option value="none">{tx('بلا عمولة', 'No commission')}</option>
              </Select>}
            </Field>
            {(local.rateMode === 'percent' || local.rateMode === 'fixed') && (
              <Field label={local.rateMode === 'percent' ? tx('النسبة %', 'Percent %') : tx('المبلغ (ر.س)', 'Amount (SAR)')} error={err('rate') ? (local.rateMode === 'percent' ? tx('من 0.01 إلى 90', '0.01 to 90') : tx('مبلغ أكبر من صفر', 'More than zero')) : null}>
                {(p) => <Input {...p} dir="ltr" inputMode="decimal" value={local.rateValue} onChange={(e) => set({ rateValue: e.target.value })} />}
              </Field>
            )}
          </div>
          {!editing && (
            <div className="space-y-3 rounded-xl bg-surface-2 px-4 py-3">
              <label className="flex items-center justify-between gap-3">
                <span><span className="block text-sm font-semibold text-fg">{tx('خصم للمتابعين بنفس الرمز', 'Follower discount with the same code')}</span><span className="block text-xs text-muted">{tx('يُنشأ كوبون يكتبه العميل عند الدفع', 'Creates a coupon shoppers type at checkout')}</span></span>
                <Switch label={tx('خصم للمتابعين', 'Follower discount')} checked={local.discount} onChange={(v) => set({ discount: v })} />
              </label>
              {local.discount && <Field label={tx('نسبة الخصم %', 'Discount %')} error={err('pct') ? tx('عدد صحيح 1–90', 'Whole number 1–90') : null}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" className="max-w-40" value={local.discountPct} onChange={(e) => set({ discountPct: e.target.value })} />}</Field>}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <dl className="divide-y divide-border rounded-xl border border-border text-sm">
            {[
              [tx('الشريك', 'Partner'), local.name.trim()],
              [tx('الرابط المتتبَّع', 'Tracked link'), <Ref key="l">{partnerLink(code)}</Ref>],
              [tx('الكود عند الدفع', 'Code at checkout'), local.discount ? <span key="c"><Ref>{code}</Ref> · {tx(`خصم ${pct}% مرة لكل عميل`, `${pct}% off, once per customer`)}</span> : tx('لا (رابط فقط)', 'No (link only)')],
              [tx('العمولة', 'Commission'), rateLabel(rateFromDraft(local), rules.base, tx)],
              [tx('مدة الاحتساب بعد النقر', 'Credit window after a click'), tx(`${rules.cookieDays} يومًا`, `${rules.cookieDays} days`)],
            ].map(([k, v], i) => <div key={i} className="flex flex-wrap justify-between gap-2 px-4 py-2.5"><dt className="text-muted">{k}</dt><dd className="min-w-0 break-all font-medium text-fg">{v}</dd></div>)}
          </dl>
          {kind === 'affiliate' && (
            <div className="rounded-xl border border-dashed border-border p-4 text-sm">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted"><Simulated />{tx(`رسالة الدعوة إلى ${local.email || local.phone}`, `Invitation to ${local.email || local.phone}`)}</p>
              <p className="text-fg">{tx(`مرحبًا ${local.name.trim()}، ندعوك لبرنامج المسوقين في متجرنا. رابطك: ${partnerLink(code)}. عمولتك ${rateLabel(rateFromDraft(local), rules.base, tx)} وتُعتمد بعد انتهاء مهلة الإرجاع.`, `Hi ${local.name.trim()}, you’re invited to our store’s affiliate programme. Your link: ${partnerLink(code)}. Commission: ${rateLabel(rateFromDraft(local), rules.base, tx)}, approved after the return window.`)}</p>
            </div>
          )}
          <p className="text-xs text-muted">{tx('لا يُحتسب أي طلب سابق. يبدأ الاحتساب من أول زيارة أو كود بعد الإضافة.', 'No earlier order is credited. Credit starts with the first visit or code after adding.')}</p>
        </div>
      )}
    </Modal>
  );
}

/** The partner's tracked link (optionally to a product) and checkout code, with copy buttons. */
export function LinkCodeCard({ p, products }: { p: Partner; products: { id: string; name: { ar: string; en: string } }[] }) {
  const tx = useTx();
  const [path, setPath] = useState('');
  const [copied, setCopied] = useState('');
  const href = partnerLink(p.code, path);
  const full = `${typeof location !== 'undefined' ? location.origin + location.pathname : ''}${href}`;
  const copy = (k: string, v: string) => { try { void navigator.clipboard?.writeText(v); } catch { /* clipboard unavailable */ } setCopied(k); setTimeout(() => setCopied(''), 1500); };
  return (
    <div className="space-y-3 px-5 pb-5">
      <Field label={tx('الصفحة', 'Page')}>{(f) => <Select {...f} value={path} onChange={(e) => setPath(e.target.value)}><option value="">{tx('الرئيسية', 'Home')}</option>{products.slice(0, 30).map((x) => <option key={x.id} value={`/p/${x.id}`}>{tx(x.name.ar, x.name.en)}</option>)}</Select>}</Field>
      <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
        <Link2 className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-xs" dir="ltr">{href}</span>
        <IconButton label={tx('انسخ الرابط', 'Copy link')} onClick={() => copy('l', full)}>{copied === 'l' ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}</IconButton>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted">{tx('الكود عند الدفع', 'Checkout code')}</span>
        {p.coupon ? <span className="flex items-center gap-2"><Ref>{p.coupon}</Ref><IconButton label={tx('انسخ الكود', 'Copy code')} onClick={() => copy('c', p.coupon!)}>{copied === 'c' ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}</IconButton></span> : <span className="text-xs text-muted">{tx('رابط فقط', 'Link only')}</span>}
      </div>
      <a href={href} target="_blank" rel="noopener" className="inline-block text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('جرّب الرابط في المتجر', 'Try the link in the store')}</a>
    </div>
  );
}

export const moneyCell = (v: number) => <Money v={v} />;
