// Wholesale price lists (`#/dashboard/wholesale/prices?g=`): per customer group, per product, quantity tiers before
// VAT; the first tier is the minimum order quantity. Edits are a draft kept for the session until saved, with
// warnings (price rising with quantity, below cost, above retail) the merchant may accept.
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, type Route } from '../../../core/router';
import { logAction, productsStore } from '../../merchant/stores';
import { moneyInput, parseIntStrict, parseMoney } from '../../merchant/catalog';
import { checkTiers, tierWarnings, type PriceList, type PriceRow } from '../../merchant/wholesale';
import { Badge, Button, Card, CardHeader, EmptyState, IconButton, InfoHint, Money, ProductImage, Ref, useTx } from '../../../ds/ui';
import { Alert, Field, Input, Modal, SaveBar, Select, useToast } from '../../../ds/kit';
import { listPhoto } from '../products/model';
import { useUnsaved } from '../unsaved';
import { setWs, wsStore } from './state';

type TierText = { min: string; price: string };
type RowText = { productId: string; tiers: TierText[] };
const toText = (l: PriceList | undefined): RowText[] => (l?.rows ?? []).map((r) => ({ productId: r.productId, tiers: r.tiers.map((t) => ({ min: String(t.min), price: moneyInput(t.price) })) }));
const fromText = (rows: RowText[]): PriceRow[] => rows.map((r) => ({ productId: r.productId, tiers: r.tiers.map((t) => ({ min: parseIntStrict(t.min) ?? NaN, price: parseMoney(t.price) ?? NaN })) }));

export function Prices({ route, canManage }: { route: Route; canManage: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const s = wsStore.use();
  const products = productsStore.use();
  const g = route.query.get('g') ?? s.groups[0]?.id ?? '';
  const saved = s.lists.find((l) => l.group === g);
  const [rows, setRowsState] = useState<RowText[]>(() => toText(s.drafts[g] ?? saved));
  const [picking, setPicking] = useState(false);
  const [newGroup, setNewGroup] = useState<{ ar: string; en: string } | null>(null);
  const [tried, setTried] = useState(false);
  const setRows = (r: RowText[]) => { setRowsState(r); setWs((x) => ({ drafts: { ...x.drafts, [g]: { group: g, rows: fromText(r) } } })); };
  const parsed = fromText(rows);
  const dirty = JSON.stringify(parsed) !== JSON.stringify(saved?.rows ?? []);
  useUnsaved(dirty, { ar: 'قائمة أسعار الجملة', en: 'Wholesale price list' });
  const errs = parsed.map((r) => checkTiers(r.tiers));
  const save = () => {
    setTried(true);
    if (errs.some(Boolean)) return;
    setWs((x) => ({ lists: [...x.lists.filter((l) => l.group !== g), { group: g, rows: parsed }], drafts: Object.fromEntries(Object.entries(x.drafts).filter(([k]) => k !== g)), example: false }));
    logAction('products', { ar: `حفظ قائمة أسعار الجملة (${s.groups.find((x) => x.id === g)?.name.ar}): ${parsed.length} منتجات`, en: `Saved wholesale price list (${s.groups.find((x) => x.id === g)?.name.en}): ${parsed.length} products` });
    toast({ tone: 'ok', text: tx('حُفظت الأسعار. تُطبَّق على العروض الجديدة.', 'Prices saved. They apply to new quotes.') });
    setTried(false);
  };
  const discard = () => { setRowsState(toText(saved)); setWs((x) => ({ drafts: Object.fromEntries(Object.entries(x.drafts).filter(([k]) => k !== g)) })); };
  const listed = new Set(rows.map((r) => r.productId));
  const candidates = products.filter((p) => p.status === 'active' && (p.type === 'physical' || p.type === 'food') && !listed.has(p.id));
  const errText = (e: ReturnType<typeof checkTiers>) => e && ({ min: tx('الكمية رقم صحيح من 1', 'Quantity is a whole number from 1'), price: tx('سعر غير صحيح', 'Invalid price'), order: tx('الكميات تصاعدية بلا تكرار', 'Quantities must increase'), empty: tx('أضف شريحة', 'Add a tier') })[e];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field className="w-60" label={tx('مجموعة العملاء', 'Customer group')}>{(p) => <Select {...p} value={g} onChange={(e) => replace(link('/dashboard/wholesale/prices', { g: e.target.value }))}>{s.groups.map((x) => <option key={x.id} value={x.id}>{x.name[lang]}</option>)}</Select>}</Field>
        {canManage && <Button variant="secondary" onClick={() => setNewGroup({ ar: '', en: '' })}><Plus className="size-4" aria-hidden="true" />{tx('مجموعة', 'Group')}</Button>}
        {canManage && <Button className="ms-auto" onClick={() => setPicking(true)} disabled={!candidates.length}><Plus className="size-4" aria-hidden="true" />{tx('أضف منتجًا', 'Add product')}</Button>}
      </div>
      {s.example && g === 'g1' && <Alert tone="info" title={tx('مثال للتجربة', 'Example for trying out')}>{tx('هذه أسعار مثال وليست أسعارك. عدّلها أو احذفها؛ أسعار الجملة قرارك أنت.', 'These are example prices, not yours. Edit or remove them; wholesale prices are your decision.')}</Alert>}
      <Card>
        <CardHeader title={tx('الأسعار حسب الكمية (قبل الضريبة)', 'Prices by quantity (before VAT)')} hint={tx('أول شريحة هي الحد الأدنى للطلب. يأخذ المشتري سعر أعلى شريحة يبلغها.', 'The first tier is the minimum order quantity. The buyer gets the price of the highest tier reached.')} />
        {rows.length === 0 ? <EmptyState title={tx('لا منتجات في هذه القائمة', 'No products in this list')} action={canManage && <Button onClick={() => setPicking(true)}>{tx('أضف منتجًا', 'Add product')}</Button>}>{tx('المنتجات غير المدرجة لا تظهر للمشترين بأسعار جملة.', 'Products not listed are not offered at wholesale prices.')}</EmptyState> : (
          <ul className="divide-y divide-border">
            {rows.map((r, i) => {
              const p = products.find((x) => x.id === r.productId);
              if (!p) return null;
              const warn = errs[i] ? [] : tierWarnings(parsed[i].tiers, p);
              return (
                <li key={r.productId} className="space-y-3 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <ProductImage src={listPhoto(p)} alt={p.name[lang]} size={40} />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-fg">{p.name[lang]}</p><p className="text-xs text-muted"><Ref>{p.sku}</Ref> · {tx('التجزئة', 'Retail')} <Money v={p.price} />{p.cost !== null && <> · {tx('التكلفة', 'Cost')} <Money v={p.cost} /></>}</p></div>
                    <Badge tone="brand">{tx('أقل كمية', 'MOQ')} {parsed[i].tiers[0]?.min || '—'}</Badge>
                    {canManage && <IconButton label={tx('أزل من القائمة', 'Remove from list')} onClick={() => setRows(rows.filter((_, k) => k !== i))}><Trash2 className="size-4" aria-hidden="true" /></IconButton>}
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    {r.tiers.map((t, k) => (
                      <div key={k} className="flex items-end gap-1.5 rounded-xl border border-border p-2">
                        <Field className="w-20" label={tx('من كمية', 'From qty')}>{(fp) => <Input {...fp} disabled={!canManage} inputMode="numeric" dir="ltr" value={t.min} onChange={(e) => setRows(rows.map((x, xi) => (xi === i ? { ...x, tiers: x.tiers.map((y, yi) => (yi === k ? { ...y, min: e.target.value } : y)) } : x)))} />}</Field>
                        <Field className="w-28" label={tx('السعر ر.س', 'Price SAR')}>{(fp) => <Input {...fp} disabled={!canManage} inputMode="decimal" dir="ltr" value={t.price} onChange={(e) => setRows(rows.map((x, xi) => (xi === i ? { ...x, tiers: x.tiers.map((y, yi) => (yi === k ? { ...y, price: e.target.value } : y)) } : x)))} />}</Field>
                        {canManage && r.tiers.length > 1 && <IconButton className="size-10" label={tx('احذف الشريحة', 'Delete tier')} onClick={() => setRows(rows.map((x, xi) => (xi === i ? { ...x, tiers: x.tiers.filter((_, yi) => yi !== k) } : x)))}><Trash2 className="size-4" aria-hidden="true" /></IconButton>}
                      </div>
                    ))}
                    {canManage && r.tiers.length < 5 && <Button variant="ghost" onClick={() => setRows(rows.map((x, xi) => (xi === i ? { ...x, tiers: [...x.tiers, { min: '', price: '' }] } : x)))}><Plus className="size-4" aria-hidden="true" />{tx('شريحة', 'Tier')}</Button>}
                  </div>
                  {tried && errs[i] && <p className="text-xs font-medium text-red-600">{errText(errs[i])}</p>}
                  {warn.length > 0 && <p className="flex flex-wrap items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">{warn.map((w) => <span key={w}>{({ rising: tx('السعر يرتفع مع الكمية', 'Price rises with quantity'), belowCost: tx('أقل من التكلفة', 'Below cost'), aboveRetail: tx('أعلى من سعر التجزئة قبل الضريبة', 'Above retail before VAT') })[w]}</span>)}<InfoHint>{tx('تنبيه فقط؛ يمكنك الحفظ.', 'A warning only; you can save.')}</InfoHint></p>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <SaveBar dirty={dirty} error={tried && errs.some(Boolean) ? tx('صحّح الشرائح المعلّمة', 'Fix the marked tiers') : undefined} onSave={save} onDiscard={discard} saveLabel={tx('احفظ الأسعار', 'Save prices')} />
      {picking && (
        <Modal title={tx('أضف منتجًا للقائمة', 'Add a product to the list')} onClose={() => setPicking(false)} footer={<Button variant="secondary" onClick={() => setPicking(false)}>{tx('إغلاق', 'Close')}</Button>}>
          <ul className="divide-y divide-border">{candidates.map((p) => <li key={p.id}><button type="button" className="flex w-full items-center gap-3 py-2.5 text-start text-sm hover:text-brand-700" onClick={() => { setRows([...rows, { productId: p.id, tiers: [{ min: '', price: '' }] }]); setPicking(false); }}><ProductImage src={listPhoto(p)} alt={p.name[lang]} size={32} /><span className="flex-1 font-semibold text-fg">{p.name[lang]}</span><Money v={p.price} /></button></li>)}</ul>
        </Modal>
      )}
      {newGroup && (
        <Modal title={tx('مجموعة عملاء جديدة', 'New customer group')} onClose={() => setNewGroup(null)}
          footer={<><Button variant="secondary" onClick={() => setNewGroup(null)}>{tx('إلغاء', 'Cancel')}</Button><Button disabled={!newGroup.ar.trim() || !newGroup.en.trim()} onClick={() => {
            const id = `g${s.groups.length + 1}-${Date.now() % 1000}`;
            setWs((x) => ({ groups: [...x.groups, { id, name: { ar: newGroup.ar.trim(), en: newGroup.en.trim() } }], lists: [...x.lists, { group: id, rows: [] }] }));
            logAction('store', { ar: `أنشأ مجموعة جملة ${newGroup.ar}`, en: `Created wholesale group ${newGroup.en}` });
            setNewGroup(null); replace(link('/dashboard/wholesale/prices', { g: id }));
          }}>{tx('أنشئ', 'Create')}</Button></>}>
          <Field label={tx('الاسم بالعربية', 'Name in Arabic')}>{(p) => <Input {...p} value={newGroup.ar} onChange={(e) => setNewGroup({ ...newGroup, ar: e.target.value })} placeholder={tx('مثال: موزعون', 'e.g. distributors')} />}</Field>
          <Field label={tx('الاسم بالإنجليزية', 'Name in English')}>{(p) => <Input {...p} value={newGroup.en} onChange={(e) => setNewGroup({ ...newGroup, en: e.target.value })} dir="ltr" />}</Field>
        </Modal>
      )}
    </div>
  );
}
