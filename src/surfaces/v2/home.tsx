// Merchant home, redesigned. Question it answers in the first second: "what needs me right now, and is the store healthy?"
import { useMemo, useState } from 'react';
import { useLang } from '../../core/lang';
import { link } from '../../core/router';
import { formatMoney } from '../../core/format';
import { ordersStore, levelsStore, productsStore } from '../merchant/stores';
import { VIEWS, total, type Order } from '../merchant/domain';
import { lowStock, available } from '../merchant/inventory';
import { analyticsSeries, summarize, change, periods } from '../merchant/growth';
import { Icon, Money, Ref, Skeleton, EmptyState, ThumbStack, Thumb, useTx, type IconName, type Tone } from './ui';
import { reviewStore, vhref, isLate, itemImage, productImage, productIdForSku, age, stageOf } from './data';
import { Page } from './index';
import './home.css';

interface Task { id: string; tone: Tone; icon: IconName; title: string; why: string; count: number; value?: number; cta: string; href: string; secondary?: { label: string; href: string }; preview?: { src?: string; alt: string }[] }

export default function Home() {
  const { lang } = useLang();
  const tx = useTx();
  const { dir, state } = reviewStore.use();
  const orders = ordersStore.use();
  const levels = levelsStore.use();
  const products = productsStore.use();
  const series = useMemo(analyticsSeries, []);

  const needs = orders.filter(VIEWS.needs);
  const late = needs.filter(isLate);
  const failed = orders.filter((o) => o.pay === 'failed');
  const refunds = orders.filter((o) => o.refunds.some((r) => r.status === 'pending'));
  const low = lowStock(levels);
  const today = orders.filter((o) => o.hoursAgo < 12);
  const paidToday = today.filter((o) => o.pay !== 'failed').reduce((s, o) => s + total(o), 0);
  const { cur, prev } = periods(series, 7);
  const sCur = summarize(cur), sPrev = summarize(prev);

  const imgs = (list: Order[]) => list.slice(0, 4).map((o) => ({ src: itemImage(o.items[0]), alt: o.items[0].name[lang] }));
  const lowPreview = low.slice(0, 3).map((l) => ({ src: productImage(productIdForSku(l.sku)), alt: l.sku }));

  // Ranked by time and money risk: unpaid failures and late orders first, then today's fulfilment, then stock.
  const tasks: Task[] = [];
  if (late.length) tasks.push({ id: 'late', tone: 'bad', icon: 'clock', count: late.length, value: late.reduce((s, o) => s + total(o), 0),
    title: tx('طلبات متأخرة عن موعد التجهيز', 'Orders past their fulfilment window'),
    why: tx(`مدفوعة منذ أكثر من 24 ساعة ولم تُجهّز. أقدمها ${age(Math.max(...late.map((o) => o.hoursAgo)), lang)}.`, `Paid over 24 hours ago and not fulfilled. Oldest ${age(Math.max(...late.map((o) => o.hoursAgo)), lang)}.`),
    cta: tx('جهّز المتأخرة', 'Fulfil late orders'), href: vhref('orders', { view: 'late' }), preview: imgs(late) });
  if (failed.length) tasks.push({ id: 'pay', tone: 'bad', icon: 'card', count: failed.length, value: failed.reduce((s, o) => s + total(o), 0),
    title: tx('مدفوعات لم تكتمل', 'Payments that did not complete'),
    why: tx('لم يُحصَّل المبلغ. لا تُجهَّز حتى يتأكد الدفع؛ تواصل مع العميل أو ألغِ الطلب.', 'Not collected. Do not fulfil until payment is confirmed; contact the customer or cancel.'),
    cta: tx('راجع المدفوعات', 'Review payments'), href: vhref('orders', { view: 'payfail' }), preview: imgs(failed) });
  if (needs.length - late.length > 0) tasks.push({ id: 'needs', tone: 'brand', icon: 'box', count: needs.length - late.length, value: needs.filter((o) => !isLate(o)).reduce((s, o) => s + total(o), 0),
    title: tx('طلبات جديدة جاهزة للتجهيز', 'New orders ready to fulfil'),
    why: tx('مدفوعة، ضمن الوقت. التجهيز اليوم يحافظ على وعد التوصيل.', 'Paid and on time. Fulfilling today keeps the delivery promise.'),
    cta: tx('ابدأ التجهيز', 'Start fulfilling'), href: vhref('orders', { view: 'needs' }), preview: imgs(needs.filter((o) => !isLate(o))) });
  if (refunds.length) tasks.push({ id: 'refund', tone: 'warn', icon: 'return', count: refunds.length,
    title: tx('استردادات بانتظار تأكيد المزوّد', 'Refunds waiting for the provider'),
    why: tx('لا تخبر العميل بوصول المبلغ قبل التأكيد.', 'Do not tell the customer the money has arrived before confirmation.'),
    cta: tx('تابع الاستردادات', 'Track refunds'), href: vhref('orders', { view: 'returns' }) });
  if (low.length) tasks.push({ id: 'stock', tone: 'warn', icon: 'inventory', count: low.length,
    title: tx('أصناف عند حد إعادة الطلب', 'SKUs at their reorder point'),
    why: tx('المتاح = الموجود − المحجوز. قد يتوقف البيع في الموقع المعني.', 'Available = on hand − reserved. Sales may stop at that location.'),
    cta: tx('افتح المخزون', 'Open inventory'), href: link('/merchant/inventory'), secondary: { label: tx('الإصدار الحالي', 'current version'), href: link('/merchant/inventory') }, preview: lowPreview });

  const kpis = [
    { label: tx('مبيعات مدفوعة اليوم', 'Paid sales today'), value: <Money v={paidToday} />, note: tx(`${today.length} طلبات اليوم`, `${today.length} orders today`), delta: null as number | null },
    { label: tx('صافي آخر 7 أيام', 'Net sales, last 7 days'), value: <Money v={sCur.net} />, note: tx('مقابل الأيام السبعة السابقة', 'vs the previous 7 days'), delta: change(sCur.net, sPrev.net) },
    { label: tx('بانتظار التجهيز', 'Awaiting fulfilment'), value: <span className="lk-num">{needs.length}</span>, note: late.length ? tx(`${late.length} منها متأخرة`, `${late.length} of them late`) : tx('لا متأخر', 'none late'), delta: null },
    { label: tx('معدل التحويل', 'Conversion'), value: <span className="lk-num">{sCur.conversion === null ? '—' : `${sCur.conversion}%`}</span>, note: tx(`محسوب على ${sCur.sessionDays} من ${sCur.days} أيام فيها بيانات زيارات`, `On ${sCur.sessionDays} of ${sCur.days} days with visit data`), delta: change(sCur.conversion, sPrev.conversion) },
  ];

  const head = (
    <div className="lk-pagehead">
      <div className="lk-col lk-grow lk-gap-4">
        <span className="lk-eyebrow">{tx('الاثنين 24 نوفمبر · توقيت الرياض', 'Monday 24 November · Riyadh time')}</span>
        <h1 className="lk-display">{tx('صباح الخير', 'Good morning')}</h1>
        <p className="lk-2">{state === 'live' && tasks.length ? tx(`${tasks.length} أمور تحتاجك اليوم، مرتبة حسب أثرها على المال والوقت.`, `${tasks.length} things need you today, ranked by money and time impact.`) : tx('ملخص متجرك اليوم.', 'Your store today.')}</p>
      </div>
      <div className="lk-row lk-wrap">
        <a className="lk-btn" href={vhref(`products/${products[0].id}`)}><Icon name="plus" size="sm" />{tx('منتج جديد', 'New product')}</a>
        <a className="lk-btn primary" href={vhref('orders', { view: 'needs' })}><Icon name="box" size="sm" />{tx('جهّز الطلبات', 'Fulfil orders')}</a>
      </div>
    </div>
  );

  if (state === 'loading') return <Page>{head}<HomeSkeleton dir={dir} /></Page>;
  if (state === 'error') return (
    <Page>{head}
      <div className="lk-card"><EmptyState tone="bad" icon="alert" title={tx('تعذر تحميل ملخص اليوم', "Today's summary could not load")}
        action={<button type="button" className="lk-btn primary" onClick={() => reviewStore.set((s) => ({ ...s, state: 'live' }))}><Icon name="refresh" size="sm" />{tx('أعد المحاولة', 'Try again')}</button>}>
        {tx('لم تتغير بياناتك. طلباتك ومنتجاتك تعمل كالمعتاد؛ هذا الملخص فقط لم يصل. المرجع: SIM-HOME-503', 'Nothing changed in your data. Orders and products work as usual; only this summary failed. Reference: SIM-HOME-503')}
      </EmptyState></div>
    </Page>
  );
  const shownTasks = state === 'empty' ? [] : tasks;

  const queue = (
    <section className="lk-card home-queue" aria-labelledby="q-h">
      <div className="lk-card-h"><h2 id="q-h" className="lk-h2 lk-grow">{tx('يحتاجك الآن', 'Needs you now')}</h2><span className="lk-micro lk-3">{tx('مرتّبة حسب أثر المال والوقت', 'Ranked by money and time impact')}</span></div>
      {shownTasks.length === 0 ? (
        <EmptyState icon="check" title={tx('لا شيء ينتظرك', 'Nothing is waiting for you')} action={<a className="lk-btn" href={vhref('orders')}>{tx('كل الطلبات', 'All orders')}</a>}>
          {tx('كل الطلبات المدفوعة مجهّزة، ولا مدفوعات متعثرة ولا مخزون منخفض. سنضيف هنا كل ما يحتاج قرارك.', 'Every paid order is fulfilled, no failed payments, no low stock. Anything that needs your decision will appear here.')}
        </EmptyState>
      ) : (
        <ol className="home-tasks">
          {shownTasks.map((t, n) => (
            <li key={t.id} className={`home-task${n === 0 ? ' first' : ''}`}>
              <span className={`home-task-ic ${t.tone}`}><Icon name={t.icon} /></span>
              <div className="lk-grow lk-col lk-gap-4">
                <div className="lk-row lk-wrap" style={{ gap: '4px 10px' }}>
                  <h3 className="lk-h3">{t.title}</h3>
                  <span className="lk-count">{t.count}</span>
                  {t.value ? <span className="lk-small lk-2"><Money v={t.value} /></span> : null}
                </div>
                <p className="lk-small lk-2">{t.why}</p>
              </div>
              {t.preview && t.preview.length > 0 && <span className="lk-only-desktop"><ThumbStack items={t.preview} /></span>}
              <a className={`lk-btn${n === 0 ? ' primary' : ''}`} href={t.href}>{t.cta}<Icon name="chevron" size="sm" /></a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );

  const kpiCards = (
    <section className={`home-kpis ${dir}`} aria-label={tx('مؤشرات', 'Key figures')}>
      {kpis.map((k) => (
        <div key={k.label} className="home-kpi">
          <span className="lk-small lk-2">{k.label}</span>
          <strong className="home-kpi-v">{state === 'empty' ? <span className="lk-3">—</span> : k.value}</strong>
          <span className="lk-micro lk-3 lk-row lk-wrap" style={{ gap: 6 }}>
            {state !== 'empty' && k.delta !== null && <Delta v={k.delta} />}{state === 'empty' ? tx('لا بيانات بعد', 'No data yet') : k.note}
          </span>
        </div>
      ))}
    </section>
  );

  const chart = <SalesChart days={state === 'empty' ? [] : series.slice(-14)} />;
  const activity = <Activity orders={state === 'empty' ? [] : orders.slice(0, 6)} />;
  const lowList = state === 'empty' ? [] : low.slice(0, 4);
  const stock = (
    <section className="lk-card" aria-labelledby="st-h">
      <div className="lk-card-h"><h2 id="st-h" className="lk-h2 lk-grow">{tx('مخزون يقترب من النفاد', 'Stock running low')}</h2><a className="lk-btn sm ghost" href={link('/merchant/inventory')}>{tx('الكل', 'All')}</a></div>
      {lowList.length === 0 ? <p className="lk-card-b lk-small lk-2">{tx('لا أصناف عند حد إعادة الطلب.', 'No SKUs at their reorder point.')}</p> : (
        <ul className="home-stock">
          {lowList.map((l) => {
            const p = products.find((x) => x.id === productIdForSku(l.sku));
            return (
              <li key={`${l.sku}-${l.loc}`}>
                <Thumb src={productImage(productIdForSku(l.sku))} alt={p?.name[lang] ?? l.sku} />
                <div className="lk-grow lk-col"><span className="lk-small lk-strong lk-truncate">{p?.name[lang] ?? l.sku}</span><span className="lk-micro lk-3"><Ref>{l.sku}</Ref> · {l.loc === 'ryd' ? tx('الرياض', 'Riyadh') : tx('جدة', 'Jeddah')}</span></div>
                <div className="lk-col" style={{ alignItems: 'flex-end' }}><span className="lk-num lk-strong">{available(l)}</span><span className="lk-micro lk-3">{tx(`الحد ${l.threshold}`, `min ${l.threshold}`)}</span></div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return dir === 'a' ? (
    <Page>
      {head}
      <div className="home-a">
        <div className="lk-col lk-gap-16 home-a-main">{queue}{chart}</div>
        <aside className="lk-col lk-gap-16 home-a-rail">{kpiCards}{stock}{activity}</aside>
      </div>
    </Page>
  ) : (
    <Page>
      {head}
      {kpiCards}
      {queue}
      <div className="home-b-grid">{chart}<div className="lk-col lk-gap-16">{stock}{activity}</div></div>
    </Page>
  );
}

function Delta({ v }: { v: number }) {
  const up = v >= 0;
  return <span className={`home-delta ${up ? 'up' : 'down'}`}><bdi dir="ltr">{up ? '▲' : '▼'} {Math.abs(v)}%</bdi></span>;
}

function SalesChart({ days }: { days: { date: string; net: number; orders: number }[] }) {
  const tx = useTx();
  const { lang } = useLang();
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.net));
  const totalNet = days.reduce((s, d) => s + d.net, 0);
  const fmtDay = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const h = hover === null ? null : days[hover];
  return (
    <section className="lk-card" aria-labelledby="ch-h">
      <div className="lk-card-h">
        <div className="lk-col lk-grow"><h2 id="ch-h" className="lk-h2">{tx('صافي المبيعات · آخر 14 يومًا مكتملًا', 'Net sales · last 14 complete days')}</h2>
          <span className="lk-micro lk-3">{tx('بعد الخصومات والاستردادات، شامل الضريبة. اليوم غير مكتمل فلا يُحتسب.', 'After discounts and refunds, VAT included. Today is incomplete and excluded.')}</span></div>
        <div className="lk-seg" role="group" aria-label={tx('طريقة العرض', 'View')}>
          <button type="button" aria-pressed={!table} onClick={() => setTable(false)}>{tx('رسم', 'Chart')}</button>
          <button type="button" aria-pressed={table} onClick={() => setTable(true)}>{tx('جدول', 'Table')}</button>
        </div>
      </div>
      <div className="lk-card-b">
        {days.length === 0 ? <EmptyState icon="analytics" title={tx('لا مبيعات بعد', 'No sales yet')}>{tx('سيظهر هنا صافي المبيعات اليومي بعد أول طلب مدفوع.', 'Daily net sales appear here after your first paid order.')}</EmptyState>
          : table ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="home-table"><thead><tr><th scope="col">{tx('اليوم', 'Day')}</th><th scope="col">{tx('الطلبات', 'Orders')}</th><th scope="col">{tx('صافي المبيعات', 'Net sales')}</th></tr></thead>
                <tbody>{days.map((d) => <tr key={d.date}><td>{fmtDay(d.date)}</td><td className="lk-num">{d.orders}</td><td><Money v={d.net} /></td></tr>)}</tbody></table>
            </div>
          ) : (
            <>
              <div className="lk-row lk-between" style={{ alignItems: 'flex-end', marginBottom: 12 }}>
                <div className="lk-col"><span className="lk-micro lk-3">{h ? fmtDay(h.date) : tx('الإجمالي', 'Total')}</span><span className="lk-h1 lk-num">{formatMoney(h ? h.net : totalNet)} <span className="lk-small lk-3">{tx('ر.س', 'SAR')}</span></span></div>
                <span className="lk-small lk-2 lk-num">{h ? tx(`${h.orders} طلب`, `${h.orders} orders`) : tx(`${days.reduce((s, d) => s + d.orders, 0)} طلب`, `${days.reduce((s, d) => s + d.orders, 0)} orders`)}</span>
              </div>
              <div className="home-bars" onMouseLeave={() => setHover(null)}>
                {days.map((d, i) => (
                  <button key={d.date} type="button" className="home-bar" aria-label={`${fmtDay(d.date)}: ${formatMoney(d.net)} ${tx('ر.س', 'SAR')}`}
                    onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} data-on={hover === i ? '' : undefined}>
                    <span style={{ height: `${Math.max(2, (d.net / max) * 100)}%` }} className={d.net === 0 ? 'zero' : undefined} />
                  </button>
                ))}
              </div>
              <div className="home-axis lk-micro lk-3"><span>{fmtDay(days[0].date)}</span><span>{fmtDay(days[days.length - 1].date)}</span></div>
            </>
          )}
      </div>
    </section>
  );
}

function Activity({ orders }: { orders: Order[] }) {
  const tx = useTx();
  const { lang } = useLang();
  const label = (o: Order) => {
    const s = stageOf(o);
    return s === 'payfail' ? tx('فشل الدفع', 'payment failed') : s === 'todo' ? tx('طلب جديد', 'new order') : s === 'delivered' ? tx('تم التسليم', 'delivered') : s === 'transit' ? tx('في الطريق', 'in transit') : s === 'label' ? tx('صدر ملصق الشحن', 'label issued') : s === 'refund' ? tx('استرداد معلّق', 'refund pending') : tx('تجهيز جزئي', 'partly fulfilled');
  };
  return (
    <section className="lk-card" aria-labelledby="ac-h">
      <div className="lk-card-h"><h2 id="ac-h" className="lk-h2 lk-grow">{tx('آخر النشاط', 'Recent activity')}</h2></div>
      {orders.length === 0 ? <p className="lk-card-b lk-small lk-2">{tx('لا نشاط بعد.', 'No activity yet.')}</p> : (
        <ul className="home-activity">
          {orders.map((o) => (
            <li key={o.ref}>
              <a href={vhref(`orders/${o.ref}`)}>
                <Thumb src={itemImage(o.items[0])} alt={o.items[0].name[lang]} />
                <span className="lk-grow lk-col"><span className="lk-small"><span className="lk-strong">{o.customer[lang]}</span> · {label(o)}</span><span className="lk-micro lk-3"><Ref>#{o.ref}</Ref> · {age(o.hoursAgo, lang)}</span></span>
                <Money v={total(o)} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HomeSkeleton({ dir }: { dir: 'a' | 'b' }) {
  const block = (h: number) => <div className="lk-card lk-card-b lk-col lk-gap-12" aria-hidden="true"><Skeleton w="40%" h={16} /><Skeleton h={h} r={8} /></div>;
  const kp = <div className={`home-kpis ${dir}`} aria-hidden="true">{[0, 1, 2, 3].map((i) => <div key={i} className="home-kpi"><Skeleton w="60%" /><Skeleton w="80%" h={26} /><Skeleton w="50%" h={10} /></div>)}</div>;
  return (
    <div role="status" aria-label="Loading" aria-busy="true">
      {dir === 'a' ? <div className="home-a"><div className="lk-col lk-gap-16">{block(260)}{block(200)}</div><div className="lk-col lk-gap-16">{kp}{block(160)}</div></div>
        : <div className="lk-col lk-gap-16">{kp}{block(240)}{block(220)}</div>}
    </div>
  );
}
