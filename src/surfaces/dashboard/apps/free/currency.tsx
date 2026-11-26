// Gulf currency switcher app (`#/dashboard/apps/free/currency`): which GCC currencies shoppers can pick, the rate the
// merchant enters for each (an automatic source is pending approval), the rounding rule, and a preview of the store's
// approximate prices with the note that payment is in SAR.
import { ExternalLink, Info } from 'lucide-react';
import { useLang } from '../../../../core/lang';
import { link } from '../../../../core/router';
import { productsStore } from '../../../merchant/stores';
import { Badge, Card, CardHeader, LinkButton, Money, Segmented, cn, useTx } from '../../../../ds/ui';
import { Field, Input, SaveBar, Select, Switch, useToast } from '../../../../ds/kit';
import { freeAppsStore } from './registry';
import {
  GCC, GCC_INFO, ROUNDINGS, approx, currencyErrors, currencySettingsOf, formatApprox, pendingCurrencies, rateError, shownCurrencies,
  type CurrencySettings, type Gcc, type Rounding,
} from './currency-model';
import { AppStates, useAppForm } from './integrations-ui';

export default function CurrencyApp() {
  return <AppStates><Screen /></AppStates>;
}

function Screen() {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const saved = currencySettingsOf(freeAppsStore.use().currency?.settings as Partial<CurrencySettings>);
  type Form = Pick<CurrencySettings, 'rates' | 'rounding'>;
  const f = useAppForm<Form>('currency', { rates: saved.rates, rounding: saved.rounding }, { ar: 'إعدادات العملات', en: 'Currency settings' });
  const d = f.draft;
  const s: CurrencySettings = { ...saved, ...d };
  const errs = currencyErrors(s);
  const shown = shownCurrencies(s);
  const pending = pendingCurrencies(s);
  const products = productsStore.use().filter((p) => p.status === 'active' && p.channels.online).slice(0, 4);
  const setRate = (c: Gcc, patch: Partial<CurrencySettings['rates'][Gcc]>) => f.set({ rates: { ...d.rates, [c]: { ...d.rates[c], ...patch } } });
  const roundName: Record<Rounding, string> = { exact: tx('دون تقريب', 'No rounding'), nearest: tx('لأقرب عدد صحيح', 'To the nearest whole'), up: tx('للأعلى لعدد صحيح', 'Up to a whole number') };
  const save = () => {
    if (errs.length) return;
    const changed = GCC.some((c) => d.rates[c].rate !== saved.rates[c].rate || d.rates[c].on !== saved.rates[c].on || d.rates[c].mode !== saved.rates[c].mode);
    f.commit({ ...d, ...(changed ? { ratesAt: new Date().toISOString() } : {}) } as Form, { ar: `حفظ عملات العرض (${shown.join('، ') || 'لا شيء'})`, en: `Saved display currencies (${shown.join(', ') || 'none'})` });
  };
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader id="cur-rates" title={tx('العملات والأسعار', 'Currencies and rates')} hint={tx('سعر الصرف يكتبه التاجر: كم ريالًا تساوي وحدة واحدة. الأسعار في المتجر تقريبية والدفع بالريال دائمًا.', 'You type each rate: how many riyals one unit is worth. Store prices are approximate; payment is always in SAR.')}
          action={<Badge tone={shown.length ? 'green' : 'gray'}>{tx(`${shown.length} ظاهرة`, `${shown.length} shown`)}</Badge>} />
        <div className="space-y-4 px-5 pb-5">
          <ul className="divide-y divide-border rounded-xl border border-border">
            {GCC.map((c) => {
              const r = d.rates[c];
              const e = rateError(r);
              return (
                <li key={c} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Switch checked={r.on} onChange={(v) => setRate(c, { on: v })} label={tx(`اعرض ${GCC_INFO[c].ar}`, `Show ${GCC_INFO[c].en}`)} />
                  <span className="min-w-[8rem] flex-1 text-sm font-medium text-fg">{GCC_INFO[c][lang]} <bdi dir="ltr" className="text-xs text-muted">{c}</bdi></span>
                  {r.on && (
                    <>
                      <Segmented label={tx(`مصدر سعر ${c}`, `${c} rate source`)} value={r.mode} onChange={(v) => setRate(c, { mode: v })} options={[{ value: 'manual', label: tx('يدوي', 'Manual') }, { value: 'auto', label: tx('تلقائي', 'Automatic') }]} />
                      {r.mode === 'manual' ? (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted" dir="ltr">1 {c} =</span>
                          <Field label={tx(`سعر ${c} بالريال`, `${c} rate in SAR`)} className="w-28 [&>label]:sr-only" error={e === 'empty' ? tx('أدخل السعر', 'Enter the rate') : e === 'invalid' ? tx('رقم بين ٠٫٠١ و١٠٠', '0.01 to 100') : null}>
                            {(p) => <Input {...p} dir="ltr" inputMode="decimal" value={r.rate} onChange={(ev) => setRate(c, { rate: ev.target.value })} />}
                          </Field>
                          <span className="text-muted">{tx('ر.س', 'SAR')}</span>
                        </div>
                      ) : <Badge tone="amber">{tx('بانتظار الاعتماد', 'Awaiting approval')}</Badge>}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {pending.length > 0 && <p className="flex items-start gap-1.5 text-xs text-muted"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{tx('مصدر الأسعار التلقائي لم يُعتمد بعد؛ هذه العملات لا تظهر حتى تُدخل سعرًا يدويًا.', 'The automatic rate source isn’t approved yet; these currencies stay hidden until you enter a manual rate.')} <bdi dir="ltr">{pending.join(', ')}</bdi></p>}
          <Field label={tx('التقريب', 'Rounding')} className="max-w-xs">{(p) => <Select {...p} value={d.rounding} onChange={(e) => f.set({ rounding: e.target.value as Rounding })}>{ROUNDINGS.map((r) => <option key={r} value={r}>{roundName[r]}</option>)}</Select>}</Field>
        </div>
      </Card>

      <Card>
        <CardHeader id="cur-pv" title={tx('ما يراه العميل', 'What shoppers see')} action={<LinkButton size="sm" variant="ghost" href={link('/store')} target="_blank" rel="noopener"><ExternalLink className="size-4" aria-hidden="true" />{tx('افتح المتجر', 'Open the store')}</LinkButton>} />
        <div className="space-y-3 px-5 pb-5">
          {!shown.length ? <p className="text-sm text-muted">{tx('لا عملة ظاهرة: لن يظهر اختيار العملة في المتجر.', 'No currency shown: the store won’t show a currency picker.')}</p> : (
            <>
              <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-[13px] text-amber-900 dark:text-amber-200">{tx('الأسعار بالعملات الأخرى تقريبية؛ يتم الدفع بالريال السعودي.', 'Prices in other currencies are approximate; you pay in Saudi riyals.')}</p>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="bg-surface-2 text-xs text-muted"><tr><th className="px-3 py-2 text-start font-medium">{tx('المنتج', 'Product')}</th><th className="px-3 py-2 text-end font-medium"><bdi>SAR</bdi></th>{shown.map((c) => <th key={c} className="px-3 py-2 text-end font-medium"><bdi dir="ltr">≈ {c}</bdi></th>)}</tr></thead>
                  <tbody className="divide-y divide-border">{products.map((p) => (
                    <tr key={p.id}><td className="px-3 py-2 text-fg">{p.name[lang]}</td><td className="px-3 py-2 text-end"><Money v={p.price} /></td>{shown.map((c) => { const v = approx(p.price, c, s); return <td key={c} className={cn('px-3 py-2 text-end tabular-nums text-muted')}><bdi>{v === null ? '—' : formatApprox(v, c, s, lang)}</bdi></td>; })}</tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </Card>

      <SaveBar dirty={f.dirty} saving={f.saving} onSave={save} onDiscard={() => { f.discard(); toast({ tone: 'info', text: tx('تُجوهلت التعديلات', 'Edits discarded') }); }}
        error={errs.length ? tx(`أدخل سعرًا صحيحًا لـ ${errs.join('، ')}`, `Enter a valid rate for ${errs.join(', ')}`) : undefined} />
    </div>
  );
}
