// International readiness per product: HS code, weight, origin, Arabic/English customs description, readiness %,
// with bulk fill (empty fields only) and a preview before anything changes.
import { useMemo, useState } from 'react';
import { Globe2, Pencil, SearchX, Wand2 } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { replace, useRoute } from '../../../core/router';
import type { Product } from '../../merchant/catalog';
import type { IntlData } from '../../merchant/workspace';
import { Badge, Button, EmptyState, IconButton, InfoHint, LinkButton, ProductImage, Ref, cn, useTx } from '../../../ds/ui';
import { Alert, BulkBar, Checkbox, DataTable, Drawer, Field, FilterChip, Input, Modal, Pagination, SearchInput, Select, type Column } from '../../../ds/kit';
import { useUnsaved } from '../unsaved';
import { productPhoto } from '../model/media';
import { sectionHref } from '../pages';
import { useSessionDraft } from './drafts';
import { Section, useSave } from './common';
import { HS_BY_CAT, ORIGINS, bulkFill, catKey, countryName, readiness, validHs, type IntlField } from './shipping-model';
import { commitShipping, shipHref, useShipping } from './shipping-ui';

const PER = 8;
const FIELD_LABEL: Record<IntlField, { ar: string; en: string }> = {
  hs: { ar: 'رمز HS', en: 'HS code' }, weight: { ar: 'الوزن', en: 'Weight' }, origin: { ar: 'المنشأ', en: 'Origin' }, descAr: { ar: 'الوصف العربي', en: 'Arabic description' }, descEn: { ar: 'الوصف الإنجليزي', en: 'English description' },
};

export default function IntlTab() {
  const tx = useTx();
  const { lang } = useLang();
  const route = useRoute();
  const { setup, products } = useShipping();
  const q = route.query.get('q') ?? '';
  const st = route.query.get('ready') ?? '';
  const page = Math.max(1, Number(route.query.get('page')) || 1);
  const go = (p: Record<string, string | undefined>) => replace(shipHref('intl', { q: q || undefined, ready: st || undefined, ...p }));
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);
  const [fill, setFill] = useState(false);
  const [edit, setEdit] = useState<Product | null>(null);

  const physical = products.filter((p) => p.type !== 'digital' && p.status !== 'archived');
  const rows = physical.map((p) => ({ p, r: readiness(p, setup.intl[p.id]) }));
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((x) => (!needle || `${x.p.name.ar} ${x.p.name.en} ${x.p.sku}`.toLowerCase().includes(needle))
    && (!st || (st === 'ready' ? x.r.pct === 100 : x.r.pct < 100)));
  const pages = Math.max(1, Math.ceil(shown.length / PER));
  const cur = Math.min(page, pages);
  const pageRows = shown.slice((cur - 1) * PER, cur * PER);
  const ready = rows.filter((x) => x.r.pct === 100).length;
  const scopeIds = all ? shown.map((x) => x.p.id) : [...sel];
  const clearSel = () => { setSel(new Set()); setAll(false); };

  const bar = (pct: number) => (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2" aria-hidden="true"><span className={cn('block h-full rounded-full', pct === 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${pct}%` }} /></span>
      <span className="text-xs tabular-nums text-fg">{pct}%</span>
    </span>
  );
  const missing = (m: IntlField[]) => (m.length ? <span className="text-xs text-muted">{m.map((f) => FIELD_LABEL[f][lang]).join(tx('، ', ', '))}</span> : <Badge tone="green">{tx('جاهز', 'Ready')}</Badge>);
  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'p', header: tx('المنتج', 'Product'), cell: ({ p }) => <span className="flex items-center gap-3"><ProductImage src={productPhoto(p.id)} alt="" size={36} /><span className="min-w-0"><span className="block truncate font-medium text-fg">{p.name[lang]}</span><span className="block text-xs text-muted"><Ref>{p.sku}</Ref></span></span></span> },
    { key: 'hs', header: tx('رمز HS', 'HS'), cell: ({ p }) => <Ref>{setup.intl[p.id]?.hs || '—'}</Ref>, hideBelow: 'lg' },
    { key: 'o', header: tx('المنشأ', 'Origin'), cell: ({ p }) => (setup.intl[p.id]?.origin ? countryName(setup.intl[p.id].origin)[lang] : '—'), hideBelow: 'lg' },
    { key: 'r', header: tx('الجاهزية', 'Readiness'), cell: ({ r }) => bar(r.pct) },
    { key: 'm', header: tx('الناقص', 'Missing'), cell: ({ r }) => missing(r.missing) },
    { key: 'a', header: <span className="sr-only">{tx('إجراء', 'Action')}</span>, align: 'end', cell: ({ p }) => <IconButton label={tx(`تعديل بيانات ${p.name.ar}`, `Edit customs data for ${p.name.en}`)} onClick={() => setEdit(p)}><Pencil className="size-4" aria-hidden="true" /></IconButton> },
  ];

  return (
    <>
      <Section id="in-h" flush title={tx('جاهزية الشحن الدولي', 'International readiness')}
        hint={<InfoHint>{tx('الشحن الدولي يظهر للعميل فقط إذا كانت كل منتجات سلته جاهزة 100%. الوزن من صفحة المنتج.', 'International shipping shows only when every product in the cart is 100% ready. Weight comes from the product page.')}</InfoHint>}
        action={<span className="text-[13px] text-muted tabular-nums">{tx(`${ready} من ${rows.length} جاهز`, `${ready} of ${rows.length} ready`)}</span>}>
        <div className="space-y-3 px-5 pb-3">
          {sel.size > 0 || all ? (
            <BulkBar count={scopeIds.length} onClear={clearSel}
              scope={all ? tx(`كل ${shown.length} نتيجة`, `All ${shown.length} results`) : (
                <>{tx(`${sel.size} في هذه الصفحة`, `${sel.size} on this page`)}{shown.length > pageRows.length && <> · <button type="button" className="font-semibold text-brand-700 hover:underline dark:text-brand-300" onClick={() => setAll(true)}>{tx(`حدد كل ${shown.length}`, `Select all ${shown.length}`)}</button></>}</>
              )}>
              <Button size="sm" onClick={() => setFill(true)}><Wand2 className="size-4" aria-hidden="true" />{tx('تعبئة تلقائية', 'Auto-fill')}</Button>
            </BulkBar>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={q} onChange={(v) => go({ q: v || undefined, page: undefined })} placeholder={tx('ابحث بالاسم أو SKU', 'Search name or SKU')} />
              <FilterChip label={tx('الحالة', 'Status')} value={st} onChange={(v) => go({ ready: v || undefined, page: undefined })} options={[{ value: 'ready', label: tx('جاهز', 'Ready') }, { value: 'missing', label: tx('ناقص', 'Incomplete') }]} />
            </div>
          )}
        </div>
        {shown.length === 0 ? (
          rows.length === 0
            ? <EmptyState icon={<Globe2 className="size-6" aria-hidden="true" />} title={tx('لا منتجات تُشحن', 'No shippable products')} action={<LinkButton href={sectionHref('products', 'new')}>{tx('أضف منتجًا', 'Add a product')}</LinkButton>} />
            : <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={tx('لا منتجات تطابق', 'No products match')} action={<LinkButton variant="secondary" href={shipHref('intl')}>{tx('امسح التصفية', 'Clear filters')}</LinkButton>} />
        ) : (
          <div className="border-t border-border">
            <DataTable label={tx('جاهزية المنتجات', 'Product readiness')} rows={pageRows} columns={cols} rowKey={(x) => x.p.id}
              selected={all ? new Set(pageRows.map((x) => x.p.id)) : sel} onSelect={(k, on) => { setAll(false); setSel((s) => { const n = new Set(s); if (on) n.add(k); else n.delete(k); return n; }); }}
              card={({ p, r }) => (
                <div className="flex items-start gap-3">
                  <ProductImage src={productPhoto(p.id)} alt="" size={40} />
                  <div className="min-w-0 flex-1 space-y-1"><p className="truncate text-sm font-medium text-fg">{p.name[lang]}</p>{bar(r.pct)}{missing(r.missing)}</div>
                  <IconButton label={tx(`تعديل بيانات ${p.name.ar}`, `Edit customs data for ${p.name.en}`)} onClick={() => setEdit(p)}><Pencil className="size-4" aria-hidden="true" /></IconButton>
                </div>
              )} />
            <Pagination page={cur} pages={pages} total={shown.length} hrefFor={(n) => shipHref('intl', { q: q || undefined, ready: st || undefined, page: String(n) })} />
          </div>
        )}
      </Section>
      {fill && <FillModal ids={scopeIds} onClose={() => setFill(false)} onDone={() => { setFill(false); clearSel(); }} />}
      {edit && <IntlDrawer key={edit.id} p={edit} data={setup.intl[edit.id]} onClose={() => setEdit(null)} />}
    </>
  );
}

function FillModal({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const { setup, products } = useShipping();
  const [hs, setHs] = useState(true);
  const [origin, setOrigin] = useState('SA');
  const [desc, setDesc] = useState(true);
  const { saving, error, save } = useSave();
  const res = useMemo(() => bulkFill(setup.intl, products, ids, { hs, origin: origin || null, desc }), [setup.intl, products, ids, hs, origin, desc]);
  const before = (id: string) => readiness(products.find((p) => p.id === id)!, setup.intl[id]).pct;
  const after = (id: string) => readiness(products.find((p) => p.id === id)!, res.intl[id]).pct;
  return (
    <Modal size="lg" title={tx(`تعبئة تلقائية لـ ${ids.length} منتج`, `Auto-fill ${ids.length} products`)} onClose={onClose}
      description={tx('نملأ الخانات الفارغة فقط؛ ما كتبته لا يتغير. رمز HS اقتراح حسب الفئة، راجعه مع مخلّصك.', 'Only empty fields are filled; what you typed stays. HS codes are suggestions by category; confirm them with your broker.')}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button disabled={saving || !res.changed.length} onClick={() => save(() => {
        commitShipping({ ...setup, intl: res.intl }, { ar: `عبّأ بيانات الشحن الدولي لـ ${res.changed.length} منتج`, en: `Auto-filled international data for ${res.changed.length} products` }, { after: res.changed.join(', ') });
        onDone();
      }, tx(`حُدّث ${res.changed.length} منتج`, `${res.changed.length} products updated`))}>{saving ? tx('جارٍ الحفظ…', 'Saving…') : tx(`حدّث ${res.changed.length} منتج`, `Update ${res.changed.length} products`)}</Button></>}>
      {error && <Alert tone="bad">{error}</Alert>}
      <div className="space-y-3">
        <label className="flex items-center gap-2.5 text-sm text-fg"><Checkbox checked={hs} onChange={setHs} label={tx('رمز HS المقترح لفئة المنتج', 'Suggested HS code for the product’s category')} />{tx('رمز HS المقترح لفئة المنتج', 'Suggested HS code for the product’s category')}</label>
        <label className="flex items-center gap-2.5 text-sm text-fg"><Checkbox checked={desc} onChange={setDesc} label={tx('الوصفان من اسم المنتج', 'Descriptions from the product name')} />{tx('الوصفان من اسم المنتج', 'Descriptions from the product name')}</label>
        <Field label={tx('بلد المنشأ', 'Country of origin')} className="sm:max-w-xs">{(p) => <Select {...p} value={origin} onChange={(e) => setOrigin(e.target.value)}><option value="">{tx('لا تغيّر', 'Leave as is')}</option>{ORIGINS.map((o) => <option key={o.id} value={o.id}>{o.name[lang]}</option>)}</Select>}</Field>
      </div>
      {res.changed.length === 0 ? <p className="rounded-xl bg-surface-2 p-3 text-[13px] text-muted">{tx('لا خانات فارغة يمكن ملؤها بهذه الخيارات.', 'No empty fields these options can fill.')}</p> : (
        <ul className="divide-y divide-border rounded-xl border border-border text-[13px]">
          {res.changed.slice(0, 8).map((id) => (
            <li key={id} className="flex items-center gap-3 px-3 py-2"><span className="min-w-0 flex-1 truncate text-fg">{products.find((p) => p.id === id)?.name[lang]}</span><span className="tabular-nums text-muted">{before(id)}% {lang === 'ar' ? '←' : '→'} <span className="font-semibold text-fg">{after(id)}%</span></span></li>
          ))}
          {res.changed.length > 8 && <li className="px-3 py-2 text-xs text-muted">{tx(`و${res.changed.length - 8} منتجًا آخر`, `and ${res.changed.length - 8} more`)}</li>}
        </ul>
      )}
    </Modal>
  );
}

function IntlDrawer({ p, data, onClose }: { p: Product; data: IntlData | undefined; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const { setup } = useShipping();
  const base = useMemo<IntlData>(() => data ?? { hs: '', origin: '', descAr: '', descEn: '' }, [data]);
  const [d, setD, clear] = useSessionDraft<IntlData>(`ship.intl.${p.id}`, base);
  const [tried, setTried] = useState(false);
  useUnsaved(JSON.stringify(d) !== JSON.stringify(base), { ar: 'بيانات الشحن الدولي', en: 'International data' });
  const { saving, error, save } = useSave();
  const hsBad = !!d.hs.trim() && !validHs(d.hs);
  const r = readiness(p, d);
  const sug = HS_BY_CAT[catKey(p.category)];
  const close = () => { clear(); onClose(); };
  const set = (x: Partial<IntlData>) => setD({ ...d, ...x });
  return (
    <Drawer title={p.name[lang]} onClose={close}
      footer={<><Button className="flex-1" disabled={saving} onClick={() => { setTried(true); if (hsBad) return; save(() => {
        commitShipping({ ...setup, intl: { ...setup.intl, [p.id]: { ...d, hs: d.hs.trim() } } }, { ar: `عدّل بيانات الشحن الدولي لـ ${p.name.ar}`, en: `Edited international data for ${p.name.en}` }, { target: p.id });
        clear(); onClose();
      }, tx('حُفظت البيانات', 'Data saved')); }}>{saving ? tx('جارٍ الحفظ…', 'Saving…') : tx('احفظ', 'Save')}</Button><Button variant="secondary" onClick={close}>{tx('إلغاء', 'Cancel')}</Button></>}>
      {error && <Alert tone="bad">{error}</Alert>}
      <p className="flex items-center gap-2 text-[13px] text-muted">{tx('الجاهزية', 'Readiness')} <span className="font-semibold tabular-nums text-fg">{r.pct}%</span></p>
      <Field label={tx('رمز HS', 'HS code')} hint={tx('6 إلى 10 أرقام', '6 to 10 digits')} error={tried && hsBad ? tx('رمز غير صالح', 'Invalid code') : null}>{(pp) => (
        <div className="flex gap-2"><Input {...pp} dir="ltr" inputMode="decimal" value={d.hs} onChange={(e) => set({ hs: e.target.value })} />{sug && !d.hs && <Button size="sm" variant="secondary" onClick={() => set({ hs: sug })}>{tx('اقتراح', 'Suggest')} {sug}</Button>}</div>
      )}</Field>
      <Field label={tx('بلد المنشأ', 'Country of origin')}>{(pp) => <Select {...pp} value={d.origin} onChange={(e) => set({ origin: e.target.value })}><option value="">{tx('اختر', 'Choose')}</option>{ORIGINS.map((o) => <option key={o.id} value={o.id}>{o.name[lang]}</option>)}</Select>}</Field>
      <Field label={tx('الوصف الجمركي بالعربية', 'Customs description (Arabic)')}>{(pp) => <Input {...pp} dir="rtl" value={d.descAr} onChange={(e) => set({ descAr: e.target.value })} />}</Field>
      <Field label={tx('الوصف الجمركي بالإنجليزية', 'Customs description (English)')}>{(pp) => <Input {...pp} dir="ltr" value={d.descEn} onChange={(e) => set({ descEn: e.target.value })} />}</Field>
      <p className="text-[13px] text-muted">{tx('الوزن: ', 'Weight: ')}{p.weight ? tx(`${p.weight / 1000} كجم`, `${p.weight / 1000} kg`) : <span className="font-medium text-red-600 dark:text-red-400">{tx('غير مدخل', 'Missing')}</span>} · <a href={sectionHref('products', p.id)} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('عدّله في المنتج', 'Edit in the product')}</a></p>
    </Drawer>
  );
}
