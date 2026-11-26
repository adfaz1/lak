// Honest social proof settings (`#/dashboard/apps/free/proof`): recent purchases (initial or no name, city, window)
// and the low-stock line threshold; a preview from a real product's real orders and stock; impressions (simulated).
import { useState } from 'react';
import { useLang } from '../../../../core/lang';
import { Card, CardHeader, InfoHint, Segmented, useTx } from '../../../../ds/ui';
import { Alert, Field, Select, Switch } from '../../../../ds/kit';
import { ordersStore } from '../../../merchant/stores';
import { useCatalog } from '../../../storefront/data';
import { PROOF_DEFAULTS, lowStockLeft, proofProblems, recentBuys, type ProofError, type ProofSettings } from './proof-model';
import { ProofLines } from './proof-store';
import { useMinute } from './livechat-store';
import { AppLayout, AppSaveBar, NumInput, PreviewFrame, Results, useAppDraft } from './store-kit';
import { storeAppsLog } from './store-runtime';
import type { FreeAppId } from './registry';

export default function ProofScreen({ id }: { id: FreeAppId }) {
  const tx = useTx();
  const { lang } = useLang();
  const d = useAppDraft<ProofSettings>(id, PROOF_DEFAULTS, proofProblems);
  const s = d.draft;
  const errs = d.errs as ProofError[];
  const orders = ordersStore.use();
  const store = useCatalog();
  const log = storeAppsLog.use();
  const now = useMinute();
  const ok = { ...s, windowHours: Number.isFinite(s.windowHours) ? s.windowHours : 48, lowAt: Number.isFinite(s.lowAt) ? s.lowAt : 3 };
  const skus = (pid: string) => store.find((p) => p.id === pid)?.variants.flatMap((v) => (v.sku ? [v.sku] : [])) ?? [];
  const withProof = store.filter((p) => recentBuys(orders, skus(p.id), ok, now, 1).length > 0).length;
  const lowNow = store.flatMap((p) => p.variants).filter((v) => lowStockLeft(v.stock, ok) !== null).length;
  const [pid, setPid] = useState(() => store.find((p) => recentBuys(orders, skus(p.id), ok, now, 1).length)?.id ?? store[0]?.id ?? '');
  const p = store.find((x) => x.id === pid);
  const [vid, setVid] = useState('');
  const v = p?.variants.find((x) => x.id === vid) ?? (p?.variants.length === 1 ? p.variants[0] : p?.variants.find((x) => lowStockLeft(x.stock, ok) !== null) ?? p?.variants[0]);
  const buy = p && s.recent ? recentBuys(orders, skus(p.id), ok, now, 1)[0] ?? null : null;
  const left = v ? lowStockLeft(v.stock, ok) : null;
  const errText: Record<ProofError, string> = { nothing: tx('فعّل نوعًا واحدًا على الأقل', 'Turn on at least one'), window: tx('من ١ إلى ١٦٨ ساعة', '1–168 hours'), lowAt: tx('من ١ إلى ٢٠ قطعة', '1–20 units') };

  const results = (
    <Results items={[
      { label: tx('مرات الظهور', 'Impressions'), value: log.shown.proof ?? 0, sim: true },
      { label: tx('منتجات لها شراء حديث', 'Products with a recent buy'), value: withProof, hint: tx('ضمن نافذة الأيام التي حددتها', 'Within the window you set') },
      { label: tx('خيارات منخفضة المخزون', 'Low-stock options'), value: lowNow },
      { label: tx('المنتجات في المتجر', 'Products in the store'), value: store.length },
    ]} />
  );

  const settings = (
    <>
      <Card aria-labelledby="pf-recent">
        <CardHeader id="pf-recent" title={tx('مشتريات حديثة', 'Recent purchases')} hint={<InfoHint>{tx('من طلبات مدفوعة حقيقية فقط. لا اسم كامل أبدًا.', 'From real paid orders only. Never a full name.')}</InfoHint>}
          action={<Switch checked={s.recent} onChange={(x) => d.set({ recent: x })} label={tx('مشتريات حديثة', 'Recent purchases')} />} />
        {s.recent && (
          <div className="space-y-4 px-5 pb-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[13px] font-semibold text-fg">{tx('اسم المشتري', 'Buyer name')}</span>
              <Segmented label={tx('اسم المشتري', 'Buyer name')} value={s.name} onChange={(x) => d.set({ name: x })} options={[{ value: 'initial', label: tx('الحرف الأول', 'First initial') }, { value: 'none', label: tx('بلا اسم', 'No name') }]} />
            </div>
            <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3"><span className="text-sm text-fg">{tx('أظهر المدينة', 'Show the city')}</span><Switch checked={s.city} onChange={(x) => d.set({ city: x })} label={tx('أظهر المدينة', 'Show the city')} /></label>
            <Field label={tx('خلال آخر (ساعات)', 'Within the last (hours)')} error={errs.includes('window') ? errText.window : null}>{(pp) => <NumInput {...pp} value={s.windowHours} onChange={(n) => d.set({ windowHours: n })} />}</Field>
          </div>
        )}
      </Card>
      <Card aria-labelledby="pf-low">
        <CardHeader id="pf-low" title={tx('تنبيه المخزون المنخفض', 'Low-stock line')} hint={<InfoHint>{tx('يظهر فقط حين يكون المتاح للبيع فعلًا عند الحد أو أقل.', 'Shows only when stock really available to sell is at or below the threshold.')}</InfoHint>}
          action={<Switch checked={s.lowStock} onChange={(x) => d.set({ lowStock: x })} label={tx('تنبيه المخزون المنخفض', 'Low-stock line')} />} />
        {s.lowStock && <div className="px-5 pb-5"><Field label={tx('يظهر عند (قطع أو أقل)', 'Show at (units or fewer)')} error={errs.includes('lowAt') ? errText.lowAt : null}>{(pp) => <NumInput {...pp} value={s.lowAt} onChange={(n) => d.set({ lowAt: n })} />}</Field></div>}
      </Card>
      {errs.includes('nothing') && <Alert tone="warn">{errText.nothing}</Alert>}
    </>
  );

  const preview = (
    <PreviewFrame page={p?.name[lang]} note={tx('من طلبات هذا المنتج ومخزونه الفعلي الآن.', 'From this product’s real orders and stock now.')}>
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <Select aria-label={tx('المنتج', 'Product')} value={pid} onChange={(e) => { setPid(e.target.value); setVid(''); }}>{store.map((x) => <option key={x.id} value={x.id}>{x.name[lang]}</option>)}</Select>
        {p && p.variants.length > 1 && <Select aria-label={tx('الخيار', 'Option')} value={v?.id ?? ''} onChange={(e) => setVid(e.target.value)}>{p.variants.map((x) => <option key={x.id} value={x.id}>{[x.color, x.size].filter(Boolean).join(' · ') || x.sku} ({x.stock === Number.POSITIVE_INFINITY ? '∞' : x.stock})</option>)}</Select>}
      </div>
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-base font-semibold">{p?.name[lang]}</p>
        <div className="mt-3">{buy || left !== null ? <ProofLines buy={buy} left={left} now={now} /> : <p className="text-sm text-muted">{tx('لا شيء يظهر لهذا المنتج الآن؛ لا شراء حديث ولا مخزون منخفض.', 'Nothing shows for this product now: no recent buy and no low stock.')}</p>}</div>
      </div>
    </PreviewFrame>
  );

  return (
    <>
      <AppLayout results={results} settings={settings} preview={preview} />
      <AppSaveBar d={d} error={errs.length ? errText[errs[0]] : undefined} />
    </>
  );
}
