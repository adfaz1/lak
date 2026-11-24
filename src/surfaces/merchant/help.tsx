import { useState } from 'react';
import type { Route } from '../../core/router';
import { Alert, Badge, Field, PageHeader, Sim } from '../../core/ui';
import { appsStore, settingsStore, ticketsStore } from './stores';
import { articles } from './workspace';
import { mhref, mreplace, useL, useTx } from './kit';

const ARTICLES = articles();

export function HelpPage({ route }: { route: Route }) {
  const tx = useTx();
  const l = useL();
  const q = (route.query.get('q') ?? '').trim().toLowerCase();
  const [open, setOpen] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [err, setErr] = useState(false);
  const tickets = ticketsStore.use();
  const apps = appsStore.use();
  const providers = settingsStore.use().providers;
  const shown = ARTICLES.filter((a) => !q || `${a.title.ar} ${a.title.en} ${a.steps.map((s) => `${s.ar} ${s.en}`).join(' ')}`.toLowerCase().includes(q));
  const issues = [
    ...apps.filter((a) => a.state === 'error' || a.state === 'reauth').map((a) => ({ id: a.id, text: l(a.name), href: mhref(`apps/${a.id}`) })),
    ...providers.filter((p) => p.state === 'action_required').map((p) => ({ id: p.id, text: l(p.name), href: mhref('settings/payments') })),
  ];
  return (
    <>
      <PageHeader title={tx('المساعدة', 'Help')} sub={tx('مقالات قصيرة، حالة التكاملات، وطلب دعم.', 'Short articles, integration status, and a support request.')} />
      <input className="input search" type="search" aria-label={tx('ابحث في المساعدة', 'Search help')} placeholder={tx('مثال: استرداد، استيراد، تحويل', 'e.g. refund, import, transfer')} value={route.query.get('q') ?? ''} onChange={(e) => mreplace('help', { q: e.target.value || undefined })} />
      <div className="cols">
        <div className="col-main">
          <section className="card" aria-labelledby="hl-h">
            <div className="card-head"><h2 id="hl-h">{tx('مقالات', 'Articles')}</h2></div>
            {shown.length === 0 ? <div className="empty"><span>{tx('لا مقالات تطابق البحث. جرّب كلمة أخرى أو اطلب الدعم.', 'No articles match. Try another word or contact support.')}</span><a className="btn" href={mhref('help')}>{tx('مسح البحث', 'Clear search')}</a></div> : (
              <ul className="queue">
                {shown.map((a) => (
                  <li key={a.id} className="m-article">
                    <button type="button" className="m-linkbtn strong" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>{l(a.title)}</button>
                    {open === a.id && <ol className="m-list">{a.steps.map((s, i) => <li key={i}>{l(s)}</li>)}</ol>}
                    {open === a.id && <a className="btn small" href={mhref(a.page)}>{tx('افتح الصفحة المعنية', 'Open the related page')}</a>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside className="col-side">
          <section className="card pad" aria-labelledby="hs-h">
            <h2 id="hs-h">{tx('حالة التكاملات', 'Integration status')}</h2>
            {issues.length === 0 ? <p className="small">{tx('لا مشكلات معروفة.', 'No known issues.')}</p> : (
              <ul className="m-list">{issues.map((i) => <li key={i.id}><a href={i.href}>{i.text}</a> <Badge tone="warning">{tx('يحتاج انتباهًا', 'Needs attention')}</Badge></li>)}</ul>
            )}
          </section>
          <section className="card pad" aria-labelledby="ht-h">
            <h2 id="ht-h">{tx('اطلب الدعم', 'Contact support')} <Sim /></h2>
            <Field id="ht-s" label={tx('ما المشكلة؟', 'What is the problem?')} error={err ? tx('صف المشكلة باختصار.', 'Describe the problem briefly.') : undefined}>
              <textarea id="ht-s" className="input" value={subject} aria-invalid={err} onChange={(e) => { setSubject(e.target.value); setErr(false); }} />
            </Field>
            <p className="small muted">{tx('نرفق تلقائيًا: الصفحة الحالية ووقت الطلب ومرجعًا. لا نرفق كلمات مرور أو بيانات بطاقات.', 'We attach automatically: the current page, the time and a reference. Never passwords or card data.')}</p>
            <button type="button" className="btn primary" onClick={() => { if (!subject.trim()) { setErr(true); return; } ticketsStore.set((t) => [{ id: `SUP-${5101 + t.length}`, subject: subject.trim(), state: 'open' }, ...t]); setSubject(''); }}>{tx('أرسل الطلب (محاكاة)', 'Send request (simulated)')}</button>
            {tickets.map((t) => <Alert key={t.id} tone="info"><bdi dir="ltr">{t.id}</bdi> · {tx('مفتوح — لا يوجد فريق دعم حقيقي في هذه المعاينة', 'Open — there is no real support team in this preview')}: {t.subject}</Alert>)}
          </section>
        </aside>
      </div>
    </>
  );
}
