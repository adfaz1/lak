// Store details: name, category, contact, time zone and units.
import { useState } from 'react';
import { settingsStore } from '../../merchant/stores';
import type { StoreDetails } from '../../merchant/workspace';
import { InfoHint, useTx } from '../../../ds/ui';
import { Field, Input, SaveBar, Select } from '../../../ds/kit';
import { NAME_MAX, STORE_CATEGORIES, TIMEZONES, hasErrors, same, validateStore } from './model';
import { LeaveGuard, Section, useSave } from './common';

const CAT_LABEL: Record<(typeof STORE_CATEGORIES)[number], [string, string]> = {
  fashion: ['أزياء', 'Fashion'], beauty: ['تجميل', 'Beauty'], home: ['منزل', 'Home'], food: ['أغذية', 'Food'], electronics: ['إلكترونيات', 'Electronics'],
  digital: ['منتجات رقمية', 'Digital products'], dropshipping: ['دروب شيبنق', 'Dropshipping'], charity: ['خيري', 'Charity'],
};

export default function StorePage() {
  const tx = useTx();
  const saved = settingsStore.use().store;
  const [d, setD] = useState<StoreDetails>(saved);
  const [tried, setTried] = useState(false);
  const { saving, error, save, clearError } = useSave();
  const dirty = !same(d, saved);
  const errs = validateStore(d);
  const msg = (k: keyof typeof errs) => {
    if (!tried || !errs[k]) return null;
    return errs[k] === 'required' ? tx('مطلوب', 'Required') : errs[k] === 'tooLong' ? tx(`${NAME_MAX} حرفًا كحد أقصى`, `${NAME_MAX} characters maximum`) : k === 'email' ? tx('بريد غير صالح', 'Invalid email') : tx('رقم جوال سعودي، مثل 05xxxxxxxx', 'A Saudi mobile, e.g. 05xxxxxxxx');
  };
  const set = (p: Partial<StoreDetails>) => { setD({ ...d, ...p }); clearError(); };
  const onSave = () => {
    setTried(true);
    if (hasErrors(errs)) return;
    save(() => { settingsStore.set((x) => ({ ...x, store: { ...d, name: d.name.trim(), email: d.email.trim() } })); setTried(false); }, tx('حُفظت بيانات المتجر', 'Store details saved'));
  };

  return (
    <>
      <LeaveGuard dirty={dirty} />
      <Section id="st-h" title={tx('هوية المتجر', 'Store identity')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tx('اسم المتجر', 'Store name')} error={msg('name')} hint={<span className="tabular-nums">{d.name.length}/{NAME_MAX}</span>}>
            {(p) => <Input {...p} value={d.name} maxLength={NAME_MAX + 20} onChange={(e) => set({ name: e.target.value })} />}
          </Field>
          <Field label={tx('فئة المتجر', 'Store category')}>
            {(p) => <Select {...p} value={d.category} onChange={(e) => set({ category: e.target.value })}>{STORE_CATEGORIES.map((c) => <option key={c} value={c}>{tx(...CAT_LABEL[c])}</option>)}</Select>}
          </Field>
        </div>
      </Section>
      <Section id="st-c" title={tx('التواصل', 'Contact')} hint={<InfoHint>{tx('يظهر للعملاء في تذييل المتجر وصفحة التواصل، وتصلك عليه تنبيهات المتجر.', 'Shown to shoppers in the store footer and contact page; store alerts go here too.')}</InfoHint>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tx('بريد التواصل', 'Contact email')} error={msg('email')}>
            {(p) => <Input {...p} type="email" dir="ltr" autoComplete="email" value={d.email} onChange={(e) => set({ email: e.target.value })} />}
          </Field>
          <Field label={tx('جوال التواصل', 'Contact mobile')} error={msg('phone')} optional>
            {(p) => <Input {...p} type="tel" dir="ltr" autoComplete="tel" value={d.phone} onChange={(e) => set({ phone: e.target.value })} />}
          </Field>
        </div>
      </Section>
      <Section id="st-r" title={tx('التوقيت والوحدات', 'Time zone and units')} hint={<InfoHint>{tx('المنطقة الزمنية تحدد بداية اليوم في التقارير ومواعيد الطلبات.', 'The time zone sets when a day starts in reports and order times.')}</InfoHint>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tx('المنطقة الزمنية', 'Time zone')}>
            {(p) => <Select {...p} dir="ltr" value={d.timezone} onChange={(e) => set({ timezone: e.target.value })}>{TIMEZONES.map((z) => <option key={z} value={z}>{z}</option>)}</Select>}
          </Field>
          <Field label={tx('وحدة الوزن', 'Weight unit')}>
            {(p) => <Select {...p} value={d.weightUnit} onChange={(e) => set({ weightUnit: e.target.value as StoreDetails['weightUnit'] })}><option value="kg">{tx('كيلوغرام (كجم)', 'Kilogram (kg)')}</option><option value="g">{tx('غرام (غ)', 'Gram (g)')}</option></Select>}
          </Field>
        </div>
      </Section>
      <SaveBar dirty={dirty} saving={saving} error={error ?? (tried && hasErrors(errs) ? tx('صحّح الحقول المعلّمة ثم احفظ', 'Fix the marked fields, then save') : undefined)} onSave={onSave}
        onDiscard={() => { setD(saved); setTried(false); clearError(); }} />
    </>
  );
}
