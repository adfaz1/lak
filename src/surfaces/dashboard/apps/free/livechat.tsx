// Live chat settings (`#/dashboard/apps/free/livechat`): hours in Riyadh time, greeting in both languages, the
// out-of-hours form, a live preview of the store window, and results from the chats in the inbox.
import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { link } from '../../../../core/router';
import { useLang } from '../../../../core/lang';
import { Badge, Card, CardHeader, InfoHint, LinkButton, Ref, Segmented, cn, useTx } from '../../../../ds/ui';
import { Field, Input, Switch } from '../../../../ds/kit';
import { inboxStore } from '../../../merchant/stores';
import { shopperState } from '../../../merchant/inbox';
import { CHAT_DEFAULTS, chatProblems, chatStats, durationL, isChat, isOpen, nextOpen, type ChatError, type ChatSettings } from './livechat-model';
import { ChatWidget, useMinute } from './livechat-store';
import { AppLayout, AppSaveBar, PreviewFrame, Results, useAppDraft } from './store-kit';
import type { FreeAppId } from './registry';

const latin = (v: string) => v.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
const DAYS: [number, string, string][] = [[0, 'الأحد', 'Sun'], [1, 'الاثنين', 'Mon'], [2, 'الثلاثاء', 'Tue'], [3, 'الأربعاء', 'Wed'], [4, 'الخميس', 'Thu'], [5, 'الجمعة', 'Fri'], [6, 'السبت', 'Sat']];

export default function LiveChatScreen({ id }: { id: FreeAppId }) {
  const tx = useTx();
  const { lang } = useLang();
  const d = useAppDraft<ChatSettings>(id, CHAT_DEFAULTS, chatProblems);
  const s = d.draft;
  const errs = d.errs as ChatError[];
  const now = useMinute();
  const cases = inboxStore.use();
  const st = chatStats(cases, now);
  const recent = cases.filter(isChat).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
  const [pv, setPv] = useState<'open' | 'closed'>(isOpen(d.saved, now) ? 'open' : 'closed');
  const open = isOpen(s, now);
  const back = nextOpen(s, now);
  const fmt = (ms: number) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { timeZone: 'Asia/Riyadh', weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(ms);
  const errText: Record<ChatError, string> = {
    days: tx('اختر يومًا واحدًا على الأقل', 'Choose at least one day'), from: tx('وقت البداية مثل 09:00', 'Start time like 09:00'), to: tx('وقت النهاية مثل 22:00', 'End time like 22:00'),
    same: tx('البداية والنهاية متطابقتان', 'Start and end are the same'), greeting: tx('الترحيب بالعربية والإنجليزية (حتى ١٦٠ حرفًا)', 'Greeting in Arabic and English (up to 160 characters)'), offline: tx('اكتب رسالة خارج الدوام باللغتين', 'Write the away message in both languages'),
  };

  const results = (
    <Results items={[
      { label: tx('محادثات (٣٠ يومًا)', 'Chats (30 days)'), value: st.chats, hint: tx(`منها ${st.offline} خارج الدوام`, `${st.offline} out of hours`) },
      { label: tx('رُدّ عليها', 'Answered'), value: st.answered },
      { label: tx('متوسط أول رد', 'Avg first reply'), value: st.avgReplyMs === null ? '—' : durationL(st.avgReplyMs)[lang], hint: st.medianReplyMs === null ? undefined : tx(`الوسيط ${durationL(st.medianReplyMs).ar}`, `Median ${durationL(st.medianReplyMs).en}`) },
      { label: tx('تنتظر ردك', 'Waiting on you'), value: st.open },
    ]} />
  );

  const settings = (
    <>
      <Card aria-labelledby="lc-hours">
        <CardHeader id="lc-hours" title={tx('ساعات العمل', 'Hours')} hint={<InfoHint>{tx('بتوقيت الرياض. إن كانت النهاية قبل البداية فالدوام يمتد بعد منتصف الليل.', 'Riyadh time. An end before the start runs past midnight.')}</InfoHint>}
          action={<Badge tone={open ? 'green' : 'gray'}>{open ? tx('متاح الآن', 'Open now') : back ? tx(`يفتح ${fmt(back)}`, `Opens ${fmt(back)}`) : tx('مغلق', 'Closed')}</Badge>} />
        <div className="space-y-4 px-5 pb-5">
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold text-fg">{tx('الأيام', 'Days')}</legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map(([n, ar, en]) => {
                const on = s.days.includes(n);
                return <button key={n} type="button" aria-pressed={on} onClick={() => d.set({ days: on ? s.days.filter((x) => x !== n) : [...s.days, n].sort() })}
                  className={cn('h-9 rounded-xl border px-3 text-[13px] font-semibold', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-border bg-surface text-muted hover:text-fg')}>{tx(ar, en)}</button>;
              })}
            </div>
            {errs.includes('days') && <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{errText.days}</p>}
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tx('من', 'From')} error={errs.includes('from') ? errText.from : errs.includes('same') ? errText.same : null}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" placeholder="09:00" value={s.from} onChange={(e) => d.set({ from: latin(e.target.value) })} />}</Field>
            <Field label={tx('إلى', 'To')} error={errs.includes('to') ? errText.to : null}>{(p) => <Input {...p} dir="ltr" inputMode="numeric" placeholder="22:00" value={s.to} onChange={(e) => d.set({ to: latin(e.target.value) })} />}</Field>
          </div>
        </div>
      </Card>
      <Card aria-labelledby="lc-msg">
        <CardHeader id="lc-msg" title={tx('الرسائل', 'Messages')} />
        <div className="space-y-4 px-5 pb-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tx('الترحيب بالعربية', 'Greeting (Arabic)')} error={errs.includes('greeting') && !s.greeting.ar.trim() ? errText.greeting : null}>{(p) => <Input {...p} dir="rtl" value={s.greeting.ar} onChange={(e) => d.set({ greeting: { ...s.greeting, ar: e.target.value } })} />}</Field>
            <Field label={tx('الترحيب بالإنجليزية', 'Greeting (English)')} error={errs.includes('greeting') && !s.greeting.en.trim() ? errText.greeting : null}>{(p) => <Input {...p} dir="ltr" value={s.greeting.en} onChange={(e) => d.set({ greeting: { ...s.greeting, en: e.target.value } })} />}</Field>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
            <span className="text-sm font-medium text-fg">{tx('نموذج رسالة خارج الدوام', 'Message form out of hours')} <InfoHint>{tx('عند إيقافه تختفي الدردشة خارج الدوام.', 'When off, the chat hides out of hours.')}</InfoHint></span>
            <Switch checked={s.offlineForm} onChange={(v) => d.set({ offlineForm: v })} label={tx('نموذج رسالة خارج الدوام', 'Message form out of hours')} />
          </label>
          {s.offlineForm && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={tx('رسالة الغياب بالعربية', 'Away message (Arabic)')} error={errs.includes('offline') && !s.offlineText.ar.trim() ? errText.offline : null}>{(p) => <Input {...p} dir="rtl" value={s.offlineText.ar} onChange={(e) => d.set({ offlineText: { ...s.offlineText, ar: e.target.value } })} />}</Field>
              <Field label={tx('رسالة الغياب بالإنجليزية', 'Away message (English)')} error={errs.includes('offline') && !s.offlineText.en.trim() ? errText.offline : null}>{(p) => <Input {...p} dir="ltr" value={s.offlineText.en} onChange={(e) => d.set({ offlineText: { ...s.offlineText, en: e.target.value } })} />}</Field>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-semibold text-fg">{tx('موضع الزر', 'Button position')}</span>
            <Segmented label={tx('موضع الزر', 'Button position')} value={s.position} onChange={(v) => d.set({ position: v })} options={[{ value: 'end', label: tx('نهاية الصفحة', 'End side') }, { value: 'start', label: tx('بداية الصفحة', 'Start side') }]} />
          </div>
        </div>
      </Card>
      <Card aria-labelledby="lc-recent">
        <CardHeader id="lc-recent" title={tx('آخر المحادثات', 'Latest chats')} action={<LinkButton size="sm" variant="secondary" href={link('/dashboard/inbox')}><Inbox className="size-4" aria-hidden="true" />{tx('صندوق الخدمة', 'Inbox')}</LinkButton>} />
        {recent.length ? (
          <ul className="divide-y divide-border px-5 pb-3">
            {recent.map((c) => {
              const ss = shopperState(c);
              return (
                <li key={c.id} className="flex items-center gap-3 py-3 text-sm">
                  <a href={link(`/dashboard/inbox/${c.id}`)} className="min-w-0 flex-1 hover:underline"><span className="font-medium text-fg">{c.customer[lang]}</span> <span className="text-muted">· <Ref>{c.id}</Ref></span>
                    <span className="block truncate text-[13px] text-muted" dir="auto">{c.messages.at(-1)?.text}</span></a>
                  <Badge tone={ss === 'closed' ? 'gray' : ss === 'answered' ? 'green' : 'amber'}>{ss === 'closed' ? tx('مغلقة', 'Closed') : ss === 'answered' ? tx('رددت', 'Replied') : tx('تنتظر ردك', 'Needs reply')}</Badge>
                </li>
              );
            })}
          </ul>
        ) : <p className="px-5 pb-5 text-sm text-muted">{tx('لا محادثات بعد. جرّب من المتجر: ستصل هنا وفي صندوق الخدمة.', 'No chats yet. Try one from the store: it lands here and in the inbox.')} <a className="font-semibold text-brand-700 hover:underline dark:text-brand-300" href={link('/store')}>{tx('افتح المتجر', 'Open the store')}</a></p>}
      </Card>
    </>
  );

  const preview = (
    <PreviewFrame note={tx('معاينة فقط؛ لا يُرسل شيء منها.', 'Preview only; nothing is sent from it.')}>
      <div className="mb-3 flex justify-center"><Segmented label={tx('حالة المعاينة', 'Preview state')} value={pv} onChange={setPv} options={[{ value: 'open', label: tx('في الدوام', 'Open') }, { value: 'closed', label: tx('خارج الدوام', 'Away') }]} /></div>
      {pv === 'closed' && !s.offlineForm ? <p className="py-10 text-center text-sm text-muted">{tx('لا تظهر الدردشة خارج الدوام.', 'The chat does not show out of hours.')}</p>
        : <div className={cn('flex', s.position === 'start' ? 'justify-start' : 'justify-end')}><ChatWidget s={s} open={pv === 'open'} now={now} preview /></div>}
    </PreviewFrame>
  );

  return (
    <>
      <AppLayout results={results} settings={settings} preview={preview} />
      <AppSaveBar d={d} error={errs.length ? errText[errs[0]] : undefined} />
    </>
  );
}
