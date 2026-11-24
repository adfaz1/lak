// Shipping & quality (`#/admin/shipping`, `?tab=failed`): carrier coverage/SLA/complaints and failed deliveries
// moved only along allowed states. Carrier names are fixtures, not signed integrations.
import { useState } from 'react';
import { PackageX, RotateCcw, Truck, Undo2 } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { DataTable, FilterChip, PageHeader, Tabs, useToast, type Column } from '../../../ds/kit';
import { Badge, Button, Card, EmptyState, InfoHint, Ref, useTx, type Tone } from '../../../ds/ui';
import { can, DELIVERY_NEXT, type Carrier, type DeliveryState, type FailedDelivery } from '../domain';
import { CARRIER_STATUS, DELIVERY_ACTION, DELIVERY_STATE } from '../i18n';
import { carriersStore, deliveriesStore, moveDelivery, storesStore } from '../state';
import { ahref, AsOf, Bars, ImpactList, Locked, NoResults, pct, ReasonModal, StateGate, useFmt, useQueryNav, useViewState } from '../ui';
import type { ScreenProps } from '../index';

const CARRIER_TONE: Record<Carrier['status'], Tone> = { operational: 'green', degraded: 'amber', down: 'red' };
const DELIVERY_TONE: Record<DeliveryState, Tone> = { failed: 'red', reattempt: 'sky', returning: 'amber', resolved: 'green' };

export default function Shipping(p: ScreenProps) {
  const tx = useTx();
  const state = useViewState();
  const tab = p.route.query.get('tab') === 'failed' ? 'failed' : 'carriers';
  const failed = deliveriesStore.use().filter((d) => d.state === 'failed').length;
  const header = (
    <>
      <PageHeader title={tx('الشحن والجودة', 'Shipping & quality')} description={tx('أسماء الناقلين أمثلة اختبار وليست تكاملات موقّعة', 'Carrier names are test fixtures, not signed integrations')} meta={<AsOf />} />
      <Tabs label={tx('أقسام الشحن', 'Shipping sections')} items={[
        { href: ahref('shipping'), label: tx('الناقلون', 'Carriers'), current: tab === 'carriers' },
        { href: ahref('shipping', { tab: 'failed' }), label: tx('شحنات متعثرة', 'Failed deliveries'), current: tab === 'failed', count: failed },
      ]} />
    </>
  );
  if (state === 'loading' || state === 'error') return <StateGate state={state} header={header} what={{ ar: 'الشحن', en: 'Shipping' }} refCode="SIM-ADM-SHP-503" />;
  return <div className="space-y-6">{header}{tab === 'carriers' ? <Carriers /> : <Failed {...p} />}</div>;
}

function Carriers() {
  const tx = useTx();
  const { lang } = useLang();
  const f = useFmt();
  const state = useViewState();
  const stored = carriersStore.use();
  const rows = state === 'empty' ? [] : stored;
  if (rows.length === 0) return <Card><EmptyState as="h2" icon={<Truck className="size-6" />} title={tx('لا ناقلين مربوطين', 'No carriers connected')}>{tx('يظهر الناقل هنا بعد توقيع العقد وربطه.', 'A carrier appears after its contract is signed and connected.')}</EmptyState></Card>;
  const cols: Column<Carrier>[] = [
    { key: 'name', header: tx('الناقل', 'Carrier'), cell: (c) => <span>{c.name[lang]}<span className="block text-xs font-normal text-muted">{tx('حتى', 'as of')} {f.dt(c.asOf)}</span></span> },
    { key: 'status', header: tx('الحالة', 'Status'), cell: (c) => <Badge tone={CARRIER_TONE[c.status]}>{CARRIER_STATUS[c.status][lang]}</Badge> },
    { key: 'cov', header: tx('المدن', 'Cities'), align: 'end', cell: (c) => <span className="tabular-nums">{c.cities}</span> },
    { key: 'sla', header: tx('مدة الخدمة (أيام)', 'SLA (days)'), align: 'end', cell: (c) => <span className="tabular-nums">{c.slaDays}</span>, hideBelow: 'md' },
    { key: 'ontime', header: <span className="inline-flex items-center gap-1">{tx('في الموعد', 'On time')}<InfoHint>{tx('نسبة الشحنات المسلّمة ضمن مدة الخدمة، 30 يومًا.', 'Share delivered within SLA, 30 days.')}</InfoHint></span>, align: 'end', cell: (c) => c.status === 'down' ? <span className="text-xs text-muted">{tx('لا بيانات حالية', 'No current data')}</span> : <bdi className="tabular-nums">{pct(c.onTime)}</bdi> },
    { key: 'comp', header: tx('شكاوى مفتوحة', 'Open complaints'), align: 'end', cell: (c) => <span className="tabular-nums">{c.complaints}</span> },
  ];
  const max = Math.max(1, ...rows.map((c) => c.complaints));
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <DataTable label={tx('الناقلون', 'Carriers')} rows={rows} columns={cols} rowKey={(c) => c.id}
          card={(c) => <div><div className="flex items-baseline justify-between gap-2"><p className="text-sm font-semibold text-fg">{c.name[lang]}</p><Badge tone={CARRIER_TONE[c.status]}>{CARRIER_STATUS[c.status][lang]}</Badge></div><p className="text-xs text-muted">{tx(`${c.cities} مدينة · ${c.slaDays} أيام · ${c.complaints} شكوى`, `${c.cities} cities · ${c.slaDays}-day SLA · ${c.complaints} complaints`)}{c.status !== 'down' && ` · ${pct(c.onTime)}`}</p></div>} />
      </Card>
      <Card className="p-5">
        <p className="mb-1 flex items-center gap-1 text-[15px] font-semibold text-fg">{tx('الشكاوى حسب الناقل', 'Complaints by carrier')}<InfoHint>{tx('عدد فقط. معالجة الشكاوى لم تُبنَ بعد.', 'Counts only. Complaint handling is not built yet.')}</InfoHint></p>
        <p className="mb-4 text-xs text-muted">{tx('مفتوحة الآن', 'Open now')}</p>
        <Bars rows={[...rows].sort((a, b) => b.complaints - a.complaints).map((c) => ({ key: c.id, label: c.name[lang], value: c.complaints, pct: (c.complaints * 100) / max }))} />
      </Card>
    </div>
  );
}

function Failed({ role, route }: ScreenProps) {
  const tx = useTx();
  const { lang } = useLang();
  const f = useFmt();
  const toast = useToast();
  const state = useViewState();
  const stored = deliveriesStore.use();
  const all = state === 'empty' ? [] : stored;
  const stores = storesStore.use();
  const carriers = carriersStore.use();
  const go = useQueryNav('shipping', route);
  const st = (route.query.get('state') ?? '') as DeliveryState | '';
  const rows = all.filter((d) => !st || d.state === st);
  const [dlg, setDlg] = useState<{ d: FailedDelivery; to: DeliveryState } | null>(null);
  const mayAct = can(role, 'shipping.act');
  const name = (id: string) => stores.find((s) => s.id === id)?.name[lang] ?? id;
  if (all.length === 0) return <Card><EmptyState as="h2" icon={<PackageX className="size-6" />} title={tx('لا شحنات متعثرة', 'No failed deliveries')}>{tx('كل الشحنات تسير حسب المدة.', 'Every shipment is within its window.')}</EmptyState></Card>;
  const actions = (d: FailedDelivery) => mayAct && DELIVERY_NEXT[d.state].length
    ? <span className="flex flex-wrap gap-1.5">{DELIVERY_NEXT[d.state].map((to) => <Button key={to} size="sm" variant="secondary" onClick={() => setDlg({ d, to })}>{to === 'reattempt' ? <RotateCcw className="size-3.5" aria-hidden="true" /> : to === 'returning' ? <Undo2 className="size-3.5" aria-hidden="true" /> : null}{DELIVERY_ACTION[to][lang]}</Button>)}</span> : null;
  const cols: Column<FailedDelivery>[] = [
    { key: 'id', header: tx('الشحنة', 'Shipment'), cell: (d) => <span><Ref>{d.id}</Ref><a className="block max-w-48 truncate text-xs text-muted hover:underline" href={ahref(`stores/${d.storeId}`)}>{name(d.storeId)}</a></span> },
    { key: 'carrier', header: tx('الناقل', 'Carrier'), cell: (d) => carriers.find((c) => c.id === d.carrierId)?.name[lang], hideBelow: 'lg' },
    { key: 'reason', header: tx('السبب', 'Reason'), cell: (d) => <span className="block max-w-56 text-muted">{d.reason[lang]} · {d.city[lang]}</span> },
    { key: 'att', header: tx('المحاولات', 'Attempts'), align: 'end', cell: (d) => <span className="tabular-nums">{d.attempts}</span>, hideBelow: 'md' },
    { key: 'state', header: tx('الحالة', 'State'), cell: (d) => <span className="flex flex-col items-start gap-1"><Badge tone={DELIVERY_TONE[d.state]}>{DELIVERY_STATE[d.state][lang]}</Badge><span className="text-xs text-muted">{tx('منذ', 'since')} {f.d(d.since)}</span></span> },
    { key: 'act', header: <span className="sr-only">{tx('إجراءات', 'Actions')}</span>, cell: actions },
  ];
  return (
    <>
      {!mayAct && <Locked>{tx('دورك يعرض الشحنات ولا يغيّر حالتها.', 'Your role can view shipments but not change them.')}</Locked>}
      <Card>
        <div className="p-4 sm:px-5"><FilterChip label={tx('الحالة', 'State')} value={st} options={(['failed', 'reattempt', 'returning', 'resolved'] as DeliveryState[]).map((s) => ({ value: s, label: DELIVERY_STATE[s][lang] }))} onChange={(v) => go({ state: v || undefined, tab: 'failed' })} /></div>
        {rows.length === 0 ? <NoResults onClear={() => go({ state: undefined, tab: 'failed' })} /> : (
          <div className="border-t border-border"><DataTable label={tx('شحنات متعثرة', 'Failed deliveries')} rows={rows} columns={cols} rowKey={(d) => d.id}
            card={(d) => <div><div className="flex items-baseline justify-between gap-2"><Ref>{d.id}</Ref><Badge tone={DELIVERY_TONE[d.state]}>{DELIVERY_STATE[d.state][lang]}</Badge></div><p className="text-xs text-muted">{name(d.storeId)} · {d.reason[lang]} · {d.city[lang]}</p><div className="mt-2">{actions(d)}</div></div>} /></div>
        )}
      </Card>
      {dlg && (
        <ReasonModal title={DELIVERY_ACTION[dlg.to][lang]} confirmLabel={DELIVERY_ACTION[dlg.to][lang]} optional={dlg.to !== 'returning'} danger={dlg.to === 'returning'} onClose={() => setDlg(null)}
          target={<><p className="font-semibold text-fg"><Ref>{dlg.d.id}</Ref> · {name(dlg.d.storeId)}</p><p className="text-xs text-muted">{DELIVERY_STATE[dlg.d.state][lang]} → {DELIVERY_STATE[dlg.to][lang]}</p></>}
          onConfirm={(note) => { const e = moveDelivery(dlg.d.id, dlg.to, note); if (!e) toast({ tone: 'ok', text: `${DELIVERY_ACTION[dlg.to][lang]}: ${dlg.d.id}` }); return e; }}>
          <ImpactList items={[dlg.to === 'returning'
            ? { icon: <Undo2 />, text: tx('تعود الشحنة للتاجر، وقرار الاسترداد للعميل يبقى عند التاجر.', 'The parcel goes back to the merchant; the refund decision stays with the merchant.'), tone: 'warn' }
            : { icon: <Truck />, text: tx('لا يُرسل طلب فعلي للناقل.', 'No request is sent to the carrier.') }]} />
        </ReasonModal>
      )}
    </>
  );
}

