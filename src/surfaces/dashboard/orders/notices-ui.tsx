// Customer messages on the order page and in action previews: what was sent, on which channel, in which language,
// and what an action is about to send. Simulated: nothing leaves the browser.
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Mail, MessageCircle, MessagesSquare, MinusCircle, RotateCw, Send, Smartphone } from 'lucide-react';
import type { Order } from '../../merchant/domain';
import { NOTICE_CHANNELS, customerLang, resendMessage, type CustomerMessage, type NoticeChannel, type NoticeEvent } from '../../merchant/ops';
import { noticeCtx, noticesStore, testStore } from '../../merchant/stores';
import { can } from '../../merchant/perms';
import { Simulated, Switch, useToast } from '../../../ds/kit';
import { Badge, Button, Card, CardHeader, InfoHint, cn, useTx, type Tone } from '../../../ds/ui';
import { saveOrder, useActor } from './ui';
import { When } from './detail';

export function useNoticeName() {
  const tx = useTx();
  return (e: NoticeEvent | string) => ({
    placed: tx('استلام الطلب', 'Order placed'), paid: tx('تأكيد الدفع', 'Payment received'), payFailed: tx('تعثّر الدفع', 'Payment failed'),
    ready: tx('الطلب جاهز', 'Order packed'), shipped: tx('شُحن مع رابط التتبع', 'Shipped, with tracking link'), delivered: tx('تم التسليم', 'Delivered'),
    cancelled: tx('أُلغي الطلب', 'Order cancelled'), refunded: tx('تم الاسترداد', 'Refunded'),
    returnRequested: tx('استلام طلب الإرجاع', 'Return requested'), returnApproved: tx('الموافقة على الإرجاع', 'Return approved'),
    returnRejected: tx('رفض الإرجاع', 'Return rejected'), returnReceived: tx('وصول المرتجع', 'Return received'),
    payLink: tx('رابط دفع', 'Payment link'), payReminder: tx('تمديد مهلة الدفع', 'More time to pay'), invoice: tx('الفاتورة للعميل', 'Invoice to customer'),
    subStatus: tx('تحديث بالحالة الفرعية', 'Sub-status update'), caseReply: tx('رد خدمة العملاء', 'Customer service reply'), digitalDelivered: tx('تسليم الأكواد والروابط', 'Codes and download links'),
  } as Record<string, string>)[e] ?? e;
}
export function useChannelName() {
  const tx = useTx();
  return (c: NoticeChannel) => ({ email: tx('بريد', 'Email'), sms: tx('رسالة نصية', 'SMS'), whatsapp: tx('واتساب', 'WhatsApp') })[c];
}
export const CHANNEL_ICON: Record<NoticeChannel, typeof Mail> = { email: Mail, sms: Smartphone, whatsapp: MessageCircle };

/**
 * One line for an action's preview: which message this change sends and on which channels, with a switch to skip it
 * for this action. Shown wherever a state change will notify the customer.
 */
export function NoticeNote({ o, event, notify, onNotify }: { o: Order; event: NoticeEvent; notify: boolean; onNotify?: (v: boolean) => void }) {
  const tx = useTx();
  const name = useNoticeName();
  const chName = useChannelName();
  const cfg = noticesStore.use();
  const chans = NOTICE_CHANNELS.filter((c) => cfg.channels[event]?.[c]);
  const lang = customerLang(o, cfg);
  if (!chans.length) return <p className="text-xs text-muted">{tx(`لا رسالة للعميل: «${name(event)}» مطفأة في الإعدادات.`, `No customer message: “${name(event)}” is off in settings.`)}</p>;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-fg">
      <Send className="size-3.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
      <span className="min-w-0 flex-1">{notify
        ? tx(`يصل العميل «${name(event)}» عبر ${chans.map(chName).join(' و')} بـ${lang === 'ar' ? 'العربية' : 'الإنجليزية'}.`, `The customer gets “${name(event)}” by ${chans.map(chName).join(' and ')}, in ${lang === 'ar' ? 'Arabic' : 'English'}.`)
        : tx('لن تُرسل رسالة للعميل في هذا الإجراء؛ تُسجّل «لم تُرسل».', 'No message for this action; it is logged as not sent.')}</span>
      <Simulated />
      {onNotify && <span className="flex items-center gap-2 font-medium"><Switch checked={notify} onChange={onNotify} label={tx('أبلغ العميل', 'Notify customer')} /><span aria-hidden="true">{tx('أبلغ العميل', 'Notify customer')}</span></span>}
    </div>
  );
}

const STATUS_TONE: Record<CustomerMessage['status'], Tone> = { sent: 'green', failed: 'red', skipped: 'gray' };

/** The order page's message log: every message this order sent or tried to send, newest first. */
export function MessagesCard({ o }: { o: Order }) {
  const tx = useTx();
  const name = useNoticeName();
  const chName = useChannelName();
  const toast = useToast();
  const who = useActor();
  const role = testStore.use().role;
  const canSend = can(role, 'customer.message') || can(role, 'customer.contact');
  const [open, setOpen] = useState<string | null>(null);
  const msgs = [...(o.messages ?? [])].reverse();
  const reason = (m: CustomerMessage) => (m.reason === 'noEmail' ? tx('لا بريد للعميل', 'No customer email') : m.reason === 'noPhone' ? tx('لا جوال للعميل', 'No customer mobile') : m.reason === 'muted' ? tx('اخترت عدم الإبلاغ', 'You chose not to notify') : m.reason === 'noConsent' ? tx('لا موافقة من العميل على واتساب', 'No WhatsApp consent from the customer') : m.reason === 'quiet' ? tx('ساعات الهدوء في تطبيق واتساب', 'WhatsApp app quiet hours') : tx('تعذّر الإرسال لدى المزوّد', 'The provider did not accept it'));
  const resend = (m: CustomerMessage) => {
    const next = resendMessage(o, m.id, noticesStore.get(), noticeCtx(o), who);
    if (next === o) return;
    saveOrder(next);
    const ok = next.messages?.at(-1)?.status === 'sent';
    toast({ tone: ok ? 'ok' : 'bad', text: ok ? tx(`أُعيد إرسال «${name(m.event)}»`, `“${name(m.event)}” resent`) : tx('لم يُرسل مرة أخرى؛ راجع بيانات العميل أو القناة', 'Not sent again; check the customer details or channel') });
  };
  return (
    <Card aria-labelledby="h-msgs">
      <CardHeader id="h-msgs" title={<span className="flex items-center gap-1.5">{tx('رسائل العميل', 'Customer messages')}<InfoHint>{tx('ما أُرسل للعميل عن هذا الطلب، بلغته وقناته. محاكاة: لا يُرسل شيء فعليًا.', 'What this order sent the customer, in their language and channel. Simulated: nothing is actually sent.')}</InfoHint></span>}
        action={<a className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300" href="#/dashboard/settings/notifications?tab=customers">{tx('القوالب', 'Templates')}</a>} />
      {msgs.length === 0 ? (
        <div className="flex items-start gap-3 px-5 pb-5 text-sm text-muted"><MessagesSquare className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{tx('لم تُرسل رسائل لهذا الطلب في هذه الجلسة. كل تغيير في حالته يرسل الرسالة المفعّلة له.', 'No messages for this order in this session. Each state change sends the message switched on for it.')}</span></div>
      ) : (
        <ul className="divide-y divide-border !border-t !border-border">
          {msgs.map((m) => {
            const I = CHANNEL_ICON[m.channel];
            const isOpen = open === m.id;
            return (
              <li key={m.id} className="px-5 py-3">
                <div className="flex items-start gap-3">
                  <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', m.status === 'sent' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : m.status === 'failed' ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-surface-2 text-muted')} aria-hidden="true"><I className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-fg">{name(m.event)}
                      <Badge tone={STATUS_TONE[m.status]} icon={m.status === 'sent' ? <CheckCircle2 className="size-3" aria-hidden="true" /> : m.status === 'failed' ? <AlertTriangle className="size-3" aria-hidden="true" /> : <MinusCircle className="size-3" aria-hidden="true" />}>
                        {m.status === 'sent' ? tx('أُرسلت', 'Sent') : m.status === 'failed' ? tx('فشلت', 'Failed') : tx('لم تُرسل', 'Not sent')}
                      </Badge>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                      <span>{chName(m.channel)}</span><span aria-hidden="true">·</span><span>{m.lang === 'ar' ? 'عربي' : 'English'}</span><span aria-hidden="true">·</span><When at={m.at} />
                      {m.actor !== 'system' && <><span aria-hidden="true">·</span><span>{m.actor}</span></>}
                      {m.retryOf && <><span aria-hidden="true">·</span><span>{tx('إعادة إرسال', 'Resend')}</span></>}
                    </p>
                    {m.status !== 'sent' && <p className="mt-1 text-xs text-red-700 dark:text-red-400">{reason(m)}</p>}
                  </div>
                  <button type="button" aria-expanded={isOpen} aria-label={tx('اعرض نص الرسالة', 'Show message text')} onClick={() => setOpen(isOpen ? null : m.id)} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2"><ChevronDown className={cn('size-4 transition-transform', isOpen && 'rotate-180')} aria-hidden="true" /></button>
                </div>
                {isOpen && (
                  <div className="mt-2 space-y-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] text-fg" dir={m.lang === 'ar' ? 'rtl' : 'ltr'}>
                    {m.to && <p className="text-xs text-muted"><bdi dir="ltr">{m.to}</bdi></p>}
                    {m.subject && <p className="font-semibold">{m.subject}</p>}
                    <p className="whitespace-pre-line break-words">{m.body}</p>
                  </div>
                )}
                {m.status !== 'sent' && m.reason !== 'muted' && canSend && !msgs.some((x) => x.retryOf === m.id && x.status === 'sent') && (
                  <Button size="sm" variant="secondary" className="mt-2" onClick={() => resend(m)}><RotateCw className="size-3.5" aria-hidden="true" />{tx('أعد الإرسال', 'Resend')}</Button>
                )}
                {m.reason === 'muted' && canSend && <Button size="sm" variant="ghost" className="mt-2" onClick={() => resend(m)}><Send className="size-3.5" aria-hidden="true" />{tx('أرسلها الآن', 'Send it now')}</Button>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
