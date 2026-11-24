import { useCallback, useState, type ReactNode } from 'react';
import { formatInt } from '../../../core/format';
import { Dialog, LinkTabs, Money, PageHeader, Sim } from '../../../core/ui';
import { can, csvMoney, DATA_AS_OF, gmv, PLAN_NAME, REGION_REVENUE, SUBS_MONTHS, toCsv } from '../domain';
import { STORE_STATUS } from '../i18n';
import { AsOf, DataList, flash, Icon, Locked, withQuery, type Ctx } from '../kit';
import { logExport, storesStore } from '../state';

type ReportId = 'merchants' | 'revenue' | 'subs' | 'sales';
interface Built { title: string; headers: string[]; csv: (string | number)[][]; view: { key: string; cells: ReactNode[] }[]; ends: boolean[] }

export default function Reports({ t, lang, role, route }: Ctx) {
  const stores = storesStore.use();
  const q = route.query.get('report') as ReportId | null;
  const id: ReportId = q && ['merchants', 'revenue', 'subs', 'sales'].includes(q) ? q : 'merchants';
  const [confirming, setConfirming] = useState(false);
  const close = useCallback(() => setConfirming(false), []);
  const titles: Record<ReportId, string> = { merchants: t.repMerchants, revenue: t.repRevenue, subs: t.repSubs, sales: t.repSales };

  const build = (): Built => {
    if (id === 'merchants') {
      return {
        title: titles.merchants, ends: [false, false, false, false, true, true, true],
        headers: ['ID', t.store, t.plan, t.status, t.orders30, `${t.gmv30} (SAR)`, t.tickets],
        csv: stores.map((s) => [s.id, s.name[lang], PLAN_NAME[s.plan], STORE_STATUS[s.status][lang], s.orders30, csvMoney(s.gmv30), s.tickets]),
        view: stores.map((s) => ({ key: s.id, cells: [s.id, s.name[lang], PLAN_NAME[s.plan], STORE_STATUS[s.status][lang], formatInt(s.orders30), <Money key="m" v={s.gmv30} />, s.tickets] })),
      };
    }
    if (id === 'revenue') {
      return {
        title: titles.revenue, ends: [false, true, true, true, true],
        headers: [t.region, `${t.subs} (SAR)`, `${t.addons} (SAR)`, `${t.oneTime} (SAR)`, `${t.total} (SAR)`],
        csv: REGION_REVENUE.map((r) => [r.region[lang], csvMoney(r.subscriptions), csvMoney(r.addons), csvMoney(r.oneTime), csvMoney(r.subscriptions + r.addons + r.oneTime)]),
        view: REGION_REVENUE.map((r) => ({ key: r.region.en, cells: [r.region[lang], <Money key="a" v={r.subscriptions} />, <Money key="b" v={r.addons} />, <Money key="c" v={r.oneTime} />, <Money key="d" v={r.subscriptions + r.addons + r.oneTime} />] })),
      };
    }
    if (id === 'subs') {
      return {
        title: titles.subs, ends: [false, true, true, true, true],
        headers: [t.month, t.signups, t.cancellations, t.upgrades, t.downgrades],
        csv: SUBS_MONTHS.map((m) => [m.month, m.signups, m.cancellations, m.upgrades, m.downgrades]),
        view: SUBS_MONTHS.map((m) => ({ key: m.month, cells: [<bdi key="m" dir="ltr">{m.month}</bdi>, m.signups, m.cancellations, m.upgrades, m.downgrades] })),
      };
    }
    const total = gmv(stores);
    const cats = [...new Set(stores.map((s) => s.category.en))].map((en) => {
      const list = stores.filter((s) => s.category.en === en);
      return { label: list[0].category[lang], n: list.length, gmv: list.reduce((a, s) => a + s.gmv30, 0) };
    }).sort((a, b) => b.gmv - a.gmv);
    const share = (v: number) => (total ? `${((v * 1000) / total / 10).toFixed(1)}%` : '0.0%');
    return {
      title: titles.sales, ends: [false, true, true, true],
      headers: [t.category, t.storesCount, `${t.gmv30} (SAR)`, t.share],
      csv: cats.map((c) => [c.label, c.n, csvMoney(c.gmv), share(c.gmv)]),
      view: cats.map((c) => ({ key: c.label, cells: [c.label, c.n, <Money key="g" v={c.gmv} />, <bdi key="s">{share(c.gmv)}</bdi>] })),
    };
  };
  const r = build();

  const download = () => {
    const blob = new Blob(['﻿' + toCsv(r.headers, r.csv)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `lak-${id}-${DATA_AS_OF.slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    logExport(id, { ar: titles[id], en: titles[id] }, r.csv.length);
    flash(t.exportDone);
    setConfirming(false);
  };

  return (
    <>
      <PageHeader title={t.repTitle} sub={t.repSub} actions={<AsOf t={t} lang={lang} at={DATA_AS_OF} />} />
      <LinkTabs label={t.repTitle} items={(['merchants', 'revenue', 'subs', 'sales'] as ReportId[]).map((k) => ({
        href: withQuery('/reports', route, { report: k === 'merchants' ? undefined : k }), label: titles[k], current: k === id,
      }))} />
      <section className="card">
        <div className="card-head">
          <h2>{r.title}</h2>
          {can(role, 'reports.export')
            ? <button type="button" className="btn" onClick={() => setConfirming(true)}><Icon name="download" size={18} />&nbsp;{t.exportCsv}</button>
            : <Locked>{t.noExport}</Locked>}
        </div>
        <div className="card-body adm-tight"><p className="muted small">{id === 'subs' ? t.periodMonths : `${t.period} ${DATA_AS_OF.slice(0, 10)}`}</p></div>
        <DataList label={r.title} rows={r.view} rowKey={(v) => v.key}
          cols={r.headers.map((h, i) => ({ key: String(i), head: h, primary: i === (id === 'merchants' ? 1 : 0), end: r.ends[i], cell: (v: Built['view'][number]) => v.cells[i] }))} />
      </section>
      {confirming && (
        <Dialog title={t.exportTitle} onClose={close} footer={<>
          <button type="button" className="btn" onClick={close}>{t.cancel}</button>
          <button type="button" className="btn primary" onClick={download}>{t.exportCsv}</button>
        </>}>
          <p>{t.exportScope(r.csv.length, r.title)}</p>
          <p className="small"><Sim /> {t.simData}</p>
        </Dialog>
      )}
    </>
  );
}
