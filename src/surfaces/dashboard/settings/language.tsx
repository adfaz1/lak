// Language & region: admin language (personal, immediate), store languages and currency.
import { useState } from 'react';
import { useLang } from '../../../core/lang';
import { settingsStore, testStore } from '../../merchant/stores';
import { InfoHint, Segmented, useTx } from '../../../ds/ui';
import { SaveBar, Switch } from '../../../ds/kit';
import { canOpen, storeLangsError } from './model';
import { LeaveGuard, Section, settingsHref, useSave } from './common';

export default function LanguagePage() {
  const tx = useTx();
  const { lang, setLang } = useLang();
  const role = testStore.use().role;
  return (
    <>
      <Section id="lg-a" title={tx('لغة لوحة التحكم', 'Dashboard language')} hint={<InfoHint>{tx('لك وحدك وتتغير فورًا. لا تغيّر لغات المتجر ولا العملة.', 'Just for you and immediate. It doesn’t change store languages or currency.')}</InfoHint>}>
        <Segmented label={tx('لغة اللوحة', 'Dashboard language')} value={lang} onChange={setLang} options={[{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]} />
      </Section>
      {canOpen(role, 'store') ? <StoreRegion /> : (
        <Section id="lg-s" title={tx('لغات المتجر والعملة', 'Store languages and currency')}>
          <p className="text-sm text-muted">{tx('تحتاج صلاحية إعدادات المتجر لتغييرها.', 'You need store settings permission to change these.')}</p>
        </Section>
      )}
    </>
  );
}

function StoreRegion() {
  const tx = useTx();
  const s = settingsStore.use();
  const [langs, setLangs] = useState(s.storeLangs);
  const { saving, error, save, clearError } = useSave();
  const dirty = langs.ar !== s.storeLangs.ar || langs.en !== s.storeLangs.en;
  const bad = storeLangsError(langs);
  return (
    <Section id="lg-s" title={tx('لغات المتجر والعملة', 'Store languages and currency')}>
      <LeaveGuard dirty={dirty} />
      <ul className="divide-y divide-border rounded-xl border border-border">
        {([['ar', 'العربية', 'Arabic'], ['en', 'English', 'English']] as const).map(([k, ar, en]) => (
          <li key={k} className="flex items-center gap-4 px-4 py-3">
            <span className="min-w-0 flex-1 text-sm font-medium text-fg">{tx(ar, en)}</span>
            <Switch checked={langs[k]} onChange={(v) => { setLangs({ ...langs, [k]: v }); clearError(); }} label={tx(`عرض المتجر بـ${ar}`, `Show the store in ${en}`)} />
          </li>
        ))}
      </ul>
      {bad && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400" role="alert">{tx('اختر لغة واحدة على الأقل', 'Choose at least one language')}</p>}
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-surface-2 p-3"><dt className="flex items-center gap-1 text-xs text-muted">{tx('العملة الأساسية', 'Primary currency')}<InfoHint>{tx('العملات المتعددة غير متاحة في هذه النسخة.', 'Multiple currencies aren’t available in this version.')}</InfoHint></dt><dd className="mt-1 text-sm font-semibold text-fg">{tx('ريال سعودي', 'Saudi riyal')} <bdi dir="ltr">(SAR)</bdi></dd></div>
        <div className="rounded-xl bg-surface-2 p-3"><dt className="text-xs text-muted">{tx('المنطقة الزمنية', 'Time zone')}</dt><dd className="mt-1 text-sm font-semibold text-fg"><bdi dir="ltr">{s.store.timezone}</bdi> · <a href={settingsHref('store')} className="text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('غيّر', 'Change')}</a></dd></div>
      </dl>
      <SaveBar dirty={dirty} saving={saving} error={error ?? (bad ? tx('اختر لغة واحدة على الأقل', 'Choose at least one language') : undefined)} onDiscard={() => { setLangs(s.storeLangs); clearError(); }}
        onSave={() => { if (bad) return; save(() => settingsStore.set((x) => ({ ...x, storeLangs: langs })), tx('حُفظت لغات المتجر', 'Store languages saved')); }} />
    </Section>
  );
}
