import { useMemo, useState } from 'react';
import type { Route } from '../../core/router';
import { Alert, Badge, PageHeader, type Tone } from '../../core/ui';
import type { Channel } from './domain';
import { applyBulkEdit, moneyInput, skusOf, toCsv, validateBulkRow, type BulkRow, type Product, type ProductStatus } from './catalog';
import { totalAvailable } from './inventory';
import { can } from './perms';
import { levelsStore, productsStore, testStore } from './stores';
import { ActionLocked, DataTable, Icon, Money, Pager, downloadText, mhref, mreplace, useL, useTx, type Col } from './kit';
import { ProductEditor } from './product-editor';
import { ImportWizard } from './import';

export const STATUS_TONE: Record<ProductStatus, Tone> = { active: 'success', draft: 'neutral', archived: 'warning' };
export function useStatusName() {
  const tx = useTx();
  return (s: ProductStatus) => ({ active: tx('نشط', 'Active'), draft: tx('مسودة', 'Draft'), archived: tx('مؤرشف', 'Archived') })[s];
}
const PAGE = 25;

export function ProductsPage({ route }: { route: Route }) {
  const sub = route.path[1];
  if (sub === 'import') return <ImportWizard />;
  if (sub) return <ProductEditor key={sub} id={sub} />;
  return <ProductList route={route} />;
}

function ProductList({ route }: { route: Route }) {
  const tx = useTx();
  const l = useL();
  const statusName = useStatusName();
  const products = productsStore.use();
  const levels = levelsStore.use();
  const role = testStore.use().role;
  const canEdit = can(role, 'product.edit');
  const q = route.query.get('q') ?? '';
  const st = route.query.get('status') as ProductStatus | null;
  const status = st && ['active', 'draft', 'archived'].includes(st) ? st : null;
  const chq = route.query.get('ch') as Channel | null;
  const ch = chq && ['online', 'market', 'app'].includes(chq) ? chq : null;
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return products.filter((p) => (!status || p.status === status) && (!ch || p.channels[ch])
      && (!n || p.name.ar.includes(n) || p.name.en.toLowerCase().includes(n) || skusOf(p).some((s) => s.toLowerCase().includes(n)) || p.sku.toLowerCase().includes(n)));
  }, [products, q, status, ch]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const page = Math.min(pages, Math.max(1, Number(route.query.get('page')) || 1));
  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE);
  const qs = (o: Record<string, string | undefined>) => ({ q: q || undefined, status: status ?? undefined, ch: ch ?? undefined, ...o });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<BulkRow[] | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const avail = (p: Product) => totalAvailable(levels, skusOf(p));
  const priceCell = (p: Product) => {
    const prices = p.variants.length ? p.variants.map((v) => v.price) : [p.price];
    const min = Math.min(...prices);
    return <>{prices.some((x) => x !== min) && <span className="small muted">{tx('من ', 'from ')}</span>}<Money v={min} />{p.compareAt && <div className="small muted"><s><Money v={p.compareAt} /></s></div>}</>;
  };
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOnPage = pageRows.length > 0 && pageRows.every((p) => sel.has(p.id));
  const chNames: Record<Channel, string> = { online: tx('المتجر', 'Store'), market: tx('السوق', 'Marketplace'), app: tx('التطبيق', 'App') };

  const exportCsv = () => downloadText('products-export.csv', toCsv([
    ['name_ar', 'name_en', 'sku', 'price', 'compare_at_price', 'status', 'available'],
    ...rows.flatMap((p) => (p.variants.length ? p.variants.map((v) => [p.name.ar, `${p.name.en} / ${v.color} / ${v.size}`, v.sku, moneyInput(v.price), moneyInput(p.compareAt), p.status, totalAvailable(levels, [v.sku])])
      : [[p.name.ar, p.name.en, p.sku, moneyInput(p.price), moneyInput(p.compareAt), p.status, avail(p)]])),
  ]));

  const cols: Col<Product>[] = [
    ...(canEdit ? [{ key: 'sel', head: tx('تحديد', 'Select'), srHead: true, cell: (p: Product) => <input type="checkbox" className="m-cb" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={tx(`تحديد ${p.name.ar}`, `Select ${p.name.en}`)} /> }] : []),
    { key: 'name', head: tx('المنتج', 'Product'), cell: (p) => <span className="m-prodcell"><span className="m-thumb" aria-hidden="true">{l(p.name).slice(0, 1)}</span><span><span className="strong">{l(p.name)}</span><span className="small muted"><br /><bdi dir="ltr">{p.sku}</bdi>{p.variants.length ? tx(` · ${p.variants.length} متغيرات`, ` · ${p.variants.length} variants`) : ''}</span></span></span> },
    { key: 'status', head: tx('الحالة', 'Status'), cell: (p) => <Badge tone={STATUS_TONE[p.status]}>{statusName(p.status)}</Badge> },
    { key: 'price', head: tx('السعر', 'Price'), end: true, cell: priceCell },
    { key: 'avail', head: tx('المتاح', 'Available'), end: true, cell: (p) => (p.type === 'digital' ? <span className="small muted">{tx('رقمي — لا مخزون', 'Digital — no stock')}</span> : <bdi>{avail(p)}</bdi>) },
    { key: 'ch', head: tx('القنوات', 'Channels'), cell: (p) => <span className="small">{(Object.keys(p.channels) as Channel[]).filter((c) => p.channels[c]).map((c) => chNames[c]).join(' · ') || tx('لا قناة', 'None')}</span> },
    { key: 'open', head: tx('فتح', 'Open'), srHead: true, end: true, cell: (p) => <a className="btn small" href={mhref(`products/${p.id}`)} aria-label={tx(`فتح ${p.name.ar}`, `Open ${p.name.en}`)}>{tx('فتح', 'Open')}</a> },
  ];

  const startBulk = () => { setSaved(null); setBulk(products.filter((p) => sel.has(p.id)).map((p) => ({ id: p.id, price: moneyInput(p.price), compareAt: moneyInput(p.compareAt), status: p.status }))); };
  const bulkErrors = bulk?.map(validateBulkRow) ?? [];
  const bulkInvalid = bulkErrors.filter((e) => Object.keys(e).length).length;
  const saveBulk = () => {
    if (!bulk) return;
    const next = applyBulkEdit(productsStore.get(), bulk);
    if (!next) return;
    productsStore.set(next);
    setSaved(bulk.length);
    setBulk(null);
    setSel(new Set());
  };
  const cellErr = (c?: string) => (c === 'compareAt' ? tx('يجب أن يكون أعلى من السعر', 'Must be above the price') : c === 'money' ? tx('مبلغ غير صالح', 'Invalid amount') : '');

  return (
    <>
      <PageHeader title={tx('المنتجات', 'Products')} sub={tx(`${products.length} منتجًا تجريبيًا · المتاح محسوب من المخزون (الموجود − المحجوز)`, `${products.length} demo products · Available comes from inventory (on hand − reserved)`)}
        actions={<>
          <button type="button" className="btn" onClick={exportCsv}><Icon name="download" size={16} /> {tx('تصدير CSV', 'Export CSV')}</button>
          {can(role, 'product.import') && <a className="btn" href={mhref('products/import')}>{tx('استيراد CSV', 'Import CSV')}</a>}
          {canEdit && <a className="btn primary" href={mhref('products/new')}><Icon name="plus" size={16} /> {tx('إضافة منتج', 'Add product')}</a>}
        </>} />
      <div className="toolbar">
        <div className="views" role="group" aria-label={tx('حالة المنتج', 'Product status')}>
          {([null, 'active', 'draft', 'archived'] as (ProductStatus | null)[]).map((s) => (
            <a key={s ?? 'all'} className="chip" href={mhref('products', qs({ status: s ?? undefined }))} aria-current={status === s ? 'true' : undefined}>
              {s ? statusName(s) : tx('الكل', 'All')} · <bdi>{products.filter((p) => !s || p.status === s).length}</bdi>
            </a>
          ))}
        </div>
        <div className="m-row-fields">
          <input className="input search" type="search" aria-label={tx('بحث بالاسم أو SKU', 'Search by name or SKU')} placeholder={tx('ابحث بالاسم أو SKU', 'Search name or SKU')} value={q} onChange={(e) => mreplace('products', qs({ q: e.target.value || undefined }))} />
          <label className="sr" htmlFor="p-ch">{tx('القناة', 'Channel')}</label>
          <select id="p-ch" className="input" value={ch ?? ''} onChange={(e) => mreplace('products', qs({ ch: e.target.value || undefined }))}>
            <option value="">{tx('كل القنوات', 'All channels')}</option>
            {(['online', 'market', 'app'] as Channel[]).map((c) => <option key={c} value={c}>{chNames[c]}</option>)}
          </select>
        </div>
      </div>
      {!canEdit && <ActionLocked>{tx('دورك يعرض المنتجات للقراءة فقط.', 'Your role shows products read-only.')}</ActionLocked>}
      {saved !== null && <Alert tone="success">{tx(`حُفظت تعديلات ${saved} منتجات.`, `Saved edits to ${saved} products.`)}</Alert>}
      {canEdit && sel.size > 0 && !bulk && (
        <div className="m-bulkbar" role="region" aria-label={tx('إجراء جماعي', 'Bulk action')}>
          <span className="strong">{tx(`${sel.size} محدد`, `${sel.size} selected`)}</span><span className="grow" />
          <button type="button" className="btn primary" onClick={startBulk}>{tx('تعديل جماعي', 'Bulk edit')}</button>
          <button type="button" className="btn" onClick={() => setSel(new Set())}>{tx('إلغاء التحديد', 'Clear selection')}</button>
        </div>
      )}
      {bulk && (
        <section className="card" aria-labelledby="bulk-h">
          <div className="card-head"><h2 id="bulk-h">{tx(`تعديل جماعي: ${bulk.length} منتجات`, `Bulk edit: ${bulk.length} products`)}</h2></div>
          <div className="card-body">
            <p className="small muted">{tx('لا يُحفظ شيء حتى تصبح كل الخلايا صالحة. أسعار المتغيرات التي تساوي السعر الأساسي تتبعه.', 'Nothing is saved until every cell is valid. Variant prices equal to the base price follow it.')}</p>
            <div className="m-bulkgrid">
              {bulk.map((r, i) => {
                const p = products.find((x) => x.id === r.id)!;
                const e = bulkErrors[i];
                const upd = (patch: Partial<BulkRow>) => setBulk(bulk.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <fieldset key={r.id} className="m-bulkrow">
                    <legend className="strong">{l(p.name)}</legend>
                    <div className="field"><label htmlFor={`bp-${i}`}>{tx('السعر (ر.س)', 'Price (SAR)')}</label><input id={`bp-${i}`} className="input" dir="ltr" inputMode="decimal" value={r.price} aria-invalid={!!e.price} onChange={(ev) => upd({ price: ev.target.value })} />{e.price && <span className="error">{cellErr(e.price)}</span>}</div>
                    <div className="field"><label htmlFor={`bc-${i}`}>{tx('السعر قبل الخصم', 'Compare-at')}</label><input id={`bc-${i}`} className="input" dir="ltr" inputMode="decimal" value={r.compareAt} aria-invalid={!!e.compareAt} onChange={(ev) => upd({ compareAt: ev.target.value })} />{e.compareAt && <span className="error">{cellErr(e.compareAt)}</span>}</div>
                    <div className="field"><label htmlFor={`bs-${i}`}>{tx('الحالة', 'Status')}</label><select id={`bs-${i}`} className="input" value={r.status} onChange={(ev) => upd({ status: ev.target.value as ProductStatus })}>{(['active', 'draft', 'archived'] as ProductStatus[]).map((s) => <option key={s} value={s}>{statusName(s)}</option>)}</select></div>
                  </fieldset>
                );
              })}
            </div>
            {bulkInvalid > 0 && <p className="error" role="alert">{tx(`${bulkInvalid} صفوف فيها قيم غير صالحة.`, `${bulkInvalid} rows have invalid values.`)}</p>}
            <div className="actions">
              <button type="button" className="btn primary" disabled={bulkInvalid > 0} onClick={saveBulk}>{tx(`احفظ ${bulk.length} منتجات`, `Save ${bulk.length} products`)}</button>
              <button type="button" className="btn" onClick={() => setBulk(null)}>{tx('تجاهل التعديلات', 'Discard edits')}</button>
            </div>
          </div>
        </section>
      )}
      <div className="card">
        {canEdit && pageRows.length > 0 && (
          <div className="m-selectpage"><label className="check"><input type="checkbox" checked={allOnPage} onChange={() => setSel((s) => { const n = new Set(s); pageRows.forEach((p) => (allOnPage ? n.delete(p.id) : n.add(p.id))); return n; })} />
            {tx(`تحديد هذه الصفحة (${pageRows.length} من ${rows.length})`, `Select this page (${pageRows.length} of ${rows.length})`)}</label></div>
        )}
        <DataTable label={tx('المنتجات', 'Products')} cols={cols} rows={pageRows} rowKey={(p) => p.id}
          mobile={(p) => (
            <div className="m-rowcard-in">
              {canEdit && <input type="checkbox" className="m-cb" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={tx(`تحديد ${p.name.ar}`, `Select ${p.name.en}`)} />}
              <a className="m-rowcard-main" href={mhref(`products/${p.id}`)}>
                <span className="m-rowcard-top"><span className="strong">{l(p.name)}</span><span>{priceCell(p)}</span></span>
                <span className="small muted"><bdi dir="ltr">{p.sku}</bdi> · {p.type === 'digital' ? tx('رقمي', 'Digital') : tx(`متاح ${avail(p)}`, `${avail(p)} available`)}</span>
                <span className="m-badges"><Badge tone={STATUS_TONE[p.status]}>{statusName(p.status)}</Badge></span>
              </a>
            </div>
          )}
          empty={<div className="empty"><span>{products.length ? tx('لا منتجات تطابق البحث والتصفية.', 'No products match this search and filter.') : tx('لا منتجات بعد.', 'No products yet.')}</span><a className="btn" href={mhref('products')}>{tx('مسح التصفية', 'Clear filters')}</a></div>} />
      </div>
      <div className="toolbar"><p className="small muted" role="status">{tx(`${rows.length} نتيجة`, `${rows.length} results`)}</p><Pager page={page} pages={pages} hrefFor={(p) => mhref('products', qs({ page: p > 1 ? String(p) : undefined }))} /></div>
    </>
  );
}
