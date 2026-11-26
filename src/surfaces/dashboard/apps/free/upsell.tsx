// Recommendations settings (`#/dashboard/apps/free/upsell`): minimum co-purchases, how many to show, product page and
// bag placements, manual picks and exclusions; the real top pairs; a preview of a product page block; results.
import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useLang } from '../../../../core/lang';
import { Badge, Button, Card, CardHeader, InfoHint, Money, useTx } from '../../../../ds/ui';
import { Field, Select, Switch } from '../../../../ds/kit';
import { ordersStore, productsStore } from '../../../merchant/stores';
import { useCatalog } from '../../../storefront/data';
import { UPSELL_DEFAULTS, coPurchases, suggestionsFor, topPairs, upsellProblems, upsellStats, type UpsellError, type UpsellSettings } from './upsell-model';
import { SuggestCard } from './upsell-store';
import { AppLayout, AppSaveBar, NumInput, PreviewFrame, Results, useAppDraft } from './store-kit';
import { storeAppsLog } from './store-runtime';
import type { FreeAppId } from './registry';

export default function UpsellScreen({ id }: { id: FreeAppId }) {
  const tx = useTx();
  const { lang } = useLang();
  const d = useAppDraft<UpsellSettings>(id, UPSELL_DEFAULTS, upsellProblems);
  const s = d.draft;
  const errs = d.errs as UpsellError[];
  const orders = ordersStore.use();
  const products = productsStore.use();
  const store = useCatalog();
  const log = storeAppsLog.use();
  const co = useMemo(() => coPurchases(orders, products), [orders, products]);
  const name = (pid: string) => products.find((p) => p.id === pid)?.name[lang] ?? pid;
  const live = products.filter((p) => p.status !== 'archived');
  const pairs = topPairs(co, Number.isFinite(s.minSupport) ? s.minSupport : 1, 8);
  const stats = upsellStats(log.adds, orders);
  const [focus, setFocus] = useState(() => pairs[0]?.a ?? store[0]?.id ?? '');
  const [pick, setPick] = useState('');
  const manual = s.manual[focus] ?? [];
  const sugg = focus ? suggestionsFor(focus, co, { ...s, minSupport: Number.isFinite(s.minSupport) ? s.minSupport : 1, maxShown: Number.isFinite(s.maxShown) ? s.maxShown : 3 }, store) : [];
  const byId = new Map(store.map((p) => [p.id, p]));
  const errText: Record<UpsellError, string> = { support: tx('من ١ إلى ١٠٠ طلب', '1–100 orders'), shown: tx('من ١ إلى ٦', '1–6'), nothing: tx('فعّل مكانًا واحدًا على الأقل', 'Turn on at least one place') };
  const setManual = (list: string[]) => d.set({ manual: { ...s.manual, [focus]: list } });

  const results = (
    <Results items={[
      { label: tx('إضافات من الاقتراحات', 'Adds from suggestions'), value: stats.adds },
      { label: tx('طلبات تضمّنتها', 'Orders with them'), value: stats.orders, hint: tx('طلب إلكتروني خلال ٧ أيام من الإضافة يحتوي المنتج نفسه', 'An online order within 7 days of the add that contains the same item') },
      { label: tx('إيراد منسوب', 'Attributed revenue'), value: <Money v={stats.revenue} /> },
      { label: tx('مرات الظهور', 'Impressions'), value: log.shown.upsell ?? 0, sim: true },
    ]} />
  );

  const settings = (
    <>
      <Card aria-labelledby="up-rules">
        <CardHeader id="up-rules" title={tx('القواعد', 'Rules')} hint={<InfoHint>{tx('لا يُقترح منتج نفد أو مخفي أو مقيّد أو موجود في الحقيبة.', 'Never suggests a product that is sold out, hidden, restricted or already in the bag.')}</InfoHint>} />
        <div className="space-y-4 px-5 pb-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={<>{tx('أقل عدد طلبات مشتركة', 'Min. orders together')}<InfoHint>{tx('يُقترح الزوج فقط إن اشتُري معًا في هذا العدد من الطلبات أو أكثر.', 'A pair is suggested only once bought together in at least this many orders.')}</InfoHint></>} error={errs.includes('support') ? errText.support : null}>{(p) => <NumInput {...p} value={s.minSupport} onChange={(n) => d.set({ minSupport: n })} />}</Field>
            <Field label={tx('عدد الاقتراحات في صفحة المنتج', 'Suggestions on a product page')} error={errs.includes('shown') ? errText.shown : null}>{(p) => <NumInput {...p} value={s.maxShown} onChange={(n) => d.set({ maxShown: n })} />}</Field>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3"><span className="text-sm font-medium text-fg">{tx('«يُشترى معه عادة» في صفحة المنتج', '“Often bought with” on product pages')}</span><Switch checked={s.productBlock} onChange={(v) => d.set({ productBlock: v })} label={tx('في صفحة المنتج', 'On product pages')} /></label>
          <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3"><span className="text-sm font-medium text-fg">{tx('اقتراح واحد في الحقيبة', 'One suggestion in the bag')}</span><Switch checked={s.bagSuggest} onChange={(v) => d.set({ bagSuggest: v })} label={tx('في الحقيبة', 'In the bag')} /></label>
          {errs.includes('nothing') && <p className="text-xs font-medium text-red-600 dark:text-red-400">{errText.nothing}</p>}
        </div>
      </Card>
      <Card aria-labelledby="up-pairs">
        <CardHeader id="up-pairs" title={tx('أكثر ما يُشترى معًا', 'Most bought together')} hint={<InfoHint>{tx('من دفتر طلباتك؛ دون الطلبات الملغاة والفاشلة.', 'From your order book, without cancelled or failed orders.')}</InfoHint>} />
        {pairs.length ? (
          <ul className="divide-y divide-border px-5 pb-3 text-sm">
            {pairs.map((x) => (
              <li key={`${x.a}-${x.b}`} className="flex items-center gap-3 py-2.5">
                <button type="button" className="min-w-0 flex-1 truncate text-start text-fg hover:underline" onClick={() => setFocus(x.a)}>{name(x.a)} <span className="text-muted">+</span> {name(x.b)}</button>
                <span className="shrink-0 text-xs text-muted tabular-nums">{tx(`${x.n} طلبًا`, `${x.n} orders`)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="px-5 pb-5 text-sm text-muted">{tx('لا أزواج تبلغ الحد بعد. خفّض الحد أو انتظر طلبات أكثر.', 'No pair reaches the minimum yet. Lower it or wait for more orders.')}</p>}
      </Card>
      <Card aria-labelledby="up-manual">
        <CardHeader id="up-manual" title={tx('اختيار يدوي واستبعاد', 'Manual picks & exclusions')} />
        <div className="space-y-4 px-5 pb-5">
          <Field label={tx('المنتج', 'Product')}>{(p) => <Select {...p} value={focus} onChange={(e) => setFocus(e.target.value)}>{live.map((x) => <option key={x.id} value={x.id}>{x.name[lang]}</option>)}</Select>}</Field>
          <div>
            <p className="mb-2 text-[13px] font-semibold text-fg">{tx('يظهر أولًا معه', 'Shown first with it')}</p>
            <div className="flex flex-wrap gap-2">
              {manual.map((m) => <Badge key={m} tone="brand">{name(m)}<button type="button" className="ms-1" aria-label={tx(`أزل ${name(m)}`, `Remove ${name(m)}`)} onClick={() => setManual(manual.filter((x) => x !== m))}><X className="size-3" aria-hidden="true" /></button></Badge>)}
              {!manual.length && <span className="text-xs text-muted">{tx('لا اختيار يدوي؛ تُستخدم الطلبات المشتركة.', 'No manual picks; co-purchases are used.')}</span>}
            </div>
            <div className="mt-2 flex gap-2">
              <Select aria-label={tx('أضف منتجًا', 'Add a product')} value={pick} onChange={(e) => setPick(e.target.value)} className="min-w-0 flex-1">
                <option value="">{tx('اختر منتجًا…', 'Choose a product…')}</option>
                {live.filter((x) => x.id !== focus && !manual.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name[lang]}</option>)}
              </Select>
              <Button variant="secondary" disabled={!pick} onClick={() => { setManual([...manual, pick]); setPick(''); }}><Plus className="size-4" aria-hidden="true" />{tx('أضف', 'Add')}</Button>
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
            <span className="text-sm text-fg">{tx('لا تقترح هذا المنتج أبدًا', 'Never suggest this product')}</span>
            <Switch checked={s.exclude.includes(focus)} onChange={(v) => d.set({ exclude: v ? [...s.exclude, focus] : s.exclude.filter((x) => x !== focus) })} label={tx('استبعاد المنتج', 'Exclude product')} />
          </label>
          {s.exclude.length > 0 && <p className="text-xs text-muted">{tx('مستبعد: ', 'Excluded: ')}{s.exclude.map(name).join(lang === 'ar' ? '، ' : ', ')}</p>}
        </div>
      </Card>
    </>
  );

  const preview = (
    <PreviewFrame page={focus ? name(focus) : undefined} note={tx('ما يراه العميل في صفحة هذا المنتج الآن، بالمخزون الحالي.', 'What a shopper sees on this product’s page now, with current stock.')}>
      {s.productBlock && sugg.length ? (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold">{tx('يُشترى معه عادة', 'Often bought with')}</p>
          <ul className="space-y-3">{sugg.map((x) => byId.get(x.id) && <SuggestCard key={x.id} p={byId.get(x.id)!} sug={x} from="product" preview />)}</ul>
        </div>
      ) : <p className="py-10 text-center text-sm text-muted">{s.productBlock ? tx('لا اقتراح لهذا المنتج بالحد الحالي.', 'No suggestion for this product at the current minimum.') : tx('الاقتراح في صفحة المنتج متوقف.', 'Product page suggestions are off.')}</p>}
    </PreviewFrame>
  );

  return (
    <>
      <AppLayout results={results} settings={settings} preview={preview} />
      <AppSaveBar d={d} error={errs.length ? errText[errs[0]] : undefined} />
    </>
  );
}
