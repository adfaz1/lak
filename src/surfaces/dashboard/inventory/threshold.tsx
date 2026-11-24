// Reorder point (low-stock threshold) for one or many SKU/location rows, with a preview of what moves in or out of
// "low", and the alert that follows (simulated delivery, one alert per crossing). Rules: merchant/inventory.ts.
import { useState } from 'react';
import { useLang } from '../../../core/lang';
import { LOCATIONS } from '../../merchant/domain';
import { setThresholds, syncStockAlerts, type Level } from '../../merchant/inventory';
import { levelsStore, stockAlertsStore } from '../../merchant/stores';
import { Button, InfoHint, useTx } from '../../../ds/ui';
import { Alert, Field, Input, Modal, Simulated, useToast } from '../../../ds/kit';
import { parseThreshold, thresholdPreview, type SkuInfo } from './model';

export function ThresholdModal({ rows, info, onClose, onSaved }: { rows: Level[]; info: (sku: string) => SkuInfo; onClose: () => void; onSaved?: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const same = rows.every((r) => r.threshold === rows[0]?.threshold);
  const [value, setValue] = useState(same && rows[0] ? String(rows[0].threshold) : '');
  const [tried, setTried] = useState(false);
  const n = parseThreshold(value);
  const pv = thresholdPreview(rows, n);
  const one = rows.length === 1 ? rows[0] : null;
  const save = () => {
    setTried(true);
    if (n === null) return;
    const next = setThresholds(levelsStore.get(), rows, n);
    if (!next) return;
    levelsStore.set(next);
    const r = syncStockAlerts(next, stockAlertsStore.get(), 'now', Date.now());
    stockAlertsStore.set(r.alerts);
    toast({ tone: 'ok', text: r.raised.length
      ? tx(`حُفظ حد إعادة الطلب. أُرسل ${r.raised.length} تنبيه (محاكاة).`, `Reorder point saved. ${r.raised.length} alert${r.raised.length === 1 ? '' : 's'} sent (simulated).`)
      : tx('حُفظ حد إعادة الطلب.', 'Reorder point saved.') });
    onSaved?.();
    onClose();
  };
  return (
    <Modal title={tx('حد إعادة الطلب', 'Reorder point')} onClose={onClose}
      description={one ? <>{info(one.sku).name[lang]}{info(one.sku).variant[lang] && ` · ${info(one.sku).variant[lang]}`} · {LOCATIONS[one.loc][lang]}</> : tx(`${rows.length} صفوف (صنف × موقع)`, `${rows.length} rows (SKU × location)`)}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={save}>{tx('احفظ', 'Save')}</Button></>}>
      <Field label={<span className="inline-flex items-center gap-1">{tx('نبّهني عندما يصل المتاح إلى', 'Alert me when available reaches')}<InfoHint>{tx('منخفض = المتاح ≤ هذا الرقم. 0 يعني التنبيه عند النفاد فقط.', 'Low = available ≤ this number. 0 alerts only when sold out.')}</InfoHint></span>}
        error={tried && n === null ? tx('عدد صحيح من 0 إلى 9999', 'A whole number from 0 to 9999') : undefined}>
        {(p) => <Input {...p} dir="ltr" inputMode="numeric" className="max-w-40" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />}
      </Field>
      {n !== null && (
        <dl className="grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-3 text-center text-xs" aria-live="polite">
          <div><dt className="text-muted">{tx('يصبح منخفضًا', 'Becomes low')}</dt><dd className="mt-0.5 text-base font-bold tabular-nums text-amber-700 dark:text-amber-300">{pv.becomeLow}</dd></div>
          <div><dt className="text-muted">{tx('يخرج من المنخفض', 'Leaves low')}</dt><dd className="mt-0.5 text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{pv.leaveLow}</dd></div>
          <div><dt className="text-muted">{tx('بلا تغيير', 'Unchanged')}</dt><dd className="mt-0.5 text-base font-bold tabular-nums text-fg">{pv.unchanged}</dd></div>
        </dl>
      )}
      {pv.becomeLow > 0 && <Alert tone="info">{tx(`سيُرسل تنبيه واحد لكل صف يصبح منخفضًا، ويظهر في الرئيسية.`, `One alert per row that becomes low is sent, and it shows on Home.`)} <Simulated /></Alert>}
    </Modal>
  );
}
