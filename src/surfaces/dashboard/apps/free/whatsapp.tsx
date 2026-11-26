// WhatsApp Business app settings (`#/dashboard/apps/free/whatsapp`): simulated connection (number, display name,
// review), which order events also go by WhatsApp (templates stay in Settings → Notifications), consent-only sending
// and quiet hours, a WhatsApp step for abandoned carts, the floating store button, and results.
import { useMemo, useState } from 'react';
import { CheckCircle2, Clock3, ExternalLink, Link2, MessageCircle, RefreshCw, Send, ShieldCheck, ShoppingCart, Unplug, XCircle } from 'lucide-react';
import { useLang } from '../../../../core/lang';
import { link } from '../../../../core/router';
import { useReviewMode } from '../../../../core/review';
import { cartsStore, logAction, noticeCtx, noticesStore, ordersStore, settingsStore } from '../../../merchant/stores';
import { ORDER_NOTICES, RETURN_NOTICES, renderNotice, noticeVars, customerLang, type NoticeEvent } from '../../../merchant/ops';
import { Badge, Button, Card, CardHeader, EmptyState, InfoHint, LinkButton, Money, Ref, Segmented, cn, useTx } from '../../../../ds/ui';
import { Alert, Field, Input, Modal, SaveBar, Select, Simulated, Switch, Textarea, useToast } from '../../../../ds/kit';
import { useNoticeName } from '../../orders/notices-ui';
import { freeAppsStore, saveAppSettings } from './registry';
import {
  WA_CART_HOURS, cartPlan, cartResults, formatPhone, messageStats, normalisePhone, prefill, renderCartText, reviewName, riyadhHourOf, runCartStep, waErrors, waSettingsOf, waMeLink,
  type WaCartReason, type WaPage, type WaSettings,
} from './whatsapp-model';
import { waDeliveriesStore } from './integrations-state';
import { AppStates, HOURS, LabeledSwitch, Stat, Stats, hourLabel, useAppForm } from './integrations-ui';

const EVENTS: NoticeEvent[] = [...ORDER_NOTICES, ...RETURN_NOTICES];
type Form = WaSettings & { channels: Record<string, boolean> };

export default function WhatsAppApp() {
  return <AppStates><Screen /></AppStates>;
}

function Screen() {
  const tx = useTx();
  const toast = useToast();
  const apps = freeAppsStore.use();
  const notices = noticesStore.use();
  const saved = waSettingsOf(apps);
  const base: Form = useMemo(() => ({ ...saved, channels: Object.fromEntries(EVENTS.map((e) => [e, !!notices.channels[e]?.whatsapp])) }), [apps.whatsapp, notices]); // eslint-disable-line react-hooks/exhaustive-deps
  const f = useAppForm<Form>('whatsapp', base, { ar: 'إعدادات واتساب', en: 'WhatsApp settings' });
  const d = f.draft;
  const errs = waErrors(d);
  const on = !!apps.whatsapp?.on;
  const live = on && saved.status === 'approved';

  const save = () => {
    if (errs.length) return;
    const { channels, ...s } = d;
    // A new number or name goes back to review.
    const changed = saved.status !== 'none' && (normalisePhone(s.phone) !== normalisePhone(saved.phone) || s.displayName.trim() !== saved.displayName.trim());
    const next: WaSettings = { ...s, phone: s.phone.trim(), displayName: s.displayName.trim(), ...(changed ? { status: 'pending' as const, requestedAt: new Date().toISOString(), rejectReason: undefined } : {}) };
    f.commit(d, { ar: 'حفظ إعدادات واتساب للأعمال', en: 'Saved WhatsApp Business settings' }, () => {
      saveAppSettings('whatsapp', next);
      noticesStore.set((n) => ({ ...n, channels: Object.fromEntries(Object.entries(n.channels).map(([e, c]) => [e, e in channels ? { ...c, whatsapp: channels[e] } : c])) as typeof n.channels }));
    });
  };

  return (
    <div className="space-y-6">
      <Results live={live} />
      <Connection saved={saved} d={d} set={f.set} dirty={f.dirty} errs={errs} />
      <OrderMessages d={d} set={f.set} live={live} />
      <ConsentQuiet d={d} set={f.set} />
      <CartStep d={d} set={f.set} dirty={f.dirty} live={live} errs={errs} />
      <FloatButton d={d} set={f.set} errs={errs} />
      <SaveBar dirty={f.dirty} saving={f.saving} onDiscard={() => { f.discard(); toast({ tone: 'info', text: tx('تُجوهلت التعديلات', 'Edits discarded') }); }} onSave={save}
        error={errs.length ? tx('صحّح الحقول المعلّمة قبل الحفظ', 'Fix the marked fields before saving') : undefined} />
    </div>
  );
}

function StatusBadge({ s }: { s: WaSettings['status'] }) {
  const tx = useTx();
  if (s === 'approved') return <Badge tone="green" icon={<CheckCircle2 className="size-3.5" aria-hidden="true" />}>{tx('معتمد', 'Approved')}</Badge>;
  if (s === 'pending') return <Badge tone="amber" icon={<Clock3 className="size-3.5" aria-hidden="true" />}>{tx('قيد مراجعة Meta', 'In Meta review')}</Badge>;
  if (s === 'rejected') return <Badge tone="red" icon={<XCircle className="size-3.5" aria-hidden="true" />}>{tx('مرفوض', 'Rejected')}</Badge>;
  return <Badge tone="gray">{tx('غير مربوط', 'Not connected')}</Badge>;
}

function Connection({ saved, d, set, dirty, errs }: { saved: WaSettings; d: Form; set: (p: Partial<Form>) => void; dirty: boolean; errs: string[] }) {
  const tx = useTx();
  const toast = useToast();
  const review = useReviewMode();
  const [forceReject, setForceReject] = useState(false);
  const phone = normalisePhone(saved.phone);
  const canRequest = !dirty && !!phone && saved.displayName.trim().length >= 3;
  const request = () => {
    saveAppSettings('whatsapp', { status: 'pending', requestedAt: new Date().toISOString(), rejectReason: undefined });
    logAction('apps', { ar: `طلب ربط واتساب للرقم ${formatPhone(phone!)}`, en: `Requested WhatsApp connection for ${formatPhone(phone!)}` }, { target: 'whatsapp' });
    toast({ tone: 'info', text: tx('أُرسل الطلب لمراجعة Meta (محاكاة)', 'Sent for Meta review (simulated)') });
  };
  const check = () => {
    const r = forceReject ? { status: 'rejected' as const, reason: 'brand' as const } : reviewName(saved.displayName);
    saveAppSettings('whatsapp', r.status === 'approved' ? { status: 'approved', rejectReason: undefined } : { status: 'rejected', rejectReason: r.reason });
    logAction('apps', { ar: `نتيجة مراجعة واتساب: ${r.status === 'approved' ? 'معتمد' : 'مرفوض'}`, en: `WhatsApp review result: ${r.status}` }, { target: 'whatsapp' });
    toast({ tone: r.status === 'approved' ? 'ok' : 'bad', text: r.status === 'approved' ? tx('اعتُمد الرقم. الرسائل تعمل الآن.', 'Number approved. Messages are live.') : tx('رُفض اسم العرض. عدّله وأعد الطلب.', 'Display name rejected. Edit it and request again.') });
  };
  const disconnect = () => {
    saveAppSettings('whatsapp', { status: 'none', rejectReason: undefined });
    logAction('apps', { ar: 'فصل رقم واتساب', en: 'Disconnected the WhatsApp number' }, { target: 'whatsapp' });
    toast({ tone: 'info', text: tx('فُصل الرقم وتوقفت رسائل واتساب', 'Disconnected; WhatsApp messages stopped') });
  };
  return (
    <Card>
      <CardHeader id="wa-conn" title={tx('الحساب', 'Account')} hint={tx('الربط عبر واجهة Meta الرسمية. في هذه المعاينة المراجعة والإرسال محاكاة.', 'Through Meta’s official API. In this preview the review and sending are simulated.')}
        action={<div className="flex items-center gap-2"><Simulated /><StatusBadge s={saved.status} /></div>} />
      <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
        <Field label={tx('رقم واتساب للأعمال', 'WhatsApp Business number')} error={errs.includes('phone') ? tx('رقم غير صحيح، مثل 05xxxxxxxx', 'Invalid number, e.g. 05xxxxxxxx') : null}>
          {(p) => <Input {...p} dir="ltr" inputMode="tel" placeholder="05x xxx xxxx" value={d.phone} onChange={(e) => set({ phone: e.target.value })} />}
        </Field>
        <Field label={tx('اسم العرض', 'Display name')} hint={tx('يظهر للعميل؛ دون كلمة «واتساب»', 'Shown to customers; no “WhatsApp”')} error={errs.includes('name') ? tx('ثلاثة أحرف على الأقل', 'At least three letters') : errs.includes('nameLong') ? tx('٤٠ حرفًا كحد أقصى', '40 characters at most') : null}>
          {(p) => <Input {...p} value={d.displayName} onChange={(e) => set({ displayName: e.target.value })} />}
        </Field>
        {saved.status === 'rejected' && (
          <div className="sm:col-span-2"><Alert tone="bad" title={tx('رفضت Meta اسم العرض', 'Meta rejected the display name')}>{saved.rejectReason === 'brand' ? tx('لا يُسمح باستخدام «واتساب» في الاسم. استخدم اسم متجرك.', '“WhatsApp” isn’t allowed in the name. Use your store name.') : tx('الاسم قصير جدًا.', 'The name is too short.')}</Alert></div>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          {(saved.status === 'none' || saved.status === 'rejected') && <Button onClick={request} disabled={!canRequest}><Link2 className="size-4" aria-hidden="true" />{saved.status === 'rejected' ? tx('أعد طلب المراجعة', 'Request review again') : tx('اطلب الربط', 'Request connection')}</Button>}
          {saved.status === 'pending' && <Button variant="secondary" onClick={check}><RefreshCw className="size-4" aria-hidden="true" />{tx('تحقق من نتيجة المراجعة', 'Check review result')}</Button>}
          {saved.status !== 'none' && <Button variant="ghost" onClick={disconnect}><Unplug className="size-4" aria-hidden="true" />{tx('افصل الرقم', 'Disconnect')}</Button>}
          {!canRequest && (saved.status === 'none' || saved.status === 'rejected') && <span className="text-xs text-muted">{dirty ? tx('احفظ الرقم والاسم أولًا', 'Save the number and name first') : tx('أدخل الرقم واسم العرض واحفظهما', 'Enter and save the number and display name')}</span>}
          {saved.status === 'pending' && saved.requestedAt && <span className="text-xs text-muted">{tx('أُرسل الطلب', 'Requested')} <Ref>{saved.requestedAt.slice(0, 16).replace('T', ' ')}</Ref></span>}
          {review && saved.status === 'pending' && <span className="ms-auto"><Switch checked={forceReject} onChange={setForceReject} label={tx('محاكاة: ارفض المراجعة', 'Simulate: reject the review')} /></span>}
        </div>
      </div>
    </Card>
  );
}

function OrderMessages({ d, set, live }: { d: Form; set: (p: Partial<Form>) => void; live: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const name = useNoticeName();
  const notices = noticesStore.use();
  const orders = ordersStore.use();
  const sample = orders.find((o) => o.ref === '10477') ?? orders[0];
  const [pv, setPv] = useState<NoticeEvent>('shipped');
  const body = sample ? renderNotice(notices.templates[pv].body[lang], noticeVars(sample, noticeCtx(sample), lang)) : '';
  const count = EVENTS.filter((e) => d.channels[e]).length;
  return (
    <Card>
      <CardHeader id="wa-msgs" title={tx('رسائل حالة الطلب', 'Order status messages')} hint={tx('نفس قوالب «إشعارات العملاء» تصل عبر واتساب أيضًا. النص يُعدّل من الإعدادات.', 'The same customer-notification templates also go by WhatsApp. Edit the text in Settings.')}
        action={<Badge tone={count ? 'brand' : 'gray'}>{tx(`${count} حالة`, `${count} events`)}</Badge>} />
      {!live && <div className="px-5 pb-3"><Alert tone="warn">{tx('لا يُرسل شيء عبر واتساب حتى يُعتمد الرقم والتطبيق مفعّل.', 'Nothing goes by WhatsApp until the number is approved and the app is on.')}</Alert></div>}
      <div className="grid gap-5 px-5 pb-5 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <ul className="divide-y divide-border rounded-xl border border-border">
          {EVENTS.map((e) => (
            <li key={e} className={cn('flex items-center gap-3 px-4 py-2.5', pv === e && 'bg-surface-2')}>
              <button type="button" className="min-w-0 flex-1 text-start text-sm text-fg hover:underline" onClick={() => setPv(e)} aria-pressed={pv === e}>{name(e)}</button>
              <Switch checked={!!d.channels[e]} onChange={(v) => set({ channels: { ...d.channels, [e]: v } })} label={tx(`واتساب: ${name(e)}`, `WhatsApp: ${name(e)}`)} />
            </li>
          ))}
        </ul>
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted">{tx('معاينة', 'Preview')} · {name(pv)} · <Ref>#{sample?.ref}</Ref></p>
          <div className="rounded-2xl bg-[#e7f7e4] p-3 text-sm text-[#102a12] dark:bg-emerald-950 dark:text-emerald-50" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <p className="whitespace-pre-wrap rounded-xl bg-white/80 p-3 shadow-sm dark:bg-emerald-900/60">{body}</p>
          </div>
          <a href={link('/dashboard/settings/notifications', { tab: 'customers', event: pv })} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('عدّل نص الرسالة', 'Edit the message text')}<ExternalLink className="size-3.5" aria-hidden="true" /></a>
          {sample && <p className="text-xs text-muted">{tx('لغة العميل', 'Customer language')}: {customerLang(sample, notices) === 'ar' ? 'العربية' : 'English'}</p>}
        </div>
      </div>
    </Card>
  );
}

function ConsentQuiet({ d, set }: { d: Form; set: (p: Partial<Form>) => void }) {
  const tx = useTx();
  return (
    <Card>
      <CardHeader id="wa-quiet" title={tx('الموافقة وساعات الهدوء', 'Consent and quiet hours')} />
      <div className="space-y-4 px-5 pb-5">
        <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
          <ShieldCheck className="size-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-fg">{tx('الإرسال للعملاء الموافقين على التواصل بالجوال فقط', 'Only customers who consented to mobile messages')}<InfoHint>{tx('لا يمكن إيقافه. العميل بلا موافقة تُسجَّل رسالته «متخطاة».', 'Can’t be turned off. Customers without consent are recorded as skipped.')}</InfoHint></p>
          <Badge tone="green">{tx('دائمًا', 'Always')}</Badge>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <span className="pb-2"><LabeledSwitch checked={d.quiet.on} onChange={(v) => set({ quiet: { ...d.quiet, on: v } })} label={tx('ساعات هدوء', 'Quiet hours')} /></span>
          <Field label={tx('من', 'From')} className="w-28">{(p) => <Select {...p} disabled={!d.quiet.on} value={d.quiet.from} onChange={(e) => set({ quiet: { ...d.quiet, from: Number(e.target.value) } })}>{HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</Select>}</Field>
          <Field label={tx('إلى', 'To')} className="w-28" error={d.quiet.on && d.quiet.from === d.quiet.to ? tx('اختر وقتين مختلفين', 'Pick two different times') : null}>{(p) => <Select {...p} disabled={!d.quiet.on} value={d.quiet.to} onChange={(e) => set({ quiet: { ...d.quiet, to: Number(e.target.value) } })}>{HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</Select>}</Field>
          <span className="pb-2 text-xs text-muted">{tx('بتوقيت الرياض', 'Riyadh time')}</span>
        </div>
        <LabeledSwitch checked={d.quietOrders} onChange={(v) => set({ quietOrders: v })} label={tx('أوقف رسائل حالة الطلب أيضًا في ساعات الهدوء', 'Hold order updates in quiet hours too')} />
      </div>
    </Card>
  );
}

function CartStep({ d, set, dirty, live, errs }: { d: Form; set: (p: Partial<Form>) => void; dirty: boolean; live: boolean; errs: string[] }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const carts = cartsStore.use();
  const done = waDeliveriesStore.use();
  const store = settingsStore.use().store.name;
  const saved = waSettingsOf(freeAppsStore.use());
  const [confirm, setConfirm] = useState(false);
  const hour = riyadhHourOf(Date.now());
  const plan = cartPlan(carts, saved, done, hour);
  const sample = plan.due[0] ?? carts[0];
  const text = sample ? renderCartText(d.cart.text[lang], { name: sample.customer[lang].split(' ')[0], store, items: (sample.items ?? []).map((i) => i.name[lang]).join('، ') || '—' }) : '';
  const reasons: Record<WaCartReason, string> = {
    noConsent: tx('بلا موافقة', 'No consent'), optedOut: tx('ألغى الاشتراك', 'Opted out'), tooOld: tx('أقدم من ٧ أيام', 'Older than 7 days'), bought: tx('اشترى', 'Bought'),
    quiet: tx('ساعات الهدوء الآن', 'Quiet hours now'), early: tx('لم يحن وقتها', 'Not due yet'), done: tx('وصلته رسالة', 'Already messaged'),
  };
  const why = !live ? tx('اعتمد الرقم أولًا', 'Get the number approved first') : !saved.cart.on ? tx('شغّل الخطوة واحفظ', 'Turn the step on and save') : dirty ? tx('احفظ التعديلات أولًا', 'Save your edits first') : !plan.due.length ? tx('لا سلال مستحقة الآن', 'No carts due now') : null;
  const run = () => {
    const r = runCartStep(cartsStore.get(), saved, waDeliveriesStore.get(), Date.now(), hour);
    cartsStore.set(r.carts);
    waDeliveriesStore.set(r.deliveries);
    logAction('apps', { ar: `أرسل تذكير واتساب لـ${r.sent + r.failed} سلة (استُرجعت ${r.recovered})`, en: `Sent WhatsApp cart reminders to ${r.sent + r.failed} carts (${r.recovered} recovered)` }, { target: 'whatsapp' });
    setConfirm(false);
    toast({ tone: r.failed ? 'info' : 'ok', text: tx(`أُرسلت ${r.sent}، فشلت ${r.failed}، استُرجعت ${r.recovered} (محاكاة)`, `${r.sent} sent, ${r.failed} failed, ${r.recovered} recovered (simulated)`) });
  };
  return (
    <Card>
      <CardHeader id="wa-cart" title={tx('استرجاع السلات بواتساب', 'Cart recovery by WhatsApp')} hint={tx('خطوة تُضاف لتسلسل التذكير. السلة المسترجعة تُعلَّم «اشترى» فيتوقف التسلسل لها.', 'A step alongside the reminder sequence. A recovered cart is marked bought, so the sequence stops for it.')}
        action={<Switch checked={d.cart.on} onChange={(v) => set({ cart: { ...d.cart, on: v } })} label={tx('شغّل الخطوة', 'Turn the step on')} />} />
      <div className="grid gap-5 px-5 pb-5 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label={tx('بعد ترك السلة بـ', 'After the cart is left by')} className="max-w-xs">{(p) => <Select {...p} value={d.cart.afterHours} onChange={(e) => set({ cart: { ...d.cart, afterHours: Number(e.target.value) } })}>{WA_CART_HOURS.map((h) => <option key={h} value={h}>{tx(`${h} ساعة`, `${h} hour${h > 1 ? 's' : ''}`)}</option>)}</Select>}</Field>
          <Field label={tx('النص بالعربية', 'Arabic text')} hint="{name} {store} {items}" error={errs.includes('cartText') ? tx('اكتب النص', 'Write the text') : errs.includes('placeholder') ? tx('متغير غير معروف', 'Unknown placeholder') : null}>
            {(p) => <Textarea {...p} dir="rtl" value={d.cart.text.ar} onChange={(e) => set({ cart: { ...d.cart, text: { ...d.cart.text, ar: e.target.value } } })} />}
          </Field>
          <Field label={tx('النص بالإنجليزية', 'English text')} error={errs.includes('cartTextEn') ? tx('اكتب النص', 'Write the text') : null}>
            {(p) => <Textarea {...p} dir="ltr" value={d.cart.text.en} onChange={(e) => set({ cart: { ...d.cart, text: { ...d.cart.text, en: e.target.value } } })} />}
          </Field>
          <a href={link('/dashboard/marketing/reminders')} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('تسلسل التذكير بالبريد والرسائل', 'The email and SMS reminder sequence')}<ExternalLink className="size-3.5" aria-hidden="true" /></a>
        </div>
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-3">
            <Stat label={tx('مستحقة الآن', 'Due now')} value={plan.due.length} />
            <Stat label={tx('قيمتها', 'Their value')} value={<Money v={plan.value} />} />
          </dl>
          {Object.keys(plan.blocked).length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label={tx('لن تصلها رسالة', 'Won’t be messaged')}>
              {(Object.entries(plan.blocked) as [WaCartReason, number][]).map(([k, n]) => <li key={k}><Badge tone="gray">{reasons[k]} · <Ref>{n}</Ref></Badge></li>)}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setConfirm(true)} disabled={!!why}><Send className="size-4" aria-hidden="true" />{tx('أرسل للمستحقة', 'Send to due carts')}</Button>
            {why && <span className="text-xs text-muted">{why}</span>}
          </div>
        </div>
      </div>
      {confirm && (
        <Modal title={tx(`إرسال واتساب لـ${plan.due.length} سلة؟`, `Send WhatsApp to ${plan.due.length} carts?`)} onClose={() => setConfirm(false)}
          footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={run}><Send className="size-4" aria-hidden="true" />{tx('أرسل', 'Send')}</Button></>}>
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2 text-fg"><ShoppingCart className="size-4 text-muted" aria-hidden="true" />{tx('سلال قيمتها', 'Carts worth')} <Money v={plan.value} /> <Simulated /></p>
            <p className="text-muted">{tx('العملاء الموافقون فقط، وكل سلة مرة واحدة. ما يراه العميل:', 'Consenting customers only, once per cart. What the customer sees:')}</p>
            <p className="whitespace-pre-wrap rounded-xl bg-[#e7f7e4] p-3 text-[#102a12] dark:bg-emerald-950 dark:text-emerald-50">{text}</p>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function FloatButton({ d, set, errs }: { d: Form; set: (p: Partial<Form>) => void; errs: string[] }) {
  const tx = useTx();
  const { lang } = useLang();
  const [page, setPage] = useState<WaPage>('product');
  const phone = normalisePhone(d.phone);
  const sampleName = page === 'product' ? (lang === 'ar' ? 'عباية سوداء مطرّزة' : 'Embroidered black abaya') : page === 'category' ? (lang === 'ar' ? 'العطور' : 'Perfumes') : undefined;
  const msg = prefill(d, lang, page, sampleName);
  return (
    <Card>
      <CardHeader id="wa-btn" title={tx('زر واتساب في المتجر', 'WhatsApp button in the store')} hint={tx('يفتح محادثة مع رقمك برسالة جاهزة حسب الصفحة. يظهر والتطبيق مفعّل.', 'Opens a chat with your number and a message for the page. Shows while the app is on.')}
        action={<Switch checked={d.button.on} onChange={(v) => set({ button: { ...d.button, on: v } })} label={tx('أظهر الزر', 'Show the button')} />} />
      <div className="grid gap-5 px-5 pb-5 lg:grid-cols-2">
        <div className="space-y-4">
          <Segmented label={tx('مكان الزر', 'Button side')} value={d.button.side} onChange={(v) => set({ button: { ...d.button, side: v } })} options={[{ value: 'start', label: tx('يمين', 'Left') }, { value: 'end', label: tx('يسار', 'Right') }]} />
          <Field label={tx('التحية بالعربية', 'Arabic greeting')} error={errs.includes('greeting') ? tx('اكتب التحية باللغتين', 'Write the greeting in both languages') : null}>{(p) => <Input {...p} value={d.button.greeting.ar} onChange={(e) => set({ button: { ...d.button, greeting: { ...d.button.greeting, ar: e.target.value } } })} />}</Field>
          <Field label={tx('التحية بالإنجليزية', 'English greeting')}>{(p) => <Input {...p} dir="ltr" value={d.button.greeting.en} onChange={(e) => set({ button: { ...d.button, greeting: { ...d.button.greeting, en: e.target.value } } })} />}</Field>
        </div>
        <div className="space-y-3">
          <Segmented label={tx('الصفحة', 'Page')} value={page} onChange={setPage} options={[{ value: 'product', label: tx('منتج', 'Product') }, { value: 'category', label: tx('قسم', 'Category') }, { value: 'cart', label: tx('الحقيبة', 'Bag') }, { value: 'other', label: tx('أخرى', 'Other') }]} />
          <p className="rounded-xl bg-surface-2 p-3 text-sm text-fg">{msg}</p>
          {!phone ? <p className="text-xs text-muted">{tx('أدخل رقمًا صحيحًا ليظهر الزر', 'Enter a valid number for the button to show')}</p> : (
            <div className="flex flex-wrap gap-2">
              <LinkButton variant="secondary" size="sm" href={waMeLink(phone, msg)} target="_blank" rel="noopener"><MessageCircle className="size-4" aria-hidden="true" />{tx('جرّب الرابط', 'Try the link')}</LinkButton>
              <LinkButton variant="ghost" size="sm" href={link('/store')} target="_blank" rel="noopener"><ExternalLink className="size-4" aria-hidden="true" />{tx('افتح المتجر', 'Open the store')}</LinkButton>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function Results({ live }: { live: boolean }) {
  const tx = useTx();
  const name = useNoticeName();
  const orders = ordersStore.use();
  const done = waDeliveriesStore.use();
  const stats = useMemo(() => messageStats(orders), [orders]);
  const cart = cartResults(done);
  const sent = stats.reduce((t, s) => t + s.sent, 0);
  const failed = stats.reduce((t, s) => t + s.failed, 0);
  return (
    <Card>
      <CardHeader id="wa-res" title={tx('النتائج', 'Results')} hint={tx('من رسائل الطلبات المسجّلة وخطوة السلات في هذه الجلسة. الإرسال محاكاة.', 'From messages recorded on orders and the cart step in this session. Sending is simulated.')} action={live ? <Badge tone="green">{tx('يعمل', 'Live')}</Badge> : <Badge tone="gray">{tx('متوقف', 'Not live')}</Badge>} />
      <div className="space-y-4 px-5 pb-5">
        <Stats>
          <Stat label={tx('رسائل طلبات أُرسلت', 'Order messages sent')} value={sent} tone={sent ? 'ok' : undefined} />
          <Stat label={tx('فشلت', 'Failed')} value={failed} tone={failed ? 'bad' : undefined} />
          <Stat label={tx('سلال مسترجعة', 'Carts recovered')} value={`${cart.recovered} / ${cart.sent}`} hint={tx('مسترجعة من السلال التي وصلتها رسالة', 'Recovered out of carts messaged')} />
          <Stat label={tx('مبيعات مسترجعة', 'Recovered sales')} value={<Money v={cart.revenue} />} />
        </Stats>
        {stats.length ? (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs text-muted"><tr><th className="px-3 py-2 text-start font-medium">{tx('الحالة', 'Event')}</th><th className="px-3 py-2 text-end font-medium">{tx('أُرسلت', 'Sent')}</th><th className="px-3 py-2 text-end font-medium">{tx('فشلت', 'Failed')}</th><th className="px-3 py-2 text-end font-medium">{tx('متخطاة', 'Skipped')}</th></tr></thead>
              <tbody className="divide-y divide-border">{stats.map((s) => <tr key={s.event}><td className="px-3 py-2 text-fg">{name(s.event)}</td><td className="px-3 py-2 text-end tabular-nums">{s.sent}</td><td className="px-3 py-2 text-end tabular-nums">{s.failed}</td><td className="px-3 py-2 text-end tabular-nums">{s.skipped}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <EmptyState icon={<MessageCircle className="size-6" aria-hidden="true" />} title={tx('لا رسائل واتساب بعد', 'No WhatsApp messages yet')}>{live ? tx('تظهر هنا عند تغيّر حالة طلب مفعّلة لواتساب.', 'They show here when an order reaches an event switched on for WhatsApp.') : tx('اعتمد الرقم وفعّل الحالات أدناه.', 'Get the number approved and switch events on below.')}</EmptyState>}
      </div>
    </Card>
  );
}
