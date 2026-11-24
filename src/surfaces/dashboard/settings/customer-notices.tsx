// Settings → Notifications → Customer messages: per order state, which channels reach the customer, and the
// bilingual template with variables, a live preview in the customer's language and a simulated test send.
// Rules live in merchant/ops.ts (templates, variables, SMS parts, what each state change sends).
import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Mail, MessageCircle, RotateCcw, Send, Smartphone } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, useRoute } from '../../../core/router';
import { logAction, noticeCtx, noticesStore, ordersStore, settingsStore } from '../../merchant/stores';
import {
  DEFAULT_TEMPLATES, MANUAL_NOTICES, NOTICE_CHANNELS, NOTICE_EVENTS, NOTICE_VARS, ORDER_NOTICES, RETURN_NOTICES, SUB_NOTICES, noticeFixture, composeNotice, renderNotice, smsParts, templateIssues, noticeVars,
  type NoticeChannel, type NoticeConfig, type NoticeEvent,
} from '../../merchant/ops';
import { Alert, Field, Input, Modal, SaveBar, Select, Simulated, Switch, inputClass, useToast } from '../../../ds/kit';
import { Badge, Button, InfoHint, Ref, Segmented, cn, useTx } from '../../../ds/ui';
import { ReviewOnly } from '../orders/ui';
import { CHANNEL_ICON, useChannelName, useNoticeName } from '../orders/notices-ui';
import { same } from './model';
import { LeaveGuard, Section, useSave } from './common';
import { useSessionDraft } from './drafts';

const isEvent = (v: string | null): v is NoticeEvent => !!v && (NOTICE_EVENTS as string[]).includes(v);
type TestRow = { at: number; event: NoticeEvent; channel: NoticeChannel; to: string; lang: 'ar' | 'en'; ok: boolean };

export default function CustomerNotices() {
  const tx = useTx();
  const { lang } = useLang();
  const route = useRoute();
  const toast = useToast();
  const name = useNoticeName();
  const chName = useChannelName();
  const saved = noticesStore.use();
  // Sessions saved before a state was added (e.g. sub-status updates) get its default channels and template.
  const fill = (c: Omit<NoticeConfig, 'simFail'>) => ({ ...c, channels: { ...noticeFixture().channels, ...c.channels }, templates: { ...DEFAULT_TEMPLATES, ...c.templates } });
  const base = useMemo(() => fill({ channels: saved.channels, templates: saved.templates, defaultLang: saved.defaultLang }), [saved]); // eslint-disable-line react-hooks/exhaustive-deps
  const [rawDraft, setDraft, clearDraft] = useSessionDraft<Omit<NoticeConfig, 'simFail'>>('settings.customerNotices', base);
  const draft = fill(rawDraft);
  const { saving, error, save, clearError } = useSave();
  const dirty = !same(draft, base);
  const ev: NoticeEvent = isEvent(route.query.get('event')) ? (route.query.get('event') as NoticeEvent) : 'shipped';
  const pick = (e: NoticeEvent) => replace(link('/dashboard/settings/notifications', { tab: 'customers', event: e }));
  const [edLang, setEdLang] = useState<'ar' | 'en'>(lang);
  const [pvChannel, setPvChannel] = useState<NoticeChannel>('sms');
  const orders = ordersStore.use();
  const [sampleRef, setSampleRef] = useState(orders[0]?.ref ?? '');
  const sample = orders.find((o) => o.ref === sampleRef) ?? orders[0];
  const [pvLang, setPvLang] = useState<'ar' | 'en' | null>(null);
  const [testing, setTesting] = useState(false);
  const [tests, setTests] = useState<TestRow[]>([]);
  const body = useRef<HTMLTextAreaElement>(null);

  const tpl = draft.templates[ev];
  const edit = (next: Partial<Omit<NoticeConfig, 'simFail'>>) => { setDraft({ ...draft, ...next }); clearError(); };
  const setTpl = (field: 'subject' | 'body', v: string) => edit({ templates: { ...draft.templates, [ev]: { ...tpl, [field]: { ...tpl[field], [edLang]: v } } } });
  const toggle = (e: NoticeEvent, c: NoticeChannel, v: boolean) => edit({ channels: { ...draft.channels, [e]: { ...draft.channels[e], [c]: v } } });
  const insertVar = (v: string) => {
    const el = body.current;
    const text = tpl.body[edLang];
    const at = el ? el.selectionStart ?? text.length : text.length;
    const end = el ? el.selectionEnd ?? at : at;
    setTpl('body', `${text.slice(0, at)}{${v}}${text.slice(end)}`);
    requestAnimationFrame(() => { el?.focus(); const p = at + v.length + 2; el?.setSelectionRange(p, p); });
  };

  // Every language of every template must be usable before saving.
  const blocking = NOTICE_EVENTS.filter((e) => (['ar', 'en'] as const).some((l) => { const i = templateIssues(e, draft.templates[e].body[l]); return i.empty || i.unknown.length > 0; }));
  const issues = templateIssues(ev, tpl.body[edLang]);
  const subjectIssues = templateIssues(ev, tpl.subject[edLang]);
  const changed = (e: NoticeEvent) => !same(draft.templates[e], DEFAULT_TEMPLATES[e]);
  const cfg: NoticeConfig = { ...draft, simFail: saved.simFail };
  const sLang = pvLang ?? sample?.lang ?? draft.defaultLang;
  const ctx = sample ? noticeCtx(sample) : null;
  const vars = sample && ctx ? noticeVars(sample, ctx, sLang) : {};
  const pvBody = renderNotice(tpl.body[sLang], vars);
  const pvSubject = renderNotice(tpl.subject[sLang], vars);
  const store = settingsStore.use().store;
  const VAR_LABEL: Record<string, string> = {
    customer: tx('اسم العميل', 'Customer name'), order: tx('رقم الطلب', 'Order number'), total: tx('الإجمالي', 'Total'), refund: tx('المسترد', 'Refund'), tracking: tx('رابط التتبع', 'Tracking link'),
    payLink: tx('رابط الدفع', 'Payment link'), deadline: tx('مهلة الدفع', 'Payment deadline'), returnRef: tx('رقم المرتجع', 'Return number'), store: tx('اسم المتجر', 'Store name'),
  };

  const groups: [string, NoticeEvent[]][] = [[tx('حالة الطلب', 'Order state'), ORDER_NOTICES], [tx('المرتجعات', 'Returns'), RETURN_NOTICES], [tx('ترسلها أنت من الطلبات', 'Sent by you from orders'), MANUAL_NOTICES], [tx('الحالات الفرعية', 'Sub-statuses'), SUB_NOTICES]];
  const onCount = NOTICE_EVENTS.filter((e) => NOTICE_CHANNELS.some((c) => draft.channels[e][c])).length;

  return (
    <>
      <LeaveGuard dirty={dirty} />
      <Section id="cn-h" flush title={tx('إشعارات العملاء', 'Customer messages')}
        hint={<InfoHint>{tx('تُرسل تلقائيًا عند تغيّر حالة الطلب، بلغة العميل. محاكاة: لا يُرسل شيء فعليًا. واتساب يحتاج قوالب معتمدة من Meta عند الربط.', 'Sent automatically when an order changes state, in the customer’s language. Simulated: nothing is sent. WhatsApp needs Meta-approved templates once connected.')}</InfoHint>}
        action={<span className="text-xs text-muted tabular-nums">{tx(`${onCount} من ${NOTICE_EVENTS.length} مفعّلة`, `${onCount} of ${NOTICE_EVENTS.length} on`)}</span>}>
        <div className="flex flex-wrap items-center gap-3 px-5 pb-3">
          <span className="flex items-center gap-1 text-[13px] font-medium text-fg">{tx('لغة العميل الافتراضية', 'Default customer language')}<InfoHint>{tx('لمن لم يحدد لغته في طلبه.', 'For customers whose order has no language.')}</InfoHint></span>
          <Segmented label={tx('لغة العميل الافتراضية', 'Default customer language')} value={draft.defaultLang} onChange={(v) => edit({ defaultLang: v })} options={[{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]} />
        </div>
        <table className="w-full min-w-0 table-fixed text-sm">
          <caption className="sr-only">{tx('الرسائل حسب الحالة والقناة', 'Messages by state and channel')}</caption>
          <thead><tr className="border-y border-border text-xs text-muted">
            <th scope="col" className="px-5 py-2.5 text-start font-semibold">{tx('الحالة', 'State')}</th>
            {NOTICE_CHANNELS.map((c) => { const I = CHANNEL_ICON[c]; return <th key={c} scope="col" className="w-14 px-1 py-2.5 font-semibold sm:w-20"><span className="flex flex-col items-center gap-0.5"><I className="size-3.5" aria-hidden="true" /><span className="hidden sm:inline">{chName(c)}</span><span className="sr-only sm:hidden">{chName(c)}</span></span></th>; })}
            <th scope="col" className="w-3 sm:w-5"><span className="sr-only">{tx('مسافة', 'Spacer')}</span></th>
          </tr></thead>
          {groups.map(([g, list]) => (
            <tbody key={g} className="divide-y divide-border">
              <tr><th scope="rowgroup" colSpan={5} className="bg-surface-2/60 px-5 py-1.5 text-start text-[11px] font-semibold text-muted">{g}</th></tr>
              {list.map((e) => (
                <tr key={e} className={cn(e === ev && 'bg-brand-500/5')}>
                  <th scope="row" className="px-5 py-2.5 text-start font-medium">
                    <button type="button" onClick={() => pick(e)} aria-current={e === ev ? 'true' : undefined} className={cn('text-start hover:underline', e === ev ? 'text-brand-700 dark:text-brand-300' : 'text-fg')}>{name(e)}</button>
                    {changed(e) && <span className="ms-1.5 text-[11px] font-normal text-muted">{tx('· معدّل', '· edited')}</span>}
                    {blocking.includes(e) && <span className="mt-0.5 block text-xs font-medium text-red-600 dark:text-red-400">{tx('في القالب خطأ', 'Template has an error')}</span>}
                  </th>
                  {NOTICE_CHANNELS.map((c) => <td key={c} className="px-1 py-2.5"><span className="flex justify-center"><Switch checked={draft.channels[e][c]} onChange={(v) => toggle(e, c, v)} label={tx(`${name(e)} عبر ${chName(c)}`, `${name(e)} by ${chName(c)}`)} /></span></td>)}
                  <td />
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </Section>

      <Section id="cn-t" title={<>{tx('القالب: ', 'Template: ')}{name(ev)}</>}
        action={<div className="flex flex-wrap items-center gap-2">
          {changed(ev) && <Button size="sm" variant="ghost" onClick={() => edit({ templates: { ...draft.templates, [ev]: DEFAULT_TEMPLATES[ev] } })}><RotateCcw className="size-3.5" aria-hidden="true" />{tx('النص الافتراضي', 'Default text')}</Button>}
          <Segmented label={tx('لغة التحرير', 'Editing language')} value={edLang} onChange={setEdLang} options={[{ value: 'ar', label: 'عربي' }, { value: 'en', label: 'English' }]} />
        </div>}>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="min-w-0 space-y-4">
            <Field label={tx('عنوان البريد', 'Email subject')} hint={tx('للبريد فقط', 'Email only')} error={subjectIssues.unknown.length ? tx(`متغير غير معروف: {${subjectIssues.unknown[0]}}`, `Unknown variable: {${subjectIssues.unknown[0]}}`) : null}>
              {(p) => <Input {...p} dir={edLang === 'ar' ? 'rtl' : 'ltr'} value={tpl.subject[edLang]} maxLength={120} onChange={(e) => setTpl('subject', e.target.value)} />}
            </Field>
            <Field label={tx('النص', 'Message')} error={issues.empty ? tx('النص فارغ', 'The message is empty') : issues.unknown.length ? tx(`متغير غير معروف: {${issues.unknown[0]}}`, `Unknown variable: {${issues.unknown[0]}}`) : null}
              hint={tx(`${[...tpl.body[edLang]].length} حرفًا · ${smsParts(renderNotice(tpl.body[edLang], vars))} جزء رسالة نصية`, `${[...tpl.body[edLang]].length} characters · ${smsParts(renderNotice(tpl.body[edLang], vars))} SMS part(s)`)}>
              {(p) => <textarea {...p} ref={body} dir={edLang === 'ar' ? 'rtl' : 'ltr'} className={cn(inputClass, 'h-auto min-h-28 py-2.5 leading-relaxed')} value={tpl.body[edLang]} maxLength={500} onChange={(e) => setTpl('body', e.target.value)} />}
            </Field>
            {issues.missing.length > 0 && <Alert tone="warn">{tx(`ينقصه ${issues.missing.map((v) => `{${v}}`).join(' و')}؛ العميل يحتاجه في هذه الرسالة.`, `Missing ${issues.missing.map((v) => `{${v}}`).join(' and ')}; the customer needs it in this message.`)}</Alert>}
            <div>
              <p className="mb-2 flex items-center gap-1 text-[13px] font-semibold text-fg">{tx('أدرج متغيرًا', 'Insert a variable')}<InfoHint>{tx('يُستبدل ببيانات كل طلب عند الإرسال.', 'Replaced with each order’s data when sent.')}</InfoHint></p>
              <div className="flex flex-wrap gap-1.5">{NOTICE_VARS.map((v) => (
                <button key={v} type="button" onClick={() => insertVar(v)} className="inline-flex h-8 items-center gap-1 rounded-full border border-border px-2.5 text-xs font-medium text-fg hover:border-brand-300 hover:bg-brand-500/5">
                  {VAR_LABEL[v]}<bdi dir="ltr" className="text-[11px] text-muted">{`{${v}}`}</bdi>
                </button>
              ))}</div>
            </div>
          </div>

          <div className="min-w-0 space-y-3 rounded-2xl border border-border bg-surface-2/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-fg">{tx('معاينة', 'Preview')}</p>
              <Segmented label={tx('قناة المعاينة', 'Preview channel')} value={pvChannel} onChange={setPvChannel} options={NOTICE_CHANNELS.map((c) => ({ value: c, label: chName(c) }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label={tx('طلب للمعاينة', 'Sample order')}>{(p) => <Select {...p} value={sample?.ref ?? ''} onChange={(e) => { setSampleRef(e.target.value); setPvLang(null); }}>
                {orders.slice(0, 40).map((o) => <option key={o.ref} value={o.ref}>#{o.ref} · {o.customer[lang]}</option>)}
              </Select>}</Field>
              <Field label={tx('بلغة العميل', 'Customer language')}>{(p) => <Select {...p} value={sLang} onChange={(e) => setPvLang(e.target.value as 'ar' | 'en')}>
                <option value="ar">العربية</option><option value="en">English</option>
              </Select>}</Field>
            </div>
            <Bubble channel={pvChannel} lang={sLang} subject={pvSubject} body={pvBody} from={store.name} />
            {pvChannel === 'sms' && <p className="text-xs text-muted">{tx(`${smsParts(pvBody)} جزء · تُحسب الرسائل النصية بالأجزاء`, `${smsParts(pvBody)} part(s) · SMS is billed per part`)}</p>}
            {!draft.channels[ev][pvChannel] && <p className="text-xs text-amber-700 dark:text-amber-300">{tx(`${chName(pvChannel)} مطفأ لهذه الحالة؛ لن تصل هذه الرسالة.`, `${chName(pvChannel)} is off for this state; this message will not go out.`)}</p>}
            <Button variant="secondary" size="sm" disabled={!sample || issues.empty || issues.unknown.length > 0} onClick={() => setTesting(true)}><Send className="size-3.5" aria-hidden="true" />{tx('أرسل تجربة لنفسك', 'Send yourself a test')}</Button>
            {tests.length > 0 && (
              <ul className="space-y-1.5 border-t border-border pt-3 text-xs" aria-label={tx('آخر التجارب', 'Recent tests')}>
                {tests.map((t, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-1.5 text-muted">
                    {t.ok ? <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> : <AlertTriangle className="size-3.5 text-red-600 dark:text-red-400" aria-hidden="true" />}
                    <span className="text-fg">{name(t.event)}</span>·<span>{chName(t.channel)}</span>·<bdi dir="ltr">{t.to}</bdi>·<span>{t.ok ? tx('وصلت (محاكاة)', 'Delivered (simulated)') : tx('رفضها المزوّد', 'Provider rejected it')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <ReviewOnly>
          <label className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg">
            <span>{tx('حاكِ تعطل قناة (يظهر «فشلت» وإعادة الإرسال في الطلب)', 'Simulate a channel outage (shows “failed” and resend on the order)')}</span>
            <Select aria-label={tx('القناة المعطلة', 'Failing channel')} className="w-40" value={saved.simFail ?? ''} onChange={(e) => noticesStore.set((c) => ({ ...c, simFail: (e.target.value || null) as NoticeChannel | null }))}>
              <option value="">{tx('لا شيء', 'None')}</option>{NOTICE_CHANNELS.map((c) => <option key={c} value={c}>{chName(c)}</option>)}
            </Select>
          </label>
        </ReviewOnly>
      </Section>

      <SaveBar dirty={dirty} saving={saving}
        error={error ?? (blocking.length ? tx(`صحّح القوالب: ${blocking.map(name).join('، ')}`, `Fix the templates: ${blocking.map(name).join(', ')}`) : undefined)}
        onDiscard={() => { clearDraft(); clearError(); }}
        onSave={() => {
          if (blocking.length) { pick(blocking[0]); return; }
          save(() => {
            const changedEvents = NOTICE_EVENTS.filter((e) => !same(draft.templates[e], saved.templates[e]) || !same(draft.channels[e], saved.channels[e]));
            noticesStore.set((c) => ({ ...c, ...draft }));
            clearDraft();
            logAction('settings', { ar: `حُفظت إشعارات العملاء (${changedEvents.length} حالة)`, en: `Customer messages saved (${changedEvents.length} states)` }, { after: changedEvents.join(',') });
          }, tx('حُفظت إشعارات العملاء', 'Customer messages saved'));
        }} />

      {testing && sample && ctx && (
        <TestModal ev={ev} cfg={cfg} lang={sLang} channel={pvChannel} onClose={(row) => {
          setTesting(false);
          if (!row) return;
          setTests((t) => [row, ...t].slice(0, 5));
          logAction('settings', { ar: `رسالة تجربة «${name(ev)}» عبر ${chName(row.channel)}`, en: `Test message “${name(ev)}” by ${chName(row.channel)}` }, { target: row.to });
          toast({ tone: row.ok ? 'ok' : 'bad', text: row.ok ? tx(`أُرسلت التجربة إلى ${row.to} (محاكاة)`, `Test sent to ${row.to} (simulated)`) : tx('رفض المزوّد التجربة؛ جرّب قناة أخرى', 'The provider rejected the test; try another channel') });
        }} sample={sample} />
      )}
    </>
  );
}

function Bubble({ channel, lang, subject, body, from }: { channel: NoticeChannel; lang: 'ar' | 'en'; subject: string; body: string; from: string }) {
  const tx = useTx();
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  if (channel === 'email') return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface" dir={dir} aria-label={tx('معاينة البريد', 'Email preview')}>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted"><Mail className="size-3.5" aria-hidden="true" /><span className="truncate">{from}</span></div>
      <div className="space-y-2 px-3 py-3"><p className="text-sm font-semibold text-fg">{subject}</p><p className="whitespace-pre-line break-words text-[13px] leading-relaxed text-fg">{body}</p></div>
    </div>
  );
  const wa = channel === 'whatsapp';
  return (
    <div className={cn('rounded-xl p-3', wa ? 'bg-emerald-500/10' : 'bg-surface')} dir={dir} aria-label={wa ? tx('معاينة واتساب', 'WhatsApp preview') : tx('معاينة الرسالة النصية', 'SMS preview')}>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted">{wa ? <MessageCircle className="size-3.5" aria-hidden="true" /> : <Smartphone className="size-3.5" aria-hidden="true" />}{from}</p>
      <p className={cn('max-w-[95%] whitespace-pre-line break-words rounded-2xl px-3 py-2 text-[13px] leading-relaxed text-fg shadow-sm', wa ? 'bg-surface rounded-ss-sm' : 'bg-surface-2 rounded-ss-sm')}>{body}</p>
    </div>
  );
}

function TestModal({ ev, cfg, lang, channel, sample, onClose }: { ev: NoticeEvent; cfg: NoticeConfig; lang: 'ar' | 'en'; channel: NoticeChannel; sample: import('../../merchant/domain').Order; onClose: (row?: TestRow) => void }) {
  const tx = useTx();
  const chName = useChannelName();
  const name = useNoticeName();
  const store = settingsStore.use().store;
  const [c, setC] = useState<NoticeChannel>(channel);
  const to = c === 'email' ? store.email : store.phone;
  // The test uses the merchant's own contact, never the sample customer's.
  const ctx = { ...noticeCtx(sample), contact: { email: store.email, phone: store.phone } };
  const msg = composeNotice(sample, ev, cfg, ctx, { name: 'test', role: 'owner' }, { only: [c], lang })[0];
  return (
    <Modal title={tx('رسالة تجربة', 'Test message')} description={tx('تصل إليك أنت، لا إلى العميل.', 'It goes to you, not the customer.')} onClose={() => onClose()}
      footer={<><Button variant="secondary" onClick={() => onClose()}>{tx('إلغاء', 'Cancel')}</Button><Button disabled={!to} onClick={() => onClose({ at: Date.now(), event: ev, channel: c, to: to ?? '', lang, ok: msg?.status === 'sent' })}><Send className="size-4" aria-hidden="true" />{tx(`أرسل إلى ${chName(c)}`, `Send by ${chName(c)}`)}</Button></>}>
      <Segmented label={tx('القناة', 'Channel')} value={c} onChange={setC} options={NOTICE_CHANNELS.map((x) => ({ value: x, label: chName(x) }))} />
      <dl className="space-y-1 text-sm">
        <div className="flex gap-2"><dt className="text-muted">{tx('إلى', 'To')}</dt><dd className="font-medium text-fg">{to ? <bdi dir="ltr">{to}</bdi> : tx('لا عنوان في بيانات المتجر', 'No address in store details')}</dd></div>
        <div className="flex gap-2"><dt className="text-muted">{tx('الرسالة', 'Message')}</dt><dd className="text-fg">{name(ev)} · <Ref>#{sample.ref}</Ref> · {lang === 'ar' ? 'عربي' : 'English'}</dd></div>
      </dl>
      {msg && <Bubble channel={c} lang={lang} subject={msg.subject ?? ''} body={msg.body} from={store.name} />}
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">{tx('تُكتب البيانات من الطلب المختار للمعاينة.', 'Filled with the sample order’s data.')}<Simulated /></p>
      {!to && <Badge tone="amber">{tx('أضف بريدًا وجوالًا في بيانات المتجر', 'Add an email and mobile in store details')}</Badge>}
    </Modal>
  );
}
