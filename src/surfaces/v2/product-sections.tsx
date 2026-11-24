// Product editor (v2): the form sections. Each section reads and writes the shared editor; layout is decided by product.tsx.
import { useEffect, useState } from 'react';
import { useLang } from '../../core/lang';
import { link } from '../../core/router';
import { LOCATIONS, LOC_IDS, type Channel } from '../merchant/domain';
import { parseMoney, rebuildVariants, duplicateValues, type ProductStatus, type VariantDraft } from '../merchant/catalog';
import { available, levelOf } from '../merchant/inventory';
import { levelsStore, settingsStore } from '../merchant/stores';
import { Dialog, Icon, Money, Pill, Ref, Sim, useTx, type Tone } from './ui';
import { CATEGORIES, discountPct, economics, fieldId, mediaSrc, photoLibrary, photoMedia, type Editor } from './product-model';
import { Counter, Field, Photo, Riyal, Section, Swatch, SwitchRow, describedBy, useColorName, useErrText } from './product-fields';

type P = { ed: Editor };

/* ---------- Basics ---------- */

export function BasicsSection({ ed }: P) {
  const tx = useTx();
  const err = useErrText();
  const { draft, set, fe } = ed;
  const bad = !!(fe('nameAr') || fe('nameEn'));
  return (
    <Section id="basics" tone={bad ? 'error' : undefined} title={tx('الاسم والوصف', 'Title and description')} sub={tx('يظهر الاسم في المتجر والسلة والفاتورة بلغة العميل.', 'The name appears in the store, cart and invoice in the shopper’s language.')}>
      <div className="pe-grid2">
        <Field id="pe-nameAr" k="nameAr" label={tx('الاسم بالعربية', 'Name in Arabic')} error={err(fe('nameAr'))} aside={<Counter n={draft.nameAr.length} max={80} />}>
          <input id="pe-nameAr" className="lk-input" dir="rtl" lang="ar" maxLength={80} value={draft.nameAr} aria-invalid={!!fe('nameAr')} aria-required="true"
            aria-describedby={describedBy('pe-nameAr', 'nameAr', !!fe('nameAr'))} onChange={(e) => set({ nameAr: e.target.value })} placeholder="مثال: عباية كتّان صيفية" />
        </Field>
        <Field id="pe-nameEn" k="nameEn" label={tx('الاسم بالإنجليزية', 'Name in English')} error={err(fe('nameEn'))} aside={<Counter n={draft.nameEn.length} max={80} />}>
          <input id="pe-nameEn" className="lk-input" dir="ltr" lang="en" maxLength={80} value={draft.nameEn} aria-invalid={!!fe('nameEn')} aria-required="true"
            aria-describedby={describedBy('pe-nameEn', 'nameEn', !!fe('nameEn'))} onChange={(e) => set({ nameEn: e.target.value })} placeholder="e.g. Summer linen abaya" />
        </Field>
        <Field id="pe-descAr" label={tx('الوصف بالعربية', 'Description in Arabic')} help={tx('المادة والقصّة والعناية. جمل قصيرة تُقرأ على الجوال.', 'Material, fit and care. Short sentences read well on a phone.')}>
          <textarea id="pe-descAr" className="lk-textarea" dir="rtl" lang="ar" value={draft.descAr} aria-describedby="pe-descAr-help" onChange={(e) => set({ descAr: e.target.value })} />
        </Field>
        <Field id="pe-descEn" label={tx('الوصف بالإنجليزية', 'Description in English')} help={tx('اختياري، لكنه يظهر لمن يتصفح بالإنجليزية.', 'Optional, but shown to shoppers browsing in English.')}>
          <textarea id="pe-descEn" className="lk-textarea" dir="ltr" lang="en" value={draft.descEn} aria-describedby="pe-descEn-help" onChange={(e) => set({ descEn: e.target.value })} />
        </Field>
      </div>
    </Section>
  );
}

/* ---------- Media ---------- */

export function MediaSection({ ed }: P) {
  const tx = useTx();
  const err = useErrText();
  const { lang } = useLang();
  const { draft, set, fe } = ed;
  const media = draft.media;
  const [sel, setSel] = useState(0);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const cur = Math.min(sel, Math.max(0, media.length - 1));
  const m = media[cur];
  useEffect(() => {
    const on = (e: Event) => setSel((e as CustomEvent<number>).detail);
    window.addEventListener('pe:media', on);
    return () => window.removeEventListener('pe:media', on);
  }, []);
  const move = (i: number, to: number) => {
    if (to < 0 || to >= media.length) return;
    const n = [...media];
    const [x] = n.splice(i, 1);
    n.splice(to, 0, x);
    set({ media: n });
    setSel(to);
  };
  const remove = (i: number) => { set({ media: media.filter((_, j) => j !== i) }); setSel(Math.max(0, i - 1)); };
  const inUse = new Set(media.map(mediaSrc).filter(Boolean) as string[]);
  const library = photoLibrary(ed.product?.id, inUse);
  const missingAlt = media.filter((x) => !x.alt.trim()).length;
  const errCount = media.filter((_, i) => fe(`media.${i}`)).length;

  return (
    <Section id="media" tone={errCount ? 'error' : undefined} title={tx('الصور', 'Media')}
      sub={media.length ? tx(`${media.length === 1 ? 'صورة واحدة' : `${media.length} صور`} · الأولى هي الرئيسية في المتجر والسلة`, `${media.length} image${media.length === 1 ? '' : 's'} · the first is the main image in the store and cart`) : tx('أضف صورة واحدة على الأقل؛ المنتجات بصور تُباع أكثر.', 'Add at least one image; products with photos sell better.')}
>
      {media.length === 0 ? (
        <button type="button" className="pe-drop" onClick={() => { setPicked([]); setAdding(true); }}>
          <span className="pe-drop-ic" aria-hidden="true"><Icon name="upload" /></span>
          <span className="lk-strong">{tx('أضف صور المنتج', 'Add product images')}</span>
          <span className="lk-small lk-3">{tx('اختر من مكتبة صور المتجر. صورة مربعة أو طولية بخلفية هادئة تعمل أفضل.', 'Pick from the store photo library. Square or portrait shots on a calm background work best.')}</span>
        </button>
      ) : (
        <div className="pe-media">
          <ul className="pe-gallery" aria-label={tx('ترتيب الصور', 'Image order')}>
            {media.map((x, i) => (
              <li key={x.id} className={i === 0 ? 'primary' : undefined}>
                <button type="button" className="pe-tile" aria-pressed={i === cur} onClick={() => setSel(i)}
                  aria-label={tx(`الصورة ${i + 1}${i === 0 ? '، الرئيسية' : ''}${x.alt ? `: ${x.alt}` : '، بلا نص بديل'}`, `Image ${i + 1}${i === 0 ? ', primary' : ''}${x.alt ? `: ${x.alt}` : ', no alt text'}`)}>
                  <Photo src={mediaSrc(x)} alt="" />
                  <span className="pe-tile-n lk-num">{i + 1}</span>
                  {i === 0 && <span className="pe-tile-primary">{tx('رئيسية', 'Primary')}</span>}
                  {!x.alt.trim() && <span className={`pe-tile-flag${fe(`media.${i}`) ? ' bad' : ''}`}>{tx('بلا وصف', 'No alt')}</span>}
                </button>
              </li>
            ))}
            <li><button type="button" className="pe-tile pe-tile-add" onClick={() => { setPicked([]); setAdding(true); }}><Icon name="upload" /><span className="lk-small lk-strong">{tx('أضف صورًا', 'Add images')}</span></button></li>
          </ul>
          {m && (
            <div className="pe-media-edit">
              <div className="lk-row lk-between lk-wrap" style={{ gap: 8 }}>
                <span className="lk-h3">{tx(`الصورة ${cur + 1} من ${media.length}`, `Image ${cur + 1} of ${media.length}`)}{cur === 0 && <span className="lk-3 lk-small" style={{ fontWeight: 500 }}> · {tx('الرئيسية', 'primary')}</span>}</span>
                <div className="lk-row" style={{ gap: 4 }}>
                  <button type="button" className="lk-btn icon sm ghost" disabled={cur === 0} onClick={() => move(cur, cur - 1)} aria-label={tx('قدّم الصورة', 'Move image earlier')} title={tx('قدّم', 'Move earlier')}><Icon name="back" size="sm" /></button>
                  <button type="button" className="lk-btn icon sm ghost" disabled={cur === media.length - 1} onClick={() => move(cur, cur + 1)} aria-label={tx('أخّر الصورة', 'Move image later')} title={tx('أخّر', 'Move later')}><Icon name="arrow" size="sm" /></button>
                  {cur > 0 && <button type="button" className="lk-btn sm" onClick={() => move(cur, 0)}>{tx('اجعلها الرئيسية', 'Set as primary')}</button>}
                  <button type="button" className="lk-btn sm ghost danger" onClick={() => remove(cur)}><Icon name="trash" size="sm" />{tx('احذف', 'Remove')}</button>
                </div>
              </div>
              <Field id={fieldId(`media.${cur}`)} k={`media.${cur}`} label={tx('النص البديل', 'Alt text')} error={err(fe(`media.${cur}`))}
                help={tx('يقرؤه قارئ الشاشة ومحركات البحث. صف ما في الصورة، لا اسم الملف.', 'Read by screen readers and search engines. Describe what is in the photo, not the file name.')}
                aside={<Counter n={m.alt.length} max={125} />}>
                <input id={fieldId(`media.${cur}`)} className="lk-input" maxLength={125} value={m.alt} aria-invalid={!!fe(`media.${cur}`)}
                  aria-describedby={describedBy(fieldId(`media.${cur}`), `media.${cur}`, !!fe(`media.${cur}`), true)}
                  placeholder={tx('مثال: عباية كتان سوداء، منظر أمامي', 'e.g. Black linen abaya, front view')}
                  onChange={(e) => set({ media: media.map((x, j) => (j === cur ? { ...x, alt: e.target.value } : x)) })} />
              </Field>
              {missingAlt > 0 && <p className="lk-small lk-3">{tx(`${missingAlt} من الصور بلا نص بديل. اختر الصورة من الأعلى لإضافته.`, `${missingAlt} image${missingAlt > 1 ? 's have' : ' has'} no alt text. Select it above to add one.`)}</p>}
            </div>
          )}
        </div>
      )}
      {adding && (
        <Dialog wide title={tx('أضف صورًا من المكتبة', 'Add images from the library')} onClose={() => setAdding(false)}
          footer={<>
            <button type="button" className="lk-btn" onClick={() => setAdding(false)}>{tx('إلغاء', 'Cancel')}</button>
            <button type="button" className="lk-btn primary" disabled={!picked.length} onClick={() => {
              const add = picked.map((src, n) => photoMedia(src, n));
              set({ media: [...media, ...add] });
              setSel(media.length);
              setAdding(false);
            }}>{picked.length ? tx(`أضف ${picked.length} صور`, `Add ${picked.length} image${picked.length > 1 ? 's' : ''}`) : tx('اختر صورة', 'Choose an image')}</button>
          </>}>
          <p className="lk-small lk-2 lk-row lk-wrap" style={{ gap: 8 }}><Sim />{tx('لا يُرفع أي ملف في هذا النموذج؛ تختار من صور المتجر الموجودة.', 'Nothing is uploaded in this prototype; you pick from the store’s existing photos.')}</p>
          {library.length === 0 ? <p className="lk-small lk-3">{tx('كل صور المكتبة مضافة لهذا المنتج.', 'Every library photo is already on this product.')}</p> : (
            <ul className="pe-library">
              {library.map((p) => {
                const on = picked.includes(p.src);
                return (
                  <li key={p.src}>
                    <button type="button" className="pe-tile" aria-pressed={on} onClick={() => setPicked((x) => (on ? x.filter((s) => s !== p.src) : [...x, p.src]))} aria-label={p.label[lang]}>
                      <Photo src={p.src} alt="" />
                      {on && <span className="pe-tile-check"><Icon name="check" size="xs" /></span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Dialog>
      )}
    </Section>
  );
}

/* ---------- Pricing ---------- */

function MoneyInput({ id, k, ed, label, help, value, onChange, optional }: { id: string; k: string; ed: Editor; label: string; help?: string; value: string; onChange: (v: string) => void; optional?: boolean }) {
  const tx = useTx();
  const err = useErrText();
  const e = ed.fe(k);
  return (
    <Field id={id} k={k} label={<>{label}{optional && <span className="lk-3" style={{ fontWeight: 500 }}> · {tx('اختياري', 'optional')}</span>}</>} error={err(e)} help={help}>
      <div className="lk-affix">
        <input id={id} className="lk-input ltr has-suffix lk-num pe-money" inputMode="decimal" value={value} aria-invalid={!!e} placeholder="0.00"
          aria-describedby={describedBy(id, k, !!e, !!help)} onChange={(ev) => onChange(ev.target.value)}
          onBlur={() => { const p = parseMoney(value); if (p !== null && value.trim()) onChange((p / 100).toFixed(2)); }} style={{ paddingInlineStart: 12 }} />
        <Riyal />
      </div>
    </Field>
  );
}

export function PricingSection({ ed }: P) {
  const tx = useTx();
  const { draft, set, fe } = ed;
  const ec = economics(draft.price, draft.cost);
  const off = discountPct(draft.price, draft.compareAt);
  const base = parseMoney(draft.price);
  const differing = draft.variants.filter((v) => parseMoney(v.price) !== base).length;
  const bad = !!(fe('price') || fe('compareAt') || fe('cost'));
  return (
    <Section id="pricing" tone={bad ? 'error' : undefined} title={tx('التسعير', 'Pricing')} sub={tx('الأسعار شاملة ضريبة القيمة المضافة 15٪ كما يراها العميل.', 'Prices include 15% VAT, exactly as the shopper sees them.')}>
      <div className="pe-grid3">
        <MoneyInput id="pe-price" k="price" ed={ed} label={tx('السعر', 'Price')} value={draft.price} onChange={(v) => set({ price: v })} />
        <MoneyInput id="pe-compareAt" k="compareAt" ed={ed} optional label={tx('السعر قبل الخصم', 'Compare-at price')} value={draft.compareAt} onChange={(v) => set({ compareAt: v })}
          help={off !== null ? tx(`يرى العميل خصم ${off}٪`, `Shoppers see ${off}% off`) : tx('يظهر مشطوبًا بجانب السعر.', 'Shown struck through next to the price.')} />
        <MoneyInput id="pe-cost" k="cost" ed={ed} optional label={tx('تكلفة القطعة', 'Cost per item')} value={draft.cost} onChange={(v) => set({ cost: v })}
          help={tx('دون الضريبة. لا يراه العملاء.', 'Excluding VAT. Shoppers never see it.')} />
      </div>
      {differing > 0 && <p className="lk-small lk-2 pe-note">{tx(`${differing} من المتغيرات بسعر مختلف عن هذا السعر.`, `${differing} variant${differing > 1 ? 's have' : ' has'} a price different from this one.`)} <button type="button" className="pe-linkbtn" onClick={() => document.getElementById('sec-variants')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{tx('راجع المتغيرات', 'Review variants')}</button></p>}
      <div className="pe-econ" aria-live="polite">
        {!ec ? <p className="lk-small lk-3">{tx('أدخل السعر لنعرض الضريبة وصافي الإيراد.', 'Enter a price to see VAT and net revenue.')}</p> : (
          <>
            <dl className="pe-econ-rows">
              <div><dt>{tx('يدفع العميل', 'Shopper pays')}</dt><dd><Money v={ec.price} strong /></dd></div>
              <div><dt>{tx('منها ضريبة القيمة المضافة (15٪)', 'Of which VAT (15%)')}</dt><dd className="lk-2"><Money v={ec.vat} /></dd></div>
              <div><dt>{tx('صافي الإيراد بعد الضريبة', 'Net revenue after VAT')}</dt><dd><Money v={ec.net} /></dd></div>
              {ec.cost !== null && <div><dt>{tx('تكلفة القطعة', 'Cost per item')}</dt><dd className="lk-2"><Money v={ec.cost} /></dd></div>}
            </dl>
            {ec.profit !== null && ec.cost !== null ? (
              <>
                <div className={`pe-profit${ec.profit < 0 ? ' neg' : ''}`}>
                  <div className="lk-col" style={{ gap: 2 }}><span className="lk-small">{tx('ربحك في كل قطعة', 'Your profit per item')}</span><Money v={ec.profit} figure /></div>
                  <div className="lk-col" style={{ gap: 2, alignItems: 'flex-end' }}><span className="lk-small">{tx('الهامش', 'Margin')}</span><span className="lk-figure pe-profit-pct"><bdi dir="ltr">{ec.pct}%</bdi></span></div>
                </div>
                <div className="pe-econ-bar" aria-hidden="true">
                  <span className="cost" style={{ flexGrow: Math.max(0, Math.min(ec.cost, ec.price)) }} />
                  <span className="vat" style={{ flexGrow: ec.vat }} />
                  {ec.profit > 0 && <span className="profit" style={{ flexGrow: ec.profit }} />}
                </div>
                <div className="pe-econ-legend lk-micro lk-2"><span><i className="cost" />{tx('التكلفة', 'Cost')}</span><span><i className="vat" />{tx('الضريبة', 'VAT')}</span><span><i className="profit" />{tx('الربح', 'Profit')}</span>
                  <span className="lk-3">{tx('قبل الشحن ورسوم الدفع.', 'Before shipping and payment fees.')}</span></div>
              </>
            ) : <p className="lk-small lk-3">{tx('أضف التكلفة لنحسب الربح والهامش. لا نقدّر الربح دونها.', 'Add a cost to see profit and margin. We never estimate profit without it.')}</p>}
          </>
        )}
      </div>
    </Section>
  );
}

/* ---------- Inventory ---------- */

export function InventorySection({ ed }: P) {
  const tx = useTx();
  const err = useErrText();
  const { lang } = useLang();
  const levels = levelsStore.use();
  const { draft, set, fe, isNew } = ed;
  const hasVariants = draft.variants.length > 0;
  const physical = draft.type === 'physical';
  const skus = hasVariants ? draft.variants.filter((v) => !v.isNew).map((v) => v.sku) : [draft.sku];
  const rows = LOC_IDS.map((loc) => {
    const ls = skus.map((s) => levelOf(levels, s, loc)).filter(Boolean) as NonNullable<ReturnType<typeof levelOf>>[];
    return { loc, onHand: ls.reduce((s, l) => s + l.onHand, 0), reserved: ls.reduce((s, l) => s + l.reserved, 0), avail: ls.reduce((s, l) => s + available(l), 0), low: ls.filter((l) => available(l) <= l.threshold).length, found: ls.length > 0 };
  });
  const hasLevels = rows.some((r) => r.found);
  const bad = !!(fe('sku') || fe('stock'));
  return (
    <Section id="inventory" tone={bad ? 'error' : undefined} title={tx('المخزون', 'Inventory')} sub={tx('المتاح = الموجود − المحجوز لطلبات مدفوعة لم تُجهّز.', 'Available = on hand − reserved for paid orders not yet fulfilled.')}>
      <div className="pe-grid2">
        <Field id="pe-sku" k="sku" label="SKU" error={err(fe('sku'))} help={hasVariants ? tx('أساس رموز المتغيرات.', 'The base for variant SKUs.') : tx('رمز فريد تعرف به القطعة في المستودع.', 'A unique code the warehouse knows this item by.')}>
          <input id="pe-sku" className="lk-input ltr lk-num" dir="ltr" value={draft.sku} aria-invalid={!!fe('sku')} aria-required="true" placeholder="ABY-LIN"
            aria-describedby={describedBy('pe-sku', 'sku', !!fe('sku'), true)} onChange={(e) => set({ sku: e.target.value.toUpperCase() })} />
        </Field>
        <Field id="pe-barcode" label={<>{tx('الباركود', 'Barcode')}<span className="lk-3" style={{ fontWeight: 500 }}> · {tx('اختياري', 'optional')}</span></>} help="GTIN, EAN, UPC">
          <input id="pe-barcode" className="lk-input ltr lk-num" dir="ltr" inputMode="numeric" value={draft.barcode} aria-describedby="pe-barcode-help" onChange={(e) => set({ barcode: e.target.value })} />
        </Field>
      </div>
      {physical ? (
        <SwitchRow id="pe-track" checked={draft.track} onChange={(v) => set({ track: v })} label={tx('تتبّع الكمية', 'Track quantity')}
          help={draft.track ? tx('نعدّ المخزون في كل مستودع ونحجز القطع للطلبات المدفوعة.', 'We count stock at each warehouse and reserve units for paid orders.') : tx('لا نعدّ المخزون؛ يبقى المنتج متاحًا للبيع دائمًا.', 'Stock isn’t counted; the product always stays available to buy.')} />
      ) : <p className="lk-small lk-2 pe-note">{tx('منتج رقمي: لا مخزون يُعدّ ولا شحن.', 'Digital product: no stock to count and nothing to ship.')}</p>}
      {physical && draft.track && (
        isNew && !hasVariants ? (
          <div className="pe-grid2">
            <Field id="pe-stock" k="stock" label={tx('الكمية الأولية', 'Starting quantity')} error={err(fe('stock'))} help={tx(`تُسجّل في ${LOCATIONS.ryd[lang]}. التعديلات اللاحقة من المخزون مع سبب.`, `Recorded at the ${LOCATIONS.ryd[lang]}. Later changes go through Inventory with a reason.`)}>
              <input id="pe-stock" className="lk-input ltr lk-num" dir="ltr" inputMode="numeric" value={draft.stock} aria-invalid={!!fe('stock')}
                aria-describedby={describedBy('pe-stock', 'stock', !!fe('stock'), true)} onChange={(e) => set({ stock: e.target.value })} />
            </Field>
          </div>
        ) : hasLevels ? (
          <div className="pe-locs">
            <table className="pe-table" aria-label={tx('المخزون حسب المستودع', 'Stock by warehouse')}>
              <thead><tr><th scope="col">{tx('المستودع', 'Warehouse')}</th><th scope="col" className="n">{tx('الموجود', 'On hand')}</th><th scope="col" className="n r">{tx('محجوز', 'Reserved')}</th><th scope="col" className="n">{tx('المتاح', 'Available')}</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.loc}>
                    <th scope="row">{LOCATIONS[r.loc][lang]}</th>
                    <td className="n lk-num">{r.onHand}</td><td className="n r lk-num lk-2">{r.reserved}</td>
                    <td className="n"><span className="lk-row" style={{ gap: 8, justifyContent: 'flex-end' }}>{r.low > 0 && <Pill tone={r.avail <= 0 ? 'bad' : 'warn'}>{r.avail <= 0 ? tx('نفد', 'Out') : hasVariants ? tx(`${r.low} منخفض`, `${r.low} low`) : tx('منخفض', 'Low')}</Pill>}<span className="lk-num lk-strong">{r.avail}</span></span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th scope="row">{tx('الإجمالي', 'Total')}</th><td className="n lk-num">{rows.reduce((s, r) => s + r.onHand, 0)}</td><td className="n r lk-num lk-2">{rows.reduce((s, r) => s + r.reserved, 0)}</td><td className="n lk-num lk-strong">{rows.reduce((s, r) => s + r.avail, 0)}</td></tr></tfoot>
            </table>
            <div className="lk-row lk-wrap lk-between" style={{ gap: 8 }}>
              <span className="lk-small lk-3">{hasVariants ? tx('مجموع كل المتغيرات. تفصيل كل متغير في قسم المتغيرات.', 'Sum of all variants. Per-variant stock is in Variants.') : tx('تعديل الكميات يتم من المخزون مع سبب مسجّل.', 'Quantities change in Inventory, with a recorded reason.')}</span>
              <a className="lk-btn sm" href={link('/merchant/inventory', { q: draft.sku })}>{tx('عدّل في المخزون', 'Adjust in Inventory')}<Icon name="external" size="xs" /></a>
            </div>
          </div>
        ) : <p className="lk-small lk-3">{tx('ستظهر الكميات حسب المستودع بعد الحفظ.', 'Quantities by warehouse appear after saving.')}</p>
      )}
    </Section>
  );
}

/* ---------- Variants ---------- */

export function VariantsSection({ ed }: P) {
  const tx = useTx();
  const err = useErrText();
  const cn = useColorName();
  const levels = levelsStore.use();
  const { draft, set, fe } = ed;
  const [input, setInput] = useState({ colors: '', sizes: '' });
  const [dupe, setDupe] = useState<{ colors?: string; sizes?: string }>({});
  const [bulk, setBulk] = useState('');
  const [applied, setApplied] = useState<string | null>(null);
  const vs = draft.variants;

  const add = (kind: 'colors' | 'sizes') => {
    const v = input[kind].trim();
    if (!v) return;
    if (draft[kind].some((x) => x.trim().toLowerCase() === v.toLowerCase())) { setDupe({ ...dupe, [kind]: v }); return; }
    const next = { ...draft, [kind]: [...draft[kind], v] };
    set({ [kind]: next[kind], variants: rebuildVariants(next) });
    setInput({ ...input, [kind]: '' });
    setDupe({ ...dupe, [kind]: undefined });
  };
  const removeOpt = (kind: 'colors' | 'sizes', i: number) => {
    const next = { ...draft, [kind]: draft[kind].filter((_, j) => j !== i) };
    set({ [kind]: next[kind], variants: rebuildVariants(next) });
  };
  const setV = (i: number, patch: Partial<VariantDraft>) => set({ variants: vs.map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  const stockOf = (sku: string) => LOC_IDS.map((loc) => { const l = levelOf(levels, sku, loc); return l ? available(l) : 0; });
  const name = (v: VariantDraft) => [cn(v.color), v.size].filter(Boolean).join(' / ');
  const bulkOk = parseMoney(bulk || draft.price);
  const varErr = vs.some((_, i) => fe(`v.${i}.sku`) || fe(`v.${i}.price`) || fe(`v.${i}.stock`)) || !!fe('colors') || !!fe('sizes');

  const optEditor = (kind: 'colors' | 'sizes') => {
    const label = kind === 'colors' ? tx('اللون', 'Colour') : tx('المقاس', 'Size');
    const e = dupe[kind] ? tx(`«${dupe[kind]}» مضاف بالفعل.`, `“${dupe[kind]}” is already added.`) : err(fe(kind));
    return (
      <div className="pe-opt">
        <Field id={`pe-${kind}`} k={kind} label={kind === 'colors' ? tx('الألوان', 'Colours') : tx('المقاسات', 'Sizes')} error={e}>
          <div className="pe-chips">
            {draft[kind].map((v, i) => (
              <span key={v + i} className="pe-chip">{kind === 'colors' && <Swatch color={v} />}{kind === 'colors' ? cn(v) : <bdi>{v}</bdi>}
                <button type="button" onClick={() => removeOpt(kind, i)} aria-label={tx(`احذف ${v}`, `Remove ${v}`)}><Icon name="close" size="xs" /></button></span>
            ))}
            <span className="pe-chip-add">
              <input id={`pe-${kind}`} className="lk-input" value={input[kind]} aria-invalid={!!e} aria-describedby={e ? `pe-${kind}-err` : undefined}
                placeholder={kind === 'colors' ? tx('أضف لونًا، مثل Black', 'Add a colour, e.g. Black') : tx('أضف مقاسًا، مثل M', 'Add a size, e.g. M')}
                onChange={(ev) => { setInput({ ...input, [kind]: ev.target.value }); setDupe({ ...dupe, [kind]: undefined }); }}
                onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); add(kind); } }} />
              <button type="button" className="lk-btn sm" onClick={() => add(kind)} aria-label={tx(`أضف ${label}`, `Add ${label.toLowerCase()}`)}><Icon name="plus" size="sm" /></button>
            </span>
          </div>
        </Field>
      </div>
    );
  };

  const skuInput = (v: VariantDraft, i: number) => (
    <input id={`pe-v-${i}-sku`} className="lk-input ltr lk-num pe-cell" dir="ltr" value={v.sku} aria-invalid={!!fe(`v.${i}.sku`)} aria-label={tx(`SKU ${name(v)}`, `SKU for ${name(v)}`)}
      aria-describedby={fe(`v.${i}.sku`) ? `pe-v-${i}-sku-err` : undefined} onChange={(e) => setV(i, { sku: e.target.value.toUpperCase() })} />
  );
  const priceInput = (v: VariantDraft, i: number) => (
    <div className="lk-affix">
      <input id={`pe-v-${i}-price`} className="lk-input ltr lk-num pe-cell has-suffix" dir="ltr" inputMode="decimal" value={v.price} aria-invalid={!!fe(`v.${i}.price`)} aria-label={tx(`سعر ${name(v)}`, `Price for ${name(v)}`)}
        aria-describedby={fe(`v.${i}.price`) ? `pe-v-${i}-price-err` : undefined} onChange={(e) => setV(i, { price: e.target.value })} style={{ paddingInlineStart: 10 }} />
      <Riyal />
    </div>
  );
  const stockCell = (v: VariantDraft, i: number) => v.isNew ? (
    <input id={`pe-v-${i}-stock`} className="lk-input ltr lk-num pe-cell" dir="ltr" inputMode="numeric" value={v.stock} aria-invalid={!!fe(`v.${i}.stock`)} aria-label={tx(`الكمية الأولية ${name(v)}`, `Starting quantity for ${name(v)}`)}
      aria-describedby={fe(`v.${i}.stock`) ? `pe-v-${i}-stock-err` : undefined} onChange={(e) => setV(i, { stock: e.target.value })} />
  ) : (() => {
    const [r, j] = stockOf(v.sku);
    const t = r + j;
    return <span className="pe-vstock"><span className={`lk-num lk-strong${t <= 3 ? ' low' : ''}`}>{t}</span><span className="lk-micro lk-3 lk-num">{tx(`الرياض ${r} · جدة ${j}`, `RUH ${r} · JED ${j}`)}</span></span>;
  })();
  const cellErr = (i: number, f: string) => fe(`v.${i}.${f}`) ? <span className="lk-error" id={`pe-v-${i}-${f}-err`}><Icon name="alert" size="xs" />{err(fe(`v.${i}.${f}`))}</span> : null;

  return (
    <Section id="variants" tone={varErr ? 'error' : undefined} title={tx('الخيارات والمتغيرات', 'Options and variants')}
      sub={vs.length ? tx(`${vs.length} متغيرات من ${draft.colors.length || 1} ألوان × ${draft.sizes.length || 1} مقاسات`, `${vs.length} variants from ${draft.colors.length || 1} colour${draft.colors.length === 1 ? '' : 's'} × ${draft.sizes.length || 1} size${draft.sizes.length === 1 ? '' : 's'}`) : tx('أضف ألوانًا أو مقاسات إن كان المنتج يُباع بأكثر من خيار.', 'Add colours or sizes if the product comes in more than one option.')}>
      <div className="pe-grid2">{optEditor('colors')}{optEditor('sizes')}</div>
      {vs.length > 0 && (
        <>
          <div className="pe-bulk">
            <label htmlFor="pe-bulk" className="lk-small lk-strong">{tx('سعر موحّد', 'One price for all')}</label>
            <div className="lk-affix pe-bulk-in">
              <input id="pe-bulk" className="lk-input ltr lk-num has-suffix" dir="ltr" inputMode="decimal" value={bulk} placeholder={draft.price || '0.00'} onChange={(e) => { setBulk(e.target.value); setApplied(null); }} style={{ paddingInlineStart: 12 }} />
              <Riyal />
            </div>
            <button type="button" className="lk-btn sm" disabled={bulkOk === null || bulkOk === 0} onClick={() => {
              const p = (bulkOk! / 100).toFixed(2);
              set({ variants: vs.map((v) => ({ ...v, price: p })) });
              setApplied(p);
            }}>{tx(`طبّق على ${vs.length} متغيرات`, `Apply to all ${vs.length}`)}</button>
            <span className="lk-small lk-3" role="status">{applied ? <>{tx('طُبّق', 'Applied')} <Money v={parseMoney(applied)!} /> {tx('على كل المتغيرات. يمكنك التجاهل قبل الحفظ.', 'to every variant. You can still discard before saving.')}</> : ''}</span>
          </div>

          <div className="pe-matrix">
            <table className="pe-table pe-vtable" aria-label={tx('مصفوفة المتغيرات', 'Variant matrix')}>
              <thead><tr><th scope="col">{tx('المتغير', 'Variant')}</th><th scope="col">SKU</th><th scope="col">{tx('السعر', 'Price')}</th><th scope="col" className="n">{tx('المتاح', 'Available')}</th></tr></thead>
              <tbody>
                {vs.map((v, i) => (
                  <tr key={`${v.color}|${v.size}`} className={i > 0 && vs[i - 1].color !== v.color ? 'grp' : undefined}>
                    <th scope="row"><span className="lk-row" style={{ gap: 10 }}>{v.color && <Swatch color={v.color} />}<span className="lk-col"><span className="lk-strong">{name(v)}</span>{v.isNew && <span className="lk-micro" style={{ color: 'var(--lk-indigo-600)' }}>{tx('جديد', 'New')}</span>}</span></span></th>
                    <td>{skuInput(v, i)}{cellErr(i, 'sku')}</td>
                    <td>{priceInput(v, i)}{cellErr(i, 'price')}</td>
                    <td className="n">{stockCell(v, i)}{cellErr(i, 'stock')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="pe-vcards" aria-label={tx('المتغيرات', 'Variants')}>
              {vs.map((v, i) => (
                <li key={`${v.color}|${v.size}`} className="pe-vcard">
                  <div className="lk-row lk-between">
                    <span className="lk-row" style={{ gap: 10 }}>{v.color && <Swatch color={v.color} />}<span className="lk-strong">{name(v)}</span>{v.isNew && <span className="lk-pill brand" style={{ height: 20 }}>{tx('جديد', 'New')}</span>}</span>
                    {!v.isNew && stockCell(v, i)}
                  </div>
                  <div className="pe-vcard-f">
                    <div className="lk-field"><span className="lk-micro lk-3">SKU</span>{skuInput(v, i)}{cellErr(i, 'sku')}</div>
                    <div className="lk-field"><span className="lk-micro lk-3">{tx('السعر', 'Price')}</span>{priceInput(v, i)}{cellErr(i, 'price')}</div>
                    {v.isNew && <div className="lk-field"><span className="lk-micro lk-3">{tx('الكمية الأولية', 'Starting qty')}</span>{stockCell(v, i)}{cellErr(i, 'stock')}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p className="lk-small lk-3">{tx('الكمية الأولية للمتغيرات الجديدة فقط؛ تعديل الموجود يتم من المخزون مع سبب. حذف لون أو مقاس لا يمس الطلبات السابقة التي تحمله.', 'Starting quantity is for new variants only; existing stock changes in Inventory with a reason. Removing a colour or size never alters past orders that include it.')}</p>
        </>
      )}
    </Section>
  );
}

/* ---------- Shipping ---------- */

export function ShippingSection({ ed }: P) {
  const tx = useTx();
  const err = useErrText();
  const { draft, set, fe } = ed;
  const g = Number(draft.weight);
  return (
    <Section id="shipping" tone={fe('weight') ? 'error' : undefined} title={tx('الشحن', 'Shipping')}>
      <SwitchRow id="pe-physical" checked={draft.type === 'physical'} onChange={(v) => set({ type: v ? 'physical' : 'digital' })} label={tx('منتج ملموس يُشحن', 'Physical product that ships')}
        help={draft.type === 'physical' ? tx('نستخدم الوزن لحساب أسعار الشحن وإصدار البوليصة.', 'We use the weight to price shipping and issue the waybill.') : tx('منتج رقمي: يُسلَّم بالبريد أو برمز، بلا وزن ولا شحن.', 'Digital: delivered by email or code, with no weight or shipping.')} />
      {draft.type === 'physical' && (
        <div className="pe-grid2">
          <Field id="pe-weight" k="weight" label={tx('الوزن مع التغليف', 'Weight with packaging')} error={err(fe('weight'))}
            help={g > 0 && Number.isFinite(g) ? tx(`≈ ${(g / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 })} كغ`, `≈ ${(g / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 })} kg`) : tx('بالغرام.', 'In grams.')}>
            <div className="lk-affix">
              <input id="pe-weight" className="lk-input ltr lk-num has-suffix" dir="ltr" inputMode="numeric" value={draft.weight} aria-invalid={!!fe('weight')} style={{ paddingInlineStart: 12 }}
                aria-describedby={describedBy('pe-weight', 'weight', !!fe('weight'), true)} onChange={(e) => set({ weight: e.target.value })} />
              <span className="lk-suffix">{tx('غ', 'g')}</span>
            </div>
          </Field>
        </div>
      )}
    </Section>
  );
}

/* ---------- Search engine listing ---------- */

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export function SeoSection({ ed }: P) {
  const tx = useTx();
  const err = useErrText();
  const { lang } = useLang();
  const store = settingsStore.use();
  const { draft, set, fe } = ed;
  const title = draft.seoTitle || (lang === 'ar' ? draft.nameAr : draft.nameEn) || draft.nameEn || draft.nameAr;
  const desc = draft.seoDesc || (lang === 'ar' ? draft.descAr : draft.descEn);
  const ec = parseMoney(draft.price);
  const suggested = slugify(draft.nameEn);
  return (
    <Section id="seo" tone={fe('slug') ? 'error' : undefined} title={tx('الظهور في محركات البحث', 'Search engine listing')} sub={tx('كيف قد تظهر صفحة المنتج في نتائج البحث. لا نضمن ترتيبًا.', 'How the product page may appear in search results. Ranking is never guaranteed.')}>
      <figure className="pe-serp" aria-label={tx('معاينة نتيجة البحث', 'Search result preview')}>
        <div className="pe-serp-site"><span className="fav" aria-hidden="true">{store.store.name.slice(0, 1)}</span><span className="lk-col"><span className="lk-small">{store.store.name}</span><span className="lk-micro lk-3" dir="ltr">platform.example › {store.domain.slug} › p › {draft.slug || '…'}</span></span></div>
        <p className="pe-serp-t">{title || <span className="lk-3">{tx('عنوان الصفحة', 'Page title')}</span>}</p>
        <p className="pe-serp-d">{ec ? <span className="lk-3"><Money v={ec} /> · </span> : null}{desc || <span className="lk-3">{tx('أضف وصفًا يشرح المنتج في جملة أو جملتين.', 'Add a description that explains the product in a sentence or two.')}</span>}</p>
      </figure>
      <Field id="pe-seoTitle" label={tx('عنوان الصفحة', 'Page title')} help={tx('يُستخدم اسم المنتج إن تركته فارغًا. الأفضل أقل من 60 حرفًا.', 'The product name is used if empty. Best under 60 characters.')} aside={<Counter n={draft.seoTitle.length} max={70} ideal={60} />}>
        <input id="pe-seoTitle" className="lk-input" maxLength={70} value={draft.seoTitle} placeholder={title} aria-describedby="pe-seoTitle-help" onChange={(e) => set({ seoTitle: e.target.value })} />
      </Field>
      <Field id="pe-seoDesc" label={tx('الوصف', 'Meta description')} help={tx('الأفضل بين 120 و155 حرفًا.', 'Best between 120 and 155 characters.')} aside={<Counter n={draft.seoDesc.length} max={160} ideal={155} />}>
        <textarea id="pe-seoDesc" className="lk-textarea" style={{ minHeight: 88 }} maxLength={160} value={draft.seoDesc} aria-describedby="pe-seoDesc-help" onChange={(e) => set({ seoDesc: e.target.value })} />
      </Field>
      <Field id="pe-slug" k="slug" label={tx('رابط الصفحة', 'URL handle')} error={err(fe('slug'))} help={tx('حروف لاتينية صغيرة وأرقام وشرطات.', 'Lowercase Latin letters, digits and hyphens.')}
        aside={suggested && suggested !== draft.slug ? <button type="button" className="pe-linkbtn lk-small" onClick={() => set({ slug: suggested })}>{tx('أنشئه من الاسم الإنجليزي', 'Generate from English name')}</button> : undefined}>
        <div className="pe-prefixed" dir="ltr">
          <span className="lk-3 lk-small">/p/</span>
          <input id="pe-slug" className="lk-input ltr" dir="ltr" value={draft.slug} aria-invalid={!!fe('slug')} aria-describedby={describedBy('pe-slug', 'slug', !!fe('slug'), true)} onChange={(e) => set({ slug: e.target.value })} />
        </div>
      </Field>
    </Section>
  );
}

/* ---------- Status, channels, category ---------- */

export const STATUS_TONE: Record<ProductStatus, Tone> = { active: 'ok', draft: 'idle', archived: 'warn' };
export function useStatusText() {
  const tx = useTx();
  return {
    name: (s: ProductStatus) => ({ active: tx('نشط', 'Active'), draft: tx('مسودة', 'Draft'), archived: tx('مؤرشف', 'Archived') })[s],
    help: (s: ProductStatus) => ({
      active: tx('معروض للعملاء في القنوات المفعّلة.', 'Visible to shoppers on the channels turned on.'),
      draft: tx('مخفي عن العملاء حتى تفعّله.', 'Hidden from shoppers until you activate it.'),
      archived: tx('مخفي ومحفوظ مع سجل طلباته. يمكن إعادته لاحقًا.', 'Hidden and kept with its order history. You can restore it later.'),
    })[s],
    icon: (s: ProductStatus) => (s === 'active' ? 'check' : s === 'draft' ? 'clock' : 'box') as 'check' | 'clock' | 'box',
  };
}

export function StatusControl({ ed }: P) {
  const tx = useTx();
  const st = useStatusText();
  const { draft, set } = ed;
  return (
    <div className="lk-col lk-gap-12">
      <div className="lk-seg pe-status-seg" role="radiogroup" aria-label={tx('حالة المنتج', 'Product status')}>
        {(['active', 'draft', 'archived'] as ProductStatus[]).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={draft.status === s} aria-pressed={draft.status === s} onClick={() => set({ status: s })}>{st.name(s)}</button>
        ))}
      </div>
      <p className="lk-small lk-2 lk-row" style={{ gap: 8, alignItems: 'flex-start' }}><Pill tone={STATUS_TONE[draft.status]} icon={st.icon(draft.status)}>{st.name(draft.status)}</Pill><span>{st.help(draft.status)}</span></p>
    </div>
  );
}

export function ChannelsControl({ ed }: P) {
  const tx = useTx();
  const { draft, set } = ed;
  const items: { c: Channel; label: string; help: string }[] = [
    { c: 'online', label: tx('المتجر الإلكتروني', 'Online store'), help: tx('موقع متجرك.', 'Your store website.') },
    { c: 'market', label: tx('سوق لك', 'LAK marketplace'), help: tx('يخضع لمراجعة الأهلية قبل الظهور.', 'Subject to an eligibility review before it appears.') },
    { c: 'app', label: tx('تطبيق المتجر', 'Store app'), help: tx('تطبيق الجوال الخاص بمتجرك.', 'Your store’s mobile app.') },
  ];
  const on = items.filter((i) => draft.channels[i.c]).length;
  return (
    <div className="lk-col">
      {items.map((i) => <SwitchRow key={i.c} id={`pe-ch-${i.c}`} checked={draft.channels[i.c]} onChange={(v) => set({ channels: { ...draft.channels, [i.c]: v } })} label={i.label} help={i.help} />)}
      {draft.status !== 'active' && on > 0 && <p className="lk-small lk-3 pe-note" style={{ marginTop: 8 }}>{tx('تُطبَّق القنوات عندما يصبح المنتج نشطًا.', 'Channels apply once the product is active.')}</p>}
      {on === 0 && <p className="lk-small pe-note warn" style={{ marginTop: 8 }}>{tx('لا قناة مفعّلة: لن يراه أحد حتى إن كان نشطًا.', 'No channel on: nobody will see it, even when active.')}</p>}
    </div>
  );
}

export function CategoryControl({ ed }: P) {
  const tx = useTx();
  const { lang } = useLang();
  const { draft, set } = ed;
  return (
    <Field id="pe-category" label={tx('التصنيف', 'Category')} help={tx('يحدد مكان المنتج في قوائم المتجر وفلاتره.', 'Where the product sits in store menus and filters.')}>
      <select id="pe-category" className="lk-select" value={draft.category.en} aria-describedby="pe-category-help"
        onChange={(e) => set({ category: CATEGORIES.find((c) => c.en === e.target.value) ?? draft.category })}>
        {[...CATEGORIES.filter((c) => c.en !== draft.category.en), draft.category].sort((a, b) => a[lang].localeCompare(b[lang], lang)).map((c) => <option key={c.en} value={c.en}>{c[lang]}</option>)}
      </select>
    </Field>
  );
}

/* ---------- Storefront preview card ---------- */

export function PreviewCard({ ed, big }: P & { big?: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const cn = useColorName();
  const st = useStatusText();
  const { draft } = ed;
  const name = (lang === 'ar' ? draft.nameAr : draft.nameEn) || draft.nameAr || draft.nameEn;
  const price = parseMoney(draft.price);
  const cmp = draft.compareAt.trim() ? parseMoney(draft.compareAt) : null;
  const off = discountPct(draft.price, draft.compareAt);
  const first = draft.media[0];
  const prices = draft.variants.map((v) => parseMoney(v.price)).filter((p): p is number => p !== null && p > 0);
  const from = prices.length && Math.min(...prices) !== Math.max(...prices) ? Math.min(...prices) : null;
  const hidden = draft.status !== 'active' || !draft.channels.online;
  const colors = duplicateValues(draft.colors).length ? [...new Set(draft.colors)] : draft.colors;
  return (
    <figure className={`pe-pcard${big ? ' big' : ''}`} aria-label={tx('معاينة بطاقة المنتج في المتجر', 'Storefront product card preview')}>
      <div className="pe-pcard-img">
        <Photo src={first ? mediaSrc(first) : undefined} alt={first?.alt ?? ''} />
        {off !== null && <span className="pe-pcard-off lk-num"><bdi dir="ltr">−{off}%</bdi></span>}
      </div>
      <figcaption className="pe-pcard-body" lang={lang}>
        <span className="lk-micro lk-3">{draft.category[lang]}</span>
        <span className="pe-pcard-name">{name || <span className="lk-3">{tx('اسم المنتج', 'Product name')}</span>}</span>
        <span className="lk-row lk-wrap" style={{ gap: '2px 8px' }}>
          {price ? <span className="lk-strong pe-pcard-price">{from !== null ? tx('من ', 'From ') : ''}<Money v={from ?? price} figure /></span> : <span className="lk-3">—</span>}
          {cmp !== null && off !== null && <s className="lk-small lk-3"><Money v={cmp} /></s>}
        </span>
        {colors.length > 0 && <span className="lk-row" style={{ gap: 4 }} aria-label={colors.map(cn).join('، ')}>{colors.slice(0, 5).map((c) => <Swatch key={c} color={c} />)}{draft.sizes.length > 0 && <span className="lk-micro lk-3" style={{ marginInlineStart: 4 }}>{tx(`${draft.sizes.length} مقاسات`, `${draft.sizes.length} sizes`)}</span>}</span>}
      </figcaption>
      {hidden && <p className="pe-pcard-hidden lk-micro">{draft.status !== 'active' ? tx(`غير ظاهر للعملاء: ${st.name(draft.status)}`, `Not visible to shoppers: ${st.name(draft.status).toLowerCase()}`) : tx('غير ظاهر: المتجر الإلكتروني متوقف', 'Not visible: online store is off')}</p>}
    </figure>
  );
}

/* ---------- Readiness (new products) ---------- */

export function Readiness({ ed, onJump }: P & { onJump: (k: string) => void }) {
  const tx = useTx();
  const { draft } = ed;
  const items: { k: string; label: string; done: boolean }[] = [
    { k: 'nameAr', label: tx('الاسم بالعربية والإنجليزية', 'Name in Arabic and English'), done: !!draft.nameAr.trim() && !!draft.nameEn.trim() },
    { k: 'media', label: tx('صورة واحدة على الأقل بنص بديل', 'At least one image with alt text'), done: draft.media.length > 0 && draft.media.every((m) => m.alt.trim()) },
    { k: 'price', label: tx('السعر', 'Price'), done: !!parseMoney(draft.price) },
    { k: 'sku', label: tx('SKU والكمية', 'SKU and quantity'), done: /^[A-Za-z0-9-]{3,32}$/.test(draft.sku) },
    { k: 'publishing', label: tx('فعّله في قناة واحدة على الأقل', 'Turn on at least one channel'), done: Object.values(draft.channels).some(Boolean) },
  ];
  const done = items.filter((i) => i.done).length;
  return (
    <div className="pe-ready">
      <div className="lk-row lk-between"><span className="lk-h3">{tx('جاهز للبيع', 'Ready to sell')}</span><span className="lk-small lk-2 lk-num">{done}/{items.length}</span></div>
      <div className="pe-ready-bar" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done} aria-label={tx('اكتمال المنتج', 'Product completeness')}><span style={{ width: `${(done / items.length) * 100}%` }} /></div>
      <ol>
        {items.map((i) => (
          <li key={i.k} className={i.done ? 'done' : undefined}>
            <button type="button" onClick={() => onJump(i.k)}><span className="pe-ready-ic">{i.done ? <Icon name="check" size="xs" /> : null}</span><span className="lk-grow">{i.label}</span>{!i.done && <Icon name="chevron" size="xs" />}</button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export { Ref };
