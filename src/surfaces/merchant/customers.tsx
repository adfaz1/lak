import { useMemo, useState } from 'react';
import { useLang } from '../../core/lang';
import type { Route } from '../../core/router';
import { Alert, Badge, Dialog, Field, PageHeader, Sim } from '../../core/ui';
import { total } from './domain';
import { can, canSee } from './perms';
import { notesStore, ordersStore, testStore } from './stores';
import { SEGMENTS, customerFixtures, customerStats, segmentsOf, type Customer, type Segment } from './workspace';
import { strings } from './i18n';
import { ActionLocked, DataTable, KV, Money, Pager, mhref, mreplace, useL, useTx, type Col } from './kit';
import { PAY_TONE } from './orders';

const CUSTOMERS = customerFixtures();

function useSegName() {
  const tx = useTx();
  return (s: Segment) => ({ returning: tx('عائد (طلبان أو أكثر)', 'Returning (2+ orders)'), new: tx('جديد (طلب واحد)', 'New (1 order)'), highValue: tx('إنفاق 10,000 ر.س أو أكثر', 'Spent SAR 10,000+'), emailConsent: tx('موافق على البريد التسويقي', 'Email marketing consent') })[s];
}

export function CustomersPage({ route }: { route: Route }) {
  if (route.path[1]) return <Profile id={route.path[1]} />;
  return <List route={route} />;
}

function List({ route }: { route: Route }) {
  const tx = useTx();
  const l = useL();
  const segName = useSegName();
  const orders = ordersStore.use();
  const q = route.query.get('q') ?? '';
  const sq = route.query.get('seg') as Segment | null;
  const seg = sq && SEGMENTS.includes(sq) ? sq : null;
  const all = useMemo(() => CUSTOMERS.map((c) => { const s = customerStats(c, orders); return { c, s, segs: segmentsOf(c, s) }; }), [orders]);
  const rows = all.filter((r) => (!seg || r.segs.includes(seg)) && (!q || r.c.name.ar.includes(q) || r.c.name.en.toLowerCase().includes(q.toLowerCase()) || r.c.id.toLowerCase().includes(q.toLowerCase()) || r.c.city.en.toLowerCase().includes(q.toLowerCase()) || r.c.city.ar.includes(q)));
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  const page = Math.min(pages, Math.max(1, Number(route.query.get('page')) || 1));
  const pageRows = rows.slice((page - 1) * 25, page * 25);
  const qs = (o: Record<string, string | undefined>) => ({ q: q || undefined, seg: seg ?? undefined, ...o });
  type R = (typeof rows)[number];
  const cols: Col<R>[] = [
    { key: 'n', head: tx('العميل', 'Customer'), cell: (r) => <><span className="strong">{l(r.c.name)}</span><div className="small muted"><bdi dir="ltr">{r.c.id}</bdi></div></> },
    { key: 'city', head: tx('المدينة', 'City'), cell: (r) => l(r.c.city) },
    { key: 'o', head: tx('طلبات مدفوعة', 'Paid orders'), end: true, cell: (r) => <bdi>{r.s.paidCount}</bdi> },
    { key: 's', head: tx('إجمالي الإنفاق', 'Total spent'), end: true, cell: (r) => <Money v={r.s.spent} /> },
    { key: 'g', head: tx('الشرائح', 'Segments'), cell: (r) => <span className="m-badges">{r.segs.filter((x) => x !== 'emailConsent').map((x) => <Badge key={x}>{segName(x)}</Badge>)}</span> },
    { key: 'a', head: tx('فتح', 'Open'), srHead: true, end: true, cell: (r) => <a className="btn small" href={mhref(`customers/${r.c.id}`, qs({}))}>{tx('فتح', 'Open')}</a> },
  ];
  return (
    <>
      <PageHeader title={tx('العملاء', 'Customers')} sub={tx('الشرائح قواعد على سجل الطلبات والموافقات فقط؛ لا نستنتج عمرًا أو جنسًا أو ملاءة.', 'Segments are rules over order history and consent only; we infer no age, gender or creditworthiness.')} />
      <div className="views" role="group" aria-label={tx('الشرائح', 'Segments')}>
        <a className="chip" href={mhref('customers', { q: q || undefined })} aria-current={!seg ? 'true' : undefined}>{tx('الكل', 'All')} · <bdi>{all.length}</bdi></a>
        {SEGMENTS.map((s) => <a key={s} className="chip" href={mhref('customers', { q: q || undefined, seg: s })} aria-current={seg === s ? 'true' : undefined}>{segName(s)} · <bdi>{all.filter((r) => r.segs.includes(s)).length}</bdi></a>)}
      </div>
      <input className="input search" type="search" aria-label={tx('بحث بالاسم أو المعرف أو المدينة', 'Search by name, id or city')} placeholder={tx('ابحث بالاسم أو المعرف أو المدينة', 'Search name, id or city')} value={q} onChange={(e) => mreplace('customers', qs({ q: e.target.value || undefined, page: undefined }))} />
      <div className="card">
        <DataTable label={tx('العملاء', 'Customers')} cols={cols} rows={pageRows} rowKey={(r) => r.c.id}
          mobile={(r) => <a className="m-rowcard-main" href={mhref(`customers/${r.c.id}`, qs({}))}><span className="m-rowcard-top"><span className="strong">{l(r.c.name)}</span><Money v={r.s.spent} /></span><span className="small muted">{l(r.c.city)} · {tx(`${r.s.paidCount} طلبات`, `${r.s.paidCount} orders`)}</span></a>}
          empty={<div className="empty"><span>{tx('لا عملاء يطابقون البحث.', 'No customers match.')}</span><a className="btn" href={mhref('customers')}>{tx('مسح التصفية', 'Clear filters')}</a></div>} />
      </div>
      <div className="toolbar"><p className="small muted">{tx(`${rows.length} عميلًا`, `${rows.length} customers`)}</p><Pager page={page} pages={pages} hrefFor={(p) => mhref('customers', qs({ page: p > 1 ? String(p) : undefined }))} /></div>
    </>
  );
}

function Profile({ id }: { id: string }) {
  const tx = useTx();
  const l = useL();
  const { lang } = useLang();
  const t = strings[lang];
  const segName = useSegName();
  const orders = ordersStore.use();
  const notes = notesStore.use()[id] ?? [];
  const role = testStore.use().role;
  const c = CUSTOMERS.find((x) => x.id === id);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [confirm, setConfirm] = useState(false);
  const [noteErr, setNoteErr] = useState(false);
  const back = <a className="back" href={mhref('customers')}>{tx('العودة إلى العملاء', 'Back to customers')}</a>;
  if (!c) return <>{back}<Alert tone="danger">{tx('لا يوجد عميل بهذا المعرف.', 'No customer with this id.')}</Alert></>;
  const s = customerStats(c, orders);
  const segs = segmentsOf(c, s);
  const consented = channel === 'email' ? c.consent.email : c.consent.sms;
  const add = (kind: 'internal' | 'message', text: string) => notesStore.set((n) => ({ ...n, [id]: [{ id: `N${Date.now()}`, kind, text, channel: kind === 'message' ? channel : undefined, by: 'You' }, ...(n[id] ?? [])] }));
  const internal = notes.filter((n) => n.kind === 'internal');
  const messages = notes.filter((n) => n.kind === 'message');
  return (
    <>
      {back}
      <PageHeader title={l(c.name)} sub={<><bdi dir="ltr">{c.id}</bdi> · {l(c.city)} · {tx('عميل منذ', 'Customer since')} <bdi dir="ltr">{c.since}</bdi></>} />
      <div className="cols">
        <div className="col-main">
          <section className="card" aria-labelledby="co-h">
            <div className="card-head"><h2 id="co-h">{tx('الطلبات', 'Orders')}</h2><span className="small muted">{tx(`${s.orders.length} طلبًا · إنفاق ${''}`, `${s.orders.length} orders · spent `)}<Money v={s.spent} /></span></div>
            <ul className="queue">
              {s.orders.slice(0, 10).map((o) => (
                <li key={o.ref}>
                  <span className="grow">{canSee(role, 'orders') ? <a href={mhref(`orders/${o.ref}`)}><bdi dir="ltr">#{o.ref}</bdi></a> : <bdi dir="ltr">#{o.ref}</bdi>} <span className="small muted">· {t.age(o.hoursAgo)}</span></span>
                  <Badge tone={PAY_TONE[o.pay]}>{t.pay[o.pay]}</Badge><span className="strong"><Money v={total(o)} /></span>
                </li>
              ))}
              {s.orders.length === 0 && <li className="muted">{tx('لا طلبات بعد.', 'No orders yet.')}</li>}
            </ul>
            {s.orders.length > 10 && <div className="card-body"><p className="small muted">{tx(`يعرض أحدث 10 من ${s.orders.length}.`, `Showing the latest 10 of ${s.orders.length}.`)}</p></div>}
          </section>

          <section className="card m-internal" aria-labelledby="cn-h">
            <div className="card-head"><h2 id="cn-h">{tx('ملاحظات داخلية', 'Internal notes')}</h2><Badge>{tx('للفريق فقط — لا تصل للعميل', 'Team only — never sent to the customer')}</Badge></div>
            <div className="card-body">
              {can(role, 'customer.note') ? (
                <>
                  <Field id="cn-t" label={tx('ملاحظة جديدة', 'New note')} error={noteErr ? tx('اكتب الملاحظة.', 'Write the note.') : undefined}><textarea id="cn-t" className="input" value={note} aria-invalid={noteErr} onChange={(e) => { setNote(e.target.value); setNoteErr(false); }} /></Field>
                  <button type="button" className="btn" onClick={() => { if (!note.trim()) { setNoteErr(true); return; } add('internal', note.trim()); setNote(''); }}>{tx('أضف ملاحظة داخلية', 'Add internal note')}</button>
                </>
              ) : <ActionLocked>{tx('دورك لا يشمل الملاحظات.', 'Your role does not include notes.')}</ActionLocked>}
              <ul className="log">{internal.map((n) => <li key={n.id}><span className="muted when">{n.by}</span><span className="grow">{n.text}</span></li>)}{internal.length === 0 && <li className="muted">{tx('لا ملاحظات.', 'No notes.')}</li>}</ul>
            </div>
          </section>

          <section className="card m-outbound" aria-labelledby="cm-h">
            <div className="card-head"><h2 id="cm-h">{tx('رسالة إلى العميل', 'Message to the customer')}</h2><Badge tone="warning">{tx('تُرسل للعميل', 'Sent to the customer')}</Badge></div>
            <div className="card-body">
              {!can(role, 'customer.message') ? <ActionLocked>{tx('دورك لا يشمل مراسلة العملاء.', 'Your role does not include messaging customers.')}</ActionLocked> : (
                <>
                  <fieldset className="m-inline-radios"><legend>{tx('القناة', 'Channel')}</legend>
                    <label className="check"><input type="radio" checked={channel === 'email'} onChange={() => setChannel('email')} /> {tx('بريد', 'Email')} {c.consent.email ? '' : tx('(بلا موافقة)', '(no consent)')}</label>
                    <label className="check"><input type="radio" checked={channel === 'sms'} onChange={() => setChannel('sms')} /> {tx('رسالة نصية', 'SMS')} {c.consent.sms ? '' : tx('(بلا موافقة)', '(no consent)')}</label>
                  </fieldset>
                  {!consented && <Alert tone="info">{tx('لا موافقة مسجلة على هذه القناة. يمكن إرسال رسائل خدمة متعلقة بطلب فقط، لا تسويقية.', 'No consent on record for this channel. Only service messages about an order may be sent, not marketing.')}</Alert>}
                  <Field id="cm-t" label={tx('نص الرسالة', 'Message text')}><textarea id="cm-t" className="input" value={msg} onChange={(e) => setMsg(e.target.value)} /></Field>
                  <button type="button" className="btn primary" disabled={!msg.trim()} onClick={() => setConfirm(true)}>{tx('مراجعة قبل الإرسال', 'Review before sending')}</button>
                </>
              )}
              <ul className="log">{messages.map((n) => <li key={n.id}><span className="muted when">{n.channel === 'sms' ? 'SMS' : tx('بريد', 'Email')} · {n.by}</span><span className="grow">{n.text} <Sim /></span></li>)}</ul>
            </div>
          </section>
        </div>
        <aside className="col-side">
          <section className="card pad" aria-labelledby="cc-h">
            <h2 id="cc-h">{tx('التواصل والموافقات', 'Contact and consent')}</h2>
            {can(role, 'customer.contact') ? <KV rows={[
              [tx('البريد', 'Email'), <bdi dir="ltr">{c.email}</bdi>],
              [tx('الجوال', 'Mobile'), <bdi dir="ltr">{c.phone}</bdi>],
              [tx('بريد تسويقي', 'Email marketing'), c.consent.email ? <Badge tone="success">{tx('موافق', 'Consented')}</Badge> : <Badge>{tx('غير موافق', 'Not consented')}</Badge>],
              [tx('رسائل نصية', 'SMS marketing'), c.consent.sms ? <Badge tone="success">{tx('موافق', 'Consented')}</Badge> : <Badge>{tx('غير موافق', 'Not consented')}</Badge>],
            ]} /> : <ActionLocked>{tx('بيانات التواصل مخفية لدورك.', 'Contact details are hidden for your role.')}</ActionLocked>}
            <p className="small muted">{tx('طلبات كشف البيانات أو حذفها تُعالج عبر الدعم وفق سياسة الخصوصية المعتمدة.', 'Data access or deletion requests are handled through support under the approved privacy policy.')}</p>
          </section>
          <section className="card pad" aria-labelledby="cs-h">
            <h2 id="cs-h">{tx('الشرائح', 'Segments')}</h2>
            <span className="m-badges">{segs.map((x) => <Badge key={x}>{segName(x)}</Badge>)}{segs.length === 0 && <span className="muted small">{tx('لا شرائح', 'None')}</span>}</span>
          </section>
        </aside>
      </div>
      {confirm && (
        <Dialog title={tx('تأكيد إرسال الرسالة', 'Confirm sending the message')} onClose={() => setConfirm(false)}
          footer={<><button type="button" className="btn primary" onClick={() => { add('message', msg.trim()); setMsg(''); setConfirm(false); }}>{tx('أرسل (محاكاة)', 'Send (simulated)')}</button><button type="button" className="btn" onClick={() => setConfirm(false)}>{tx('إلغاء', 'Cancel')}</button></>}>
          <KV rows={[[tx('إلى', 'To'), l(c.name)], [tx('القناة', 'Channel'), channel === 'email' ? tx('بريد', 'Email') : 'SMS'], [tx('النص', 'Text'), msg]]} />
          <p className="muted">{tx('لا يمكن استرجاع رسالة بعد إرسالها. في هذه المعاينة لا يخرج أي شيء فعليًا.', 'A sent message cannot be recalled. In this preview nothing actually leaves.')} <Sim /></p>
        </Dialog>
      )}
    </>
  );
}
export type { Customer };
