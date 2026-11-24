// Locations (`#/dashboard/inventory/locations`): warehouses and branches as data. Add, edit, disable with a reason
// (blocked while the location holds stock, reservations, incoming units or open transfers) and enable again.
// Rules live in merchant/inventory.ts (validateLocation, disableBlocks, newLocationId) and ./model (locationRows).
import { useMemo, useState } from 'react';
import { MapPin, Plus, Warehouse, Store, Pencil, Power, ArrowLeftRight, Truck, PackageCheck } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { allLocations, type LocDisableReason, type LocKind, type Location } from '../../merchant/domain';
import { disableBlocks, newLocationId, validateLocation, type DisableBlock } from '../../merchant/inventory';
import { can } from '../../merchant/perms';
import { levelsStore, locationsStore, logAction, transfersStore } from '../../merchant/stores';
import { Badge, Button, Card, EmptyState, ErrorState, InfoHint, LinkButton, Skeleton, cn, useTx } from '../../../ds/ui';
import { Alert, Field, Input, Modal, PageHeader, Select, Switch, Textarea, useToast } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { useUnsaved } from '../unsaved';
import { ReviewTools, ihref, roleBadge, useRole } from '../products/common';
import { locationRows } from './model';

interface Draft { id: string | null; nameAr: string; nameEn: string; kind: LocKind; cityAr: string; cityEn: string; address: string; ships: boolean; pickup: boolean }
const emptyDraft = (): Draft => ({ id: null, nameAr: '', nameEn: '', kind: 'branch', cityAr: '', cityEn: '', address: '', ships: true, pickup: true });
const toDraft = (l: Location): Draft => ({ id: l.id, nameAr: l.name.ar, nameEn: l.name.en, kind: l.kind, cityAr: l.city.ar, cityEn: l.city.en, address: l.address, ships: l.ships, pickup: l.pickup });
/** Unsaved location form kept for this session (leaving and coming back restores it). */
let kept: Draft | null = null;

export default function Locations() {
  const tx = useTx();
  const { lang } = useLang();
  const state = useDashState();
  const role = useRole();
  const canManage = can(role, 'inventory.transfer');
  const list = locationsStore.use();
  const levels = levelsStore.use();
  const transfers = transfersStore.use();
  const rows = useMemo(() => locationRows(levels, transfers), [levels, transfers, list]); // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState<Draft | null>(kept);
  const [off, setOff] = useState<Location | null>(null);
  const toast = useToast();
  const back = { href: ihref(), label: tx('المخزون', 'Inventory') };
  const active = list.filter((l) => l.active).length;

  const header = (
    <PageHeader back={back} title={tx('المستودعات والفروع', 'Warehouses & branches')}
      description={state === 'live' ? tx(`${active} نشطة من ${list.length}`, `${active} active of ${list.length}`) : undefined}
      meta={!canManage ? roleBadge(tx) : undefined}
      actions={canManage && <Button onClick={() => setForm(emptyDraft())}><Plus className="size-4" aria-hidden="true" />{tx('أضف موقعًا', 'Add location')}</Button>} />
  );
  if (state === 'loading') return <div className="space-y-6" aria-busy="true">{header}<div className="grid gap-4 md:grid-cols-2" role="status" aria-label="Loading">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div></div>;
  if (state === 'error') return <div className="space-y-6">{header}<Card><ErrorState as="h2" title={tx('تعذّر تحميل المواقع', 'Locations could not load')} onRetry={() => setDashState('live')}>{tx('لم يتغير شيء. المرجع SIM-LOC-503.', 'Nothing changed. Ref SIM-LOC-503.')}</ErrorState></Card></div>;
  const shown = state === 'empty' ? [] : list;

  const enable = (l: Location) => {
    locationsStore.set((ls) => ls.map((x) => (x.id === l.id ? { ...x, active: true, disabled: undefined, version: x.version + 1 } : x)));
    logAction('inventory', { ar: `فعّل الموقع ${l.name.ar}`, en: `Enabled location ${l.name.en}` }, { target: l.id, before: 'disabled', after: 'active' });
    toast({ tone: 'ok', text: tx(`فُعّل ${l.name.ar}`, `${l.name.en} enabled`) });
  };

  return (
    <div className="space-y-6">
      {header}
      {shown.length === 0 ? (
        <Card><EmptyState as="h2" icon={<Warehouse className="size-6" aria-hidden="true" />} title={tx('أضف أول مستودع', 'Add your first warehouse')}
          action={canManage ? <Button onClick={() => setForm(emptyDraft())}><Plus className="size-4" aria-hidden="true" />{tx('أضف موقعًا', 'Add location')}</Button> : undefined}>
          {tx('المكان الذي تخزّن فيه منتجاتك وتشحن منه.', 'Where you keep your products and ship from.')}
        </EmptyState></Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {shown.map((l) => {
            const r = rows.get(l.id);
            const I = l.kind === 'branch' ? Store : Warehouse;
            return (
              <li key={l.id}>
                <Card className={cn('h-full', !l.active && 'opacity-80')}>
                  <div className="flex items-start gap-3 p-5 pb-3">
                    <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', l.active ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'bg-surface-2 text-subtle')}><I className="size-5" aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1">
                      <h2 className="flex flex-wrap items-center gap-2 text-base font-bold text-fg">{l.name[lang]}
                        {l.isDefault && <Badge tone="brand">{tx('الافتراضي', 'Default')}</Badge>}
                        <Badge tone={l.active ? 'green' : 'gray'}>{l.active ? tx('نشط', 'Active') : tx('معطّل', 'Disabled')}</Badge>
                      </h2>
                      <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted"><MapPin className="size-3.5" aria-hidden="true" />{l.city[lang]}{l.address && <> · <bdi>{l.address}</bdi></>}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 px-5">
                    <Badge tone={l.ships ? 'sky' : 'gray'} icon={<Truck className="size-3" aria-hidden="true" />}>{l.ships ? tx('يشحن', 'Ships') : tx('لا يشحن', 'No shipping')}</Badge>
                    <Badge tone={l.pickup ? 'sky' : 'gray'} icon={<PackageCheck className="size-3" aria-hidden="true" />}>{l.pickup ? tx('استلام من الفرع', 'Pickup') : tx('بلا استلام', 'No pickup')}</Badge>
                    <Badge tone="gray">{l.kind === 'branch' ? tx('فرع', 'Branch') : tx('مستودع', 'Warehouse')}</Badge>
                  </div>
                  {l.disabled && <p className="mx-5 mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">{tx('سبب التعطيل: ', 'Disabled: ')}{reasonText(tx, l.disabled.reason)}{l.disabled.note && ` · ${l.disabled.note}`}</p>}
                  {r && (
                    <dl className="m-5 mb-4 grid grid-cols-4 gap-2 rounded-xl bg-surface-2 p-3 text-center text-xs">
                      {([[tx('أصناف', 'SKUs'), r.skus], [tx('موجود', 'On hand'), r.onHand], [tx('وارد', 'Incoming'), r.incoming], [tx('منخفض', 'Low'), r.low]] as const).map(([k, v]) => (
                        <div key={k}><dt className="text-muted">{k}</dt><dd className="mt-0.5 text-base font-bold tabular-nums text-fg">{v}</dd></div>
                      ))}
                    </dl>
                  )}
                  <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
                    <LinkButton variant="ghost" size="sm" href={ihref('', { loc: l.id })}>{tx('المخزون هنا', 'Stock here')}</LinkButton>
                    {l.active && canManage && <LinkButton variant="ghost" size="sm" href={ihref('transfers/new', { to: l.id })}><ArrowLeftRight className="size-3.5" aria-hidden="true" />{tx('حوّل إليه', 'Transfer in')}</LinkButton>}
                    <span className="flex-1" />
                    {canManage && <Button variant="secondary" size="sm" onClick={() => setForm(toDraft(l))} aria-label={tx(`عدّل ${l.name.ar}`, `Edit ${l.name.en}`)}><Pencil className="size-3.5" aria-hidden="true" />{tx('عدّل', 'Edit')}</Button>}
                    {canManage && (l.active
                      ? <Button variant="secondary" size="sm" onClick={() => setOff(l)}><Power className="size-3.5" aria-hidden="true" />{tx('عطّل', 'Disable')}</Button>
                      : <Button size="sm" onClick={() => enable(l)}><Power className="size-3.5" aria-hidden="true" />{tx('فعّل', 'Enable')}</Button>)}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <ReviewTools />
      {form && <LocationForm initial={form} onClose={() => { kept = null; setForm(null); }} onKeep={(d) => { kept = d; }} />}
      {off && <DisableModal loc={off} onClose={() => setOff(null)} />}
    </div>
  );
}

const reasonText = (tx: (a: string, e: string) => string, r: LocDisableReason) =>
  ({ closed: tx('أُغلق', 'Closed'), moved: tx('انتقل إلى موقع آخر', 'Moved to another site'), seasonal: tx('موسمي', 'Seasonal'), other: tx('أخرى', 'Other') })[r];

function LocationForm({ initial, onClose, onKeep }: { initial: Draft; onClose: () => void; onKeep: (d: Draft) => void }) {
  const tx = useTx();
  const toast = useToast();
  const [d, setD] = useState<Draft>(initial);
  const [tried, setTried] = useState(false);
  const list = locationsStore.get();
  const base = initial.id ? toDraft(list.find((l) => l.id === initial.id)!) : emptyDraft();
  const dirty = JSON.stringify(d) !== JSON.stringify(base);
  useUnsaved(dirty, { ar: 'نموذج الموقع', en: 'Location form' });
  const set = (p: Partial<Draft>) => { const n = { ...d, ...p }; setD(n); onKeep(n); };
  const probe = { id: d.id ?? '', name: { ar: d.nameAr, en: d.nameEn }, city: { ar: d.cityAr, en: d.cityEn } };
  const errs = validateLocation(probe, list);
  const msg = (k: keyof typeof errs) => (tried && errs[k] ? (errs[k] === 'taken' ? tx('مستخدم لموقع آخر', 'Used by another location') : tx('مطلوب', 'Required')) : undefined);
  const newId = d.id ?? newLocationId({ ar: d.cityAr || d.nameAr, en: d.cityEn || d.nameEn }, list);
  const save = () => {
    setTried(true);
    if (Object.keys(errs).length) return;
    const fields = { name: { ar: d.nameAr.trim(), en: d.nameEn.trim() }, kind: d.kind, city: { ar: d.cityAr.trim(), en: d.cityEn.trim() }, address: d.address.trim(), ships: d.ships, pickup: d.pickup };
    if (d.id) locationsStore.set((ls) => ls.map((l) => (l.id === d.id ? { ...l, ...fields, version: l.version + 1 } : l)));
    else locationsStore.set((ls) => [...ls, { id: newId, ...fields, active: true, version: 1 }]);
    logAction('inventory', d.id ? { ar: `عدّل الموقع ${fields.name.ar}`, en: `Edited location ${fields.name.en}` } : { ar: `أضاف الموقع ${fields.name.ar}`, en: `Added location ${fields.name.en}` }, { target: newId });
    toast({ tone: 'ok', text: d.id ? tx('حُفظ الموقع', 'Location saved') : tx(`أُضيف ${fields.name.ar}. يظهر الآن في المخزون والتحويل والتجهيز.`, `${fields.name.en} added. It now shows in inventory, transfers and fulfilment.`) });
    onClose();
  };
  return (
    <Modal size="lg" title={d.id ? tx('عدّل الموقع', 'Edit location') : tx('موقع جديد', 'New location')} onClose={onClose}
      description={!d.id ? <span className="inline-flex items-center gap-1">{tx('يبدأ بلا مخزون.', 'Starts with no stock.')}<InfoHint>{tx('أدخل الكميات بتحويل من مستودع آخر أو بتعديل «استلام من مورد».', 'Add stock with a transfer from another location, or an adjustment “Received from supplier”.')}</InfoHint></span> : undefined}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={save}>{d.id ? tx('احفظ', 'Save') : tx('أضف الموقع', 'Add location')}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={tx('الاسم بالعربية', 'Name in Arabic')} error={msg('nameAr')}>{(p) => <Input {...p} dir="rtl" lang="ar" placeholder="فرع الدمام" value={d.nameAr} onChange={(e) => set({ nameAr: e.target.value })} />}</Field>
        <Field label={tx('الاسم بالإنجليزية', 'Name in English')} error={msg('nameEn')}>{(p) => <Input {...p} dir="ltr" lang="en" placeholder="Dammam branch" value={d.nameEn} onChange={(e) => set({ nameEn: e.target.value })} />}</Field>
        <Field label={tx('المدينة بالعربية', 'City in Arabic')} error={msg('cityAr')}>{(p) => <Input {...p} dir="rtl" lang="ar" value={d.cityAr} onChange={(e) => set({ cityAr: e.target.value })} />}</Field>
        <Field label={tx('المدينة بالإنجليزية', 'City in English')} error={msg('cityEn')}>{(p) => <Input {...p} dir="ltr" lang="en" value={d.cityEn} onChange={(e) => set({ cityEn: e.target.value })} />}</Field>
        <Field className="sm:col-span-2" label={tx('العنوان', 'Address')} optional>{(p) => <Textarea {...p} className="min-h-16" value={d.address} onChange={(e) => set({ address: e.target.value })} />}</Field>
        <Field label={tx('النوع', 'Type')}>{(p) => <Select {...p} value={d.kind} onChange={(e) => set({ kind: e.target.value as LocKind })}><option value="warehouse">{tx('مستودع', 'Warehouse')}</option><option value="branch">{tx('فرع', 'Branch')}</option></Select>}</Field>
        <div className="space-y-3 rounded-xl border border-border p-3">
          <label className="flex items-center justify-between gap-3 text-sm font-medium text-fg">{tx('يشحن الطلبات', 'Ships orders')}<Switch checked={d.ships} onChange={(v) => set({ ships: v })} label={tx('يشحن الطلبات', 'Ships orders')} /></label>
          <label className="flex items-center justify-between gap-3 text-sm font-medium text-fg">{tx('استلام العميل من هنا', 'Customer pickup')}<Switch checked={d.pickup} onChange={(v) => set({ pickup: v })} label={tx('استلام العميل من هنا', 'Customer pickup')} /></label>
        </div>
      </div>
      {!d.id && <p className="text-xs text-muted">{tx('المعرّف', 'ID')} <bdi dir="ltr" className="font-semibold text-fg">{newId}</bdi> · {tx('لا يتغير بعد الإنشاء', 'cannot change later')}</p>}
    </Modal>
  );
}

function DisableModal({ loc, onClose }: { loc: Location; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const levels = levelsStore.use();
  const transfers = transfersStore.use();
  const blocks = disableBlocks(loc, allLocations(), levels, transfers);
  const [reason, setReason] = useState<LocDisableReason | ''>('');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const blockText = (b: DisableBlock) => ({
    default: tx('هذا هو موقع التجهيز الافتراضي.', 'This is the default fulfilment location.'),
    stock: tx('فيه مخزون. حوّله إلى موقع آخر أولًا.', 'It holds stock. Transfer it to another location first.'),
    reserved: tx('فيه وحدات محجوزة لطلبات مدفوعة.', 'It has units reserved for paid orders.'),
    incoming: tx('فيه وحدات واردة لم تُستلم.', 'It has incoming units not yet received.'),
    transfers: tx('له تحويلات مفتوحة. أكملها أو أغلقها.', 'It has open transfers. Finish or close them.'),
    lastShipping: tx('آخر موقع يشحن الطلبات.', 'It is the last location that ships orders.'),
  })[b];
  const go = () => {
    setTried(true);
    if (blocks.length || !reason) return;
    locationsStore.set((ls) => ls.map((x) => (x.id === loc.id ? { ...x, active: false, disabled: { reason, note: note.trim(), by: 'You' }, version: x.version + 1 } : x)));
    logAction('inventory', { ar: `عطّل الموقع ${loc.name.ar}`, en: `Disabled location ${loc.name.en}` }, { target: loc.id, before: 'active', after: `disabled: ${reason}${note.trim() ? ` · ${note.trim()}` : ''}` });
    toast({ tone: 'ok', text: tx(`عُطّل ${loc.name.ar}. لا يظهر في التجهيز والتحويل.`, `${loc.name.en} disabled. It no longer shows in fulfilment or transfers.`) });
    onClose();
  };
  return (
    <Modal title={tx(`تعطيل ${loc.name.ar}`, `Disable ${loc.name.en}`)} onClose={onClose}
      description={tx('يختفي من التجهيز والتحويل والمستويات. السجل والطلبات القديمة تبقى باسمه.', 'It leaves fulfilment, transfers and levels. Its history and past orders keep its name.')}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={go} disabled={blocks.length > 0}>{tx('عطّل الموقع', 'Disable location')}</Button></>}>
      {blocks.length > 0 ? (
        <Alert tone="bad" title={tx('لا يمكن تعطيله الآن', 'It can’t be disabled yet')}
          action={blocks.includes('stock') ? <LinkButton size="sm" variant="secondary" href={ihref('', { loc: loc.id })}>{tx('افتح مخزونه', 'Open its stock')}</LinkButton> : undefined}>
          <ul className="mt-1 list-disc space-y-0.5 ps-4">{blocks.map((b) => <li key={b}>{blockText(b)}</li>)}</ul>
        </Alert>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <Field label={tx('السبب', 'Reason')} error={tried && !reason ? tx('اختر سببًا', 'Choose a reason') : undefined}>{(p) => (
            <Select {...p} value={reason} onChange={(e) => setReason(e.target.value as LocDisableReason)}>
              <option value="">{tx('اختر…', 'Choose…')}</option>
              {(['closed', 'moved', 'seasonal', 'other'] as const).map((r) => <option key={r} value={r}>{reasonText(tx, r)}</option>)}
            </Select>
          )}</Field>
          <Field label={tx('ملاحظة', 'Note')} optional>{(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        </div>
      )}
      <p className="text-xs text-muted">{loc.name[lang]} · <bdi dir="ltr">{loc.id}</bdi></p>
    </Modal>
  );
}
