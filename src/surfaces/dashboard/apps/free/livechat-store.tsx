// Live chat in the online store (free app «livechat», only when installed and on). The shopper's first message opens a
// «general message» case in the merchant's inbox; later messages append to it; the merchant's replies from the inbox
// show here. Outside the hours (Riyadh) it becomes a message form, or hides when the merchant turned the form off.
import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { Button, cn, useTx } from '../../../../ds/ui';
import { customersStore, inboxStore, settingsStore } from '../../../merchant/stores';
import { customerWrites, type Case } from '../../../merchant/inbox';
import { matchCustomer, riyadhDate } from '../../../storefront/bridge';
import { CUSTOMER, accountStore } from '../../../storefront/state';
import { useS } from '../../../storefront/kit';
import { freeAppsStore, isOn } from './registry';
import { CHAT_DEFAULTS, isOpen, mobileKey, nextOpen, openChat, shopperThread, startProblems, type ChatSettings } from './livechat-model';
import { settingsOf, shopperAppsStore } from './store-runtime';

const ERR = 'text-xs font-medium text-red-600 dark:text-red-400';

export function useMinute() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(t); }, []);
  return now;
}

/** Floating chat button and window. */
export function StoreLiveChat() {
  const apps = freeAppsStore.use();
  const sh = shopperAppsStore.use();
  const cases = inboxStore.use();
  const now = useMinute();
  if (!isOn(apps, 'livechat')) return null;
  const s = settingsOf(apps, 'livechat', CHAT_DEFAULTS);
  const open = isOpen(s, now);
  const mine = sh.chatCase ? cases.find((c) => c.id === sh.chatCase) : undefined;
  if (!open && !s.offlineForm && !mine) return null;
  // Leave room for the WhatsApp button when that app is on too.
  const lift = isOn(apps, 'whatsapp');
  return <ChatWidget s={s} open={open} now={now} mine={mine} lift={lift} />;
}

/** The window itself; also used, without the store around it, as the dashboard preview. */
export function ChatWidget({ s, open, now, mine, lift, preview }: { s: ChatSettings; open: boolean; now: number; mine?: Case; lift?: boolean; preview?: boolean }) {
  const tx = useTx();
  const { lang, l, time, dl } = useS();
  const sh = shopperAppsStore.use();
  const acc = accountStore.use();
  const store = settingsStore.use().store.name;
  const [shown, setShown] = useState(!!preview);
  const isShown = preview ? true : shown || sh.chatOpen;
  const signed = acc.signedIn;
  const [name, setName] = useState(preview ? '' : sh.name ?? (signed ? l(CUSTOMER.name) : ''));
  const [contact, setContact] = useState(preview ? '' : sh.contact ?? (signed ? CUSTOMER.email : ''));
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const thread = mine ? shopperThread(mine) : [];
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [thread.length, isShown]);
  const closed = mine?.status === 'resolved';
  const probs = mine && !closed ? (text.trim().length < 2 ? ['text'] : []) : startProblems({ name, contact, text });
  const toggle = (v: boolean) => { setShown(v); if (!preview) shopperAppsStore.set((x) => ({ ...x, chatOpen: v })); };

  const send = () => {
    setTried(true);
    if (preview || probs.length) return;
    const t = Date.now();
    if (mine && !closed) {
      inboxStore.set((list) => list.map((c) => (c.id === mine.id ? customerWrites(c, text, t) : c)));
    } else {
      // The merchant replies by mobile or email from the inbox, so the shopper is matched to (or added as) a customer.
      const key = mobileKey(contact);
      const m = matchCustomer(customersStore.get(), { id: signed ? CUSTOMER.id : undefined, name, phone: key ?? '', email: key ? undefined : contact.trim(), city: { ar: '', en: '' } }, riyadhDate(t));
      if (m.created) {
        const c = m.customer;
        customersStore.set(m.customers.map((x) => (x.id === c.id && !key ? { ...x, phone: '' } : x)));
      }
      const c = openChat(inboxStore.get(), { name, customerId: m.customer.id, text, lang, offline: !open, visitor: sh.visitor }, t);
      inboxStore.set((list) => [c, ...list]);
      shopperAppsStore.set((x) => ({ ...x, chatCase: c.id, name, contact }));
    }
    setText(''); setTried(false);
  };

  const back = nextOpen(s, now);
  const side = s.position === 'start' ? 'start-4' : 'end-4';
  const pos = preview ? 'relative' : cn('fixed z-40', side, lift ? 'bottom-[5.5rem]' : 'bottom-4');
  return (
    <div className={cn(pos, 'flex flex-col items-end gap-3', s.position === 'start' && 'items-start')} data-free-app="livechat">
      {isShown && (
        <section aria-label={tx('الدردشة مع المتجر', 'Chat with the store')} className={cn('flex w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-pop', preview ? 'max-h-[420px]' : 'max-h-[min(560px,calc(100vh-7rem))]')}>
          <header className="flex items-center gap-3 bg-brand-600 px-4 py-3 text-white">
            <span className="grid size-9 place-items-center rounded-full bg-white/15"><MessageCircle className="size-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{store}</p>
              <p className="flex items-center gap-1.5 text-xs text-white/85"><span aria-hidden="true" className={cn('size-2 rounded-full', open ? 'bg-emerald-300' : 'bg-white/50')} />{open ? tx('متصلون الآن', 'Online now') : back ? tx(`نعود ${dl(back)} ${time(back)}`, `Back ${dl(back)} ${time(back)}`) : tx('خارج الدوام', 'Away')}</p>
            </div>
            {!preview && <button type="button" onClick={() => toggle(false)} aria-label={tx('أغلق الدردشة', 'Close chat')} className="grid size-9 place-items-center rounded-lg hover:bg-white/10"><X className="size-5" aria-hidden="true" /></button>}
          </header>
          <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto p-4 text-sm" aria-live="polite">
            <p className="max-w-[85%] rounded-2xl rounded-ss-sm bg-surface-2 px-3 py-2" dir="auto">{open ? s.greeting[lang] : s.offlineText[lang]}</p>
            {thread.map((m) => (
              <div key={m.id} className={cn('flex flex-col', m.from === 'customer' ? 'items-end' : 'items-start')}>
                <p dir="auto" className={cn('max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2', m.from === 'customer' ? 'rounded-se-sm bg-brand-600 text-white' : 'rounded-ss-sm bg-surface-2')}>{m.text}</p>
                <span className="mt-0.5 text-[11px] text-muted">{m.from === 'store' ? `${store} · ` : ''}{time(m.at)}</span>
              </div>
            ))}
            {mine && !closed && thread.at(-1)?.from === 'customer' && <p className="text-center text-xs text-muted">{open ? tx('وصلت رسالتك، نرد هنا وعلى جوالك أو بريدك.', 'Got it. We reply here and by mobile or email.') : tx('وصلت رسالتك، نرد فور عودتنا.', 'Got it. We will reply as soon as we are back.')}</p>}
            {closed && <p className="text-center text-xs text-muted">{tx('أُغلقت المحادثة. اكتب لبدء محادثة جديدة.', 'This chat was closed. Write to start a new one.')}</p>}
            <div ref={endRef} />
          </div>
          <form className="space-y-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
            {(!mine || closed) && (
              <div className="grid grid-cols-2 gap-2">
                <div><input aria-label={tx('اسمك', 'Your name')} placeholder={tx('اسمك', 'Your name')} value={name} onChange={(e) => setName(e.target.value)} className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm" />
                  {tried && probs.includes('name') && <p className={ERR}>{tx('اكتب اسمك', 'Enter your name')}</p>}</div>
                <div><input aria-label={tx('جوالك أو بريدك', 'Mobile or email')} placeholder={tx('الجوال أو البريد', 'Mobile or email')} dir="ltr" value={contact} onChange={(e) => setContact(e.target.value)} className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm" />
                  {tried && probs.includes('contact') && <p className={ERR}>{tx('جوال سعودي أو بريد صحيح', 'A Saudi mobile or valid email')}</p>}</div>
              </div>
            )}
            <div className="flex gap-2">
              <input aria-label={tx('رسالتك', 'Your message')} placeholder={open ? tx('اكتب رسالتك…', 'Type a message…') : tx('اترك رسالتك…', 'Leave a message…')} value={text} onChange={(e) => setText(e.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm" />
              <Button type="submit" aria-label={tx('أرسل', 'Send')} disabled={preview}><Send className="size-4 rtl:-scale-x-100" aria-hidden="true" /></Button>
            </div>
            {tried && probs.includes('text') && <p className={ERR}>{tx('اكتب رسالة', 'Write a message')}</p>}
          </form>
        </section>
      )}
      {!preview && !isShown && (
        <button type="button" onClick={() => toggle(true)} className="flex h-12 items-center gap-2 rounded-full bg-brand-600 px-4 text-sm font-semibold text-white shadow-pop hover:bg-brand-700">
          <MessageCircle className="size-5" aria-hidden="true" />{open ? tx('تحدث معنا', 'Chat with us') : tx('اترك رسالة', 'Leave a message')}
          {mine && thread.at(-1)?.from === 'store' && <span className="size-2.5 rounded-full bg-amber-300" aria-label={tx('رد جديد', 'New reply')} />}
        </button>
      )}
    </div>
  );
}
