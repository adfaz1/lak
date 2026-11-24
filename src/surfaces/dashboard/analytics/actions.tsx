// Actions a report number implies, opened from the report itself (`?fix=<term>` on the search report, `?alert=<pid|sku>`
// on the demand report): turn a search that found nothing into a product draft or a search redirect, and send the
// back-in-stock alert to the people waiting. Each previews what the shopper sees before anything changes.
import { useState } from 'react';
import { Bell, PackagePlus, Search, Undo2 } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { navigate, link } from '../../../core/router';
import { can } from '../../merchant/perms';
import { draftsStore, logAction, notifyStore, productsStore, searchLogStore, searchRedirectsStore, testStore, levelsStore } from '../../merchant/stores';
import { normTerm, removeRedirect, setRedirect, type SearchRedirect } from '../../merchant/demand';
import { skusOf, type ProductDraft } from '../../merchant/catalog';
import { available } from '../../merchant/inventory';
import type { L } from '../../merchant/domain';
import { Badge, Button, ProductImage, Ref, cn, useTx } from '../../../ds/ui';
import { Alert, Field, Modal, Select, Simulated, useToast } from '../../../ds/kit';
import { productPhoto } from '../model/media';
import { toEditDraft } from '../products/model';
import { matchesNow } from './demand-reports';

const slug = (c: L) => c.en.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other';
const today = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);

export function SearchFixModal({ term, onClose }: { term: string; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const role = testStore.use().role;
  const products = productsStore.use();
  const redirects = searchRedirectsStore.use();
  const log = searchLogStore.use();
  const key = normTerm(term);
  const events = log.filter((e) => e.term === key);
  const raw = events.at(-1)?.raw ?? term;
  const current = redirects.find((r) => r.term === key);
  const live = products.filter((p) => p.status === 'active' && p.channels.online);
  const cats = [...new Map(live.map((p) => [slug(p.category), p.category])).entries()];
  const [target, setTarget] = useState<string>(current ? `${current.target.kind}:${current.target.id}` : cats[0] ? `category:${cats[0][0]}` : '');
  const canCreate = can(role, 'product.edit');
  const canRedirect = can(role, 'settings.manage') || can(role, 'product.edit');
  const [kind, id] = target.split(':');
  const name: L | undefined = kind === 'category' ? cats.find(([s]) => s === id)?.[1] : live.find((p) => p.id === id)?.name;
  const shown = kind === 'category' ? live.filter((p) => slug(p.category) === id) : live.filter((p) => p.id === id);
  const matches = matchesNow(key, products);

  const create = () => {
    const base = toEditDraft(undefined);
    draftsStore.set((d) => ({ ...d, 'dash:new': { ...base, name: { ar: /[؀-ۿ]/.test(raw) ? raw : '', en: /[؀-ۿ]/.test(raw) ? '' : raw } } as unknown as ProductDraft }));
    logAction('products', { ar: `فتح مسودة منتج من بحث «${raw}» بلا نتائج`, en: `Opened a product draft from the no-result search “${raw}”` });
    onClose();
    navigate(link('/dashboard/products/new'));
  };
  const save = () => {
    if (!name) return;
    const before = searchRedirectsStore.get();
    const r: SearchRedirect = { term: key, raw, target: { kind: kind as 'product' | 'category', id, name }, by: role, at: new Date().toISOString() };
    searchRedirectsStore.set((l) => setRedirect(l, r));
    logAction('store', { ar: `وجّه البحث «${raw}» إلى ${name.ar}`, en: `Redirected the search “${raw}” to ${name.en}` }, { before: current?.target.name[lang], after: name[lang] });
    toast({ tone: 'ok', text: tx(`من يبحث عن «${raw}» يرى الآن ${name.ar}`, `Shoppers searching “${raw}” now see ${name.en}`), action: { label: tx('تراجع', 'Undo'), run: () => searchRedirectsStore.set(before) } });
    onClose();
  };
  const remove = () => {
    const before = searchRedirectsStore.get();
    searchRedirectsStore.set((l) => removeRedirect(l, key));
    logAction('store', { ar: `ألغى توجيه البحث «${raw}»`, en: `Removed the search redirect for “${raw}”` });
    toast({ tone: 'info', text: tx('أُلغي التوجيه', 'Redirect removed'), action: { label: tx('تراجع', 'Undo'), run: () => searchRedirectsStore.set(before) } });
    onClose();
  };

  return (
    <Modal size="lg" title={tx(`«${raw}» بلا نتائج`, `“${raw}” found nothing`)} onClose={onClose}
      description={tx(`بُحث عنها ${events.length} مرة. اختر ما يراه المتسوق بدل صفحة فارغة.`, `Searched ${events.length} times. Choose what shoppers see instead of an empty page.`)}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button>
        {current && canRedirect && <Button variant="ghost" onClick={remove}><Undo2 className="size-4" aria-hidden="true" />{tx('ألغِ التوجيه', 'Remove redirect')}</Button>}
        <Button onClick={save} disabled={!canRedirect || !name}><Search className="size-4" aria-hidden="true" />{current ? tx('حدّث التوجيه', 'Update redirect') : tx('وجّه البحث', 'Redirect search')}</Button>
      </>}>
      {matches > 0 && <Alert tone="ok">{tx(`كتالوجك يجد الآن ${matches} منتج لهذه الكلمة؛ قد لا تحتاج توجيهًا.`, `Your catalogue now finds ${matches} products for this term; you may not need a redirect.`)}</Alert>}
      <section className="rounded-xl border border-border p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg"><PackagePlus className="size-4 text-muted" aria-hidden="true" />{tx('أضف المنتج الذي يبحثون عنه', 'Add the product they look for')}</h3>
        <p className="mt-1 text-[13px] text-muted">{tx('يفتح منتجًا جديدًا باسم الكلمة كمسودة. لا يُنشر شيء قبل حفظك.', 'Opens a new product named after the term, as a draft. Nothing is published until you save.')}</p>
        <Button className="mt-3" variant="secondary" size="sm" onClick={create} disabled={!canCreate}>{tx('افتح مسودة منتج', 'Open a product draft')}</Button>
        {!canCreate && <p className="mt-2 text-xs text-muted">{tx('دورك لا يملك تعديل المنتجات.', 'Your role cannot edit products.')}</p>}
      </section>
      <section className="rounded-xl border border-border p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg"><Search className="size-4 text-muted" aria-hidden="true" />{tx('أو وجّه البحث لبديل', 'Or send the search to an alternative')}</h3>
        <Field label={tx('يرى المتسوق', 'Shoppers see')} className="mt-3">
          {(p) => (
            <Select {...p} value={target} onChange={(e) => setTarget(e.target.value)}>
              <optgroup label={tx('فئة', 'Category')}>{cats.map(([s, c]) => <option key={s} value={`category:${s}`}>{c[lang]}</option>)}</optgroup>
              <optgroup label={tx('منتج', 'Product')}>{live.map((p) => <option key={p.id} value={`product:${p.id}`}>{p.name[lang]}</option>)}</optgroup>
            </Select>
          )}
        </Field>
        {name && (
          <div className="mt-3 rounded-xl bg-surface-2 p-3">
            <p className="text-xs font-semibold text-muted">{tx('معاينة ما يراه المتسوق', 'What the shopper sees')}</p>
            <p className="mt-1 text-[13px] text-fg">{tx(`لا نتائج لـ«${raw}». نعرض لك: ${name.ar}`, `No results for “${raw}”. Showing: ${name.en}`)}</p>
            <ul className="mt-2 flex flex-wrap gap-2">{shown.slice(0, 6).map((p) => <li key={p.id} className="flex items-center gap-1.5 rounded-lg bg-surface px-2 py-1 text-xs"><ProductImage src={productPhoto(p.id)} alt="" size={24} />{p.name[lang]}</li>)}{shown.length > 6 && <li className="text-xs text-muted">+{shown.length - 6}</li>}</ul>
          </div>
        )}
      </section>
    </Modal>
  );
}

export function StockAlertModal({ k, onClose }: { k: string; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const role = testStore.use().role;
  const products = productsStore.use();
  const levels = levelsStore.use();
  const reqs = notifyStore.use();
  const [pid, sku] = k.split('|');
  const p = products.find((x) => x.id === pid);
  const waiting = reqs.filter((r) => r.productId === pid && r.sku === sku && r.state === 'waiting');
  const skus = sku ? [sku] : p ? skusOf(p) : [];
  const av = p?.type === 'digital' ? null : levels.filter((l) => skus.includes(l.sku)).reduce((s, l) => s + Math.max(0, available(l)), 0);
  const allowed = can(role, 'marketing.send');
  const enough = av === null || av >= waiting.length;
  const send = () => {
    const day = today();
    const r = { n: waiting.length };
    notifyStore.set((l) => l.map((x) => (x.productId === pid && x.sku === sku && x.state === 'waiting' ? { ...x, state: 'notified' as const, notifiedDay: day } : x)));
    logAction('marketing', { ar: `أرسل تنبيه التوفر لـ ${r.n} منتظرين (${p?.name.ar ?? pid})`, en: `Sent a back-in-stock alert to ${r.n} waiting (${p?.name.en ?? pid})` }, { target: sku || pid });
    toast({ tone: 'ok', text: tx(`أُرسل التنبيه لـ ${r.n} (محاكاة)`, `Alert sent to ${r.n} (simulated)`) });
    onClose();
  };
  if (!p) return null;
  return (
    <Modal title={tx('تنبيه «عاد للتوفر»', 'Back-in-stock alert')} onClose={onClose}
      description={tx(`${waiting.length} بانتظار ${p.name.ar}`, `${waiting.length} waiting for ${p.name.en}`)}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={send} disabled={!allowed || !waiting.length}><Bell className="size-4" aria-hidden="true" />{tx(`أرسل لـ ${waiting.length}`, `Send to ${waiting.length}`)}</Button></>}>
      <div className="flex items-center gap-3">
        <ProductImage src={productPhoto(p.id)} alt="" size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">{p.name[lang]}</p>
          <p className="text-xs text-muted">{sku ? <Ref>{sku}</Ref> : tx('أي خيار', 'Any option')} · {av === null ? tx('رقمي', 'Digital') : tx(`المتاح الآن ${av}`, `Available now ${av}`)}</p>
        </div>
        <Simulated />
      </div>
      <div className="rounded-xl bg-surface-2 p-3 text-[13px]">
        <p className="text-xs font-semibold text-muted">{tx('الرسالة بلغة كل عميل', 'Message in each customer’s language')}</p>
        <p className="mt-1 text-fg">{lang === 'ar' ? `عاد «${p.name.ar}» للتوفر. الكمية محدودة؛ اطلبه الآن.` : `“${p.name.en}” is back in stock. Quantities are limited; order now.`}</p>
      </div>
      {!enough && <Alert tone="warn">{tx(`المتاح (${av}) أقل من المنتظرين (${waiting.length}): قد لا يجد بعضهم القطعة.`, `Available (${av}) is less than people waiting (${waiting.length}): some may miss out.`)}</Alert>}
      <p className={cn('text-xs text-muted')}>{tx('يصل لمن طلب التنبيه فقط، بقناة موافقته. لا يُعاد الإرسال لمن نُبّه سابقًا.', 'Goes only to those who asked, on the channel they agreed to. Nobody already alerted gets it again.')} {!allowed && <Badge tone="amber">{tx('دورك لا يرسل رسائل', 'Your role cannot send messages')}</Badge>}</p>
    </Modal>
  );
}
