// Help: order, delivery and return problems go to the store; marketplace problems go to LAK.
import { useState } from 'react';
import { ChevronLeft, Store } from 'lucide-react';
import { Button, Card, Ref, useTx } from '../../../ds/ui';
import { Alert, Field, Select, Simulated, Textarea } from '../../../ds/kit';
import { marketStore, now, useScreen } from '../state';
import { H2, SellerMark, sellerOf, useMk } from '../ui';
import { PageError, Title } from './common';
import { SeparateNote } from './cart';

export default function HelpPage() {
  const { t, lang, go, route } = useMk();
  const tx = useTx();
  const screen = useScreen();
  const s = marketStore.use();
  const [topic, setTopic] = useState(route.query.get('order') ? 'order' : 'account');
  const [order, setOrder] = useState(route.query.get('order') ?? '');
  const [msg, setMsg] = useState('');
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const orders = screen === 'empty' ? [] : s.orders;
  const error = tried && !msg.trim() ? t.required : undefined;
  if (screen === 'error') return <><Title sub={t.helpSub}>{t.helpTitle}</Title><PageError title={tx('تعذّر تحميل المساعدة', 'Help could not load')} refCode="SIM-MKT-HLP-503" /></>;

  return (
    <>
      <Title sub={t.helpSub}>{t.helpTitle}</Title>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-4 p-5" aria-labelledby="hp-s">
          <H2 id="hp-s"><Store className="size-4 text-muted" aria-hidden="true" />{t.sellerSide}</H2>
          <p className="text-[13px] text-muted">{t.sellerSideBody}</p>
          {orders.length === 0 ? <p className="rounded-xl bg-surface-2 p-3 text-[13px] text-muted">{t.noOrders}</p> : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {orders.map((o) => {
                const seller = sellerOf(o.seller)!;
                return (
                  <li key={o.ref}>
                    <a href={go(`/orders/${o.ref}`)} className="flex items-center gap-3 px-3 py-3 text-sm hover:bg-surface-2/50">
                      <SellerMark s={seller} size={28} />
                      <span className="min-w-0 flex-1 truncate"><Ref>{o.ref}</Ref> · {seller.name[lang]}</span>
                      <ChevronLeft className="size-4 text-muted ltr:rotate-180" aria-hidden="true" />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          <SeparateNote />
        </Card>

        <Card className="space-y-4 p-5" aria-labelledby="hp-l">
          <H2 id="hp-l"><img src="/lak-mark.png" alt="" className="h-4 w-auto" />{t.lakSide}</H2>
          <p className="text-[13px] text-muted">{t.lakSideBody}</p>
          <form className="space-y-4" noValidate onSubmit={(e) => {
            e.preventDefault(); setTried(true);
            if (!msg.trim()) return;
            const ref = `SUP-${3100 + s.seq}`;
            marketStore.set((x) => ({ ...x, seq: x.seq + 1, tickets: [{ ref, topic, order, at: now() }, ...x.tickets] }));
            setDone(ref); setMsg(''); setTried(false);
          }}>
            <Field label={t.topic}>{(p) => <Select {...p} value={topic} onChange={(e) => setTopic(e.target.value)}>{Object.entries(t.topics).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
            <Field label={t.aboutOrder}>{(p) => <Select {...p} value={order} onChange={(e) => setOrder(e.target.value)}><option value="">{t.noOrder}</option>{orders.map((o) => <option key={o.ref} value={o.ref}>{o.ref}</option>)}</Select>}</Field>
            <Field label={t.message} hint={t.messageHint} error={error}>{(p) => <Textarea {...p} value={msg} onChange={(e) => setMsg(e.target.value)} />}</Field>
            <div className="flex flex-wrap items-center gap-2"><Button type="submit">{t.send}</Button><Simulated /></div>
          </form>
          {done && <Alert tone="ok">{t.ticketSent(done)}</Alert>}
          {s.tickets.length > 0 && (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-sm font-semibold text-fg">{t.tickets}</p>
              <ul className="space-y-1 text-[13px] text-muted">{s.tickets.map((k) => <li key={k.ref}><Ref>{k.ref}</Ref> · {t.topics[k.topic]}{k.order && <> · <Ref>{k.order}</Ref></>}</li>)}</ul>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
