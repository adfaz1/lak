// Shipping rules: when a method shows at checkout and at what price (city, cart value, weight, category, COD).
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Route as RouteIcon, Trash2 } from 'lucide-react';
import { useLang } from '../../../core/lang';
import type { L } from '../../merchant/domain';
import type { ShipRule, ShippingSetup } from '../../merchant/workspace';
import { Badge, Button, EmptyState, IconButton, InfoHint, useTx } from '../../../ds/ui';
import { Alert, Drawer, Field, Input, Modal, Select, Switch } from '../../../ds/kit';
import { useUnsaved } from '../unsaved';
import { formatMoney } from '../../../core/format';
import { useSessionDraft } from './drafts';
import { Section, useSave } from './common';
import { SA_CITIES, cityName, impact, newId, parseRule, ruleDraft, type RuleDraft } from './shipping-model';
import { ChipPicker, ImpactList, commitShipping, useCategories, useShipping } from './shipping-ui';

/** "When the city is Riyadh and the cart is SAR 500 or more → Free" in the merchant's language. */
export function ruleSentence(r: ShipRule, setup: ShippingSetup, cats: { id: string; name: L }[], lang: 'ar' | 'en'): { when: string; then: string; methods: string } {
  const ar = lang === 'ar';
  const sar = (h: number) => (ar ? `${formatMoney(h)} ر.س` : `SAR ${formatMoney(h)}`);
  const w = r.when;
  const parts: string[] = [];
  if (w.cities?.length) parts.push((ar ? 'المدينة ' : 'city is ') + w.cities.map((c) => cityName(c)[lang]).join(ar ? ' أو ' : ' or '));
  if (w.cartMin !== undefined) parts.push(ar ? `السلة ${sar(w.cartMin)} أو أكثر` : `cart is ${sar(w.cartMin)} or more`);
  if (w.cartMax !== undefined) parts.push(ar ? `السلة حتى ${sar(w.cartMax)}` : `cart is up to ${sar(w.cartMax)}`);
  if (w.kgMin !== undefined) parts.push(ar ? `الوزن ${w.kgMin} كجم أو أكثر` : `weight is ${w.kgMin} kg or more`);
  if (w.kgMax !== undefined) parts.push(ar ? `الوزن حتى ${w.kgMax} كجم` : `weight is up to ${w.kgMax} kg`);
  if (w.cats?.length) parts.push((ar ? 'السلة فيها ' : 'cart has ') + w.cats.map((c) => cats.find((x) => x.id === c)?.name[lang] ?? c).join(ar ? ' أو ' : ' or '));
  if (w.cod !== undefined) parts.push(w.cod ? (ar ? 'الدفع عند الاستلام' : 'paying cash on delivery') : (ar ? 'الدفع مسبقًا' : 'paying online'));
  const then = r.then.kind === 'hide' ? (ar ? 'أخفِ الطريقة' : 'hide the method') : r.then.kind === 'free' ? (ar ? 'اجعلها مجانية' : 'make it free')
    : r.then.kind === 'price' ? (ar ? `السعر ${sar(r.then.v)}` : `price ${sar(r.then.v)}`) : (ar ? `أضف ${sar(r.then.v)}` : `add ${sar(r.then.v)}`);
  const methods = r.methods.length ? r.methods.map((id) => setup.methods.find((m) => m.id === id)?.name[lang] ?? id).join(ar ? '، ' : ', ') : (ar ? 'كل الطرق' : 'All methods');
  return { when: parts.length ? parts.join(ar ? ' و' : ' and ') : (ar ? 'دائمًا' : 'always'), then, methods };
}

type Pending = { next: ShippingSetup; title: string; what: L; target: string; onDone?: () => void };

export default function RulesTab() {
  const tx = useTx();
  const { lang } = useLang();
  const cats = useCategories();
  const { setup, zones, locations, products } = useShipping();
  const [edit, setEdit] = useState<{ r: ShipRule | null; id: string } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [del, setDel] = useState<ShipRule | null>(null);
  const { saving, error, save, clearError } = useSave();
  const changes = useMemo(() => (pending ? impact(setup, pending.next, zones, { now: Date.now(), locations, products }) : []), [pending, setup, zones]); // eslint-disable-line react-hooks/exhaustive-deps
  const move = (i: number, dir: -1 | 1) => {
    const list = [...setup.rules];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    commitShipping({ ...setup, rules: list }, { ar: `غيّر ترتيب قاعدة الشحن «${list[j].name.ar}»`, en: `Reordered shipping rule “${list[j].name.en}”` }, { target: list[j].id });
  };
  const add = () => setEdit({ r: null, id: newId('r', setup.rules.map((r) => r.id)) });

  return (
    <>
      <Section id="sh-r" flush title={tx('قواعد الظهور والسعر', 'Visibility & price rules')}
        hint={<InfoHint>{tx('تُطبّق بالترتيب من الأعلى. قاعدة «أخفِ» توقف ما بعدها لتلك الطريقة. حدود الطريقة نفسها (المدن والوزن) تُفحص قبل القواعد.', 'Applied top to bottom. A “hide” rule stops the rest for that method. A method’s own limits (cities, weight) are checked before rules.')}</InfoHint>}
        action={setup.rules.length > 0 && <Button size="sm" onClick={add}><Plus className="size-4" aria-hidden="true" />{tx('أضف قاعدة', 'Add rule')}</Button>}>
        {setup.rules.length === 0 ? (
          <EmptyState icon={<RouteIcon className="size-6" aria-hidden="true" />} title={tx('لا قواعد بعد', 'No rules yet')} action={<Button onClick={add}><Plus className="size-4" aria-hidden="true" />{tx('أضف أول قاعدة', 'Add your first rule')}</Button>}>
            {tx('مثال: شحن سريع مجاني فوق 500 ر.س في الرياض.', 'Example: free express over SAR 500 in Riyadh.')}
          </EmptyState>
        ) : (
          <ol className="divide-y divide-border border-t border-border">
            {setup.rules.map((r, i) => {
              const s = ruleSentence(r, setup, cats, lang);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-xs font-semibold text-muted tabular-nums" aria-label={tx(`الترتيب ${i + 1}`, `Order ${i + 1}`)}>{i + 1}</span>
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">{r.name[lang]}{!r.on && <Badge>{tx('موقوفة', 'Off')}</Badge>}</p>
                    <p className="mt-1 text-[13px] text-muted"><span className="font-medium text-fg">{tx('عندما ', 'When ')}</span>{s.when} <span aria-hidden="true">{lang === 'ar' ? '←' : '→'}</span> <span className="font-medium text-fg">{s.then}</span></p>
                    <p className="mt-0.5 text-xs text-muted">{s.methods}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton label={tx('للأعلى', 'Move up')} onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="size-4" aria-hidden="true" /></IconButton>
                    <IconButton label={tx('للأسفل', 'Move down')} onClick={() => move(i, 1)} disabled={i === setup.rules.length - 1}><ArrowDown className="size-4" aria-hidden="true" /></IconButton>
                    <Switch checked={r.on} label={tx(`تفعيل ${r.name.ar}`, `Turn on ${r.name.en}`)} onChange={(v) => setPending({
                      next: { ...setup, rules: setup.rules.map((x) => (x.id === r.id ? { ...x, on: v } : x)) }, target: r.id,
                      title: v ? tx(`تفعيل «${r.name.ar}»`, `Turn on “${r.name.en}”`) : tx(`إيقاف «${r.name.ar}»`, `Turn off “${r.name.en}”`),
                      what: v ? { ar: `فعّل قاعدة الشحن «${r.name.ar}»`, en: `Turned on shipping rule “${r.name.en}”` } : { ar: `أوقف قاعدة الشحن «${r.name.ar}»`, en: `Turned off shipping rule “${r.name.en}”` },
                    })} />
                    <IconButton label={tx(`تعديل ${r.name.ar}`, `Edit ${r.name.en}`)} onClick={() => setEdit({ r, id: r.id })}><Pencil className="size-4" aria-hidden="true" /></IconButton>
                    <IconButton label={tx(`حذف ${r.name.ar}`, `Delete ${r.name.en}`)} onClick={() => setDel(r)}><Trash2 className="size-4" aria-hidden="true" /></IconButton>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      {edit && <RuleDrawer key={edit.id} r={edit.r} id={edit.id} setup={setup} onClose={() => setEdit(null)} onSave={(rule) => setPending({
        next: { ...setup, rules: edit.r ? setup.rules.map((x) => (x.id === rule.id ? rule : x)) : [...setup.rules, rule] }, target: rule.id,
        title: edit.r ? tx(`حفظ «${rule.name.ar}»`, `Save “${rule.name.en}”`) : tx(`إضافة «${rule.name.ar}»`, `Add “${rule.name.en}”`),
        what: edit.r ? { ar: `عدّل قاعدة الشحن «${rule.name.ar}»`, en: `Edited shipping rule “${rule.name.en}”` } : { ar: `أضاف قاعدة الشحن «${rule.name.ar}»`, en: `Added shipping rule “${rule.name.en}”` },
        onDone: () => setEdit(null),
      })} />}

      {pending && (
        <Modal size="lg" title={pending.title} onClose={() => { setPending(null); clearError(); }}
          description={tx('معاينة ما يتغير في صفحة الدفع لكل مدينة وسلة تجريبية.', 'Preview of what changes at checkout for each city and sample cart.')}
          footer={<><Button variant="secondary" onClick={() => { setPending(null); clearError(); }}>{tx('رجوع', 'Back')}</Button><Button disabled={saving} onClick={() => save(() => { commitShipping(pending.next, pending.what, { target: pending.target }); setPending(null); pending.onDone?.(); }, tx('حُفظت القاعدة وطُبّقت على المتجر', 'Rule saved and live in the store'))}>{saving ? tx('جارٍ الحفظ…', 'Saving…') : tx('احفظ وطبّق', 'Save and apply')}</Button></>}>
          {error && <Alert tone="bad">{error}</Alert>}
          <ImpactList changes={changes} />
        </Modal>
      )}
      {del && (
        <Modal title={tx(`حذف «${del.name.ar}»`, `Delete “${del.name.en}”`)} onClose={() => setDel(null)} description={tx('يتوقف أثرها في صفحة الدفع فورًا.', 'Its effect at checkout stops at once.')}
          footer={<><Button variant="secondary" onClick={() => setDel(null)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={() => { commitShipping({ ...setup, rules: setup.rules.filter((x) => x.id !== del.id) }, { ar: `حذف قاعدة الشحن «${del.name.ar}»`, en: `Deleted shipping rule “${del.name.en}”` }, { target: del.id }); setDel(null); }}>{tx('احذف القاعدة', 'Delete rule')}</Button></>} />
      )}
    </>
  );
}

function RuleDrawer({ r, id, setup, onClose, onSave }: { r: ShipRule | null; id: string; setup: ShippingSetup; onClose: () => void; onSave: (r: ShipRule) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const cats = useCategories();
  const base = useMemo(() => ruleDraft(r, id), [r, id]);
  const [d, setD, clear] = useSessionDraft<RuleDraft>(`ship.rule.${id}`, base);
  const [tried, setTried] = useState(false);
  useUnsaved(JSON.stringify(d) !== JSON.stringify(base), { ar: 'تعديل قاعدة شحن', en: 'Shipping rule edit' });
  const res = parseRule(d, r?.on ?? true);
  const e = tried && !res.ok ? res.errors : {};
  const set = (p: Partial<RuleDraft>) => setD({ ...d, ...p });
  const close = () => { clear(); onClose(); };
  const money = tx('مبلغ غير صالح', 'Invalid amount');
  const kg = tx('رقم أكبر من صفر', 'A number above zero');
  return (
    <Drawer title={r ? tx('تعديل القاعدة', 'Edit rule') : tx('قاعدة جديدة', 'New rule')} onClose={close}
      footer={<><Button className="flex-1" onClick={() => { setTried(true); if (res.ok) { clear(); onSave(res.rule); } }}>{tx('راجع الأثر ثم احفظ', 'Review impact, then save')}</Button><Button variant="secondary" onClick={close}>{tx('إلغاء', 'Cancel')}</Button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={tx('الاسم بالعربية', 'Name in Arabic')} error={e.name ? tx('اكتب اسمًا', 'Enter a name') : null}>{(p) => <Input {...p} dir="rtl" value={d.nameAr} onChange={(ev) => set({ nameAr: ev.target.value })} />}</Field>
        <Field label={tx('الاسم بالإنجليزية', 'Name in English')} optional>{(p) => <Input {...p} dir="ltr" value={d.nameEn} onChange={(ev) => set({ nameEn: ev.target.value })} />}</Field>
      </div>
      <Field label={tx('الطرق', 'Methods')} optional hint={tx('بلا اختيار = كل الطرق', 'None = all methods')}>
        {() => <ChipPicker label={tx('الطرق', 'Methods')} value={d.methods} onChange={(v) => set({ methods: v })} options={setup.methods.map((m) => ({ id: m.id, name: m.name }))} />}
      </Field>
      <p className="pt-1 text-sm font-semibold text-fg">{tx('عندما', 'When')}</p>
      {e.when && <Alert tone="bad">{tx('أضف شرطًا واحدًا على الأقل أو اختر طرقًا محددة؛ وإلا ستنطبق على كل سلة.', 'Add at least one condition or pick methods; otherwise it applies to every cart.')}</Alert>}
      <Field label={tx('المدن', 'Cities')} optional>{() => <ChipPicker label={tx('المدن', 'Cities')} value={d.cities} onChange={(v) => set({ cities: v })} options={SA_CITIES} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tx('السلة من (ر.س)', 'Cart from (SAR)')} optional error={e.cartMin ? money : e.range ? tx('الحد الأدنى أكبر من الأعلى', 'Minimum above maximum') : null}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.cartMin} onChange={(ev) => set({ cartMin: ev.target.value })} />}</Field>
        <Field label={tx('السلة حتى (ر.س)', 'Cart up to (SAR)')} optional error={e.cartMax ? money : null}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.cartMax} onChange={(ev) => set({ cartMax: ev.target.value })} />}</Field>
        <Field label={tx('الوزن من (كجم)', 'Weight from (kg)')} optional error={e.kgMin ? kg : null}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.kgMin} onChange={(ev) => set({ kgMin: ev.target.value })} />}</Field>
        <Field label={tx('الوزن حتى (كجم)', 'Weight up to (kg)')} optional error={e.kgMax ? kg : null}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.kgMax} onChange={(ev) => set({ kgMax: ev.target.value })} />}</Field>
      </div>
      <Field label={tx('السلة فيها فئة', 'Cart has a category')} optional>{() => <ChipPicker label={tx('الفئات', 'Categories')} value={d.cats} onChange={(v) => set({ cats: v })} options={cats} />}</Field>
      <Field label={tx('طريقة الدفع', 'Payment')}>{(p) => <Select {...p} value={d.cod} onChange={(ev) => set({ cod: ev.target.value as RuleDraft['cod'] })}>
        <option value="">{tx('أي طريقة', 'Any')}</option><option value="yes">{tx('الدفع عند الاستلام', 'Cash on delivery')}</option><option value="no">{tx('الدفع مسبقًا', 'Paid online')}</option>
      </Select>}</Field>
      <p className="pt-1 text-sm font-semibold text-fg">{tx('النتيجة', 'Then')}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tx('الإجراء', 'Action')}>{(p) => <Select {...p} value={d.then} onChange={(ev) => set({ then: ev.target.value as RuleDraft['then'] })}>
          <option value="free">{tx('اجعلها مجانية', 'Make it free')}</option><option value="hide">{tx('أخفِ الطريقة', 'Hide the method')}</option>
          <option value="price">{tx('سعر ثابت', 'Set a price')}</option><option value="surcharge">{tx('أضف رسومًا', 'Add a fee')}</option>
        </Select>}</Field>
        {(d.then === 'price' || d.then === 'surcharge') && <Field label={tx('المبلغ (ر.س)', 'Amount (SAR)')} error={e.value ? money : null}>{(p) => <Input {...p} dir="ltr" inputMode="decimal" value={d.value} onChange={(ev) => set({ value: ev.target.value })} />}</Field>}
      </div>
      {res.ok && <p className="rounded-xl bg-surface-2 p-3 text-[13px] text-muted">{(() => { const s = ruleSentence(res.rule, setup, cats, lang); return <><span className="font-medium text-fg">{tx('عندما ', 'When ')}</span>{s.when} {lang === 'ar' ? '←' : '→'} <span className="font-medium text-fg">{s.then}</span> · {s.methods}</>; })()}</p>}
    </Drawer>
  );
}
