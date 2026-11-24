// Zones & delivery promises, and operations settings (warehouse by zone, recipient phone check, COD rules).
import { useMemo, useState } from 'react';
import { MapPin, Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { settingsStore } from '../../merchant/stores';
import type { Zone, ShippingSetup } from '../../merchant/workspace';
import { Badge, Button, EmptyState, IconButton, InfoHint, Money, useTx } from '../../../ds/ui';
import { Alert, Drawer, Field, Input, Modal, SaveBar, Select, Simulated, Switch, useToast } from '../../../ds/kit';
import { setDashState, useDashState } from '../review';
import { sectionHref } from '../pages';
import { parseZone, shippingQuote, upsertZone, zoneDraft, type ZoneDraft } from './model';
import { useSessionDraft } from './drafts';
import { LeaveGuard, Section, useSave } from './common';
import { SA_CITIES, promiseDates, zoneForCity } from './shipping-model';
import { ChipPicker, commitShipping, useCategories, useShipping } from './shipping-ui';
import { logAction } from '../../merchant/stores';

const SAMPLE = { subtotal: 20000, kg: 2 };
const DAY_OPTS = [0, 1, 2, 3, 4, 5];

/* ---------- Zones & delivery promises ---------- */

type PromiseDraft = { promises: Record<string, { handling: number; extra: number }>; cutoff: number };
const toPromiseDraft = (s: ShippingSetup, zones: Zone[]): PromiseDraft => ({
  promises: Object.fromEntries(zones.map((z) => { const p = s.promises.find((x) => x.zoneId === z.id); return [z.id, { handling: p?.handling ?? 1, extra: p?.extra ?? 0 }]; })),
  cutoff: s.sameDayCutoff,
});

export function ZonesTab() {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const empty = useDashState() === 'empty';
  const { setup, zones } = useShipping();
  const [edit, setEdit] = useState<{ d: ZoneDraft; prev: Zone | null } | null>(null);
  const [del, setDel] = useState<Zone | null>(null);
  const add = () => setEdit({ d: zoneDraft(null, lang, `z${Date.now()}`), prev: null });
  const base = useMemo(() => toPromiseDraft(setup, zones), [setup, zones]);
  const [d, setD, clear] = useSessionDraft<PromiseDraft>('ship.promises', base);
  const dirty = JSON.stringify(d) !== JSON.stringify(base);
  const { saving, error, save, clearError } = useSave();
  const days = (n: number) => (n === 0 ? tx('نفس اليوم', 'Same day') : tx(`${n} ${n === 1 ? 'يوم' : n === 2 ? 'يومان' : 'أيام'}`, `${n} day${n === 1 ? '' : 's'}`));
  const std = setup.carriers.find((c) => c.id === setup.methods.find((m) => m.cat === 'standard')?.carrier);
  const fmt = (t: number) => new Date(t).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Riyadh' });
  const setP = (id: string, p: Partial<{ handling: number; extra: number }>) => { setD({ ...d, promises: { ...d.promises, [id]: { ...d.promises[id], ...p } } }); clearError(); };

  return (
    <>
      <LeaveGuard dirty={dirty} />
      <Section id="zn-h" flush title={tx('مناطق الشحن', 'Shipping zones')}
        hint={<InfoHint>{tx('يختار العميل مدينته فيُطبَّق سعر أول منطقة تغطيها على الطرق التي تستخدم «سعر المنطقة».', 'The shopper’s city picks the first zone that covers it; methods set to “zone rate” use its price.')}</InfoHint>}
        action={zones.length > 0 && <Button size="sm" variant="secondary" onClick={add}><Plus className="size-4" aria-hidden="true" />{tx('أضف منطقة', 'Add zone')}</Button>}>
        {zones.length === 0 ? (
          <EmptyState icon={<Truck className="size-6" aria-hidden="true" />} title={tx('لا مناطق شحن بعد', 'No shipping zones yet')}
            action={<Button onClick={add}><Plus className="size-4" aria-hidden="true" />{tx('أضف أول منطقة', 'Add your first zone')}</Button>}>
            {tx('بدون منطقة لا يستطيع العملاء إتمام طلب يُشحن.', 'Without a zone shoppers can’t complete a shipped order.')}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {zones.map((z) => {
              const p = d.promises[z.id] ?? { handling: 1, extra: 0 };
              const first = SA_CITIES.find((c) => zoneForCity([z], c.name)?.id === z.id);
              const eta = std && promiseDates({ handling: p.handling, transit: [std.eta[0] + p.extra, std.eta[1] + p.extra] }, Date.now());
              return (
                <li key={z.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
                  </div>
                  <div className="flex flex-wrap items-end gap-3 rounded-xl bg-surface-2 p-3">
                    <Field label={tx('التجهيز', 'Preparation')} className="w-32">{(pp) => <Select {...pp} value={p.handling} onChange={(e) => setP(z.id, { handling: Number(e.target.value) })}>{DAY_OPTS.map((n) => <option key={n} value={n}>{days(n)}</option>)}</Select>}</Field>
                    <Field label={tx('أيام نقل إضافية', 'Extra transit')} className="w-36">{(pp) => <Select {...pp} value={p.extra} onChange={(e) => setP(z.id, { extra: Number(e.target.value) })}>{DAY_OPTS.map((n) => <option key={n} value={n}>{n === 0 ? tx('لا شيء', 'None') : days(n)}</option>)}</Select>}</Field>
                    {eta && first && <p className="min-w-0 flex-1 basis-48 pb-2 text-[13px] text-muted">{tx(`عميل في ${first.name.ar} يرى: `, `A shopper in ${first.name.en} sees: `)}<span className="font-semibold text-fg">{fmt(eta.from)} – {fmt(eta.to)}</span></p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section id="zn-cut" title={tx('موعد طلبات نفس اليوم', 'Same-day cut-off')} hint={<InfoHint>{tx('بعد هذا الوقت (توقيت الرياض) يرى العميل «يصل غدًا» بدل «اليوم».', 'After this time (Riyadh) shoppers see “arrives tomorrow” instead of “today”.')}</InfoHint>}>
        <Field label={tx('آخر موعد', 'Cut-off')} className="sm:max-w-xs">{(p) => <Select {...p} value={d.cutoff} onChange={(e) => { setD({ ...d, cutoff: Number(e.target.value) }); clearError(); }}>
          {[10, 11, 12, 13, 14, 15, 16, 17, 18].map((h) => <option key={h} value={h}>{`${h}:00`}</option>)}
        </Select>}</Field>
      </Section>

      <SaveBar dirty={dirty} saving={saving} error={error} onDiscard={() => { clear(); clearError(); }}
        onSave={() => save(() => {
          commitShipping({ ...setup, sameDayCutoff: d.cutoff, promises: Object.entries(d.promises).map(([zoneId, p]) => ({ zoneId, ...p })) }, { ar: 'عدّل وعود التوصيل', en: 'Edited delivery promises' });
          clear();
        }, tx('حُفظت وعود التوصيل؛ يراها العملاء الآن', 'Delivery promises saved; shoppers see them now'))} />

      {edit && <ZoneDrawer draft={edit.d} prev={edit.prev} onClose={() => setEdit(null)} onSave={(z) => {
        settingsStore.set((x) => ({ ...x, zones: upsertZone(x.zones, z) }));
        logAction('settings', edit.prev ? { ar: `عدّل منطقة الشحن «${z.name.ar}»`, en: `Edited shipping zone “${z.name.en}”` } : { ar: `أضاف منطقة الشحن «${z.name.ar}»`, en: `Added shipping zone “${z.name.en}”` }, { target: z.id });
        if (empty) setDashState('live');
        setEdit(null);
        toast({ tone: 'ok', text: tx(`حُفظت ${z.name.ar}`, `${z.name.en} saved`) });
      }} />}
      {del && (
        <Modal title={tx(`حذف ${del.name.ar}`, `Delete ${del.name.en}`)} onClose={() => setDel(null)}
          description={tx('لن يستطيع العملاء في هذه المدن إتمام طلبات تُشحن بسعر المنطقة حتى تغطيها منطقة أخرى. الطلبات الحالية لا تتأثر.', 'Shoppers in these cities can’t check out zone-priced methods until another zone covers them. Existing orders are unaffected.')}
          footer={<><Button variant="secondary" onClick={() => setDel(null)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={() => {
            settingsStore.set((x) => ({ ...x, zones: x.zones.filter((z) => z.id !== del.id) }));
            logAction('settings', { ar: `حذف منطقة الشحن «${del.name.ar}»`, en: `Deleted shipping zone “${del.name.en}”` }, { target: del.id });
            setDel(null);
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

/* ---------- Operations: warehouse by zone, recipient phone check, COD rules ---------- */

type OpsDraft = { autoWarehouse: boolean; warehouseByZone: Record<string, string>; verifyPhone: boolean; exceptCities: string[]; exceptCats: string[]; maxKg: string };
const toOps = (s: ShippingSetup): OpsDraft => ({ autoWarehouse: s.autoWarehouse, warehouseByZone: { ...s.warehouseByZone }, verifyPhone: s.verifyPhone, exceptCities: [...s.cod.exceptCities], exceptCats: [...s.cod.exceptCats], maxKg: s.cod.maxKg === null ? '' : String(s.cod.maxKg) });

export function OptionsTab() {
  const tx = useTx();
  const { lang } = useLang();
  const cats = useCategories();
  const { setup, zones, locations } = useShipping();
  const base = useMemo(() => toOps(setup), [setup]);
  const [d, setD, clear] = useSessionDraft<OpsDraft>('ship.ops', base);
  const [tried, setTried] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(base);
  const { saving, error, save, clearError } = useSave();
  const set = (p: Partial<OpsDraft>) => { setD({ ...d, ...p }); clearError(); };
  const kgRaw = d.maxKg.replace(/[٠-٩]/g, (x) => String(x.charCodeAt(0) - 0x0660)).trim();
  const kg = kgRaw ? Number(kgRaw) : null;
  const kgBad = kgRaw !== '' && (!Number.isFinite(kg) || kg! <= 0);
  const shipping = locations.filter((l) => l.active && l.ships);
  const codMethods = setup.methods.filter((m) => m.on && m.cod && setup.carriers.find((c) => c.id === m.carrier)?.cod);

  return (
    <>
      <LeaveGuard dirty={dirty} />
      <Section id="op-wh" title={tx('المستودع حسب مدينة العميل', 'Warehouse by customer city')}
        hint={<InfoHint>{tx('عند الطلب يُحجز المخزون من مستودع منطقة العميل أولًا، ثم من غيره إن نقص.', 'On each order stock is held from the customer zone’s warehouse first, then others if short.')}</InfoHint>}>
        <div className="flex items-center gap-4">
          <p className="min-w-0 flex-1 text-sm text-muted">{d.autoWarehouse ? tx('تلقائي حسب المنطقة.', 'Automatic by zone.') : tx('المستودع الافتراضي لكل الطلبات.', 'The default warehouse for every order.')}</p>
          <Switch checked={d.autoWarehouse} onChange={(v) => set({ autoWarehouse: v })} label={tx('اختيار المستودع تلقائيًا', 'Pick the warehouse automatically')} />
        </div>
        {d.autoWarehouse && (
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
            {zones.map((z) => (
              <li key={z.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1 basis-40 text-sm text-fg">{z.name[lang]}</span>
                <Select className="w-auto min-w-44" aria-label={tx(`مستودع ${z.name.ar}`, `Warehouse for ${z.name.en}`)} value={d.warehouseByZone[z.id] ?? ''} onChange={(e) => set({ warehouseByZone: { ...d.warehouseByZone, [z.id]: e.target.value } })}>
                  <option value="">{tx('الافتراضي', 'Default')}</option>
                  {shipping.map((l) => <option key={l.id} value={l.id}>{l.name[lang]}</option>)}
                </Select>
              </li>
            ))}
          </ul>
        )}
        <a href={sectionHref('inventory', 'locations')} className="mt-3 inline-block text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('إدارة المواقع', 'Manage locations')}</a>
      </Section>

      <Section id="op-cod" title={tx('قواعد الدفع عند الاستلام', 'Cash on delivery rules')}
        hint={<InfoHint>{tx('حدود المبلغ وعدد الطلبات في «إتمام الطلب» و«المدفوعات». هنا الاستثناءات حسب المدينة والفئة والوزن.', 'Amount and per-customer limits live in Checkout and Payments. Here: exceptions by city, category and weight.')}</InfoHint>}>
        <p className="mb-4 text-[13px] text-muted">{codMethods.length ? tx(`متاح مع: ${codMethods.map((m) => m.name.ar).join('، ')}`, `Offered with: ${codMethods.map((m) => m.name.en).join(', ')}`) : tx('لا طريقة شحن مفعّلة تقبل الدفع عند الاستلام.', 'No active method accepts cash on delivery.')}</p>
        <Field label={tx('مدن مستثناة', 'Excluded cities')} optional>{() => <ChipPicker label={tx('مدن مستثناة', 'Excluded cities')} value={d.exceptCities} onChange={(v) => set({ exceptCities: v })} options={SA_CITIES} />}</Field>
        <div className="mt-4"><Field label={tx('فئات مستثناة', 'Excluded categories')} optional>{() => <ChipPicker label={tx('فئات مستثناة', 'Excluded categories')} value={d.exceptCats} onChange={(v) => set({ exceptCats: v })} options={cats} />}</Field></div>
        <div className="mt-4"><Field label={tx('أقصى وزن (كجم)', 'Max weight (kg)')} optional error={tried && kgBad ? tx('رقم أكبر من صفر', 'A number above zero') : null} className="sm:max-w-xs">{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.maxKg} onChange={(e) => set({ maxKg: e.target.value })} />}</Field></div>
      </Section>

      <Section id="op-ph" title={<>{tx('التحقق من جوال المستلم', 'Recipient phone check')}<Simulated /></>}
        hint={<InfoHint>{tx('يُطلب من العميل رمز يصل جواله قبل قبول طلب الدفع عند الاستلام. محاكاة: لا تُرسل رسائل.', 'Shoppers confirm a code sent to their mobile before a COD order is accepted. Simulated: no messages are sent.')}</InfoHint>}>
        <div className="flex items-center gap-4">
          <p className="min-w-0 flex-1 text-sm text-muted">{d.verifyPhone ? tx('يُطلب الرمز لطلبات الدفع عند الاستلام.', 'A code is required for COD orders.') : tx('لا يُطلب رمز.', 'No code is required.')}</p>
          <Switch checked={d.verifyPhone} onChange={(v) => set({ verifyPhone: v })} label={tx('تفعيل التحقق من الجوال', 'Require phone check')} />
        </div>
        {d.verifyPhone && <Alert tone="info">{tx('يقلل الطلبات الوهمية، لكنه خطوة إضافية قد تُبطئ بعض العملاء.', 'Cuts fake orders, but it is one more step that may slow some shoppers.')}</Alert>}
      </Section>

      <SaveBar dirty={dirty} saving={saving} error={error} onDiscard={() => { clear(); setTried(false); clearError(); }}
        onSave={() => { setTried(true); if (kgBad) return; save(() => {
          commitShipping({ ...setup, autoWarehouse: d.autoWarehouse, warehouseByZone: d.warehouseByZone, verifyPhone: d.verifyPhone, cod: { exceptCities: d.exceptCities, exceptCats: d.exceptCats, maxKg: kg } }, { ar: 'عدّل إعدادات تشغيل الشحن والدفع عند الاستلام', en: 'Edited shipping operations and COD rules' });
          clear(); setTried(false);
        }, tx('حُفظت الإعدادات', 'Settings saved')); }} />
    </>
  );
}
