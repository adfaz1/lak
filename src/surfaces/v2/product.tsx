// Product editing, redesigned. Question it answers: "what will shoppers see, and is it safe to save?"
// Basics first (name, description, media, price, stock), then variants, shipping, search and publishing.
//   A "Workbench": two columns, sticky rail with status, live storefront card, channels and category; save bar on top.
//   B "Focus": one centred column with an in-page section index; preview in a drawer; sticky bottom save bar.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLang } from '../../core/lang';
import { link, navigate, replace, type Route } from '../../core/router';
import { createStore } from '../../core/store';
import type { Product } from '../merchant/catalog';
import { draftsStore, productsStore } from '../merchant/stores';
import { Banner, Dialog, EmptyState, Icon, Pill, Ref, Skeleton, Toast, useTx, SrHeading } from './ui';
import { reviewStore, vhref } from './data';
import { Page } from './index';
import { fieldId, mediaSrc, sectionOf, useEditor, useLeaveGuard, type Editor, type SectionId } from './product-model';
import { Photo, useFieldName, useColorName } from './product-fields';
import {
  BasicsSection, CategoryControl, ChannelsControl, InventorySection, MediaSection, PreviewCard, PricingSection, Readiness,
  STATUS_TONE, SeoSection, ShippingSection, StatusControl, VariantsSection, useStatusText,
} from './product-sections';
import './product.css';

/** Survives the remount that follows creating a product (the route changes from /new to its id). */
const toastStore = createStore<{ text: string; n: number } | null>(() => null);

export default function ProductEdit({ route }: { route: Route }) {
  const tx = useTx();
  const { dir, state } = reviewStore.use();
  const products = productsStore.use();
  const id = route.path[1] ?? 'new';
  const toast = toastStore.use();

  let body: ReactNode;
  if (state === 'loading') body = <><SrHeading>{tx('جارٍ تحميل المنتج', 'Loading product')}</SrHeading><ProductSkeleton dir={dir} /></>;
  else if (state === 'error') {
    const kept = !!draftsStore.get()[id];
    body = (
      <Page>
        <Crumb />
        <div className="lk-card"><EmptyState as="h1" tone="bad" icon="alert" title={tx('تعذر تحميل المنتج', 'This product couldn’t load')}
          action={<>
            <button type="button" className="lk-btn primary" onClick={() => reviewStore.set((s) => ({ ...s, state: 'live' }))}>{tx('أعد المحاولة', 'Try again')}</button>
            <a className="lk-btn" href={link('/merchant/products')}>{tx('كل المنتجات', 'All products')}</a>
          </>}>
          {kept ? tx('لم يُفقد شيء: تعديلاتك غير المحفوظة باقية في هذه الجلسة وستعود عند التحميل. المرجع: SIM-PRD-503', 'Nothing was lost: your unsaved edits are kept in this session and come back when it loads. Reference: SIM-PRD-503')
            : tx('لم يتغير المنتج ولا مخزونه؛ الصفحة فقط لم تصل. المرجع: SIM-PRD-503', 'The product and its stock are unchanged; only this page didn’t arrive. Reference: SIM-PRD-503')}
        </EmptyState></div>
      </Page>
    );
  } else {
    const forceNew = state === 'empty' || id === 'new';
    const product = forceNew ? undefined : products.find((p) => p.id === id);
    if (!forceNew && !product) body = (
      <Page><Crumb />
        <div className="lk-card"><EmptyState icon="products" title={tx('لا يوجد منتج بهذا المعرف', 'No product with this id')}
          action={<><a className="lk-btn primary" href={vhref('products/new')}>{tx('أضف منتجًا', 'Add a product')}</a><a className="lk-btn" href={vhref(`products/${products[0]?.id ?? 'new'}`)}>{tx('افتح أول منتج', 'Open the first product')}</a></>}>
          {tx(`ربما حُذف أو تغيّر الرابط. المعرف: ${id}`, `It may have been removed, or the link changed. Id: ${id}`)}
        </EmptyState></div>
      </Page>
    );
    else body = <EditorView key={forceNew ? 'new' : id} product={product} dir={dir} />;
  }
  return (
    <>
      {body}
      {toast && <Toast key={toast.n} onClose={() => toastStore.set(null)}>{toast.text}</Toast>}
    </>
  );
}

function Crumb() {
  const tx = useTx();
  return <a className="lk-crumb" href={link('/merchant/products')}><Icon name="back" size="sm" />{tx('المنتجات', 'Products')}</a>;
}

/* ---------- Editor ---------- */

function EditorView({ product, dir }: { product: Product | undefined; dir: 'a' | 'b' }) {
  const tx = useTx();
  const { lang } = useLang();
  const st = useStatusText();
  const fieldName = useFieldName();
  const cn = useColorName();
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const ed = useEditor(product?.id ?? 'new', product, (saved, isNew) => {
    toastStore.set({ n: Date.now(), text: isNew ? tx(`أُنشئ المنتج «${saved.name[lang]}» كمسودة محفوظة · الإصدار ${saved.version}`, `“${saved.name[lang]}” created · version ${saved.version}`) : tx(`حُفظ المنتج · الإصدار ${saved.version}`, `Product saved · version ${saved.version}`) });
    if (isNew) { reviewStore.set((s) => ({ ...s, state: 'live' })); replace(vhref(`products/${saved.id}`)); }
  });
  useLeaveGuard(ed.dirty, setLeaveTo);
  const { draft, errorKeys } = ed;

  // Focus the first field for a new product: the first step is the name.
  useEffect(() => { if (ed.isNew) document.getElementById('pe-nameAr')?.focus({ preventScroll: true }); }, [ed.isNew]);

  const jump = (k: string) => {
    if (k === 'publishing') { document.getElementById('sec-publishing')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); document.getElementById('pe-ch-online')?.focus({ preventScroll: true }); return; }
    if (k === 'media' || k.startsWith('media.')) {
      const i = k === 'media' ? -1 : Number(k.split('.')[1]);
      if (i >= 0) window.dispatchEvent(new CustomEvent('pe:media', { detail: i }));
      setTimeout(() => {
        const el = document.getElementById(i >= 0 ? fieldId(k) : 'sec-media');
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (el as HTMLElement | null)?.focus?.({ preventScroll: true });
        if (i < 0) document.querySelector<HTMLElement>('#sec-media button')?.focus({ preventScroll: true });
      }, 30);
      return;
    }
    // Variant fields exist twice (table on desktop, cards on phone): focus the visible one.
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(`[id="${fieldId(k)}"]`));
    const el = candidates.find((c) => c.offsetParent !== null) ?? candidates[0];
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
  };

  // After a save attempt with errors, take the merchant to the first one.
  const lastAttempt = useRef(ed.attempt);
  useEffect(() => {
    if (ed.attempt !== lastAttempt.current && errorKeys.length) jump(errorKeys[0]);
    lastAttempt.current = ed.attempt;
  }, [ed.attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const variantName = (i: number) => { const v = draft.variants[i]; return v ? [cn(v.color), v.size].filter(Boolean).join(' / ') : `#${i + 1}`; };
  const fname = (k: string) => fieldName(k, variantName, (n) => String(n));
  const showSummary = ed.showErr && errorKeys.length > 0;
  const sectionErrors = (s: SectionId) => (ed.showErr ? errorKeys.filter((k) => sectionOf(k) === s).length : 0);

  const name = (lang === 'ar' ? draft.nameAr : draft.nameEn) || draft.nameAr || draft.nameEn;
  const title = ed.isNew ? (name || tx('أضف منتجًا', 'Add a product')) : (product ? product.name[lang] : name);
  const saveText = ed.state === 'saving' ? tx('جارٍ الحفظ…', 'Saving…')
    : ed.state === 'failed' ? tx('لم يُحفظ: انقطع الاتصال', 'Not saved: the connection dropped')
    : ed.state === 'dirty' ? (ed.isNew ? tx('لم يُحفظ بعد', 'Not saved yet') : tx('تغييرات غير محفوظة', 'Unsaved changes'))
    : ed.state === 'saved' ? tx(`حُفظ للتو · الإصدار ${ed.savedVersion}`, `Saved just now · version ${ed.savedVersion}`)
    : ed.isNew ? tx('لم يُحفظ بعد', 'Not saved yet') : tx(`كل التغييرات محفوظة · الإصدار ${product?.version}`, `All changes saved · version ${product?.version}`);

  /* --- pieces --- */

  const head = (
    <header className="pe-head">
      <Crumb />
      <div className="pe-head-row">
        {!ed.isNew && <PreviewThumb ed={ed} />}
        <div className="lk-col lk-grow" style={{ gap: 6, minWidth: 0 }}>
          {ed.isNew && <span className="lk-eyebrow">{tx('منتج جديد', 'New product')}</span>}
          <h1 className="lk-h1 pe-title">{title}</h1>
          <div className="lk-row lk-wrap" style={{ gap: '6px 10px' }}>
            <Pill tone={STATUS_TONE[draft.status]} icon={st.icon(draft.status)}>{st.name(draft.status)}</Pill>
            {draft.sku && <span className="lk-small lk-2"><Ref>{draft.sku}</Ref></span>}
            {draft.variants.length > 0 && <span className="lk-small lk-2">{tx(`${draft.variants.length} متغيرات`, `${draft.variants.length} variants`)}</span>}
            <span className={`pe-state lk-small${ed.state === 'failed' ? ' bad' : ed.dirty || ed.isNew ? ' dirty' : ''}`} role="status" aria-live="polite">
              <span className="dot" aria-hidden="true" />{saveText}
            </span>
          </div>
        </div>
        <div className="lk-row lk-wrap pe-head-actions">
          {dir === 'b' && <button type="button" className="lk-btn" onClick={() => setDrawer(true)}>{tx('معاينة', 'Preview')}</button>}
          {!ed.isNew && <a className="lk-btn ghost lk-only-desktop" href={vhref('products/new')}>{tx('منتج جديد', 'New product')}</a>}
        </div>
      </div>
    </header>
  );

  const banners = (
    <>
      {ed.isNew && (
        <p className="pe-lead">{tx('ابدأ بالاسم بالعربية والإنجليزية، ثم صورة وسعر. يبقى المنتج مسودة مخفية عن العملاء حتى تفعّله.', 'Start with the name in Arabic and English, then a photo and a price. The product stays a hidden draft until you activate it.')}</p>
      )}
      {ed.restored && ed.state === 'dirty' && <Banner tone="info" title={tx('استعدنا تعديلاتك غير المحفوظة', 'We restored your unsaved edits')}>{tx('من هذه الجلسة. احفظها أو تجاهلها.', 'From this session. Save or discard them.')}</Banner>}
      {ed.state === 'failed' && (
        <Banner tone="bad" title={tx('لم يُحفظ المنتج', 'The product wasn’t saved')}
          action={<button type="button" className="lk-btn sm" onClick={ed.save}>{tx('أعد المحاولة', 'Try again')}</button>}>
          {tx('انقطع الاتصال بالخادم (محاكاة). كل ما كتبته باقٍ في الصفحة وفي مسودة هذه الجلسة؛ لا شيء تغيّر في المتجر.', 'The connection to the server dropped (simulated). Everything you typed is still on the page and in this session’s draft; nothing changed in the store.')}
        </Banner>
      )}
    </>
  );

  const summary = showSummary && (
    <div className="pe-sum" role="alert">
      <span>{tx(`صحّح ${errorKeys.length} ${errorKeys.length === 1 ? 'حقلًا' : 'حقول'} للحفظ`, `Fix ${errorKeys.length} field${errorKeys.length === 1 ? '' : 's'} to save`)}</span>
      <button type="button" className="pe-linkbtn" onClick={() => jump(errorKeys[0])}>{tx('اذهب إلى: ', 'Go to: ')}{fname(errorKeys[0])}</button>
    </div>
  );

  const saveButtons = (
    <>
      {ed.dirty && ed.state !== 'saving' && <button type="button" className="lk-btn ghost" onClick={ed.discard}>{ed.isNew ? tx('امسح', 'Clear') : tx('تجاهل', 'Discard')}</button>}
      <button type="button" className="lk-btn brand" onClick={ed.save} aria-disabled={ed.state === 'saving'} disabled={!ed.dirty && !ed.isNew}>
        {ed.state === 'saving' ? <span className="pe-spin" aria-hidden="true" /> : null}
        {ed.state === 'saving' ? tx('جارٍ الحفظ', 'Saving') : ed.state === 'failed' ? tx('أعد المحاولة', 'Try again') : ed.isNew ? tx('احفظ المنتج', 'Save product') : tx('احفظ', 'Save')}
      </button>
    </>
  );

  const failTool = (
    <label className="pe-testtool">
      <input type="checkbox" checked={ed.failNext} onChange={(e) => ed.setFailNext(e.target.checked)} />
      <span className="lk-col"><span className="lk-small lk-strong">{tx('أداة مراجعة: حاكِ انقطاع الشبكة عند الحفظ التالي', 'Review tool: simulate a network drop on the next save')}</span><span className="lk-micro lk-3">{tx('ليست جزءًا من المنتج.', 'Not part of the product.')}</span></span>
    </label>
  );

  const sections = (
    <>
      <BasicsSection ed={ed} />
      <MediaSection ed={ed} />
      <PricingSection ed={ed} />
      <InventorySection ed={ed} />
      <VariantsSection ed={ed} />
      <ShippingSection ed={ed} />
      <SeoSection ed={ed} />
    </>
  );

  const leave = leaveTo && (
    <Dialog title={tx('المغادرة دون حفظ؟', 'Leave without saving?')} onClose={() => setLeaveTo(null)}
      footer={<>
        <button type="button" className="lk-btn ghost danger" onClick={() => { const to = leaveTo; setLeaveTo(null); ed.discard(); setTimeout(() => navigate(to), 0); }}>{tx('تجاهل التعديلات', 'Discard edits')}</button>
        <span className="lk-grow" />
        <button type="button" className="lk-btn" onClick={() => { const to = leaveTo; setLeaveTo(null); setTimeout(() => navigate(to), 0); }} data-keep>{tx('غادر واحتفظ بالمسودة', 'Leave, keep draft')}</button>
        <button type="button" className="lk-btn primary" onClick={() => setLeaveTo(null)}>{tx('ابقَ هنا', 'Stay')}</button>
      </>}>
      <p className="lk-2">{tx('لديك تعديلات لم تصل إلى الخادم. يمكنك الاحتفاظ بها مسودة في هذه الجلسة فقط وستعود عند فتح المنتج مجددًا؛ لن يراها العملاء.', 'You have edits that haven’t reached the server. You can keep them as a draft for this session only; they come back when you reopen the product. Shoppers won’t see them.')}</p>
    </Dialog>
  );

  /* --- Direction A: workbench --- */
  if (dir === 'a') {
    return (
      <Page>
        {head}
        {(ed.dirty || showSummary) && (
          <div className={`pe-abar${ed.state === 'failed' ? ' bad' : ''}`} role="region" aria-label={tx('حفظ التغييرات', 'Save changes')}>
            <span className={`pe-state${ed.state === 'failed' ? ' bad' : ' dirty'}`} aria-hidden="true"><span className="dot" /></span>
            <span className="lk-strong lk-grow lk-truncate">{saveText}</span>
            {summary}
            <div className="lk-row">{saveButtons}</div>
          </div>
        )}
        {banners}
        <div className="pe-a">
          <div className="lk-col pe-a-main">{sections}</div>
          <aside className="pe-a-rail" aria-label={tx('النشر والمعاينة', 'Publishing and preview')}>
            <section className="pe-rail-sec pe-rail-preview" aria-labelledby="rail-preview">
              <div className="pe-rail-h"><h2 id="rail-preview" className="pe-rail-t lk-grow">{tx('في المتجر', 'In the store')}</h2><span className="lk-micro lk-3">{ed.dirty ? tx('يشمل تعديلاتك غير المحفوظة', 'Includes unsaved edits') : tx('كما يراه العميل', 'As shoppers see it')}</span></div>
              <PreviewCard ed={ed} />
            </section>
            {ed.isNew && <section className="pe-rail-sec"><Readiness ed={ed} onJump={jump} /></section>}
            <section className="pe-rail-sec" id="sec-publishing" aria-labelledby="rail-status">
              <h2 id="rail-status" className="pe-rail-t">{tx('الحالة', 'Status')}</h2>
              <StatusControl ed={ed} />
            </section>
            <section className="pe-rail-sec" aria-labelledby="rail-ch">
              <h2 id="rail-ch" className="pe-rail-t">{tx('القنوات', 'Channels')}</h2>
              <ChannelsControl ed={ed} />
            </section>
            <section className="pe-rail-sec" aria-labelledby="rail-org">
              <h2 id="rail-org" className="pe-rail-t">{tx('التنظيم', 'Organisation')}</h2>
              <CategoryControl ed={ed} />
            </section>
            {failTool}
          </aside>
        </div>
        {leave}
      </Page>
    );
  }

  /* --- Direction B: focus --- */
  const index: { id: SectionId; label: string; show: boolean }[] = [
    { id: 'basics', label: tx('الاسم والوصف', 'Title'), show: true },
    { id: 'media', label: tx('الصور', 'Media'), show: true },
    { id: 'pricing', label: tx('التسعير', 'Pricing'), show: true },
    { id: 'inventory', label: tx('المخزون', 'Inventory'), show: true },
    { id: 'variants', label: tx('المتغيرات', 'Variants'), show: true },
    { id: 'shipping', label: tx('الشحن', 'Shipping'), show: true },
    { id: 'seo', label: tx('محركات البحث', 'Search listing'), show: true },
    { id: 'publishing', label: tx('النشر', 'Publishing'), show: true },
  ];
  return (
    <Page>
      <div className="pe-b">
        <SectionIndex items={index.filter((i) => i.show)} errors={sectionErrors} />
        <div className="pe-b-col lk-col lk-gap-24">
          {head}
          {banners}
          {ed.isNew && <div className="pe-b-ready"><Readiness ed={ed} onJump={jump} /></div>}
          <div className="lk-col">{sections}
          <section className="pe-sec" id="sec-publishing" aria-labelledby="sec-publishing-h">
            <header className="pe-sec-h"><div className="lk-col lk-grow" style={{ gap: 4 }}><h2 id="sec-publishing-h" className="pe-sec-t">{tx('النشر', 'Publishing')}</h2><p className="lk-small lk-3">{tx('من يرى المنتج وأين.', 'Who sees the product, and where.')}</p></div>
              <button type="button" className="lk-btn sm" onClick={() => setDrawer(true)}>{tx('معاينة في المتجر', 'Preview in store')}</button></header>
            <div className="pe-sec-b">
              <div className="lk-col lk-gap-4"><span className="lk-label">{tx('الحالة', 'Status')}</span><StatusControl ed={ed} /></div>
              <hr className="lk-divider" />
              <div className="lk-col"><span className="lk-label">{tx('القنوات', 'Channels')}</span><ChannelsControl ed={ed} /></div>
              <hr className="lk-divider" />
              <div className="pe-grid2"><CategoryControl ed={ed} /></div>
            </div>
          </section>
          </div>
          {failTool}
        </div>
      </div>
      <div className={`pe-bbar${ed.state === 'failed' ? ' bad' : ''}${ed.dirty || ed.isNew ? ' dirty' : ''}`} role="region" aria-label={tx('حفظ التغييرات', 'Save changes')}>
        <div className="pe-bbar-in">
          <div className="lk-col lk-grow" style={{ minWidth: 0, gap: 2 }}>
            <span className="lk-row" style={{ gap: 8 }}><span className={`pe-state${ed.state === 'failed' ? ' bad' : ed.dirty || ed.isNew ? ' dirty' : ''}`}><span className="dot" aria-hidden="true" /></span><span className="lk-strong lk-truncate">{saveText}</span></span>
            {summary}
          </div>
          {ed.dirty || ed.isNew ? <>
            <button type="button" className="lk-btn ghost icon pe-bbar-prev" onClick={() => setDrawer(true)} aria-label={tx('معاينة في المتجر', 'Preview in store')} title={tx('معاينة', 'Preview')}><Icon name="eye" /></button>
            {saveButtons}
          </> : <button type="button" className="lk-btn" onClick={() => setDrawer(true)}>{tx('معاينة في المتجر', 'Preview in store')}</button>}
        </div>
      </div>
      {drawer && <PreviewDrawer ed={ed} onClose={() => setDrawer(false)} />}
      {leave}
    </Page>
  );
}

function PreviewThumb({ ed }: { ed: Editor }) {
  const first = ed.draft.media[0];
  return first ? <Photo className="pe-head-thumb" src={mediaSrc(first)} alt="" /> : null;
}

/* ---------- B: section index ---------- */

function SectionIndex({ items, errors }: { items: { id: SectionId; label: string }[]; errors: (s: SectionId) => number }) {
  const tx = useTx();
  const [active, setActive] = useState<SectionId>(items[0].id);
  const lock = useRef(0);
  const chipRow = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(`sec-${i.id}`)).filter(Boolean) as HTMLElement[];
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => seen.set(e.target.id, e.isIntersecting));
      if (Date.now() < lock.current) return;
      const first = els.find((el) => seen.get(el.id));
      if (first) setActive(first.id.slice(4) as SectionId);
    }, { rootMargin: '-140px 0px -55% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items.map((i) => i.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the active chip in view on phone.
  useEffect(() => {
    const row = chipRow.current;
    const chip = row?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    if (row && chip && row.scrollWidth > row.clientWidth) {
      const r = row.getBoundingClientRect(), c = chip.getBoundingClientRect();
      if (c.left < r.left || c.right > r.right) row.scrollBy({ left: c.left - r.left - 16, behavior: 'smooth' });
    }
  }, [active]);
  const go = (id: SectionId) => {
    setActive(id);
    lock.current = Date.now() + 800;
    const el = document.getElementById(`sec-${id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el?.querySelector<HTMLElement>('h2')?.setAttribute('tabindex', '-1');
    el?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  };
  return (
    <nav className="pe-index" aria-label={tx('أقسام المنتج', 'Product sections')}>
      <span className="lk-eyebrow pe-index-h">{tx('في هذه الصفحة', 'On this page')}</span>
      <ol ref={chipRow}>
        {items.map((i) => {
          const n = errors(i.id);
          return (
            <li key={i.id}>
              <a href={`#sec-${i.id}`} data-leave-ok data-id={i.id} aria-current={active === i.id ? 'location' : undefined}
                onClick={(e) => { e.preventDefault(); go(i.id); }}>
                <span className="lk-grow">{i.label}</span>
                {n > 0 && <span className="pe-index-err" aria-label={tx(`${n} أخطاء`, `${n} errors`)}>{n}</span>}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ---------- B: preview drawer ---------- */

function PreviewDrawer({ ed, onClose }: { ed: Editor; onClose: () => void }) {
  const tx = useTx();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); opener?.focus(); };
  }, []);
  return (
    <>
      <div className="lk-scrim" style={{ zIndex: 49 }} onMouseDown={onClose} aria-hidden="true" />
      <div className="lk-drawer pe-drawer" role="dialog" aria-modal="true" aria-label={tx('معاينة في المتجر', 'Store preview')} tabIndex={-1} ref={ref}>
        <header className="pe-drawer-h">
          <div className="lk-col lk-grow"><h2 className="lk-h2">{tx('معاينة في المتجر', 'Store preview')}</h2><span className="lk-micro lk-3">{ed.dirty ? tx('تشمل تعديلاتك غير المحفوظة', 'Includes your unsaved edits') : tx('كما يراه العميل الآن', 'As shoppers see it now')}</span></div>
          <button type="button" className="lk-btn icon ghost" onClick={onClose} aria-label={tx('إغلاق', 'Close')}><Icon name="close" /></button>
        </header>
        <div className="pe-drawer-b">
          <PreviewCard ed={ed} big />
          <DrawerFacts ed={ed} />
        </div>
      </div>
    </>
  );
}

function DrawerFacts({ ed }: { ed: Editor }) {
  const tx = useTx();
  const { lang } = useLang();
  const d = ed.draft;
  const ch = [d.channels.online && tx('المتجر الإلكتروني', 'Online store'), d.channels.market && tx('سوق لك', 'LAK marketplace'), d.channels.app && tx('التطبيق', 'App')].filter(Boolean);
  const desc = lang === 'ar' ? d.descAr : d.descEn;
  return (
    <dl className="pe-facts">
      <div><dt>{tx('الوصف', 'Description')}</dt><dd>{desc || <span className="lk-3">{tx('لا وصف بهذه اللغة.', 'No description in this language.')}</span>}</dd></div>
      <div><dt>{tx('القنوات', 'Channels')}</dt><dd>{ch.length ? ch.join(' · ') : <span className="lk-3">{tx('لا قناة', 'None')}</span>}</dd></div>
      <div><dt>{tx('الرابط', 'Link')}</dt><dd><Ref>/p/{d.slug || '…'}</Ref></dd></div>
    </dl>
  );
}

/* ---------- Loading ---------- */

function ProductSkeleton({ dir }: { dir: 'a' | 'b' }) {
  const sec = (rows: number, key: number) => (
    <div key={key} className="pe-sec" aria-hidden="true">
      <div className="pe-sec-h"><Skeleton w="30%" h={16} /></div>
      <div className="pe-sec-b">{Array.from({ length: rows }, (_, i) => <div key={i} className="pe-grid2"><div className="lk-col lk-gap-4"><Skeleton w="40%" h={12} /><Skeleton h={40} r={8} /></div><div className="lk-col lk-gap-4"><Skeleton w="40%" h={12} /><Skeleton h={40} r={8} /></div></div>)}</div>
    </div>
  );
  const media = (
    <div key="media" className="pe-sec" aria-hidden="true"><div className="pe-sec-h"><Skeleton w="20%" h={16} /></div>
      <div className="pe-sec-b"><ul className="pe-gallery skel">{[0, 1, 2, 3, 4].map((i) => <li key={i} className={i === 0 ? 'primary' : undefined}><Skeleton h={i === 0 ? 240 : 112} r={10} /></li>)}</ul></div></div>
  );
  const head = (
    <div className="pe-head" aria-hidden="true"><Skeleton w={90} h={14} />
      <div className="pe-head-row"><Skeleton w={56} h={56} r={10} /><div className="lk-col lk-grow lk-gap-12"><Skeleton w="45%" h={26} /><Skeleton w="30%" h={14} /></div></div></div>
  );
  const main = [sec(2, 1), media, sec(1, 2), sec(1, 3)];
  return (
    <Page>
      <div role="status" aria-busy="true" aria-label="Loading" className="lk-col lk-gap-16">
        {dir === 'a' ? (
          <>{head}<div className="pe-a"><div className="lk-col lk-gap-16">{main}</div>
            <div className="pe-a-rail">{[120, 300, 160].map((h, i) => <div key={i} className="pe-rail-sec lk-col lk-gap-12"><Skeleton w="35%" h={14} /><Skeleton h={h} r={8} /></div>)}</div></div></>
        ) : (
          <div className="pe-b"><div className="pe-index" aria-hidden="true"><ol>{[0, 1, 2, 3, 4, 5].map((i) => <li key={i} style={{ padding: '8px 12px' }}><Skeleton w={`${60 + (i % 3) * 12}%`} h={12} /></li>)}</ol></div>
            <div className="pe-b-col lk-col lk-gap-24">{head}{main}</div></div>
        )}
      </div>
    </Page>
  );
}
