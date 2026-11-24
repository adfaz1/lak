// Shipping methods by category, the carriers behind them, and enable/disable with a preview of what shoppers see.
import { useEffect, useMemo, useState } from 'react';
import { Clock, Globe2, PiggyBank, Pencil, Plus, Snowflake, Store, Trash2, Truck, Zap, type LucideIcon } from 'lucide-react';
import { useLang } from '../../../core/lang';
import type { ShipCat, ShipMethodCfg, ShippingSetup } from '../../merchant/workspace';
import { SHIP_CATS } from '../../merchant/workspace';
import { Badge, Button, IconButton, InfoHint, Money, useTx } from '../../../ds/ui';
import { Alert, Drawer, Field, Input, Modal, Select, Simulated, Switch } from '../../../ds/kit';
import { useUnsaved } from '../unsaved';
import { useSessionDraft } from './drafts';
import { Section, useSave } from './common';
import { CAT_LABEL, COUNTRIES, SA_CITIES, cityName, impact, methodDraft, newId, parseMethod, type MethodDraft } from './shipping-model';
import { ChipPicker, ImpactList, commitShipping, useCategories, useDays, useShipping } from './shipping-ui';

export const CAT_ICON: Record<ShipCat, LucideIcon> = { standard: Truck, express: Zap, economy: PiggyBank, sameday: Clock, cold: Snowflake, intl: Globe2, pickup: Store };

type Pending = { next: ShippingSetup; title: string; what: { ar: string; en: string }; target: string; confirm: string; onDone?: () => void };

export default function MethodsTab() {
  const tx = useTx();
  const { lang } = useLang();
  const days = useDays();
  const { setup, zones, locations, products } = useShipping();
  const [edit, setEdit] = useState<{ m: ShipMethodCfg; isNew: boolean } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [del, setDel] = useState<ShipMethodCfg | null>(null);
  const [reconnect, setReconnect] = useState<string | null>(null);
  const { saving, error, save, clearError } = useSave();
  const qo = { now: Date.now(), locations, products };
  const changes = useMemo(() => (pending ? impact(setup, pending.next, zones, qo) : []), [pending, setup, zones]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (m: ShipMethodCfg, on: boolean) => setPending({
    next: { ...setup, methods: setup.methods.map((x) => (x.id === m.id ? { ...x, on } : x)) },
    title: on ? tx(`تفعيل ${m.name.ar}`, `Turn on ${m.name.en}`) : tx(`إيقاف ${m.name.ar}`, `Turn off ${m.name.en}`),
    what: on ? { ar: `فعّل طريقة الشحن «${m.name.ar}»`, en: `Turned on shipping method “${m.name.en}”` } : { ar: `أوقف طريقة الشحن «${m.name.ar}»`, en: `Turned off shipping method “${m.name.en}”` },
    target: m.id, confirm: on ? tx('فعّل وطبّق على المتجر', 'Turn on in the store') : tx('أوقف في المتجر', 'Turn off in the store'),
  });
  const add = () => {
    const id = newId('m', setup.methods.map((m) => m.id));
    setEdit({ isNew: true, m: { id, cat: 'standard', name: { ar: '', en: '' }, on: true, carrier: setup.carriers[0]?.id ?? null, price: 2500, perKg: 0, freeOver: null, cities: [], onlyCats: [], maxKg: null, cod: true } });
  };
  const run = (p: Pending) => save(() => { commitShipping(p.next, p.what, { target: p.target }); setPending(null); p.onDone?.(); }, tx('حُفظ وطُبّق على المتجر', 'Saved and live in the store'));

  const carrierOf = (m: ShipMethodCfg) => setup.carriers.find((c) => c.id === m.carrier);
  const byCat = SHIP_CATS.flatMap((c) => setup.methods.filter((m) => m.cat === c));
  const action = setup.carriers.filter((c) => c.state === 'action_required');

  return (
    <>
      {action.length > 0 && <Alert tone="warn" title={tx(`${action.length} حساب ناقل يحتاج إجراءً`, `${action.length} carrier account needs action`)}>{tx('طرقه مخفية عن العملاء حتى تعيد الربط.', 'Its methods are hidden from shoppers until you reconnect.')}</Alert>}
      <Section id="sh-m" flush title={tx('طرق الشحن', 'Shipping methods')}
        hint={<InfoHint>{tx('كل طريقة مفعّلة تظهر في صفحة الدفع إذا انطبقت شروطها وقواعدها. جرّبها في «ماذا يرى العميل».', 'An active method shows at checkout when its limits and rules allow. Try it in “What the shopper sees”.')}</InfoHint>}
        action={<Button size="sm" onClick={add}><Plus className="size-4" aria-hidden="true" />{tx('أضف طريقة', 'Add method')}</Button>}>
        <ul className="divide-y divide-border border-t border-border">
          {byCat.map((m) => {
            const I = CAT_ICON[m.cat];
            const c = carrierOf(m);
            const where = m.cat === 'intl' ? (c?.countries.length ? tx(`${c.countries.length} دول`, `${c.countries.length} countries`) : '—')
              : m.cat === 'pickup' ? (locations.find((l) => l.id === m.pickupLoc)?.name[lang] ?? '—')
                : m.cities.length ? m.cities.map((x) => cityName(x)[lang]).join(tx('، ', ', ')) : c?.cities.includes('*') ? tx('كل المدن', 'All cities') : tx(`${c?.cities.length ?? 0} مدن`, `${c?.cities.length ?? 0} cities`);
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted" aria-hidden="true"><I className="size-5" /></span>
                <div className="min-w-0 flex-1 basis-52">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">{m.name[lang]}<Badge>{CAT_LABEL[m.cat][lang]}</Badge>{c?.state === 'action_required' && <Badge tone="amber">{tx('الناقل يحتاج إجراءً', 'Carrier needs action')}</Badge>}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
                    <span>{c ? c.name[lang] : tx('بدون ناقل', 'No carrier')}</span><span aria-hidden="true">·</span>
                    <span>{m.price === null ? tx('سعر المنطقة', 'Zone rate') : m.price === 0 ? tx('مجاني', 'Free') : <Money v={m.price} />}</span><span aria-hidden="true">·</span>
                    <span>{m.cat === 'sameday' ? tx(`قبل ${setup.sameDayCutoff}:00 يصل اليوم`, `Order by ${setup.sameDayCutoff}:00, arrives today`) : c ? days(c.eta[0], c.eta[1]) : tx('جاهز للاستلام', 'Ready for pickup')}</span><span aria-hidden="true">·</span>
                    <span className="truncate">{where}</span>
                  </p>
                  <p className="mt-1.5 flex flex-wrap gap-1.5">
                    {m.cod && c?.cod ? <Badge tone="green">{tx('دفع عند الاستلام', 'COD')}</Badge> : <Badge>{tx('بلا دفع عند الاستلام', 'No COD')}</Badge>}
                    {m.freeOver !== null && <Badge tone="green">{tx('مجاني فوق ', 'Free over ')}<Money v={m.freeOver} /></Badge>}
                    {m.maxKg !== null && <Badge>{tx(`حتى ${m.maxKg} كجم`, `Up to ${m.maxKg} kg`)}</Badge>}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Switch checked={m.on} onChange={(v) => toggle(m, v)} label={tx(`تفعيل ${m.name.ar}`, `Turn on ${m.name.en}`)} />
                  <IconButton label={tx(`تعديل ${m.name.ar}`, `Edit ${m.name.en}`)} onClick={() => setEdit({ m, isNew: false })}><Pencil className="size-4" aria-hidden="true" /></IconButton>
                  <IconButton label={tx(`حذف ${m.name.ar}`, `Delete ${m.name.en}`)} onClick={() => setDel(m)}><Trash2 className="size-4" aria-hidden="true" /></IconButton>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section id="sh-c" flush title={<>{tx('شركات الشحن', 'Carriers')}<Simulated /></>}
        hint={<InfoHint>{tx('حسابات تجريبية: لا ربط حقيقي ولا بوليصات فعلية. الأسعار والمدد تقديرية.', 'Test accounts: no real connection or waybills. Prices and times are estimates.')}</InfoHint>}>
        <ul className="divide-y divide-border border-t border-border">
          {setup.carriers.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
              <div className="min-w-0 flex-1 basis-52">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">{c.name[lang]}{c.state === 'connected' ? <Badge tone="green">{tx('مربوط', 'Connected')}</Badge> : <Badge tone="amber">{tx('يحتاج إجراءً', 'Needs action')}</Badge>}</p>
                <p className="mt-1 text-[13px] text-muted">
                  {c.countries.length ? c.countries.map((x) => COUNTRIES.find((k) => k.id === x)?.name[lang] ?? x).join(tx('، ', ', ')) : c.cities.includes('*') ? tx('كل مدن المملكة', 'All Saudi cities') : c.cities.map((x) => cityName(x)[lang]).join(tx('، ', ', '))}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
                  <span>{tx('من ', 'From ')}<Money v={c.price} /></span><span aria-hidden="true">·</span><span>{days(c.eta[0], c.eta[1])}</span>
                  {c.cod && <><span aria-hidden="true">·</span><span>{tx('يحصّل نقدًا', 'Collects cash')}</span></>}
                  {c.cold && <><span aria-hidden="true">·</span><span>{tx('مبرّد', 'Chilled')}</span></>}
                </p>
              </div>
              {c.state === 'action_required' && <Button size="sm" variant="secondary" onClick={() => setReconnect(c.id)}>{tx('أعد الربط', 'Reconnect')}</Button>}
            </li>
          ))}
        </ul>
      </Section>

      {edit && <MethodDrawer key={edit.m.id} m={edit.m} isNew={edit.isNew} setup={setup} onClose={() => setEdit(null)} onSave={(m) => {
        const next = { ...setup, methods: edit.isNew ? [...setup.methods, m] : setup.methods.map((x) => (x.id === m.id ? m : x)) };
        setPending({
          next, title: edit.isNew ? tx(`إضافة ${m.name.ar}`, `Add ${m.name.en}`) : tx(`حفظ ${m.name.ar}`, `Save ${m.name.en}`),
          what: edit.isNew ? { ar: `أضاف طريقة الشحن «${m.name.ar}»`, en: `Added shipping method “${m.name.en}”` } : { ar: `عدّل طريقة الشحن «${m.name.ar}»`, en: `Edited shipping method “${m.name.en}”` },
          target: m.id, confirm: tx('احفظ وطبّق على المتجر', 'Save and apply to the store'), onDone: () => setEdit(null),
        });
      }} />}

      {pending && (
        <Modal size="lg" title={pending.title} onClose={() => { setPending(null); clearError(); }}
          description={tx('معاينة ما يتغير في صفحة الدفع لكل مدينة وسلة تجريبية. الطلبات الحالية لا تتأثر.', 'Preview of what changes at checkout for each city and sample cart. Existing orders are unaffected.')}
          footer={<><Button variant="secondary" onClick={() => { setPending(null); clearError(); }}>{tx('رجوع', 'Back')}</Button><Button onClick={() => run(pending)} disabled={saving}>{saving ? tx('جارٍ الحفظ…', 'Saving…') : pending.confirm}</Button></>}>
          {error && <Alert tone="bad">{error}</Alert>}
          <ImpactList changes={changes} />
        </Modal>
      )}

      {del && (
        <Modal title={tx(`حذف ${del.name.ar}`, `Delete ${del.name.en}`)} onClose={() => setDel(null)}
          description={tx('تختفي من صفحة الدفع فورًا، والقواعد المرتبطة بها لن تنطبق. الطلبات الحالية لا تتأثر. لإخفائها مؤقتًا أوقفها بدل الحذف.', 'It disappears from checkout at once and rules tied to it stop applying. Existing orders are unaffected. To hide it for now, turn it off instead.')}
          footer={<><Button variant="secondary" onClick={() => setDel(null)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={() => {
            commitShipping({ ...setup, methods: setup.methods.filter((x) => x.id !== del.id), rules: setup.rules.map((r) => ({ ...r, methods: r.methods.filter((x) => x !== del.id) })) }, { ar: `حذف طريقة الشحن «${del.name.ar}»`, en: `Deleted shipping method “${del.name.en}”` }, { target: del.id });
            setDel(null);
          }}>{tx('احذف الطريقة', 'Delete method')}</Button></>} />
      )}

      {reconnect && (() => {
        const c = setup.carriers.find((x) => x.id === reconnect)!;
        return (
          <Modal title={tx(`إعادة ربط ${c.name.ar}`, `Reconnect ${c.name.en}`)} onClose={() => setReconnect(null)}
            description={tx('محاكاة: لا يُرسل شيء إلى شركة شحن. بعد الربط تظهر طرق هذا الناقل للعملاء حسب قواعدها.', 'Simulated: nothing is sent to a carrier. Once connected, this carrier’s methods show to shoppers under their rules.')}
            footer={<><Button variant="secondary" onClick={() => setReconnect(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => save(() => {
              commitShipping({ ...setup, carriers: setup.carriers.map((x) => (x.id === c.id ? { ...x, state: 'connected' } : x)) }, { ar: `أعاد ربط الناقل «${c.name.ar}» (محاكاة)`, en: `Reconnected carrier “${c.name.en}” (simulated)` }, { target: c.id });
              setReconnect(null);
            }, tx('رُبط الناقل (محاكاة)', 'Carrier connected (simulated)'))} disabled={saving}>{saving ? tx('جارٍ الربط…', 'Connecting…') : tx('أعد الربط', 'Reconnect')}</Button></>}>
            {error && <Alert tone="bad">{error}</Alert>}
          </Modal>
        );
      })()}
    </>
  );
}

function MethodDrawer({ m, isNew, setup, onClose, onSave }: { m: ShipMethodCfg; isNew: boolean; setup: ShippingSetup; onClose: () => void; onSave: (m: ShipMethodCfg) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const cats = useCategories();
  const { locations } = useShipping();
  const base = useMemo(() => methodDraft(m), [m]);
  const [d, setD, clear] = useSessionDraft<MethodDraft>(`ship.method.${m.id}`, base);
  const [tried, setTried] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(base);
  useUnsaved(dirty, { ar: 'تعديل طريقة شحن', en: 'Shipping method edit' });
  const r = parseMethod(d, m.on);
  const e = tried && !r.ok ? r.errors : {};
  const set = (p: Partial<MethodDraft>) => setD({ ...d, ...p });
  const carriers = setup.carriers.filter((c) => (d.cat === 'intl' ? c.countries.length > 0 : c.cities.length > 0) && (d.cat !== 'cold' || c.cold));
  const carrier = setup.carriers.find((c) => c.id === d.carrier);
  useEffect(() => { if (d.cat !== 'pickup' && !carriers.some((c) => c.id === d.carrier) && carriers[0]) set({ carrier: carriers[0].id }); }, [d.cat]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { clear(); onClose(); };
  return (
    <Drawer title={isNew ? tx('طريقة شحن جديدة', 'New shipping method') : tx('تعديل طريقة الشحن', 'Edit shipping method')} onClose={close}
      footer={<><Button className="flex-1" onClick={() => { setTried(true); if (r.ok) { clear(); onSave(r.method); } }}>{tx('راجع الأثر ثم احفظ', 'Review impact, then save')}</Button><Button variant="secondary" onClick={close}>{tx('إلغاء', 'Cancel')}</Button></>}>
      {isNew && <Field label={tx('الفئة', 'Category')}>{(p) => <Select {...p} value={d.cat} onChange={(ev) => set({ cat: ev.target.value as ShipCat, zonePrice: false })}>
        {SHIP_CATS.filter((c) => c !== 'pickup' || !setup.methods.some((x) => x.cat === 'pickup')).map((c) => <option key={c} value={c}>{CAT_LABEL[c][lang]}</option>)}
      </Select>}</Field>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={tx('الاسم بالعربية', 'Name in Arabic')} error={e.name ? tx('اكتب اسمًا', 'Enter a name') : null}>{(p) => <Input {...p} dir="rtl" value={d.nameAr} onChange={(ev) => set({ nameAr: ev.target.value })} />}</Field>
        <Field label={tx('الاسم بالإنجليزية', 'Name in English')} optional>{(p) => <Input {...p} dir="ltr" value={d.nameEn} onChange={(ev) => set({ nameEn: ev.target.value })} />}</Field>
      </div>
      {d.cat === 'pickup' ? (
        <Field label={tx('موقع الاستلام', 'Pickup location')} hint={tx('يجب أن يسمح الموقع بالاستلام', 'The location must allow pickup')}>{(p) => <Select {...p} value={d.pickupLoc} onChange={(ev) => set({ pickupLoc: ev.target.value })}>
          {locations.filter((l) => l.active).map((l) => <option key={l.id} value={l.id}>{l.name[lang]}{l.pickup ? '' : tx(' (الاستلام غير مسموح)', ' (pickup not allowed)')}</option>)}
        </Select>}</Field>
      ) : (
        <Field label={<span className="flex items-center gap-2">{tx('شركة الشحن', 'Carrier')}<Simulated /></span>} error={e.carrier ? tx('اختر ناقلًا', 'Choose a carrier') : null}>{(p) => <Select {...p} value={d.carrier} onChange={(ev) => set({ carrier: ev.target.value })}>
          {carriers.length === 0 && <option value="">{tx('لا ناقل يناسب هذه الفئة', 'No carrier fits this category')}</option>}
          {carriers.map((c) => <option key={c.id} value={c.id}>{c.name[lang]}</option>)}
        </Select>}</Field>
      )}
      {d.cat !== 'pickup' && (
        <>
          {d.cat !== 'intl' && <label className="flex items-center justify-between gap-3 text-sm text-fg">{tx('استخدم سعر منطقة الشحن', 'Use the shipping zone’s rate')}<Switch checked={d.zonePrice} onChange={(v) => set({ zonePrice: v })} label={tx('استخدم سعر منطقة الشحن', 'Use the shipping zone’s rate')} /></label>}
          {!d.zonePrice && <div className="grid grid-cols-2 gap-3">
            <Field label={tx('أول كجم (ر.س)', 'First kg (SAR)')} error={e.price ? tx('مبلغ غير صالح', 'Invalid amount') : null}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.price} onChange={(ev) => set({ price: ev.target.value })} />}</Field>
            <Field label={tx('كل كجم إضافي', 'Each extra kg')} optional error={e.perKg ? tx('مبلغ غير صالح', 'Invalid amount') : null}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.perKg} onChange={(ev) => set({ perKg: ev.target.value })} />}</Field>
          </div>}
          <div className="grid grid-cols-2 gap-3">
            <Field label={tx('مجاني فوق (ر.س)', 'Free over (SAR)')} optional error={e.free ? tx('مبلغ غير صالح', 'Invalid amount') : null}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.free} onChange={(ev) => set({ free: ev.target.value })} />}</Field>
            <Field label={tx('أقصى وزن (كجم)', 'Max weight (kg)')} optional error={e.maxKg ? tx('رقم أكبر من صفر', 'A number above zero') : null}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.maxKg} onChange={(ev) => set({ maxKg: ev.target.value })} />}</Field>
          </div>
        </>
      )}
      {d.cat !== 'intl' && d.cat !== 'pickup' && (
        <Field label={d.cat === 'sameday' ? tx('المدن', 'Cities') : tx('قصرها على مدن', 'Limit to cities')} optional={d.cat !== 'sameday'} hint={d.cat === 'sameday' ? undefined : tx('بلا اختيار = كل مدن الناقل', 'None = all the carrier’s cities')}
          error={e.cities ? tx('اختر مدينة واحدة على الأقل', 'Choose at least one city') : null}>
          {() => <ChipPicker label={tx('المدن', 'Cities')} value={d.cities} onChange={(v) => set({ cities: v })}
            options={SA_CITIES.filter((c) => !carrier || carrier.cities.includes('*') || carrier.cities.includes(c.id))} />}
        </Field>
      )}
      <Field label={tx('تظهر فقط لهذه الفئات', 'Only for these categories')} optional hint={tx('بلا اختيار = كل السلال', 'None = every cart')}>
        {() => <ChipPicker label={tx('الفئات', 'Categories')} value={d.onlyCats} onChange={(v) => set({ onlyCats: v })} options={cats} />}
      </Field>
      {d.cat !== 'pickup' && d.cat !== 'intl' && (
        <label className="flex items-center justify-between gap-3 text-sm text-fg">
          <span>{tx('الدفع عند الاستلام', 'Cash on delivery')}{carrier && !carrier.cod && <span className="block text-xs text-muted">{tx('هذا الناقل لا يحصّل نقدًا', 'This carrier doesn’t collect cash')}</span>}</span>
          <Switch checked={d.cod && !!carrier?.cod} disabled={!carrier?.cod} onChange={(v) => set({ cod: v })} label={tx('الدفع عند الاستلام', 'Cash on delivery')} />
        </label>
      )}
    </Drawer>
  );
}
