// Abandoned-cart reminder sequence: steps (when, channel, text, discount), quiet hours, live customer preview,
// a cost preview before activating or changing a running sequence, then per-step results. Sending is simulated:
// a pass runs when the page opens (standing in for the scheduler) and on "Check now".
import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowDown, Clock, Pause, Play, Plus, RotateCw, ShieldCheck, Trash2, ShoppingBag } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { useReviewMode } from '../../../core/review';
import { link, type Route } from '../../../core/router';
import { cartsStore, couponsStore, logAction, productsStore, settingsStore } from '../../merchant/stores';
import {
  MAX_STEPS, REMINDER_HOURS, TEST_RATE, couponLive, retryDelivery, simSendFails, stepErrors,
  type CartSequence, type Delivery, type ReminderStep, type StepError,
} from '../../merchant/growth';
import { Badge, Button, Card, CardHeader, IconButton, InfoHint, LinkButton, Money, Ref, Segmented, cn, useTx } from '../../../ds/ui';
import { Alert, Field, Modal, SaveBar, Select, Switch, useToast } from '../../../ds/kit';
import { useUnsaved } from '../unsaved';
import { Locked } from './access';
import { MESSAGE_MAX, TODAY } from './model';
import {
  deliveriesStore, discountLabel, forecast, openCartsForSequence, hoursLabel, newStep, passCarts, reminderProblems, reminderSimStore, runCtx, sameSequence, sequenceDraftStore, sequenceStats, sequenceStore,
} from './reminders-model';
import { DiscountPicker, MessagePreview, SimNote, StatFigures, StatusBadge, TemplateEditor, type Lang } from './reminders-parts';

/** Runs one simulated pass and writes carts, codes and deliveries. Returns the summary. */
export function runCartPass(seq: CartSequence) {
  const p = passCarts(seq, cartsStore.get(), deliveriesStore.get(), couponsStore.get(), productsStore.get(), runCtx());
  cartsStore.set(p.carts);
  couponsStore.set(p.coupons);
  deliveriesStore.set(p.deliveries);
  return p.summary;
}

export default function CartReminders({ route, canManage, canSend }: { route: Route; canManage: boolean; canSend: boolean }) {
  const tx = useTx();
  const { lang: uiLang } = useLang();
  const toast = useToast();
  const review = useReviewMode();
  const saved = sequenceStore.use();
  const draftSaved = sequenceDraftStore.use();
  const carts = cartsStore.use();
  const coupons = couponsStore.use();
  const products = productsStore.use();
  const deliveries = deliveriesStore.use();
  const sim = reminderSimStore.use();
  const storeName = settingsStore.use().store.name;
  const d = draftSaved ?? saved;
  const dirty = !sameSequence(d, saved);
  useUnsaved(dirty, { ar: 'تذكيرات السلة', en: 'Cart reminders' });
  const [sel, setSel] = useState(route.query.get('step') ?? d.steps[0]?.id ?? '');
  const [lang, setLang] = useState<Lang>(uiLang);
  const [confirm, setConfirm] = useState<'activate' | 'save' | 'pause' | null>(null);
  const [tried, setTried] = useState(false);

  // The scheduler: a pass each time the page opens while the sequence runs (simulated).
  useEffect(() => { if (sequenceStore.get().status === 'active') runCartPass(sequenceStore.get()); }, []);

  const set = (next: Partial<CartSequence>) => sequenceDraftStore.set({ ...d, ...next });
  const setStep = (id: string, p: Partial<ReminderStep>) => set({ steps: d.steps.map((s) => (s.id === id ? { ...s, ...p } : s)) });
  const errs = d.steps.map((s, i) => stepErrors(s, d.steps[i - 1], MESSAGE_MAX[s.channel], coupons));
  const nErr = errs.reduce((a, e) => a + e.length, 0) + (d.steps.some((s) => s.on) ? 0 : 1);
  const errText = (e: StepError[], k: StepError[]) => {
    const f = k.find((x) => e.includes(x));
    if (!f) return null;
    return ({
      textAr: tx('اكتب النص العربي', 'Write the Arabic text'), textEn: tx('اكتب النص الإنجليزي', 'Write the English text'), long: tx('أطول من حد القناة بعد تعبئة المتغيرات', 'Longer than the channel limit once fields are filled'),
      placeholder: tx('متغير غير معروف بين { }', 'Unknown field between { }'), pct: tx('من 1 إلى 50', 'From 1 to 50'), days: tx('من 1 إلى 14 يومًا', '1 to 14 days'),
      coupon: tx('اختر كوبونًا', 'Choose a coupon'), order: tx('يجب أن يأتي بعد الخطوة السابقة', 'Must come after the previous step'), codeMissing: tx('أضف «كود الخصم» إلى النص', 'Add “Discount code” to the text'),
    } as Record<StepError, string>)[f];
  };

  const sample = carts.find((c) => !c.purchased && c.items?.length) ?? carts[0];
  const sel_ = d.steps.find((s) => s.id === sel) ?? d.steps[0];
  const vars = (s: ReminderStep | undefined) => ({
    name: sample?.customer[lang].split(' ')[0] ?? '', store: storeName,
    items: (sample?.items ?? []).map((i) => i.name[lang]).join(lang === 'ar' ? '، ' : ', '),
    code: s?.discount.kind === 'existing' ? s.discount.code : 'LK7Q2M9X',
    expiry: s?.discount.kind === 'generated' ? new Date(Date.parse(`${TODAY}T00:00:00Z`) + s.discount.validDays * 86400000).toISOString().slice(0, 10) : (coupons.find((c) => s?.discount.kind === 'existing' && c.code === s.discount.code)?.ends ?? '—'),
  });

  const fc = forecast(d, carts, coupons, products);
  const stats = sequenceStats(saved, deliveries);
  const problems = reminderProblems(saved, [], deliveries, coupons);
  const totals = stats.reduce((a, x) => ({ sent: a.sent + x.stats.sent, recovered: a.recovered + x.stats.recovered, revenue: a.revenue + x.stats.revenue, discount: a.discount + x.stats.discount, cost: a.cost + x.stats.cost }), { sent: 0, recovered: 0, revenue: 0, discount: 0, cost: 0 });
  const stepNo = (id: string) => saved.steps.findIndex((s) => s.id === id) + 1;

  const apply = (status: CartSequence['status']) => {
    const next: CartSequence = { ...d, status, version: saved.version + 1, by: tx('أنت', 'You'), at: TODAY };
    sequenceStore.set(next);
    sequenceDraftStore.set(null);
    setConfirm(null); setTried(false);
    const what = status === 'active' && saved.status !== 'active'
      ? { ar: `فعّل تذكيرات السلة (${next.steps.filter((s) => s.on).length} خطوات، الإصدار ${next.version})`, en: `Activated cart reminders (${next.steps.filter((s) => s.on).length} steps, version ${next.version})` }
      : { ar: `عدّل تذكيرات السلة (الإصدار ${next.version})`, en: `Changed cart reminders (version ${next.version})` };
    logAction('marketing', what, { target: 'cart-reminders', before: `v${saved.version}`, after: `v${next.version}` });
    if (status === 'active') {
      const r = runCartPass(next);
      toast({ tone: 'ok', text: tx(`يعمل الآن. أُرسلت ${r.sent}، وتنتظر ${r.deferred} انتهاء ساعات الهدوء.`, `Running. ${r.sent} sent, ${r.deferred} waiting for quiet hours to end.`) });
    } else toast({ tone: 'ok', text: tx('حُفظ التسلسل.', 'Sequence saved.') });
  };
  const pause = () => {
    const next = { ...saved, status: saved.status === 'active' ? 'paused' as const : 'active' as const };
    sequenceStore.set(next); setConfirm(null);
    logAction('marketing', next.status === 'paused' ? { ar: 'أوقف تذكيرات السلة', en: 'Paused cart reminders' } : { ar: 'استأنف تذكيرات السلة', en: 'Resumed cart reminders' }, { target: 'cart-reminders' });
    if (next.status === 'active') runCartPass(next);
    toast({ tone: 'ok', text: next.status === 'paused' ? tx('أُوقف. لا تُرسل رسائل جديدة؛ ما أُرسل لا يُسترجع.', 'Paused. No new messages; sent ones are not recalled.') : tx('استؤنف.', 'Resumed.') });
  };
  const checkNow = () => {
    const r = runCartPass(saved);
    logAction('marketing', { ar: `تشغيل تذكيرات السلة يدويًا: أُرسلت ${r.sent}`, en: `Ran cart reminders now: ${r.sent} sent` }, { target: 'cart-reminders' });
    toast({ tone: 'info', text: r.sent + r.deferred + r.failed === 0 ? tx('لا رسائل مستحقة الآن.', 'Nothing due right now.') : tx(`أُرسلت ${r.sent} · تنتظر ${r.deferred} · فشلت ${r.failed}`, `${r.sent} sent · ${r.deferred} waiting · ${r.failed} failed`) });
  };
  const retry = (step: string) => {
    const ctx = runCtx();
    let n = 0;
    deliveriesStore.set((list) => list.map((x) => {
      if (x.source !== 'seq' || x.step !== step || x.status !== 'failed') return x;
      const cart = cartsStore.get().find((c) => c.id === x.target);
      const st = saved.steps.find((s) => s.id === step);
      const ok = st?.discount.kind !== 'existing' || couponLive(couponsStore.get().find((c) => c.code === (st.discount as { code: string }).code));
      const y: Delivery = retryDelivery(x, ctx, saved.quiet, !!cart && simSendFails(cart), ok);
      if (y.status === 'sent') n++;
      return y;
    }));
    logAction('marketing', { ar: `أعاد محاولة خطوة تذكير السلة ${stepNo(step)}: نجحت ${n}`, en: `Retried cart reminder step ${stepNo(step)}: ${n} succeeded` }, { target: 'cart-reminders' });
    toast({ tone: n ? 'ok' : 'bad', text: n ? tx(`أُرسلت ${n} بعد إعادة المحاولة.`, `${n} sent on retry.`) : tx('ما زال السبب قائمًا. عالج السبب ثم أعد المحاولة.', 'The cause is still there. Fix it, then retry.') });
  };

  const primary = !canSend ? null : saved.status === 'draft' || dirty
    ? <Button className={cn(saved.status === 'draft' && 'bg-brand-gradient')} onClick={() => { setTried(true); if (!nErr) setConfirm(saved.status === 'draft' ? 'activate' : 'save'); }}>
        <Play className="size-4" aria-hidden="true" />{saved.status === 'draft' ? tx('راجع ثم فعّل', 'Review and activate') : tx('راجع ثم احفظ', 'Review and save')}
      </Button>
    : null;
  const disabled = !canManage;
  const reasonText = (r: string) => ({ provider: tx('مزوّد الرسائل لا يستجيب', 'The message provider is not responding'), coupon: tx('الكوبون لا يعمل اليوم', 'The coupon does not work today') } as Record<string, string>)[r];

  return (
    <div className="space-y-6">
      <Card aria-labelledby="h-seq">
        <div className="flex flex-wrap items-start gap-4 p-5">
          <div className="min-w-0 flex-1">
            <h2 id="h-seq" className="flex flex-wrap items-center gap-2 text-base font-bold text-fg">{tx('تسلسل تذكيرات السلة', 'Cart reminder sequence')}<StatusBadge status={saved.status} />{dirty && <Badge tone="amber">{tx('تعديلات غير محفوظة', 'Unsaved edits')}</Badge>}</h2>
            <p className="mt-1 text-sm text-muted">
              {tx(`${d.steps.filter((s) => s.on).length} خطوات`, `${d.steps.filter((s) => s.on).length} steps`)} · {d.quiet.on ? tx(`هدوء ${d.quiet.from}:00–${d.quiet.to}:00`, `Quiet ${d.quiet.from}:00–${d.quiet.to}:00`) : tx('بلا ساعات هدوء', 'No quiet hours')}
              {saved.version > 0 && <> · {tx(`الإصدار ${saved.version}`, `Version ${saved.version}`)}</>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {saved.status !== 'draft' && canSend && !dirty && (
              <Button variant="secondary" onClick={() => setConfirm('pause')}>{saved.status === 'active' ? <><Pause className="size-4" aria-hidden="true" />{tx('أوقف', 'Pause')}</> : <><Play className="size-4" aria-hidden="true" />{tx('استأنف', 'Resume')}</>}</Button>
            )}
            {saved.status === 'active' && canSend && !dirty && <Button variant="secondary" onClick={checkNow}><RotateCw className="size-4" aria-hidden="true" />{tx('شغّل المستحق الآن', 'Run due now')}</Button>}
            {primary}
            {!canSend && <Locked>{tx('دورك لا يشمل تفعيل الرسائل.', 'Your role does not include activating messages.')}</Locked>}
          </div>
        </div>
        {review && (
          <div className="flex flex-wrap items-center gap-4 border-t border-dashed border-border px-5 py-3 text-xs text-muted">
            <span className="font-semibold">{tx('محاكاة المراجعة', 'Review simulation')}</span>
            <Switch checked={sim.smsDown} onChange={(v) => reminderSimStore.set({ ...sim, smsDown: v })} label={tx('تعطل مزوّد الرسائل النصية', 'SMS provider outage')} />
            <Switch checked={sim.quietNow} onChange={(v) => reminderSimStore.set({ ...sim, quietNow: v })} label={tx('الوقت الآن 23:00', 'It is 23:00 now')} />
          </div>
        )}
      </Card>

      {problems.map((p) => (
        <Alert key={p.step} tone="bad" title={tx(`خطوة ${stepNo(p.step)} لا تصل للعملاء`, `Step ${stepNo(p.step)} is not reaching customers`)}
          action={canSend ? <Button size="sm" variant="secondary" onClick={() => retry(p.step)}><RotateCw className="size-3.5" aria-hidden="true" />{tx('أعد المحاولة', 'Retry')}</Button> : undefined}>
          {p.kind === 'failing' ? tx(`${p.count} رسالة فشلت: ${reasonText(p.reason)}.`, `${p.count} failed: ${reasonText(p.reason)}.`) : tx(`الكوبون ${p.code} لم يعد يعمل. اختر كوبونًا آخر أو كودًا فرديًا.`, `Coupon ${p.code} no longer works. Choose another coupon or a single-use code.`)}
          {p.kind === 'failing' && p.reason === 'coupon' && <> {tx('غيّر خصم الخطوة ثم أعد المحاولة.', 'Change the step’s discount, then retry.')}</>}
        </Alert>
      ))}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <ol className="space-y-4" aria-label={tx('خطوات التسلسل', 'Sequence steps')}>
            {d.steps.map((s, i) => {
              const e = tried || s.id === sel ? errs[i] : [];
              return (
                <li key={s.id}>
                  {i > 0 && <div className="flex justify-center pb-2 text-subtle" aria-hidden="true"><ArrowDown className="size-4" /></div>}
                  <Card aria-label={tx(`الخطوة ${i + 1}`, `Step ${i + 1}`)} className={cn('transition-shadow', s.id === sel_?.id && 'ring-2 ring-brand-500/40', !s.on && 'opacity-70')} onFocusCapture={() => setSel(s.id)} onClick={() => setSel(s.id)}>
                    <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
                      <span className="grid size-7 place-items-center rounded-full bg-brand-500/10 text-sm font-bold text-brand-700 dark:text-brand-300">{i + 1}</span>
                      <span className="flex-1 font-semibold text-fg">{hoursLabel(s.afterHours)[uiLang]}</span>
                      <span className="text-xs text-muted">{s.on ? tx('مفعّلة', 'On') : tx('متوقفة', 'Off')}</span>
                      <Switch checked={s.on} disabled={disabled} onChange={(v) => setStep(s.id, { on: v })} label={tx(`الخطوة ${i + 1} مفعّلة`, `Step ${i + 1} on`)} />
                      {!disabled && d.steps.length > 1 && <IconButton label={tx(`احذف الخطوة ${i + 1}`, `Remove step ${i + 1}`)} onClick={(ev) => { ev.stopPropagation(); set({ steps: d.steps.filter((x) => x.id !== s.id) }); }}><Trash2 className="size-4" aria-hidden="true" /></IconButton>}
                    </div>
                    <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-end gap-3">
                          <Field label={tx('متى', 'When')} error={errText(e, ['order'])} className="w-40">
                            {(p) => <Select {...p} value={s.afterHours} disabled={disabled} onChange={(ev) => setStep(s.id, { afterHours: Number(ev.target.value) })}>{REMINDER_HOURS.map((h) => <option key={h} value={h}>{hoursLabel(h)[uiLang]}</option>)}</Select>}
                          </Field>
                          <div className="space-y-1.5">
                            <p className="text-[13px] font-semibold text-fg">{tx('القناة', 'Channel')}</p>
                            <Segmented label={tx('القناة', 'Channel')} value={s.channel} onChange={(v) => !disabled && setStep(s.id, { channel: v })} options={[{ value: 'email', label: tx('بريد', 'Email') }, { value: 'sms', label: tx('نصية', 'SMS') }]} />
                          </div>
                        </div>
                        <DiscountPicker value={s.discount} onChange={(v) => setStep(s.id, { discount: v })} coupons={coupons} disabled={disabled}
                          errors={{ coupon: errText(e, ['coupon']), pct: errText(e, ['pct']), days: errText(e, ['days']) }} />
                      </div>
                      <TemplateEditor value={s.text} onChange={(v) => setStep(s.id, { text: v })} channel={s.channel} disabled={disabled} lang={lang} setLang={setLang} onFocus={() => setSel(s.id)}
                        errors={{ ar: errText(e, ['textAr']), en: errText(e, ['textEn']), other: errText(e, ['long', 'placeholder', 'codeMissing']) }} />
                    </div>
                  </Card>
                </li>
              );
            })}
          </ol>
          {!disabled && d.steps.length < MAX_STEPS && (
            <Button variant="secondary" onClick={() => { const s = newStep(d.steps); set({ steps: [...d.steps, s] }); setSel(s.id); }}><Plus className="size-4" aria-hidden="true" />{tx('أضف خطوة', 'Add a step')}</Button>
          )}
        </div>

        <div className="space-y-6">
          <Card aria-labelledby="h-prev" className="lg:sticky lg:top-20">
            <CardHeader id="h-prev" title={tx(`معاينة الخطوة ${d.steps.findIndex((s) => s.id === sel_?.id) + 1}`, `Preview of step ${d.steps.findIndex((s) => s.id === sel_?.id) + 1}`)} hint={tx('بسلة حقيقية من متجرك وكود مثال.', 'With a real cart from your store and a sample code.')} />
            <div className="space-y-4 px-5 pb-5">
              {sel_ && <MessagePreview text={sel_.text} channel={sel_.channel} lang={lang} vars={vars(sel_)} />}
              {sample && <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted"><ShoppingBag className="size-3.5" aria-hidden="true" />{tx('السلة', 'Cart')} <Ref>{sample.id}</Ref> · <Money v={sample.value} /></p>}
            </div>
          </Card>
          <Card aria-labelledby="h-rules">
            <CardHeader id="h-rules" title={tx('قواعد ثابتة', 'Always applied')} />
            <ul className="space-y-3 px-5 pb-5 text-sm">
              <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" /><span>{tx('فقط لمن وافق على القناة، ويتوقف من ألغى الاشتراك.', 'Only customers who consented to the channel; unsubscribes stop it.')}</span></li>
              <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" /><span>{tx('يتوقف فور شراء العميل.', 'Stops as soon as the customer buys.')}</span></li>
              <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" /><span className="flex items-center gap-1">{tx('رسالة واحدة في كل مرة، ولا شيء بعد 7 أيام.', 'One message at a time, nothing after 7 days.')}<InfoHint>{tx('سلة قديمة تصلها آخر خطوة مستحقة فقط، لا كل الخطوات معًا.', 'An old cart gets only the latest due step, not every step at once.')}</InfoHint></span></li>
            </ul>
            <div className="space-y-3 border-t border-border px-5 py-4">
              <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-fg">{tx('ساعات هدوء', 'Quiet hours')}</span><Switch checked={d.quiet.on} disabled={disabled} onChange={(v) => set({ quiet: { ...d.quiet, on: v } })} label={tx('ساعات هدوء', 'Quiet hours')} /></div>
              {d.quiet.on && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={tx('من', 'From')}>{(p) => <Select {...p} value={d.quiet.from} disabled={disabled} onChange={(e) => set({ quiet: { ...d.quiet, from: Number(e.target.value) } })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{`${h}:00`}</option>)}</Select>}</Field>
                  <Field label={tx('إلى', 'Until')}>{(p) => <Select {...p} value={d.quiet.to} disabled={disabled} onChange={(e) => set({ quiet: { ...d.quiet, to: Number(e.target.value) } })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{`${h}:00`}</option>)}</Select>}</Field>
                </div>
              )}
              <p className="flex items-center gap-1.5 text-xs text-muted"><Clock className="size-3.5" aria-hidden="true" />{tx('بتوقيت الرياض؛ ما يحين وقته ينتظر انتهاءها.', 'Riyadh time; anything due waits until they end.')}</p>
            </div>
          </Card>
        </div>
      </div>

      <Card aria-labelledby="h-res">
        <CardHeader id="h-res" title={tx('النتائج لكل خطوة', 'Results per step')} hint={tx('«استُرجعت» = اشترى العميل بعد الرسالة وقبل الخطوة التالية (محاكاة). الإيراد بعد الخصم.', '“Recovered” = the customer bought after the message and before the next step (simulated). Revenue after discount.')}
          action={<LinkButton variant="ghost" size="sm" href={link('/dashboard/marketing', { tab: 'carts', cview: 'recovered' })}>{tx('السلال المسترجعة', 'Recovered carts')}</LinkButton>} />
        {saved.status === 'draft' && totals.sent === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">{tx('تظهر النتائج بعد التفعيل.', 'Results appear after activation.')}</p>
        ) : (
          <div className="space-y-4 px-5 pb-5">
            <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div><dt className="text-xs text-muted">{tx('رسائل', 'Messages')}</dt><dd className="font-semibold tabular-nums">{totals.sent}</dd></div>
              <div><dt className="text-xs text-muted">{tx('سلال استُرجعت', 'Carts recovered')}</dt><dd className="font-semibold tabular-nums">{totals.recovered}</dd></div>
              <div><dt className="text-xs text-muted">{tx('الإيراد', 'Revenue')}</dt><dd className="font-semibold"><Money v={totals.revenue} /></dd></div>
              <div><dt className="flex items-center gap-1 text-xs text-muted">{tx('تكلفة الرسائل', 'Message cost')}<Badge tone="amber">{tx('سعر اختبار', 'Test rate')}</Badge></dt><dd className="font-semibold"><Money v={totals.cost} /></dd></div>
            </dl>
            <ol className="space-y-4">
              {stats.map(({ step, stats: s }, i) => (
                <li key={step.id} className="rounded-2xl border border-border p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-fg">{tx(`الخطوة ${i + 1}`, `Step ${i + 1}`)} · {hoursLabel(step.afterHours)[uiLang]}</span>
                    <Badge>{step.channel === 'email' ? tx('بريد', 'Email') : tx('نصية', 'SMS')}</Badge>
                    <Badge tone={step.discount.kind === 'none' ? 'gray' : 'brand'}>{discountLabel(step.discount)[uiLang]}</Badge>
                    {s.failed > 0 && <Badge tone="red" icon={<AlertTriangle className="size-3" aria-hidden="true" />}>{tx(`فشلت ${s.failed}`, `${s.failed} failed`)}</Badge>}
                    {s.deferred > 0 && <Badge tone="sky" icon={<Clock className="size-3" aria-hidden="true" />}>{tx(`تنتظر ${s.deferred}`, `${s.deferred} waiting`)}</Badge>}
                    <span className="ms-auto text-xs text-muted">{tx(`لم تُرسل: ${s.skipped} (لا موافقة، أو لحقت بخطوة أحدث) · توقفت لشراء: ${s.stopped}`, `Not sent: ${s.skipped} (no consent, or a later step applied) · Stopped by purchase: ${s.stopped}`)}</span>
                  </div>
                  <StatFigures s={s} recoveredLabel={tx('استُرجعت', 'Recovered')} />
                  {s.failed > 0 && canSend && <div className="mt-3"><Button size="sm" variant="secondary" onClick={() => retry(step.id)}><RotateCw className="size-3.5" aria-hidden="true" />{tx(`أعد محاولة ${s.failed}`, `Retry ${s.failed}`)}</Button></div>}
                </li>
              ))}
            </ol>
            <SimNote />
          </div>
        )}
      </Card>

      {canManage && <SaveBar dirty={dirty} onSave={() => { setTried(true); if (!nErr && canSend) setConfirm(saved.status === 'draft' ? 'activate' : 'save'); else if (!nErr) apply(saved.status); }} onDiscard={() => { sequenceDraftStore.set(null); setTried(false); }}
        error={tried && nErr ? tx(`صحّح ${nErr} قبل الحفظ`, `Fix ${nErr} before saving`) : undefined} saveLabel={saved.status === 'draft' ? tx('راجع ثم فعّل', 'Review and activate') : tx('راجع ثم احفظ', 'Review and save')} />}

      {(confirm === 'activate' || confirm === 'save') && (
        <Modal size="lg" title={confirm === 'activate' ? tx('تفعيل تذكيرات السلة', 'Activate cart reminders') : tx('حفظ التعديلات على تسلسل يعمل', 'Save changes to a running sequence')}
          description={tx(`تقدير على ${openCartsForSequence(carts)} سلة مفتوحة اليوم.`, `Estimated on the ${openCartsForSequence(carts)} carts open today.`)}
          onClose={() => setConfirm(null)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>{tx('رجوع', 'Back')}</Button><Button onClick={() => apply('active')}><Play className="size-4" aria-hidden="true" />{confirm === 'activate' ? tx('فعّل الآن', 'Activate now') : tx('احفظ وطبّق', 'Save and apply')}</Button></>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted"><th className="py-2 text-start font-medium">{tx('الخطوة', 'Step')}</th><th className="py-2 text-end font-medium">{tx('رسائل', 'Msgs')}</th><th className="py-2 text-end font-medium">{tx('التكلفة', 'Cost')}</th><th className="py-2 text-end font-medium">{tx('متوسط الخصم', 'Avg discount')}</th></tr></thead>
              <tbody>
                {fc.rows.map((r) => { const s = d.steps.find((x) => x.id === r.step)!; return (
                  <tr key={r.step} className="border-t border-border">
                    <td className="py-2"><span className="block font-medium text-fg">{hoursLabel(s.afterHours)[uiLang]} · {s.channel === 'email' ? tx('بريد', 'Email') : tx('نصية', 'SMS')}</span><span className="text-xs text-muted">{discountLabel(s.discount)[uiLang]}</span></td>
                    <td className="py-2 text-end tabular-nums">{r.messages}</td>
                    <td className="py-2 text-end"><Money v={r.cost} /></td>
                    <td className="py-2 text-end">{s.discount.kind === 'none' ? '—' : <Money v={r.avgDiscount} />}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-surface-2 px-3 py-2.5"><dt className="text-xs text-muted">{tx('أقصى عدد رسائل', 'Most messages')}</dt><dd className="mt-0.5 font-semibold tabular-nums">{fc.messages}</dd></div>
            <div className="rounded-xl bg-surface-2 px-3 py-2.5"><dt className="flex items-center gap-1 text-xs text-muted">{tx('تكلفة الرسائل', 'Message cost')}<InfoHint>{tx(`سعر اختبار توضيحي: بريد ${TEST_RATE.email / 100} ر.س، نصية ${TEST_RATE.sms / 100} ر.س للرسالة. يُستبدل بسعر المزوّد.`, `Illustrative test rate: email SAR ${TEST_RATE.email / 100}, SMS SAR ${TEST_RATE.sms / 100} per message. Replaced by the provider’s rate.`)}</InfoHint></dt><dd className="mt-0.5 font-semibold"><Money v={fc.cost} /></dd></div>
            <div className="rounded-xl bg-surface-2 px-3 py-2.5"><dt className="flex items-center gap-1 text-xs text-muted">{tx('أقصى خصم', 'Most discount')}<InfoHint>{tx('لو اشترى كل من وصله كود. يُحسم فقط عند الشراء به.', 'If everyone who got a code bought with it. Only taken when someone buys with it.')}</InfoHint></dt><dd className="mt-0.5 font-semibold"><Money v={fc.maxDiscount} /></dd></div>
          </dl>
          <ul className="list-disc space-y-1 ps-5 text-sm text-muted">
            <li>{tx('العدد أقصى حد: معظم العملاء يشترون أو يتوقفون قبل آخر خطوة.', 'These are upper bounds: most customers buy or stop before the last step.')}</li>
            {d.steps.some((s) => s.on && s.discount.kind === 'generated') && <li>{tx('يُنشأ كود مختلف لكل عميل عند إرساله، يُستخدم مرة واحدة.', 'A different code is made for each customer when sent, usable once.')}</li>}
            {d.quiet.on && <li>{tx(`ما يحين بين ${d.quiet.from}:00 و${d.quiet.to}:00 يُرسل عند ${d.quiet.to}:00.`, `Anything due between ${d.quiet.from}:00 and ${d.quiet.to}:00 goes out at ${d.quiet.to}:00.`)}</li>}
            <li>{tx('تستطيع الإيقاف في أي وقت؛ ما أُرسل لا يُسترجع.', 'You can pause at any time; sent messages are not recalled.')}</li>
          </ul>
          <SimNote />
        </Modal>
      )}
      {confirm === 'pause' && (
        <Modal title={saved.status === 'active' ? tx('إيقاف تذكيرات السلة', 'Pause cart reminders') : tx('استئناف تذكيرات السلة', 'Resume cart reminders')} onClose={() => setConfirm(null)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>{tx('رجوع', 'Back')}</Button><Button variant={saved.status === 'active' ? 'danger' : 'primary'} onClick={pause}>{saved.status === 'active' ? tx('أوقف', 'Pause') : tx('استأنف', 'Resume')}</Button></>}>
          <p className="text-sm text-muted">{saved.status === 'active'
            ? tx('لن تُرسل رسائل جديدة. الأكواد المرسلة تبقى صالحة حتى انتهائها.', 'No new messages go out. Codes already sent stay valid until they expire.')
            : tx(`تُستأنف فورًا، وتصل السلال المستحقة آخر خطوة تخصها (حتى ${fc.messages} رسالة).`, `Resumes now; due carts get their latest step (up to ${fc.messages} messages).`)}</p>
        </Modal>
      )}
    </div>
  );
}
