// Shipping: zones, flat or weight rates, free-shipping threshold.
import { useState } from 'react';
import { MapPin, Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { settingsStore } from '../../merchant/stores';
import type { Zone } from '../../merchant/workspace';
import { Badge, Button, EmptyState, IconButton, InfoHint, Money, useTx } from '../../../ds/ui';
import { Drawer, Field, Input, Modal, Select, useToast } from '../../../ds/kit';
import { setDashState, useDashState } from '../review';
import { parseZone, shippingQuote, upsertZone, zoneDraft, type ZoneDraft } from './model';
import { Section } from './common';

const SAMPLE = { subtotal: 20000, kg: 2 };

export default function ShippingPage() {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const empty = useDashState() === 'empty';
  const stored = settingsStore.use().zones;
  const zones = empty ? [] : stored;
  const [edit, setEdit] = useState<{ d: ZoneDraft; prev: Zone | null } | null>(null);
  const [del, setDel] = useState<Zone | null>(null);
  const add = () => setEdit({ d: zoneDraft(null, lang, `z${Date.now()}`), prev: null });

  return (
    <>
      <Section id="zn-h" flush title={tx('مناطق الشحن', 'Shipping zones')}
        hint={<InfoHint>{tx('يختار العميل مدينته فيُطبَّق سعر أول منطقة تغطيها.', 'The shopper picks a city and the first zone that covers it sets the price.')}</InfoHint>}
        action={zones.length > 0 && <Button size="sm" onClick={add}><Plus className="size-4" aria-hidden="true" />{tx('أضف منطقة', 'Add zone')}</Button>}>
        {zones.length === 0 ? (
          <EmptyState icon={<Truck className="size-6" aria-hidden="true" />} title={tx('لا مناطق شحن بعد', 'No shipping zones yet')}
            action={<Button onClick={add}><Plus className="size-4" aria-hidden="true" />{tx('أضف أول منطقة', 'Add your first zone')}</Button>}>
            {tx('بدون منطقة لا يستطيع العملاء إتمام طلب يُشحن.', 'Without a zone shoppers can’t complete a shipped order.')}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {zones.map((z) => (
              <li key={z.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted" aria-hidden="true"><MapPin className="size-5" /></span>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-sm font-semibold text-fg">{z.name[lang]}</p>
                  <p className="truncate text-xs text-muted">{z.cities[lang]}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-fg">
                    {z.rateType === 'flat' ? <><span className="text-muted">{tx('ثابت', 'Flat')}</span><Money v={z.rate} /></>
                      : <><span className="text-muted">{tx('بالوزن', 'By weight')}</span><Money v={z.rate} /><span className="text-muted">+</span><Money v={z.perKg} /><span className="text-muted">{tx('لكل كجم إضافي', 'per extra kg')}</span></>}
                    {z.freeOver !== null && <Badge tone="green">{tx('مجاني فوق ', 'Free over ')}<Money v={z.freeOver} /></Badge>}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <IconButton label={tx(`تعديل ${z.name.ar}`, `Edit ${z.name.en}`)} onClick={() => setEdit({ d: zoneDraft(z, lang, z.id), prev: z })}><Pencil className="size-4" aria-hidden="true" /></IconButton>
                  <IconButton label={tx(`حذف ${z.name.ar}`, `Delete ${z.name.en}`)} onClick={() => setDel(z)}><Trash2 className="size-4" aria-hidden="true" /></IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {edit && <ZoneDrawer draft={edit.d} prev={edit.prev} onClose={() => setEdit(null)} onSave={(z) => {
        settingsStore.set((x) => ({ ...x, zones: upsertZone(x.zones, z) }));
        if (empty) setDashState('live');
        setEdit(null);
        toast({ tone: 'ok', text: tx(`حُفظت ${z.name.ar}`, `${z.name.en} saved`) });
      }} />}

      {del && (
        <Modal title={tx(`حذف ${del.name.ar}`, `Delete ${del.name.en}`)} onClose={() => setDel(null)}
          description={tx('لن يستطيع العملاء في هذه المدن إتمام طلبات تُشحن حتى تغطيها منطقة أخرى. الطلبات الحالية لا تتأثر.', 'Shoppers in these cities can’t complete shipped orders until another zone covers them. Existing orders are unaffected.')}
          footer={<><Button variant="secondary" onClick={() => setDel(null)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={() => {
            settingsStore.set((x) => ({ ...x, zones: x.zones.filter((z) => z.id !== del.id) })); setDel(null);
          }}>{tx('احذف المنطقة', 'Delete zone')}</Button></>} />
      )}
    </>
  );
}

function ZoneDrawer({ draft, prev, onClose, onSave }: { draft: ZoneDraft; prev: Zone | null; onClose: () => void; onSave: (z: Zone) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const [d, setD] = useState(draft);
  const [tried, setTried] = useState(false);
  const r = parseZone(d, prev, lang);
  const e = tried && !r.ok ? r.errors : {};
  const set = (p: Partial<ZoneDraft>) => setD({ ...d, ...p });
  return (
    <Drawer title={prev ? tx('تعديل المنطقة', 'Edit zone') : tx('منطقة جديدة', 'New zone')} onClose={onClose}
      footer={<><Button className="flex-1" onClick={() => { setTried(true); if (r.ok) onSave(r.zone); }}>{tx('احفظ المنطقة', 'Save zone')}</Button><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button></>}>
      <Field label={tx('اسم المنطقة', 'Zone name')} error={e.name ? tx('مطلوب', 'Required') : null}>{(p) => <Input {...p} value={d.name} onChange={(ev) => set({ name: ev.target.value })} />}</Field>
      <Field label={tx('المدن', 'Cities')} hint={tx('افصل بفاصلة', 'Separate with commas')} error={e.cities ? tx('أضف مدينة واحدة على الأقل', 'Add at least one city') : null}>{(p) => <Input {...p} value={d.cities} onChange={(ev) => set({ cities: ev.target.value })} />}</Field>
      <Field label={tx('طريقة التسعير', 'Pricing')}>{(p) => <Select {...p} value={d.rateType} onChange={(ev) => set({ rateType: ev.target.value as Zone['rateType'] })}><option value="flat">{tx('سعر ثابت', 'Flat rate')}</option><option value="weight">{tx('حسب الوزن', 'By weight')}</option></Select>}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={d.rateType === 'flat' ? tx('السعر (ر.س)', 'Rate (SAR)') : tx('أول كجم (ر.س)', 'First kg (SAR)')} error={e.rate ? tx('مبلغ غير صالح', 'Invalid amount') : null}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.rate} onChange={(ev) => set({ rate: ev.target.value })} />}</Field>
        {d.rateType === 'weight' && <Field label={tx('لكل كجم إضافي', 'Per extra kg')} error={e.perKg ? tx('مبلغ أكبر من صفر', 'Above zero') : null}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.perKg} onChange={(ev) => set({ perKg: ev.target.value })} />}</Field>}
      </div>
      <Field label={tx('شحن مجاني فوق (ر.س)', 'Free shipping over (SAR)')} optional error={e.free ? tx('مبلغ غير صالح', 'Invalid amount') : null}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.free} onChange={(ev) => set({ free: ev.target.value })} />}</Field>
      {r.ok && (
        <div className="rounded-xl bg-surface-2 p-3 text-[13px]">
          <p className="text-muted">{tx('مثال: طلب بـ 200 ر.س ووزن 2 كجم', 'Example: a SAR 200 order weighing 2 kg')}</p>
          <p className="mt-1 font-semibold text-fg">{tx('الشحن: ', 'Shipping: ')}{shippingQuote(r.zone, SAMPLE.subtotal, SAMPLE.kg) === 0 ? tx('مجاني', 'Free') : <Money v={shippingQuote(r.zone, SAMPLE.subtotal, SAMPLE.kg)} />}</p>
        </div>
      )}
    </Drawer>
  );
}
