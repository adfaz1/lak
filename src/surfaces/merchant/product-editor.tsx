import { useMemo, useState } from 'react';
import { navigate, replace } from '../../core/router';
import { Alert, Dialog, Field, SaveBar, Sim } from '../../core/ui';
import { LOCATIONS, LOC_IDS, type Channel } from './domain';
import {
  emptyDraft, fromDraft, margin, parseIntStrict, parseMoney, rebuildVariants, takenSkus, toDraft, validateDraft,
  type DraftError, type Media, type ProductDraft, type VariantDraft,
} from './catalog';
import { available, levelOf } from './inventory';
import { can } from './perms';
import { draftsStore, levelsStore, productsStore, testStore } from './stores';
import { ActionLocked, Icon, Money, mhref, useL, useLeaveGuard, useTx } from './kit';
import { useStatusName } from './products';

type SaveState = 'clean' | 'dirty' | 'saving' | 'failed' | 'saved';

export function ProductEditor({ id }: { id: string }) {
  const tx = useTx();
  const l = useL();
  const statusName = useStatusName();
  const products = productsStore.use();
  const levels = levelsStore.use();
  const role = testStore.use().role;
  const isNew = id === 'new';
  const product = products.find((p) => p.id === id);
  const base = useMemo(() => (product ? toDraft(product) : emptyDraft()), [product?.id, product?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraftState] = useState<ProductDraft>(() => draftsStore.get()[id] ?? base);
  const [state, setState] = useState<SaveState>(() => (draftsStore.get()[id] ? 'dirty' : 'clean'));
  const [savedAt, setSavedAt] = useState('');
  const [showErr, setShowErr] = useState(false);
  const [failNext, setFailNext] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [newColor, setNewColor] = useState('');
  const [newSize, setNewSize] = useState('');
  const restored = !!draftsStore.get()[id];
  const dirty = state === 'dirty' || state === 'failed' || state === 'saving';
  useLeaveGuard(dirty, setLeaveTo);

  if (!isNew && !product) return <><a className="back" href={mhref('products')}>{tx('العودة إلى المنتجات', 'Back to products')}</a><Alert tone="danger">{tx('لا يوجد منتج بهذا المعرف.', 'No product with this id.')}</Alert></>;
  const canEdit = can(role, 'product.edit');
  const errors = validateDraft(draft, takenSkus(products, product?.id));
  const errCount = Object.keys(errors).length;
  const set = (patch: Partial<ProductDraft>) => {
    const next = { ...draft, ...patch };
    setDraftState(next);
    draftsStore.set((d) => ({ ...d, [id]: next }));
    setState('dirty');
  };
  const discard = () => { setDraftState(base); draftsStore.set((d) => { const n = { ...d }; delete n[id]; return n; }); setState('clean'); setShowErr(false); };
  const errText = (e?: DraftError) => e && ({
    required: tx('مطلوب.', 'Required.'), money: tx('أدخل مبلغًا صالحًا أكبر من صفر، مثل 290 أو 290.50.', 'Enter a valid amount above zero, e.g. 290 or 290.50.'),
    compareAt: tx('يجب أن يكون أعلى من السعر.', 'Must be higher than the price.'), skuTaken: tx('هذا SKU مستخدم لمنتج آخر.', 'This SKU is used by another product.'),
    skuFormat: tx('3–32 حرفًا لاتينيًا أو رقمًا أو شرطة.', '3–32 Latin letters, digits or hyphens.'), weight: tx('الوزن بالغرام، بين 1 و30000.', 'Weight in grams, 1–30000.'),
    slug: tx('حروف لاتينية صغيرة وأرقام وشرطات فقط.', 'Lowercase Latin letters, digits and hyphens only.'), alt: tx('أضف نصًا بديلًا يصف الصورة.', 'Add alt text describing the image.'),
    duplicate: tx('قيمة مكررة في القائمة.', 'Duplicate value in the list.'), stock: tx('عدد صحيح 0 أو أكثر.', 'A whole number, 0 or more.'), skuRepeated: tx('SKU مكرر في المتغيرات.', 'SKU repeated in variants.'),
  })[e];
  const fe = (k: string) => (showErr ? errText(errors[k]) : undefined);

  const save = () => {
    setShowErr(true);
    if (errCount) { document.getElementById('pe-errors')?.focus(); return; }
    setState('saving');
    const willFail = failNext;
    setTimeout(() => {
      if (willFail) { setState('failed'); setFailNext(false); return; }
      const all = productsStore.get();
      const newId = isNew ? `p${Math.max(0, ...all.map((p) => Number(p.id.slice(1)) || 0)) + 1}` : id;
      const saved = fromDraft(draft, newId, (product?.version ?? 0) + 1, draft.media);
      if (product) saved.category = product.category;
      productsStore.set(isNew ? [saved, ...all] : all.map((p) => (p.id === id ? saved : p)));
      // New SKUs start at the Riyadh warehouse with the initial quantity typed here. Later changes go through Inventory.
      const known = new Set(levelsStore.get().map((x) => x.sku));
      const fresh: { sku: string; qty: number }[] = draft.variants.length
        ? draft.variants.filter((v) => !known.has(v.sku.trim())).map((v) => ({ sku: v.sku.trim(), qty: parseIntStrict(v.stock || '0') ?? 0 }))
        : !known.has(saved.sku) && saved.type === 'physical' ? [{ sku: saved.sku, qty: parseIntStrict(draft.stock || '0') ?? 0 }] : [];
      if (fresh.length) levelsStore.set((ls) => [...ls, ...fresh.flatMap((f) => LOC_IDS.map((loc) => ({ sku: f.sku, loc, onHand: loc === 'ryd' ? f.qty : 0, reserved: 0, incoming: 0, version: 1, threshold: 3 })))]);
      draftsStore.set((d) => { const n = { ...d }; delete n[id]; return n; });
      setSavedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
      setState('saved');
      setShowErr(false);
      if (isNew) replace(mhref(`products/${newId}`));
    }, 700);
  };

  const stateText: Record<SaveState, string> = {
    clean: tx('لا تغييرات', 'No changes'),
    dirty: tx('تغييرات غير محفوظة', 'Unsaved changes'),
    saving: tx('جارٍ الحفظ…', 'Saving…'),
    failed: tx('تعذر الحفظ: انقطع الاتصال (محاكاة). احتفظنا بكل تعديلاتك؛ أعد المحاولة.', 'Couldn’t save: the connection dropped (simulated). All your edits are kept; try again.'),
    saved: tx(`حُفظ الساعة ${savedAt} · الإصدار ${product?.version ?? 1}`, `Saved at ${savedAt} · version ${product?.version ?? 1}`),
  };
  const m = margin(parseMoney(draft.price), draft.cost.trim() ? parseMoney(draft.cost) : null);
  const errorKeys = Object.keys(errors);
  const fieldFor = (k: string) => (k.startsWith('media.') ? `pe-alt-${k.split('.')[1]}` : k.startsWith('v.') ? `pe-v-${k.split('.')[1]}-${k.split('.')[2]}` : `pe-${k}`);

  const addOption = (kind: 'colors' | 'sizes', value: string, clear: () => void) => {
    if (!value.trim()) return;
    const next = { ...draft, [kind]: [...draft[kind], value.trim()] };
    set({ [kind]: next[kind], variants: rebuildVariants(next) });
    clear();
  };
  const removeOption = (kind: 'colors' | 'sizes', i: number) => {
    const next = { ...draft, [kind]: draft[kind].filter((_, j) => j !== i) };
    set({ [kind]: next[kind], variants: rebuildVariants(next) });
  };
  const setVariant = (i: number, patch: Partial<VariantDraft>) => set({ variants: draft.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  const moveMedia = (i: number, d: -1 | 1) => { const n = [...draft.media]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; set({ media: n }); };
  const title = isNew ? tx('منتج جديد', 'New product') : l(product!.name);

  return (
    <>
      <a className="back" href={mhref('products')}>{tx('العودة إلى المنتجات', 'Back to products')}</a>
      <div className="page-header">
        <div className="grow"><h1>{title}</h1><p className="small muted" role="status" aria-live="polite">{stateText[state]}</p></div>
        {!isNew && <a className="btn" href="#/store">{tx('معاينة المتجر', 'Preview store')}</a>}
      </div>
      {!canEdit && <ActionLocked>{tx('دورك يعرض المنتج للقراءة فقط. لن تُحفظ أي تعديلات.', 'Your role shows this product read-only. No edits can be saved.')}</ActionLocked>}
      {restored && state === 'dirty' && <Alert tone="info">{tx('استعدنا تعديلات غير محفوظة من هذه الجلسة.', 'We restored unsaved edits from this session.')}</Alert>}
      {state === 'failed' && <Alert tone="danger" title={tx('لم يُحفظ المنتج.', 'The product was not saved.')}>{tx('انقطع الاتصال بالخادم (محاكاة). كل ما كتبته باقٍ في الصفحة. أعد الحفظ عند عودة الاتصال.', 'The connection to the server dropped (simulated). Everything you typed is still on the page. Save again when the connection is back.')}</Alert>}
      {showErr && errCount > 0 && (
        <div id="pe-errors" tabIndex={-1} className="alert" role="alert">
          <b>{tx(`صحّح ${errCount} حقول قبل الحفظ:`, `Fix ${errCount} fields before saving:`)}</b>
          <ul className="m-errlist">{errorKeys.slice(0, 8).map((k) => <li key={k}><button type="button" className="m-linkbtn" onClick={() => document.getElementById(fieldFor(k))?.focus()}>{k}: {errText(errors[k])}</button></li>)}</ul>
        </div>
      )}

      <fieldset disabled={!canEdit} className="m-editor">
        <div className="cols">
          <div className="col-main">
            <section className="card pad" aria-labelledby="pe-basic">
              <h2 id="pe-basic">{tx('الأساسيات', 'Basics')}</h2>
              <fieldset><legend>{tx('نوع المنتج', 'Product type')}</legend>
                <div className="m-inline-radios">
                  <label className="radio"><input type="radio" name="pe-type" checked={draft.type === 'physical'} onChange={() => set({ type: 'physical' })} /> {tx('ملموس يُشحن', 'Physical, shipped')}</label>
                  <label className="radio"><input type="radio" name="pe-type" checked={draft.type === 'digital'} onChange={() => set({ type: 'digital' })} /> {tx('رقمي (تنزيل/رمز)', 'Digital (download/code)')}</label>
                </div>
              </fieldset>
              <div className="grid-2">
                <Field id="pe-nameAr" label={tx('الاسم بالعربية', 'Name in Arabic')} error={fe('nameAr')}><input id="pe-nameAr" className="input" dir="rtl" lang="ar" value={draft.nameAr} aria-invalid={!!fe('nameAr')} onChange={(e) => set({ nameAr: e.target.value })} /></Field>
                <Field id="pe-nameEn" label={tx('الاسم بالإنجليزية', 'Name in English')} error={fe('nameEn')}><input id="pe-nameEn" className="input" dir="ltr" lang="en" value={draft.nameEn} aria-invalid={!!fe('nameEn')} onChange={(e) => set({ nameEn: e.target.value })} /></Field>
              </div>
              <div className="grid-2">
                <Field id="pe-descAr" label={tx('الوصف بالعربية', 'Description in Arabic')}><textarea id="pe-descAr" className="input" dir="rtl" lang="ar" value={draft.descAr} onChange={(e) => set({ descAr: e.target.value })} /></Field>
                <Field id="pe-descEn" label={tx('الوصف بالإنجليزية', 'Description in English')}><textarea id="pe-descEn" className="input" dir="ltr" lang="en" value={draft.descEn} onChange={(e) => set({ descEn: e.target.value })} /></Field>
              </div>
            </section>

            <section className="card pad" aria-labelledby="pe-media">
              <h2 id="pe-media">{tx('الوسائط', 'Media')}</h2>
              {draft.media.length === 0 && <p className="muted small">{tx('لا صور بعد.', 'No images yet.')}</p>}
              <ol className="m-media">
                {draft.media.map((md, i) => (
                  <li key={md.id}>
                    <span className="m-media-tile" aria-hidden="true">{l(md.label).slice(0, 2)}</span>
                    <div className="grow">
                      <Field id={`pe-alt-${i}`} label={tx(`نص بديل للصورة ${i + 1}`, `Alt text for image ${i + 1}`)} error={fe(`media.${i}`)} hint={tx('يُقرأ لمن لا يرى الصورة.', 'Read to people who can’t see the image.')}>
                        <input id={`pe-alt-${i}`} className="input" value={md.alt} aria-invalid={!!fe(`media.${i}`)} onChange={(e) => set({ media: draft.media.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)) })} />
                      </Field>
                    </div>
                    <div className="m-icon-btns">
                      <button type="button" className="btn small" onClick={() => moveMedia(i, -1)} disabled={i === 0} aria-label={tx(`تقديم الصورة ${i + 1}`, `Move image ${i + 1} earlier`)}><Icon name="up" size={16} /></button>
                      <button type="button" className="btn small" onClick={() => moveMedia(i, 1)} disabled={i === draft.media.length - 1} aria-label={tx(`تأخير الصورة ${i + 1}`, `Move image ${i + 1} later`)}><Icon name="down" size={16} /></button>
                      <button type="button" className="btn small" onClick={() => set({ media: draft.media.filter((_, j) => j !== i) })} aria-label={tx(`حذف الصورة ${i + 1}`, `Remove image ${i + 1}`)}><Icon name="close" size={16} /></button>
                    </div>
                  </li>
                ))}
              </ol>
              <button type="button" className="btn" onClick={() => set({ media: [...draft.media, { id: `m${Date.now()}`, label: { ar: 'صورة تجريبية', en: 'Sample image' }, alt: '' } as Media] })}>
                <Icon name="plus" size={16} /> {tx('أضف صورة تجريبية', 'Add a sample image')}
              </button> <Sim />
              <p className="small muted">{tx('لا يُرفع أي ملف في هذه المعاينة؛ تُضاف صورة مثال لاختبار النص البديل والترتيب.', 'No file is uploaded in this preview; a sample image is added to test alt text and ordering.')}</p>
            </section>

            <section className="card pad" aria-labelledby="pe-pricing">
              <h2 id="pe-pricing">{tx('التسعير', 'Pricing')}</h2>
              <div className="grid-2">
                <Field id="pe-price" label={tx('السعر (ر.س، شامل الضريبة)', 'Price (SAR, VAT included)')} error={fe('price')}><input id="pe-price" className="input" dir="ltr" inputMode="decimal" value={draft.price} aria-invalid={!!fe('price')} onChange={(e) => set({ price: e.target.value })} /></Field>
                <Field id="pe-compareAt" label={tx('السعر قبل الخصم (اختياري)', 'Compare-at price (optional)')} error={fe('compareAt')}><input id="pe-compareAt" className="input" dir="ltr" inputMode="decimal" value={draft.compareAt} aria-invalid={!!fe('compareAt')} onChange={(e) => set({ compareAt: e.target.value })} /></Field>
                <Field id="pe-cost" label={tx('تكلفة القطعة (اختياري، داخلي)', 'Cost per item (optional, internal)')} error={fe('cost')}><input id="pe-cost" className="input" dir="ltr" inputMode="decimal" value={draft.cost} aria-invalid={!!fe('cost')} onChange={(e) => set({ cost: e.target.value })} /></Field>
              </div>
              <p className="small">{m ? <>{tx('هامش إجمالي تقديري لكل قطعة:', 'Estimated gross margin per item:')} <span className="strong"><Money v={m.amount} /></span> (<bdi dir="ltr">{m.pct}%</bdi>) · {tx('قبل الشحن والرسوم، وليس ربحًا صافيًا.', 'before shipping and fees; not net profit.')}</>
                : <span className="muted">{tx('أدخل التكلفة لعرض الهامش. لا نعرض ربحية دون تكلفة.', 'Enter a cost to see margin. We never show profitability without a cost.')}</span>}</p>
            </section>

            <section className="card pad" aria-labelledby="pe-inv">
              <h2 id="pe-inv">{tx('المخزون والشحن', 'Inventory and shipping')}</h2>
              <div className="grid-2">
                <Field id="pe-sku" label="SKU" error={fe('sku')} hint={draft.variants.length ? tx('أساس SKU للمتغيرات.', 'Base for variant SKUs.') : undefined}><input id="pe-sku" className="input" dir="ltr" value={draft.sku} aria-invalid={!!fe('sku')} onChange={(e) => set({ sku: e.target.value.toUpperCase() })} /></Field>
                <Field id="pe-barcode" label={tx('الباركود (اختياري)', 'Barcode (optional)')}><input id="pe-barcode" className="input" dir="ltr" value={draft.barcode} onChange={(e) => set({ barcode: e.target.value })} /></Field>
                {draft.type === 'physical' && <Field id="pe-weight" label={tx('الوزن (غرام)', 'Weight (grams)')} error={fe('weight')}><input id="pe-weight" className="input" dir="ltr" inputMode="numeric" value={draft.weight} aria-invalid={!!fe('weight')} onChange={(e) => set({ weight: e.target.value })} /></Field>}
                {draft.type === 'physical' && !draft.variants.length && isNew && <Field id="pe-stock" label={tx('الكمية الأولية في مستودع الرياض', 'Initial quantity at Riyadh warehouse')} error={fe('stock')}><input id="pe-stock" className="input" dir="ltr" inputMode="numeric" value={draft.stock} aria-invalid={!!fe('stock')} onChange={(e) => set({ stock: e.target.value })} /></Field>}
              </div>
              {draft.type === 'digital' && <p className="small muted">{tx('المنتج الرقمي لا يحتاج وزنًا أو مخزونًا.', 'A digital product needs no weight or stock.')}</p>}
              {!isNew && draft.type === 'physical' && !draft.variants.length && (
                <p className="small">{LOC_IDS.map((loc) => { const lv = levelOf(levels, draft.sku, loc); return <span key={loc}>{l(LOCATIONS[loc])}: <bdi>{lv ? available(lv) : 0}</bdi> {tx('متاح', 'available')} · </span>; })}
                  <a href={mhref('inventory', { q: draft.sku })}>{tx('عدّل المخزون مع سبب من صفحة المخزون', 'Adjust stock with a reason in Inventory')}</a></p>
              )}
            </section>

            <section className="card pad" aria-labelledby="pe-var">
              <h2 id="pe-var">{tx('الخيارات والمتغيرات', 'Options and variants')}</h2>
              <div className="grid-2">
                {(['colors', 'sizes'] as const).map((kind) => (
                  <div key={kind}>
                    <Field id={`pe-${kind}`} label={kind === 'colors' ? tx('الألوان', 'Colours') : tx('المقاسات', 'Sizes')} error={fe(kind)}>
                      <div className="m-row-fields">
                        <input id={`pe-${kind}`} className="input" value={kind === 'colors' ? newColor : newSize} aria-invalid={!!fe(kind)}
                          onChange={(e) => (kind === 'colors' ? setNewColor(e.target.value) : setNewSize(e.target.value))}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(kind, kind === 'colors' ? newColor : newSize, () => (kind === 'colors' ? setNewColor('') : setNewSize(''))); } }} />
                        <button type="button" className="btn" onClick={() => addOption(kind, kind === 'colors' ? newColor : newSize, () => (kind === 'colors' ? setNewColor('') : setNewSize('')))}>{tx('أضف', 'Add')}</button>
                      </div>
                    </Field>
                    <ul className="m-tags">{draft[kind].map((v, i) => <li key={v + i}><span>{v}</span><button type="button" className="m-tag-x" onClick={() => removeOption(kind, i)} aria-label={tx(`حذف ${v}`, `Remove ${v}`)}><Icon name="close" size={14} /></button></li>)}</ul>
                  </div>
                ))}
              </div>
              {draft.variants.length > 0 ? (
                <>
                  <div className="table-wrap">
                    <table className="m-compact">
                      <caption className="sr">{tx('مصفوفة المتغيرات', 'Variant matrix')}</caption>
                      <thead><tr><th scope="col">{tx('المتغير', 'Variant')}</th><th scope="col">SKU</th><th scope="col">{tx('السعر', 'Price')}</th><th scope="col">{tx('المخزون', 'Stock')}</th></tr></thead>
                      <tbody>
                        {draft.variants.map((v, i) => (
                          <tr key={`${v.color}|${v.size}`}>
                            <th scope="row">{[v.color, v.size].filter(Boolean).join(' / ')}</th>
                            <td><input id={`pe-v-${i}-sku`} className="input m-cell" dir="ltr" value={v.sku} aria-label={tx(`SKU لـ ${v.color} ${v.size}`, `SKU for ${v.color} ${v.size}`)} aria-invalid={!!fe(`v.${i}.sku`)} onChange={(e) => setVariant(i, { sku: e.target.value.toUpperCase() })} />{fe(`v.${i}.sku`) && <span className="error">{fe(`v.${i}.sku`)}</span>}</td>
                            <td><input id={`pe-v-${i}-price`} className="input m-cell" dir="ltr" inputMode="decimal" value={v.price} aria-label={tx(`سعر ${v.color} ${v.size}`, `Price for ${v.color} ${v.size}`)} aria-invalid={!!fe(`v.${i}.price`)} onChange={(e) => setVariant(i, { price: e.target.value })} />{fe(`v.${i}.price`) && <span className="error">{fe(`v.${i}.price`)}</span>}</td>
                            <td>{v.isNew
                              ? <><input id={`pe-v-${i}-stock`} className="input m-cell" dir="ltr" inputMode="numeric" value={v.stock} aria-label={tx(`كمية أولية ${v.color} ${v.size}`, `Initial stock ${v.color} ${v.size}`)} aria-invalid={!!fe(`v.${i}.stock`)} onChange={(e) => setVariant(i, { stock: e.target.value })} />{fe(`v.${i}.stock`) && <span className="error">{fe(`v.${i}.stock`)}</span>}</>
                              : <span className="small"><bdi>{LOC_IDS.reduce((s, loc) => { const lv = levelOf(levels, v.sku, loc); return s + (lv ? available(lv) : 0); }, 0)}</bdi> {tx('متاح', 'available')}</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="actions"><button type="button" className="btn small" onClick={() => set({ variants: draft.variants.map((v) => ({ ...v, price: draft.price })) })}>{tx('طبّق السعر الأساسي على كل المتغيرات', 'Apply the base price to all variants')}</button></div>
                  <p className="small muted">{tx('المخزون الأولي يُدخل للمتغيرات الجديدة فقط؛ تعديل الموجود يتم من المخزون مع سبب. حذف متغير له طلبات سابقة لا يمس سجل تلك الطلبات.', 'Initial stock is entered for new variants only; existing stock changes go through Inventory with a reason. Removing a variant with past orders does not alter those orders’ records.')}</p>
                </>
              ) : <p className="small muted">{tx('بلا خيارات: منتج بسعر وSKU واحد.', 'No options: one price and one SKU.')}</p>}
            </section>
          </div>

          <aside className="col-side">
            <section className="card pad" aria-labelledby="pe-status">
              <h2 id="pe-status">{tx('الحالة', 'Status')}</h2>
              <Field id="pe-st" label={tx('حالة المنتج', 'Product status')} hint={tx('المسودة لا تظهر للعملاء.', 'Drafts are hidden from shoppers.')}>
                <select id="pe-st" className="input" value={draft.status} onChange={(e) => set({ status: e.target.value as ProductDraft['status'] })}>
                  {(['active', 'draft', 'archived'] as const).map((s) => <option key={s} value={s}>{statusName(s)}</option>)}
                </select>
              </Field>
            </section>
            <section className="card pad" aria-labelledby="pe-ch">
              <h2 id="pe-ch">{tx('القنوات', 'Channels')}</h2>
              {(['online', 'market', 'app'] as Channel[]).map((c) => (
                <label key={c} className="check"><input type="checkbox" checked={draft.channels[c]} onChange={(e) => set({ channels: { ...draft.channels, [c]: e.target.checked } })} />
                  {({ online: tx('المتجر الإلكتروني', 'Online store'), market: tx('سوق لك (يخضع لمراجعة الأهلية)', 'LAK marketplace (subject to eligibility review)'), app: tx('تطبيق المتجر', 'Store app') })[c]}</label>
              ))}
            </section>
            <section className="card pad" aria-labelledby="pe-seo">
              <h2 id="pe-seo">{tx('الظهور في البحث', 'Search engine listing')}</h2>
              <Field id="pe-seoTitle" label={tx('عنوان الصفحة', 'Page title')} hint={`${draft.seoTitle.length}/70`}><input id="pe-seoTitle" className="input" value={draft.seoTitle} maxLength={70} onChange={(e) => set({ seoTitle: e.target.value })} /></Field>
              <Field id="pe-seoDesc" label={tx('الوصف', 'Description')} hint={`${draft.seoDesc.length}/160`}><textarea id="pe-seoDesc" className="input" value={draft.seoDesc} maxLength={160} onChange={(e) => set({ seoDesc: e.target.value })} /></Field>
              <Field id="pe-slug" label={tx('الرابط المختصر', 'URL handle')} error={fe('slug')}><input id="pe-slug" className="input" dir="ltr" value={draft.slug} aria-invalid={!!fe('slug')} onChange={(e) => set({ slug: e.target.value })} /></Field>
              <div className="m-seo-preview" aria-label={tx('معاينة نتيجة البحث', 'Search result preview')}>
                <span className="m-seo-url" dir="ltr">platform.example/demo-store/p/{draft.slug || '…'}</span>
                <span className="m-seo-title">{draft.seoTitle || draft.nameEn || draft.nameAr || '—'}</span>
                <span className="small muted">{draft.seoDesc || tx('بلا وصف.', 'No description.')}</span>
              </div>
              <p className="small muted">{tx('لا نضمن ترتيبًا في محركات البحث.', 'Search ranking is not guaranteed.')}</p>
            </section>
            <section className="card pad m-testbox" aria-labelledby="pe-test">
              <h2 id="pe-test" className="small">{tx('أداة اختبار', 'Test tool')}</h2>
              <label className="check"><input type="checkbox" checked={failNext} onChange={(e) => setFailNext(e.target.checked)} /> {tx('حاكِ انقطاع الشبكة عند الحفظ التالي', 'Simulate a network drop on the next save')}</label>
            </section>
          </aside>
        </div>
      </fieldset>

      {canEdit && dirty && (
        <SaveBar message={state === 'saving' ? stateText.saving : state === 'failed' ? tx('لم يُحفظ — تعديلاتك محفوظة في الصفحة', 'Not saved — your edits are still here') : tx('تغييرات غير محفوظة', 'Unsaved changes')}
          onSave={() => { if (state !== 'saving') save(); }} onDiscard={discard} saveLabel={state === 'failed' ? tx('أعد المحاولة', 'Try again') : tx('احفظ', 'Save')} discardLabel={tx('تجاهل', 'Discard')} />
      )}
      {leaveTo && (
        <Dialog title={tx('مغادرة دون حفظ؟', 'Leave without saving?')} onClose={() => setLeaveTo(null)}
          footer={<>
            <button type="button" className="btn primary" onClick={() => setLeaveTo(null)}>{tx('ابقَ وأكمل', 'Stay and keep editing')}</button>
            <button type="button" className="btn" onClick={() => { const to = leaveTo; setLeaveTo(null); discard(); setTimeout(() => navigate(to), 0); }}>{tx('غادر وتجاهل التعديلات', 'Leave and discard edits')}</button>
            <button type="button" className="btn" onClick={() => { const to = leaveTo; setLeaveTo(null); setState('clean'); setTimeout(() => navigate(to), 0); }}>{tx('غادر واحتفظ بالمسودة في هذه الجلسة', 'Leave and keep the draft for this session')}</button>
          </>}>
          <p>{tx('لديك تعديلات لم تصل إلى الخادم. يمكنك الاحتفاظ بها مسودة في هذه الجلسة فقط (تضيع عند إعادة التحميل).', 'You have edits that have not reached the server. You can keep them as a draft for this session only (lost on reload).')}</p>
        </Dialog>
      )}
    </>
  );
}
