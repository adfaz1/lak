// Reviews & questions (`#/dashboard/marketing/reviews`): a moderation inbox (pending / published / hidden) where
// each review or question is published, hidden, answered (with a preview as it appears on the product page) or
// reported to LAK for an abuse check; bulk publish with a preview; and the store's review settings.
// Every action is logged with who and when.
import { useState } from 'react';
import { Check, EyeOff, Flag, MessageSquareReply, Star, SearchX, ShieldAlert, ExternalLink } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, type Route } from '../../../core/router';
import { logAction, productsStore, reviewSettingsStore, reviewsStore } from '../../merchant/stores';
import { looksSuspicious, publicName, type Review, type ReviewSettings, type ReviewStatus } from '../../merchant/growth';
import { Badge, Button, Card, CardHeader, EmptyState, InfoHint, LinkButton, ProductImage, Ref, cn, useTx, type Tone } from '../../../ds/ui';
import { Alert, BulkBar, Checkbox, Field, FilterChip, Modal, SearchInput, Select, Switch, Tabs, Textarea, useToast } from '../../../ds/kit';
import { productPhoto } from '../model/media';
import { TODAY } from './model';
import { Locked } from './access';
import { PublicEntry, Stars } from './storefront-reviews';

type View = ReviewStatus | 'all';
const VIEWS: View[] = ['pending', 'published', 'hidden', 'all'];
const S_TONE: Record<ReviewStatus, Tone> = { pending: 'amber', published: 'green', hidden: 'gray' };
const me = 'you';

export default function Reviews({ route, empty, canManage }: { route: Route; empty: boolean; canManage: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const all = reviewsStore.use();
  const settings = reviewSettingsStore.use();
  const products = productsStore.use();
  const list = empty ? [] : all;
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [reply, setReply] = useState<Review | null>(null);
  const [report, setReport] = useState<Review | null>(null);
  const [bulk, setBulk] = useState(false);

  const qv = route.query.get('view') as View | null;
  const view: View = qv && VIEWS.includes(qv) ? qv : 'pending';
  const kind = route.query.get('kind') ?? '';
  const rating = route.query.get('rating') ?? '';
  const q = route.query.get('q') ?? '';
  const href = (p: Record<string, string | undefined>) => link('/dashboard/marketing/reviews', { view: view === 'pending' ? undefined : view, kind: kind || undefined, rating: rating || undefined, q: q || undefined, ...p });
  const prod = (id: string) => products.find((p) => p.id === id);
  const t = q.trim().toLowerCase();
  const rows = list.filter((r) => (view === 'all' || r.status === view) && (!kind || r.kind === kind) && (!rating || (rating === 'low' ? (r.rating ?? 5) <= 2 : r.rating === Number(rating)))
    && (!t || r.text.toLowerCase().includes(t) || r.author[lang].toLowerCase().includes(t) || (prod(r.productId)?.name[lang] ?? '').toLowerCase().includes(t)));
  const count = (v: View) => list.filter((r) => v === 'all' || r.status === v).length;
  const viewName = (v: View) => ({ pending: tx('بانتظار المراجعة', 'Awaiting review'), published: tx('منشورة', 'Published'), hidden: tx('مخفية', 'Hidden'), all: tx('الكل', 'All') })[v];
  const pendingSel = rows.filter((r) => sel.has(r.id) && r.status !== 'published');

  const setStatus = (ids: string[], status: ReviewStatus) => {
    reviewsStore.set((l) => l.map((r) => (ids.includes(r.id) ? { ...r, status, log: [...r.log, { what: status === 'published' ? 'published' as const : 'hidden' as const, by: me, at: TODAY }] } : r)));
    logAction('marketing', status === 'published' ? { ar: `نشر ${ids.length} من التقييمات والأسئلة`, en: `Published ${ids.length} review(s)/question(s)` } : { ar: `أخفى ${ids.length} من التقييمات والأسئلة`, en: `Hid ${ids.length} review(s)/question(s)` }, { target: ids.join(', ') });
    setSel(new Set());
    toast({ tone: 'ok', text: status === 'published' ? tx(`نُشر ${ids.length} في صفحة المنتج`, `${ids.length} published on the product page`) : tx(`أُخفي ${ids.length} من المتجر`, `${ids.length} hidden from the store`) });
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="px-4 pt-2 sm:px-5">
          <Tabs label={tx('حالة المراجعة', 'Review status')} items={VIEWS.map((v) => ({ href: href({ view: v === 'pending' ? undefined : v }), label: viewName(v), current: v === view, count: count(v) }))} />
        </div>
        <div className="flex flex-wrap items-center gap-2 p-4 sm:px-5">
          <SearchInput value={q} onChange={(v) => replace(href({ q: v || undefined }))} placeholder={tx('ابحث في النص أو الاسم أو المنتج', 'Search text, name or product')} />
          <FilterChip label={tx('النوع', 'Type')} value={kind} onChange={(v) => replace(href({ kind: v || undefined }))} options={[{ value: 'review', label: tx('تقييمات', 'Reviews') }, { value: 'question', label: tx('أسئلة', 'Questions') }]} />
          <FilterChip label={tx('التقييم', 'Rating')} value={rating} onChange={(v) => replace(href({ rating: v || undefined }))} options={[{ value: 'low', label: tx('نجمتان أو أقل', '2 stars or less') }, ...[5, 4, 3].map((n) => ({ value: String(n), label: tx(`${n} نجوم`, `${n} stars`) }))]} />
        </div>
        {canManage && sel.size > 0 && (
          <div className="px-4 pb-3 sm:px-5">
            <BulkBar count={sel.size} scope={tx('في هذه الصفحة', 'on this page')} onClear={() => setSel(new Set())}>
              <Button size="sm" disabled={!pendingSel.length} onClick={() => setBulk(true)}><Check className="size-3.5" aria-hidden="true" />{tx(`انشر ${pendingSel.length}`, `Publish ${pendingSel.length}`)}</Button>
            </BulkBar>
          </div>
        )}
        {rows.length === 0 ? (
          list.length === 0
            ? <EmptyState icon={<Star className="size-6" aria-hidden="true" />} title={tx('لا تقييمات بعد', 'No reviews yet')}>{tx('تصل التقييمات بعد التسليم. فعّل «طلب تقييم بعد التسليم» في الأتمتة.', 'Reviews arrive after delivery. Turn on “Ask for a review after delivery” in automations.')}</EmptyState>
            : <EmptyState icon={<SearchX className="size-6" aria-hidden="true" />} title={view === 'pending' && !q && !kind && !rating ? tx('لا شيء بانتظار المراجعة', 'Nothing awaiting review') : tx('لا نتائج مطابقة', 'No matching entries')}
                action={q || kind || rating ? <LinkButton variant="secondary" href={href({ q: undefined, kind: undefined, rating: undefined })}>{tx('امسح الفلاتر', 'Clear filters')}</LinkButton> : undefined} />
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {rows.map((r) => {
              const p = prod(r.productId);
              const sus = looksSuspicious(r.text);
              return (
                <li key={r.id} className="flex gap-3 px-4 py-4 sm:px-5">
                  {canManage && <span className="pt-1"><Checkbox label={tx(`اختر ${r.id}`, `Select ${r.id}`)} checked={sel.has(r.id)} onChange={(on) => setSel((s) => { const n = new Set(s); if (on) n.add(r.id); else n.delete(r.id); return n; })} /></span>}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {p && <ProductImage src={productPhoto(p.id)} alt={p.name[lang]} size={28} />}
                      <span className="truncate text-[13px] font-medium text-muted">{p?.name[lang] ?? r.productId}</span>
                      <Badge tone={S_TONE[r.status]}>{viewName(r.status)}</Badge>
                      <Badge tone={r.kind === 'question' ? 'sky' : 'gray'}>{r.kind === 'question' ? tx('سؤال', 'Question') : tx('تقييم', 'Review')}</Badge>
                      {r.report && <Badge tone="red" icon={<Flag className="size-3" aria-hidden="true" />}>{tx('مُبلّغ عنه', 'Reported')}</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {r.rating !== undefined && <Stars n={r.rating} />}
                      <span className="font-semibold text-fg">{r.author[lang]}</span>
                      {r.verified && <span className="text-xs text-emerald-700 dark:text-emerald-400">{tx('مشترٍ موثّق', 'Verified buyer')}</span>}
                      <span className="text-xs text-muted"><Ref>{r.id}</Ref> · <bdi dir="ltr">{r.at}</bdi></span>
                    </div>
                    <p className="text-sm leading-relaxed text-fg" dir="auto">{r.text}</p>
                    {sus && <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300"><ShieldAlert className="size-3.5" aria-hidden="true" />{tx('قد يحتوي رقمًا أو رابطًا أو إعلانًا', 'May contain a number, link or advert')}</p>}
                    {r.reply && <p className="rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-fg"><span className="font-semibold">{tx('ردّك', 'Your reply')}: </span>{r.reply.text}</p>}
                    {r.log.length > 0 && <p className="text-[11px] text-subtle">{r.log.map((l) => `${({ published: tx('نُشر', 'published'), hidden: tx('أُخفي', 'hidden'), replied: tx('رُدّ عليه', 'replied'), reported: tx('أُبلغ عنه', 'reported'), restored: tx('أُعيد', 'restored') })[l.what]} · ${l.by === me ? tx('أنت', 'you') : l.by} · ${l.at}`).join(' — ')}</p>}
                    {canManage ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {r.status !== 'published' && !r.report && <Button size="sm" onClick={() => setStatus([r.id], 'published')}><Check className="size-3.5" aria-hidden="true" />{tx('انشر', 'Publish')}</Button>}
                        {r.status !== 'hidden' && <Button size="sm" variant="secondary" onClick={() => setStatus([r.id], 'hidden')}><EyeOff className="size-3.5" aria-hidden="true" />{tx('أخفِ', 'Hide')}</Button>}
                        <Button size="sm" variant="secondary" onClick={() => setReply(r)}><MessageSquareReply className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />{r.reply ? tx('عدّل الرد', 'Edit reply') : r.kind === 'question' ? tx('أجب', 'Answer') : tx('رد', 'Reply')}</Button>
                        {!r.report && <Button size="sm" variant="ghost" onClick={() => setReport(r)}><Flag className="size-3.5" aria-hidden="true" />{tx('أبلغ', 'Report')}</Button>}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!canManage && <p className="border-t border-border px-5 py-3"><Locked>{tx('دورك يعرض التقييمات فقط.', 'Your role can only view reviews.')}</Locked></p>}
      </Card>

      <SettingsCard settings={settings} canManage={canManage} />

      {bulk && (
        <Modal title={tx(`نشر ${pendingSel.length} في المتجر`, `Publish ${pendingSel.length} in the store`)} onClose={() => setBulk(false)}
          footer={<><Button variant="secondary" onClick={() => setBulk(false)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => { setStatus(pendingSel.map((r) => r.id), 'published'); setBulk(false); }}>{tx('انشر', 'Publish')}</Button></>}>
          <p className="text-sm text-fg">{tx('تظهر في صفحات المنتجات فورًا بالاسم المعروض أدناه.', 'They appear on product pages immediately, under the name shown below.')}</p>
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {pendingSel.map((r) => <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2"><span className="truncate text-fg">{publicName(r.author, settings.maskNames)[lang]} · {prod(r.productId)?.name[lang]}</span>{looksSuspicious(r.text) && <Badge tone="amber">{tx('راجعه', 'Check it')}</Badge>}</li>)}
          </ul>
        </Modal>
      )}
      {reply && <ReplyModal r={reply} settings={settings} onClose={() => setReply(null)} />}
      {report && <ReportModal r={report} onClose={() => setReport(null)} />}
    </div>
  );
}

function ReplyModal({ r, settings, onClose }: { r: Review; settings: ReviewSettings; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const products = productsStore.use();
  const [text, setText] = useState(r.reply?.text ?? '');
  const [tried, setTried] = useState(false);
  const err = !text.trim() ? 'empty' : text.length > 500 ? 'long' : null;
  const publish = r.status !== 'published';
  const save = () => {
    setTried(true);
    if (err) return;
    reviewsStore.set((l) => l.map((x) => (x.id === r.id ? { ...x, reply: { text: text.trim(), by: me, at: TODAY }, status: 'published', log: [...x.log, ...(publish ? [{ what: 'published' as const, by: me, at: TODAY }] : []), { what: 'replied' as const, by: me, at: TODAY }] } : x)));
    logAction('marketing', { ar: `رد على ${r.id}${publish ? ' ونشره' : ''}`, en: `Replied to ${r.id}${publish ? ' and published it' : ''}` }, { target: r.id });
    toast({ tone: 'ok', text: tx('نُشر الرد في صفحة المنتج', 'Reply published on the product page') });
    onClose();
  };
  const preview: Review = { ...r, author: publicName(r.author, settings.maskNames), reply: { text: text.trim() || '…', by: me, at: TODAY } };
  const p = products.find((x) => x.id === r.productId);
  return (
    <Modal size="lg" title={r.kind === 'question' ? tx('الإجابة على السؤال', 'Answer the question') : tx('الرد على التقييم', 'Reply to the review')} description={tx('الرد علني ويظهر تحت التقييم في صفحة المنتج.', 'Replies are public and appear under the review on the product page.')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={save}>{publish ? tx('انشر مع الرد', 'Publish with reply') : tx('احفظ الرد', 'Save reply')}</Button></>}>
      <Field label={tx('الرد', 'Reply')} hint={<bdi dir="ltr">{text.length} / 500</bdi>} error={tried && err ? (err === 'empty' ? tx('اكتب الرد', 'Write the reply') : tx('الحد 500 حرف', '500 characters max')) : null}>
        {(f) => <Textarea {...f} rows={3} dir="auto" value={text} onChange={(e) => setText(e.target.value)} placeholder={tx('شكرًا لك…', 'Thank you…')} />}
      </Field>
      <div className="rounded-2xl border border-border p-4">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">{tx('معاينة في صفحة المنتج', 'Preview on the product page')}{p && <a href={link(`/store/p/${p.id}`)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-brand-700 hover:underline dark:text-brand-300">{p.name[lang]}<ExternalLink className="size-3" aria-hidden="true" /></a>}</p>
        <ul><PublicEntry r={preview} store={tx('المتجر', 'the store')} /></ul>
      </div>
      {publish && <Alert tone="info">{tx('هذا العنصر غير منشور؛ حفظ الرد ينشره مع الرد.', 'This entry is not published; saving the reply publishes it with the reply.')}</Alert>}
    </Modal>
  );
}

function ReportModal({ r, onClose }: { r: Review; onClose: () => void }) {
  const tx = useTx();
  const toast = useToast();
  const [reason, setReason] = useState<NonNullable<Review['report']>['reason']>(looksSuspicious(r.text) ? 'spam' : 'abuse');
  const send = () => {
    reviewsStore.set((l) => l.map((x) => (x.id === r.id ? { ...x, status: 'hidden', report: { reason, by: me, at: TODAY }, log: [...x.log, { what: 'reported' as const, by: me, at: TODAY }] } : x)));
    logAction('marketing', { ar: `أبلغ عن ${r.id} (${reason})`, en: `Reported ${r.id} (${reason})` }, { target: r.id });
    toast({ tone: 'ok', text: tx('أُرسل البلاغ إلى «لك» وأُخفي التقييم (محاكاة)', 'Report sent to LAK and the entry hidden (simulated)') });
    onClose();
  };
  return (
    <Modal title={tx('الإبلاغ عن إساءة', 'Report abuse')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={send}><Flag className="size-4" aria-hidden="true" />{tx('أبلغ وأخفِ', 'Report and hide')}</Button></>}>
      <Field label={tx('السبب', 'Reason')}>
        {(f) => <Select {...f} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
          <option value="abuse">{tx('إساءة أو ألفاظ', 'Abuse or language')}</option><option value="spam">{tx('إعلان أو رسائل مزعجة', 'Advert or spam')}</option><option value="personal">{tx('بيانات شخصية', 'Personal data')}</option>
        </Select>}
      </Field>
      <ul className="space-y-1.5 text-sm text-fg">
        <li>{tx('يُخفى من المتجر فورًا ويُراجعه فريق «لك».', 'Hidden from the store now and reviewed by the LAK team.')}</li>
        <li>{tx('لا يُحذف: يبقى في سجلك للرجوع إليه.', 'Not deleted: it stays in your log for reference.')}</li>
      </ul>
      <p className="flex items-center gap-1 text-xs text-muted">{tx('لا يُبلَّغ كاتب التقييم.', 'The author is not notified.')}<InfoHint>{tx('في هذه النسخة لا يصل البلاغ لأي فريق.', 'In this demo the report reaches no team.')}</InfoHint></p>
    </Modal>
  );
}

function SettingsCard({ settings, canManage }: { settings: ReviewSettings; canManage: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const set = (k: keyof ReviewSettings, v: boolean, label: string) => {
    reviewSettingsStore.set((s) => ({ ...s, [k]: v }));
    logAction('marketing', { ar: `إعداد التقييمات: ${label} ${v ? 'تشغيل' : 'إيقاف'}`, en: `Review settings: ${label} ${v ? 'on' : 'off'}` }, { before: String(!v), after: String(v) });
    toast({ tone: 'ok', text: tx('حُفظ ويظهر في المتجر فورًا', 'Saved; shows in the store now') });
  };
  const rows: { k: keyof ReviewSettings; label: string; hint: string }[] = [
    { k: 'products', label: tx('تقييمات المنتجات', 'Product reviews'), hint: tx('قسم «آراء العملاء» في صفحة المنتج.', 'The “Customer reviews” block on product pages.') },
    { k: 'moderation', label: tx('مراجعة قبل النشر', 'Review before publishing'), hint: tx('عند الإيقاف تُنشر التقييمات فور وصولها.', 'When off, reviews publish as soon as they arrive.') },
    { k: 'maskNames', label: tx('إخفاء اسم العائلة', 'Hide family names'), hint: tx(`يظهر «${publicName({ ar: 'سارة العتيبي', en: 'Sarah Alotaibi' }, true)[lang]}» بدل الاسم الكامل.`, `Shows “${publicName({ ar: 'سارة العتيبي', en: 'Sarah Alotaibi' }, true)[lang]}” instead of the full name.`) },
    { k: 'questions', label: tx('أسئلة المنتجات', 'Product questions'), hint: tx('الأسئلة المُجاب عنها فقط تظهر.', 'Only answered questions are shown.') },
    { k: 'questionsSignedIn', label: tx('الأسئلة للمسجّلين فقط', 'Questions from signed-in shoppers only'), hint: tx('يقلل الرسائل المزعجة.', 'Reduces spam.') },
    { k: 'showOnCategory', label: tx('النجوم في صفحة التصنيف', 'Stars on category pages'), hint: tx('متوسط التقييم تحت اسم المنتج.', 'Average rating under the product name.') },
  ];
  return (
    <Card aria-labelledby="h-rset">
      <CardHeader id="h-rset" title={tx('إعدادات التقييمات', 'Review settings')} hint={tx('تُحفظ كل مفتاح فور تغييره وتظهر في المتجر.', 'Each switch saves when changed and shows in the store.')} />
      <ul className="divide-y divide-border border-t border-border">
        {rows.map((r) => (
          <li key={r.k} className={cn('flex items-center justify-between gap-4 px-5 py-3')}>
            <span className="min-w-0"><span className="block text-sm font-medium text-fg">{r.label}</span><span className="block text-xs text-muted">{r.hint}</span></span>
            <Switch label={r.label} checked={settings[r.k]} disabled={!canManage} onChange={(v) => set(r.k, v, r.label)} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
