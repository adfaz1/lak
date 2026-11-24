import type { Route } from '../../core/router';
import { Metric, PageHeader } from '../../core/ui';
import { formatMoney } from './domain';
import { analyticsSeries, change, periods, summarize, type DayStat } from './growth';
import { EvidenceCard } from './assistant';
import { Delta, Money, mhref, mreplace, useTx } from './kit';

const SERIES = analyticsSeries();
type MetricId = 'net' | 'orders' | 'conversion';

const valueOf = (d: DayStat, m: MetricId): number | null =>
  m === 'net' ? d.net : m === 'orders' ? d.orders : d.sessions === null ? null : d.sessions === 0 ? null : Math.round((d.orders * 10000) / d.sessions) / 100;

export function AnalyticsPage({ route }: { route: Route }) {
  const tx = useTx();
  const len = route.query.get('period') === '7' ? 7 : 28;
  const cmp = route.query.get('cmp') !== 'off';
  const view = route.query.get('view') === 'table' ? 'table' : 'chart';
  const mq = route.query.get('metric') as MetricId | null;
  const metric: MetricId = mq && ['net', 'orders', 'conversion'].includes(mq) ? mq : 'net';
  const { cur, prev } = periods(SERIES, len);
  const c = summarize(cur);
  const p = summarize(prev);
  const qs = (o: Record<string, string | undefined>) => ({ period: len === 7 ? '7' : undefined, cmp: cmp ? undefined : 'off', view: view === 'table' ? 'table' : undefined, metric: metric !== 'net' ? metric : undefined, ...o });
  const fmt = (v: number | null) => (v === null ? tx('لا بيانات', 'No data') : metric === 'net' ? `${formatMoney(v)} ${tx('ر.س', 'SAR')}` : metric === 'conversion' ? `${v}%` : String(v));
  const vals = [...cur, ...(cmp ? prev : [])].map((d) => valueOf(d, metric) ?? 0);
  const max = Math.max(1, ...vals);
  const metricName: Record<MetricId, string> = { net: tx('صافي المبيعات', 'Net sales'), orders: tx('الطلبات', 'Orders'), conversion: tx('معدل التحويل', 'Conversion rate') };

  return (
    <>
      <PageHeader title={tx('التحليلات', 'Analytics')} sub={tx(`الفترة: آخر ${len} يومًا مكتملة حتى 23 نوفمبر 2026 · المقارنة: ${len} يومًا السابقة · التوقيت: الرياض (UTC+3) · القناة: كل القنوات · المصدر: بيانات تجريبية`, `Period: last ${len} complete days to 23 Nov 2026 · Comparison: the previous ${len} days · Time zone: Riyadh (UTC+3) · Channel: all · Source: demo data`)} />
      <div className="toolbar">
        <div className="views" role="group" aria-label={tx('الفترة', 'Period')}>
          <a className="chip" href={mhref('analytics', qs({ period: '7' }))} aria-current={len === 7 ? 'true' : undefined}>{tx('7 أيام', '7 days')}</a>
          <a className="chip" href={mhref('analytics', qs({ period: undefined }))} aria-current={len === 28 ? 'true' : undefined}>{tx('28 يومًا', '28 days')}</a>
        </div>
        <div className="views" role="group" aria-label={tx('المقارنة', 'Comparison')}>
          <a className="chip" href={mhref('analytics', qs({ cmp: undefined }))} aria-current={cmp ? 'true' : undefined}>{tx('قارن بالفترة السابقة', 'Compare with previous period')}</a>
          <a className="chip" href={mhref('analytics', qs({ cmp: 'off' }))} aria-current={!cmp ? 'true' : undefined}>{tx('بلا مقارنة', 'No comparison')}</a>
        </div>
      </div>
      <section className="metrics" aria-label={tx('المؤشرات', 'Metrics')}>
        <Metric label={tx('صافي المبيعات', 'Net sales')} value={<Money v={c.net} />} note={<>{tx('المبيعات بعد الخصومات والاستردادات، قبل الرسوم والتكلفة. ليست ربحًا.', 'Sales after discounts and refunds, before fees and costs. Not profit.')}{cmp && <> · <Delta v={change(c.net, p.net)} /></>}</>} />
        <Metric label={tx('الطلبات', 'Orders')} value={c.orders} note={<>{tx('طلبات مكتملة الدفع.', 'Orders with completed payment.')}{cmp && <> · <Delta v={change(c.orders, p.orders)} /></>}</>} />
        <Metric label={tx('متوسط قيمة الطلب', 'Average order value')} value={c.aov === null ? tx('لا بيانات', 'No data') : <Money v={c.aov} />} note={<>{tx('صافي المبيعات ÷ الطلبات.', 'Net sales ÷ orders.')}{cmp && <> · <Delta v={change(c.aov, p.aov)} /></>}</>} />
        <Metric label={tx('معدل التحويل', 'Conversion rate')} value={c.conversion === null ? tx('لا بيانات', 'No data') : <bdi dir="ltr">{c.conversion}%</bdi>}
          note={<>{tx(`الطلبات ÷ الجلسات، محسوب على ${c.sessionDays} من ${c.days} أيام فيها بيانات زيارات.`, `Orders ÷ sessions, computed on ${c.sessionDays} of ${c.days} days with visit data.`)}{c.sessionDays < c.days && <strong> {tx('بيانات جزئية.', 'Partial data.')}</strong>}{cmp && <> · <Delta v={change(c.conversion, p.conversion)} /></>}</>} />
      </section>

      <section className="card" aria-labelledby="ch-h">
        <div className="card-head">
          <h2 id="ch-h">{metricName[metric]} {tx('يوميًا', 'per day')}</h2>
          <div className="m-row-fields">
            <label className="sr" htmlFor="an-m">{tx('المؤشر', 'Metric')}</label>
            <select id="an-m" className="input" value={metric} onChange={(e) => mreplace('analytics', qs({ metric: e.target.value === 'net' ? undefined : e.target.value }))}>
              {(['net', 'orders', 'conversion'] as MetricId[]).map((m) => <option key={m} value={m}>{metricName[m]}</option>)}
            </select>
            <div className="views" role="group" aria-label={tx('طريقة العرض', 'Display')}>
              <a className="chip" href={mhref('analytics', qs({ view: undefined }))} aria-current={view === 'chart' ? 'true' : undefined}>{tx('رسم', 'Chart')}</a>
              <a className="chip" href={mhref('analytics', qs({ view: 'table' }))} aria-current={view === 'table' ? 'true' : undefined}>{tx('جدول', 'Table')}</a>
            </div>
          </div>
        </div>
        <div className="card-body">
          {view === 'chart' ? (
            <>
              <div className="m-legend small">
                <span><span className="m-key cur" /> {tx('الفترة الحالية', 'Current period')}</span>
                {cmp && <span><span className="m-key prev" /> {tx('الفترة السابقة (اليوم المقابل)', 'Previous period (matching day)')}</span>}
                <span><span className="m-key none" /> {tx('لا بيانات (ليس صفرًا)', 'No data (not zero)')}</span>
              </div>
              <ol className={`m-bars${len === 28 ? ' dense' : ''}`} aria-label={tx('الرسم معروض أيضًا كجدول عبر زر «جدول».', 'The chart is also available as a table via “Table”.')}>
                {cur.map((d, i) => {
                  const v = valueOf(d, metric);
                  const pv = cmp ? valueOf(prev[i], metric) : undefined;
                  return (
                    <li key={d.date} title={`${d.date}: ${fmt(v)}`}>
                      <div className="m-bar-pair">
                        {v === null ? <span className="m-bar none" style={{ blockSize: '100%' }}><span className="sr">{tx('لا بيانات', 'No data')}</span></span>
                          : <span className={`m-bar cur${v === 0 ? ' zero' : ''}`} style={{ blockSize: `${Math.max(v === 0 ? 0 : 2, (v / max) * 100)}%` }} />}
                        {cmp && (pv === null ? <span className="m-bar none" style={{ blockSize: '100%' }} /> : <span className="m-bar prev" style={{ blockSize: `${((pv ?? 0) / max) * 100}%` }} />)}
                      </div>
                      <span className="m-bar-label"><bdi dir="ltr">{d.date.slice(8)}</bdi></span>
                    </li>
                  );
                })}
              </ol>
              <p className="small muted">{tx('محور الأيام: يوم الشهر. ارتفاع العمود نسبي لأعلى قيمة في الرسم. 2 نوفمبر صفر فعلي (المتجر في وضع الصيانة)، والأعمدة المخططة أيام بلا بيانات.', 'Day axis: day of month. Bar height is relative to the largest value shown. 2 Nov is a true zero (store in maintenance); hatched bars are days without data.')}</p>
            </>
          ) : (
            <div className="table-wrap">
              <table>
                <caption className="sr">{metricName[metric]}</caption>
                <thead><tr><th scope="col">{tx('اليوم', 'Day')}</th><th scope="col" className="end">{tx('الفترة الحالية', 'Current')}</th>{cmp && <><th scope="col">{tx('اليوم المقابل', 'Matching day')}</th><th scope="col" className="end">{tx('السابقة', 'Previous')}</th></>}</tr></thead>
                <tbody>
                  {cur.map((d, i) => (
                    <tr key={d.date}><td><bdi dir="ltr">{d.date}</bdi></td><td className="end">{fmt(valueOf(d, metric))}</td>
                      {cmp && <><td><bdi dir="ltr">{prev[i].date}</bdi></td><td className="end">{fmt(valueOf(prev[i], metric))}</td></>}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
      <EvidenceCard questions={['orders', 'conversion']} />
    </>
  );
}
