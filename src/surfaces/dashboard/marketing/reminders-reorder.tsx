// Reorder (replenishment) reminders: per product or category, "remind N days after purchase", with a template,
// optional discount, a preview of who would be reminded this week, and results. Sending is simulated.
import { useEffect, useState } from 'react';
import { ArrowLeft, Pause, Play, Plus, RotateCw, Repeat, SearchX, Users } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, navigate, type Route } from '../../../core/router';
import { couponsStore, customersStore, logAction, ordersStore, productsStore, settingsStore } from '../../merchant/stores';
import {
  TEST_RATE, couponLive, reorderCandidates, retryDelivery, stepErrors, toLatin,
  type ReorderCandidate, type ReorderRule, type StepError,
} from '../../merchant/growth';
import { Badge, Button, Card, CardHeader, EmptyState, InfoHint, LinkButton, Money, ProductImage, Ref, Segmented, useTx } from '../../../ds/ui';
import { Alert, DataTable, Field, Input, Modal, SaveBar, Select, useToast, type Column } from '../../../ds/kit';
import { productPhoto } from '../model/media';
import { useUnsaved } from '../unsaved';
import { Locked } from './access';
import { MESSAGE_MAX, TODAY, scopeOptions } from './model';
import { deliveriesStore, discountLabel, passReorder, reminderProblems, reorderDraftStore, reorderStore, ruleStats, runCtx, sequenceStore } from './reminders-model';
import { DiscountPicker, MessagePreview, SimNote, StatFigures, StatusBadge, TemplateEditor, type Lang } from './reminders-parts';

const rhref = (q: Record<string, string | undefined> = {}) => link('/dashboard/marketing/reminders', { r: 'reorder', ...q });
const blank = (id: string): ReorderRule => ({
  id, scope: { kind: 'product', id: '' }, days: 30, channel: 'email', status: 'draft', by: '', at: '', discount: { kind: 'none' },
  text: { ar: '{name}، هل حان وقت طلب {items} من جديد؟', en: '{name}, time to order {items} again?' },
});
const nextId = (rules: ReorderRule[]) => `RR-${Math.max(0, ...rules.map((r) => Number(r.id.replace(/\D/g, '')) || 0)) + 1}`;

/** Runs one simulated pass of a rule and writes deliveries and codes. */
function runRule(rule: ReorderRule) {
  const rules = reorderStore.get().map((r) => (r.id === rule.id ? rule : r));
  const p = passReorder(rule, rules, ordersStore.get(), customersStore.get(), productsStore.get(), deliveriesStore.get(), couponsStore.get(), sequenceStore.get().quiet, runCtx());
  deliveriesStore.set(p.deliveries);
  couponsStore.set(p.coupons);
  return p.summary;
}

export default function ReorderReminders({ route, canManage, canSend }: { route: Route; canManage: boolean; canSend: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const rules = reorderStore.use();
  const orders = ordersStore.use();
  const customers = customersStore.use();
  const products = productsStore.use();
  const deliveries = deliveriesStore.use();
  const sel = route.query.get('rule');

  // The scheduler: active rules run when the page opens (simulated).
  useEffect(() => { for (const r of reorderStore.get()) if (r.status === 'active') runRule(r); }, []);

  const scopeName = (r: ReorderRule) => {
    if (r.scope.kind === 'product') { const p = products.find((x) => x.id === r.scope.id); return p ? p.name[lang] : tx('منتج غير محدد', 'No product chosen'); }
    const c = products.find((x) => x.category.en === r.scope.id);
    return tx(`تصنيف ${c?.category.ar ?? r.scope.id}`, `${r.scope.id} category`);
  };
  const cands = (r: ReorderRule) => reorderCandidates(r, orders, customers, products, deliveries, rules.slice(0, rules.findIndex((x) => x.id === r.id)));

  if (sel) return <RuleEditor key={sel} id={sel} canManage={canManage} canSend={canSend} scopeName={scopeName} />;

  const cols: Column<ReorderRule>[] = [
    { key: 'n', header: tx('التذكير', 'Reminder'), cell: (r) => (
      <span className="flex items-center gap-3">
        <ProductImage src={r.scope.kind === 'product' ? productPhoto(r.scope.id) : undefined} alt={scopeName(r)} size={36} />
        <span className="min-w-0"><span className="block truncate font-semibold text-fg">{scopeName(r)}</span><span className="block text-xs text-muted"><Ref>{r.id}</Ref> · {tx(`بعد ${r.days} يومًا من الشراء`, `${r.days} days after purchase`)}</span></span>
      </span>
    ) },
    { key: 'c', header: tx('القناة والخصم', 'Channel & discount'), hideBelow: 'lg', cell: (r) => <span className="flex flex-wrap gap-1.5"><Badge>{r.channel === 'email' ? tx('بريد', 'Email') : tx('نصية', 'SMS')}</Badge><Badge tone={r.discount.kind === 'none' ? 'gray' : 'brand'}>{discountLabel(r.discount)[lang]}</Badge></span> },
    { key: 'w', header: tx('هذا الأسبوع', 'This week'), hideBelow: 'md', cell: (r) => { const c = cands(r); return <span className="tabular-nums">{c.due.length + c.week.length}</span>; } },
    { key: 'r', header: tx('النتيجة', 'Result'), hideBelow: 'md', cell: (r) => { const s = ruleStats(r, deliveries); return <span className="text-[13px]">{tx(`${s.sent} أُرسلت · ${s.recovered} اشترى`, `${s.sent} sent · ${s.recovered} bought`)}{s.revenue > 0 && <> · <Money v={s.revenue} /></>}</span>; } },
    { key: 's', header: tx('الحالة', 'Status'), align: 'end', cell: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <Card aria-labelledby="h-rr">
      <CardHeader id="h-rr" title={tx('تذكيرات إعادة الشراء', 'Reorder reminders')} hint={tx('يُذكَّر العميل بعد عدد أيام من آخر شراء للمنتج أو التصنيف. من اشترى مجددًا لا يُذكَّر.', 'The customer is reminded a number of days after their last purchase of the product or category. Anyone who bought again is not.')}
        action={canManage ? <LinkButton size="sm" href={rhref({ rule: 'new' })}><Plus className="size-4" aria-hidden="true" />{tx('تذكير جديد', 'New reminder')}</LinkButton> : undefined} />
      {rules.length === 0 ? (
        <EmptyState icon={<Repeat className="size-6" aria-hidden="true" />} title={tx('لا تذكيرات إعادة شراء', 'No reorder reminders')}
          action={canManage ? <LinkButton href={rhref({ rule: 'new' })}>{tx('أنشئ أول تذكير', 'Create the first reminder')}</LinkButton> : undefined}>
          {tx('مناسبة للمنتجات التي تنفد: العطور والبخور والقهوة.', 'Suits products that run out: perfume, bakhoor, coffee.')}
        </EmptyState>
      ) : (
        <div className="border-t border-border">
          <DataTable label={tx('تذكيرات إعادة الشراء', 'Reorder reminders')} rows={rules} columns={cols} rowKey={(r) => r.id} href={(r) => rhref({ rule: r.id })}
            card={(r) => { const s = ruleStats(r, deliveries); return (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2"><span className="truncate font-semibold text-fg">{scopeName(r)}</span><StatusBadge status={r.status} /></div>
                <p className="text-xs text-muted">{tx(`بعد ${r.days} يومًا · ${s.sent} أُرسلت · ${s.recovered} اشترى`, `${r.days} days · ${s.sent} sent · ${s.recovered} bought`)}</p>
              </div>
            ); }} />
        </div>
      )}
    </Card>
  );
}

type RDraft = ReorderRule & { daysText: string };

function RuleEditor({ id, canManage, canSend, scopeName }: { id: string; canManage: boolean; canSend: boolean; scopeName: (r: ReorderRule) => string }) {
  const tx = useTx();
  const { lang: uiLang } = useLang();
  const toast = useToast();
  const rules = reorderStore.use();
  const orders = ordersStore.use();
  const customers = customersStore.use();
  const products = productsStore.use();
  const deliveries = deliveriesStore.use();
  const coupons = couponsStore.use();
  const storeName = settingsStore.use().store.name;
  const savedDraft = reorderDraftStore.use();
  const existing = rules.find((r) => r.id === id);
  const base: RDraft = { ...(existing ?? blank('new')), daysText: String((existing ?? blank('new')).days) };
  const d: RDraft = savedDraft && savedDraft.id === id ? { ...savedDraft, daysText: (savedDraft as RDraft).daysText ?? String(savedDraft.days) } : base;
  const dirty = JSON.stringify(d) !== JSON.stringify(base);
  useUnsaved(dirty, { ar: 'تذكير إعادة الشراء', en: 'Reorder reminder' });
  const [lang, setLang] = useState<Lang>(uiLang);
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState<'activate' | 'pause' | null>(null);

  if (!existing && id !== 'new') return (
    <Card><EmptyState as="h2" icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('التذكير غير موجود', 'Reminder not found')} action={<LinkButton variant="secondary" href={rhref()}>{tx('كل التذكيرات', 'All reminders')}</LinkButton>} /></Card>
  );

  const set = (p: Partial<RDraft>) => reorderDraftStore.set({ ...d, ...p } as ReorderRule);
  const days = /^\d+$/.test(toLatin(d.daysText)) ? Number(toLatin(d.daysText)) : NaN;
  const rule: ReorderRule = { ...d, days: Number.isFinite(days) ? days : d.days };
  delete (rule as Partial<RDraft>).daysText;
  const e = stepErrors({ id: 'x', afterHours: 0, channel: d.channel, text: d.text, discount: d.discount, on: true }, undefined, MESSAGE_MAX[d.channel], coupons);
  const dayErr = !Number.isInteger(days) || days < 3 || days > 365;
  const scopeErr = !d.scope.id;
  const shown = (k: StepError[]) => (tried ? k.find((x) => e.includes(x)) : undefined);
  const msg = (k: StepError | undefined) => k ? ({
    textAr: tx('اكتب النص العربي', 'Write the Arabic text'), textEn: tx('اكتب النص الإنجليزي', 'Write the English text'), long: tx('أطول من حد القناة', 'Longer than the channel limit'),
    placeholder: tx('متغير غير معروف', 'Unknown field'), pct: tx('من 1 إلى 50', 'From 1 to 50'), days: tx('من 1 إلى 14 يومًا', '1 to 14 days'), coupon: tx('اختر كوبونًا', 'Choose a coupon'), order: '', codeMissing: tx('أضف «كود الخصم» إلى النص', 'Add “Discount code” to the text'),
  } as Record<StepError, string>)[k] : null;
  const nErr = e.length + (dayErr ? 1 : 0) + (scopeErr ? 1 : 0);
  const opts = scopeOptions(products.filter((p) => p.type !== 'digital'));

  const others = rules.filter((r) => r.id !== id);
  const order = existing ? rules.findIndex((r) => r.id === id) : rules.length;
  const c = d.scope.id && !dayErr ? reorderCandidates(rule, orders, customers, products, deliveries, [...rules.slice(0, order)].filter((r) => r.id !== id)) : null;
  const stats = existing ? ruleStats(existing, deliveries) : null;
  const problem = existing ? reminderProblems({ ...sequenceStore.get(), steps: [] }, [existing], deliveries, coupons)[0] : undefined;
  const sample = c?.due[0] ?? c?.week[0];
  const vars = {
    name: sample?.name[lang].split(' ')[0] ?? (lang === 'ar' ? 'سارة' : 'Sara'), store: storeName, items: sample?.item[lang] ?? (d.scope.id ? scopeName(rule) : '…'),
    code: d.discount.kind === 'existing' ? d.discount.code : 'LK7Q2M9X',
    expiry: d.discount.kind === 'generated' ? new Date(Date.parse(`${TODAY}T00:00:00Z`) + d.discount.validDays * 86400000).toISOString().slice(0, 10) : '—',
  };
  const avgDisc = d.discount.kind === 'none' || !c?.due.length ? 0 : Math.round(c.due.reduce((s, x) => {
    const cp = d.discount.kind === 'existing' ? coupons.find((k) => k.code === (d.discount as { code: string }).code) : { type: 'percent', value: (d.discount as { pct: number }).pct };
    return s + (cp?.type === 'percent' ? Math.floor((x.value * cp.value) / 100) : cp?.type === 'fixed' ? Math.min(cp.value, x.value) : 0);
  }, 0) / c.due.length);

  const persist = (status: ReorderRule['status']) => {
    const newId = existing ? id : nextId(rules);
    const next: ReorderRule = { ...rule, id: newId, status, by: tx('أنت', 'You'), at: TODAY };
    reorderStore.set((rs) => (existing ? rs.map((r) => (r.id === id ? next : r)) : [...rs, next]));
    reorderDraftStore.set(null);
    setTried(false); setConfirm(null);
    return next;
  };
  const save = () => {
    setTried(true);
    if (nErr) return;
    if (existing?.status === 'active') { if (canSend) setConfirm('activate'); return; }
    const next = persist(existing?.status ?? 'draft');
    logAction('marketing', existing ? { ar: `عدّل تذكير إعادة الشراء ${next.id}`, en: `Changed reorder reminder ${next.id}` } : { ar: `أنشأ تذكير إعادة الشراء ${next.id} (مسودة)`, en: `Created reorder reminder ${next.id} (draft)` }, { target: next.id });
    toast({ tone: 'ok', text: tx('حُفظ. لا يُرسل شيء حتى التفعيل.', 'Saved. Nothing is sent until you activate.') });
    if (!existing) setTimeout(() => navigate(rhref({ rule: next.id })), 0);
  };
  const activate = () => {
    const next = persist('active');
    logAction('marketing', { ar: `فعّل تذكير إعادة الشراء ${next.id} (${scopeName(next)}، بعد ${next.days} يومًا)`, en: `Activated reorder reminder ${next.id} (${scopeName(next)}, ${next.days} days)` }, { target: next.id });
    const r = runRule(next);
    toast({ tone: 'ok', text: tx(`يعمل الآن. أُرسلت ${r.sent}، وتنتظر ${r.deferred} انتهاء ساعات الهدوء.`, `Running. ${r.sent} sent, ${r.deferred} waiting for quiet hours.`) });
    if (!existing) setTimeout(() => navigate(rhref({ rule: next.id })), 0);
  };
  const togglePause = () => {
    if (!existing) return;
    const status = existing.status === 'active' ? 'paused' : 'active';
    reorderStore.set((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    logAction('marketing', status === 'paused' ? { ar: `أوقف تذكير إعادة الشراء ${id}`, en: `Paused reorder reminder ${id}` } : { ar: `استأنف تذكير إعادة الشراء ${id}`, en: `Resumed reorder reminder ${id}` }, { target: id });
    if (status === 'active') runRule({ ...existing, status });
    setConfirm(null);
    toast({ tone: 'ok', text: status === 'paused' ? tx('أُوقف.', 'Paused.') : tx('استؤنف.', 'Resumed.') });
  };
  const retry = () => {
    if (!existing) return;
    const ctx = runCtx();
    const ok = existing.discount.kind !== 'existing' || couponLive(coupons.find((k) => k.code === (existing.discount as { code: string }).code));
    let n = 0;
    deliveriesStore.set((list) => list.map((x) => { if (x.source !== id || x.status !== 'failed') return x; const y = retryDelivery(x, ctx, sequenceStore.get().quiet, (x.customerId ?? '').endsWith('7'), ok); if (y.status === 'sent') n++; return y; }));
    logAction('marketing', { ar: `أعاد محاولة تذكير إعادة الشراء ${id}: نجحت ${n}`, en: `Retried reorder reminder ${id}: ${n} succeeded` }, { target: id });
    toast({ tone: n ? 'ok' : 'bad', text: n ? tx(`أُرسلت ${n}.`, `${n} sent.`) : tx('ما زال السبب قائمًا.', 'The cause is still there.') });
  };

  const due: Column<ReorderCandidate>[] = [
    { key: 'c', header: tx('العميل', 'Customer'), cell: (x) => <span className="block"><span className="block font-semibold text-fg">{x.name[uiLang]}</span><span className="text-xs text-muted"><Ref>{x.customerId}</Ref></span></span> },
    { key: 'p', header: tx('آخر شراء', 'Last purchase'), hideBelow: 'md', cell: (x) => <span className="text-[13px]">{x.item[uiLang]} · {tx(`قبل ${x.daysSince} يومًا`, `${x.daysSince} days ago`)} · <Ref>#{x.orderRef}</Ref></span> },
    { key: 'w', header: tx('التذكير', 'Reminder'), align: 'end', cell: (x) => x.dueIn <= 0 ? <Badge tone="brand">{x.dueIn === 0 ? tx('اليوم', 'Today') : tx(`مستحق منذ ${-x.dueIn} ي`, `Due ${-x.dueIn}d ago`)}</Badge> : <Badge>{tx(`بعد ${x.dueIn} ي`, `In ${x.dueIn}d`)}</Badge> },
  ];
  const rows = c ? [...c.due, ...c.week] : [];
  const status = existing?.status ?? 'draft';

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start gap-4 p-5">
          <div className="min-w-0 flex-1">
            <a href={rhref()} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300"><ArrowLeft className="size-3.5 rtl:rotate-180" aria-hidden="true" />{tx('كل تذكيرات إعادة الشراء', 'All reorder reminders')}</a>
            <h2 className="mt-1 flex flex-wrap items-center gap-2 text-base font-bold text-fg">{existing ? scopeName(existing) : tx('تذكير إعادة شراء جديد', 'New reorder reminder')}<StatusBadge status={status} />{dirty && <Badge tone="amber">{tx('تعديلات غير محفوظة', 'Unsaved edits')}</Badge>}</h2>
            {existing && <p className="mt-1 text-sm text-muted"><Ref>{existing.id}</Ref>{existing.by && <> · {tx(`آخر تعديل: ${existing.by} ${existing.at}`, `Last change: ${existing.by} ${existing.at}`)}</>}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {existing && status !== 'draft' && canSend && !dirty && <Button variant="secondary" onClick={() => setConfirm('pause')}>{status === 'active' ? <><Pause className="size-4" aria-hidden="true" />{tx('أوقف', 'Pause')}</> : <><Play className="size-4" aria-hidden="true" />{tx('استأنف', 'Resume')}</>}</Button>}
            {status === 'draft' && canSend && <Button className="bg-brand-gradient" onClick={() => { setTried(true); if (!nErr) setConfirm('activate'); }}><Play className="size-4" aria-hidden="true" />{tx('راجع ثم فعّل', 'Review and activate')}</Button>}
            {!canSend && <Locked>{tx('دورك لا يشمل تفعيل الرسائل.', 'Your role does not include activating messages.')}</Locked>}
          </div>
        </div>
      </Card>

      {problem && (
        <Alert tone="bad" title={tx('هذا التذكير لا يصل للعملاء', 'This reminder is not reaching customers')} action={canSend && problem.kind === 'failing' ? <Button size="sm" variant="secondary" onClick={retry}><RotateCw className="size-3.5" aria-hidden="true" />{tx('أعد المحاولة', 'Retry')}</Button> : undefined}>
          {problem.kind === 'failing' ? tx(`${problem.count} رسالة فشلت: ${problem.reason === 'provider' ? 'مزوّد الرسائل لا يستجيب' : 'الكوبون لا يعمل اليوم'}.`, `${problem.count} failed: ${problem.reason === 'provider' ? 'the message provider is not responding' : 'the coupon does not work today'}.`) : tx(`الكوبون ${problem.code} لم يعد يعمل. غيّر الخصم.`, `Coupon ${problem.code} no longer works. Change the discount.`)}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" aria-labelledby="h-rule">
          <CardHeader id="h-rule" title={tx('الإعداد', 'Setup')} />
          <div className="grid grid-cols-1 gap-5 px-5 pb-5 md:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-[13px] font-semibold text-fg">{tx('ماذا اشترى', 'What they bought')}</p>
                <Segmented label={tx('النطاق', 'Scope')} value={d.scope.kind} onChange={(k) => canManage && set({ scope: { kind: k, id: '' } })} options={[{ value: 'product', label: tx('منتج', 'Product') }, { value: 'category', label: tx('تصنيف', 'Category') }]} />
              </div>
              <Field label={d.scope.kind === 'product' ? tx('المنتج', 'Product') : tx('التصنيف', 'Category')} error={tried && scopeErr ? tx('اختر واحدًا', 'Choose one') : null}>
                {(p) => <Select {...p} value={d.scope.id} disabled={!canManage} onChange={(ev) => set({ scope: { ...d.scope, id: ev.target.value } })}>
                  <option value="">{tx('اختر…', 'Choose…')}</option>
                  {d.scope.kind === 'product' ? opts.products.map((o) => <option key={o.id} value={o.id}>{o.name[uiLang]} · {o.sku}</option>) : opts.categories.map((o) => <option key={o.id} value={o.id}>{o.name[uiLang]} ({o.count})</option>)}
                </Select>}
              </Field>
              <div className="flex flex-wrap items-end gap-3">
                <Field label={tx('ذكّره بعد (أيام)', 'Remind after (days)')} error={tried && dayErr ? tx('من 3 إلى 365', '3 to 365') : null} className="w-40">
                  {(p) => <Input {...p} dir="ltr" inputMode="numeric" value={d.daysText} disabled={!canManage} onChange={(ev) => set({ daysText: ev.target.value })} />}
                </Field>
                <div className="space-y-1.5">
                  <p className="text-[13px] font-semibold text-fg">{tx('القناة', 'Channel')}</p>
                  <Segmented label={tx('القناة', 'Channel')} value={d.channel} onChange={(v) => canManage && set({ channel: v })} options={[{ value: 'email', label: tx('بريد', 'Email') }, { value: 'sms', label: tx('نصية', 'SMS') }]} />
                </div>
              </div>
              <DiscountPicker value={d.discount} onChange={(v) => set({ discount: v })} coupons={coupons} disabled={!canManage} errors={{ coupon: msg(shown(['coupon'])), pct: msg(shown(['pct'])), days: msg(shown(['days'])) }} />
            </div>
            <div className="space-y-4">
              <TemplateEditor value={d.text} onChange={(v) => set({ text: v })} channel={d.channel} disabled={!canManage} lang={lang} setLang={setLang}
                errors={{ ar: msg(shown(['textAr'])), en: msg(shown(['textEn'])), other: msg(shown(['long', 'placeholder', 'codeMissing'])) }} />
              <MessagePreview text={d.text} channel={d.channel} lang={lang} vars={vars} subject={{ ar: 'حان وقت التجديد؟', en: 'Time to restock?' }} />
            </div>
          </div>
        </Card>

        <Card aria-labelledby="h-week">
          <CardHeader id="h-week" title={tx('من سيُذكَّر هذا الأسبوع', 'Who gets reminded this week')} hint={tx('من آخر طلب مدفوع لكل عميل فيه المنتج. من اشترى مجددًا لا يظهر.', 'From each customer’s latest paid order with the product. Anyone who bought again is left out.')} />
          {!c ? <p className="px-5 pb-5 text-sm text-muted">{tx('اختر المنتج أو التصنيف والمدة.', 'Choose the product or category and the days.')}</p> : (
            <div className="space-y-3 pb-4">
              <dl className="grid grid-cols-2 gap-3 px-5">
                <div className="rounded-xl bg-brand-500/8 px-3 py-2"><dt className="text-xs text-muted">{tx('مستحق الآن', 'Due now')}</dt><dd className="text-xl font-semibold tabular-nums text-fg">{c.due.length}</dd></div>
                <div className="rounded-xl bg-surface-2 px-3 py-2"><dt className="text-xs text-muted">{tx('خلال 7 أيام', 'Next 7 days')}</dt><dd className="text-xl font-semibold tabular-nums text-fg">{c.week.length}</dd></div>
              </dl>
              <p className="flex flex-wrap items-center gap-1 px-5 text-xs text-muted"><Users className="size-3.5" aria-hidden="true" />{tx(`مستبعد: ${c.excluded.noConsent} بلا موافقة · ${c.excluded.blocked} محظور · ${c.excluded.reminded} ذُكّر · ${c.excluded.otherRule} يغطيه تذكير آخر`, `Left out: ${c.excluded.noConsent} no consent · ${c.excluded.blocked} blocked · ${c.excluded.reminded} already reminded · ${c.excluded.otherRule} covered by another reminder`)}</p>
              {rows.length === 0 ? <p className="px-5 text-sm text-muted">{tx('لا أحد هذا الأسبوع.', 'Nobody this week.')}</p> : (
                <div className="border-t border-border">
                  <ul className="divide-y divide-border" aria-label={tx('من سيُذكَّر', 'Who gets reminded')}>
                    {rows.slice(0, 8).map((x) => (
                      <li key={x.orderRef} className="flex items-center justify-between gap-3 px-5 py-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-fg">{x.name[uiLang]}</span>
                          <span className="block truncate text-xs text-muted">{tx(`اشترى قبل ${x.daysSince} يومًا`, `Bought ${x.daysSince} days ago`)} · <Ref>#{x.orderRef}</Ref></span>
                        </span>
                        {due[2].cell(x)}
                      </li>
                    ))}
                  </ul>
                  {rows.length > 8 && <p className="px-5 pt-2 text-xs text-muted">{tx(`و${rows.length - 8} غيرهم`, `and ${rows.length - 8} more`)}</p>}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {existing && stats && (
        <Card aria-labelledby="h-rres">
          <CardHeader id="h-rres" title={tx('النتائج', 'Results')} hint={tx('«اشترى مجددًا» = طلب المنتج خلال صلاحية الرسالة (محاكاة). الإيراد بعد الخصم.', '“Bought again” = ordered the product within the message window (simulated). Revenue after discount.')} />
          <div className="space-y-3 px-5 pb-5">
            {stats.sent + stats.failed === 0 ? <p className="text-sm text-muted">{status === 'active' ? tx('لا رسائل بعد: لم يحن موعد أحد.', 'No messages yet: nobody is due.') : tx('تظهر النتائج بعد التفعيل.', 'Results appear after activation.')}</p> : <StatFigures s={stats} recoveredLabel={tx('اشترى مجددًا', 'Bought again')} />}
            {stats.failed > 0 && <p className="flex flex-wrap items-center gap-2 text-sm text-red-700 dark:text-red-300">{tx(`فشلت ${stats.failed}`, `${stats.failed} failed`)}{canSend && <Button size="sm" variant="secondary" onClick={retry}><RotateCw className="size-3.5" aria-hidden="true" />{tx('أعد المحاولة', 'Retry')}</Button>}</p>}
            <SimNote />
          </div>
        </Card>
      )}

      {canManage && <SaveBar dirty={dirty} onSave={save} onDiscard={() => { reorderDraftStore.set(null); setTried(false); if (!existing) setTimeout(() => navigate(rhref()), 0); }}
        error={tried && nErr ? tx(`صحّح ${nErr} قبل الحفظ`, `Fix ${nErr} before saving`) : undefined}
        saveLabel={existing?.status === 'active' ? tx('راجع ثم احفظ', 'Review and save') : existing ? tx('احفظ', 'Save') : tx('احفظ كمسودة', 'Save as draft')} />}

      {confirm === 'activate' && c && (
        <Modal title={status === 'active' ? tx('حفظ تذكير يعمل', 'Save a running reminder') : tx('تفعيل تذكير إعادة الشراء', 'Activate the reorder reminder')} onClose={() => setConfirm(null)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>{tx('رجوع', 'Back')}</Button><Button onClick={activate}><Play className="size-4" aria-hidden="true" />{status === 'active' ? tx('احفظ وطبّق', 'Save and apply') : tx('فعّل الآن', 'Activate now')}</Button></>}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-surface-2 px-3 py-2.5"><dt className="text-xs text-muted">{tx('يُرسل الآن', 'Sent now')}</dt><dd className="mt-0.5 font-semibold tabular-nums">{c.due.length}</dd></div>
            <div className="rounded-xl bg-surface-2 px-3 py-2.5"><dt className="text-xs text-muted">{tx('خلال 7 أيام', 'Next 7 days')}</dt><dd className="mt-0.5 font-semibold tabular-nums">{c.week.length}</dd></div>
            <div className="rounded-xl bg-surface-2 px-3 py-2.5"><dt className="flex items-center gap-1 text-xs text-muted">{tx('تكلفة الأسبوع', 'Cost this week')}<Badge tone="amber">{tx('سعر اختبار', 'Test rate')}</Badge></dt><dd className="mt-0.5 font-semibold"><Money v={(c.due.length + c.week.length) * TEST_RATE[d.channel]} /></dd></div>
            <div className="rounded-xl bg-surface-2 px-3 py-2.5"><dt className="flex items-center gap-1 text-xs text-muted">{tx('متوسط الخصم للطلب', 'Average discount per order')}<InfoHint>{tx('على قيمة آخر شراء؛ يُحسم فقط إن اشترى بالكود.', 'On the last purchase value; only taken if they buy with the code.')}</InfoHint></dt><dd className="mt-0.5 font-semibold">{d.discount.kind === 'none' ? '—' : <Money v={avgDisc} />}</dd></div>
          </dl>
          <ul className="list-disc space-y-1 ps-5 text-sm text-muted">
            <li>{tx(`كل عميل يصله تذكير واحد لكل طلب، بعد ${rule.days} يومًا من الشراء.`, `Each customer gets one reminder per order, ${rule.days} days after buying.`)}</li>
            <li>{tx('يتبع ساعات الهدوء نفسها في تذكيرات السلة.', 'Follows the same quiet hours as cart reminders.')}</li>
            {others.some((r) => r.status === 'active') && <li>{tx('إن غطّى تذكير آخر نفس المنتج، يُرسل الأقدم فقط.', 'If another reminder covers the same product, only the older one is sent.')}</li>}
          </ul>
          <SimNote />
        </Modal>
      )}
      {confirm === 'pause' && existing && (
        <Modal title={status === 'active' ? tx('إيقاف التذكير', 'Pause the reminder') : tx('استئناف التذكير', 'Resume the reminder')} onClose={() => setConfirm(null)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>{tx('رجوع', 'Back')}</Button><Button variant={status === 'active' ? 'danger' : 'primary'} onClick={togglePause}>{status === 'active' ? tx('أوقف', 'Pause') : tx('استأنف', 'Resume')}</Button></>}>
          <p className="text-sm text-muted">{status === 'active' ? tx('لن تُرسل تذكيرات جديدة. ما أُرسل لا يُسترجع.', 'No new reminders go out. Sent ones are not recalled.') : tx(`يُستأنف ويُرسل المستحق الآن (${c?.due.length ?? 0}).`, `Resumes and sends what is due now (${c?.due.length ?? 0}).`)}</p>
        </Modal>
      )}
    </div>
  );
}
