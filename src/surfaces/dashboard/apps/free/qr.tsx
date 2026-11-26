// QR codes & short links app (`#/dashboard/apps/free/qr`, editor `?edit=new|<id>`): links to a product, category,
// page, landing page or coupon with UTM tags; a QR code drawn in the browser (PNG/SVG download); visits counted from
// the store in this session (simulated traffic) and orders and revenue credited from the order book.
import { useMemo, useState } from 'react';
import { Copy, Download, ExternalLink, Link2, Pause, Pencil, Play, Plus, QrCode, Trash2 } from 'lucide-react';
import { useLang } from '../../../../core/lang';
import { link, replace, useRoute } from '../../../../core/router';
import { couponsStore, currentActor, logAction, ordersStore } from '../../../merchant/stores';
import { total } from '../../../merchant/domain';
import { Badge, Button, Card, CardHeader, EmptyState, IconButton, LinkButton, Money, Ref, useTx } from '../../../../ds/ui';
import { Field, Input, Modal, SaveBar, Select, Simulated, useToast } from '../../../../ds/kit';
import { useSessionDraft } from '../../settings/drafts';
import { useUnsaved } from '../../unsaved';
import { qrMatrix, qrPath } from '../../orders/qr';
import { contentStore, landingStore } from '../../storefront/state';
import { POLICY_IDS } from '../../../storefront/pages/Policy';
import { useCatalog, useCategories } from '../../../storefront/data';
import { freeAppsStore, saveAppSettings } from './registry';
import { LINK_KINDS, QR_DEFAULTS, UTM_MEDIUMS, UTM_SOURCES, linkErrors, linkStats, linkUrl, nextCode, normCode, shortForm, slugUtm, storePath, type LinkKind, type QrSettings, type ShortLink } from './qr-model';
import { linkOrdersStore, linkVisitsStore } from './integrations-state';
import { AppStates, Stat, Stats } from './integrations-ui';

export default function QrApp() {
  return <AppStates><Screen /></AppStates>;
}

const base = () => { try { return `${window.location.origin}${window.location.pathname}`; } catch { return ''; } };

function useTargets() {
  const { lang } = useLang();
  const catalog = useCatalog();
  const cats = useCategories();
  const pages = contentStore.use().pages;
  const lps = landingStore.use();
  const coupons = couponsStore.use();
  return useMemo<Record<LinkKind, { value: string; label: string }[]>>(() => ({
    product: catalog.map((p) => ({ value: p.id, label: p.name[lang] })),
    category: cats.map((c) => ({ value: c.id, label: c.name[lang] })),
    page: [...POLICY_IDS.map((id) => ({ value: id, label: { shipping: lang === 'ar' ? 'سياسة الشحن' : 'Shipping policy', returns: lang === 'ar' ? 'سياسة الاسترجاع' : 'Returns policy', privacy: lang === 'ar' ? 'الخصوصية' : 'Privacy', terms: lang === 'ar' ? 'الشروط' : 'Terms' }[id] })),
      ...pages.filter((p) => p.live).map((p) => ({ value: p.slug, label: p.live!.title[lang] || p.slug }))],
    landing: lps.filter((p) => p.on).map((p) => ({ value: p.slug, label: p.name || p.slug })),
    coupon: coupons.filter((c) => c.status === 'active').map((c) => ({ value: c.code, label: c.code })),
  }), [catalog, cats, pages, lps, coupons, lang]);
}

function Screen() {
  const tx = useTx();
  const toast = useToast();
  const route = useRoute();
  const s = { ...QR_DEFAULTS, ...(freeAppsStore.use().qr?.settings as Partial<QrSettings>) };
  const visits = linkVisitsStore.use();
  const credited = linkOrdersStore.use();
  const orders = ordersStore.use();
  const targets = useTargets();
  const value = useMemo(() => { const m = new Map(orders.map((o) => [o.ref, o])); return (ref: string) => { const o = m.get(ref); return o && !o.cancelled ? total(o) : 0; }; }, [orders]);
  const edit = route.query.get('edit');
  const [qrFor, setQrFor] = useState<ShortLink | null>(null);
  const [del, setDel] = useState<ShortLink | null>(null);
  const stats = s.links.map((l) => ({ l, st: linkStats(l.code, visits, credited, value) }));
  const sum = stats.reduce((t, x) => ({ visits: t.visits + x.st.visits, orders: t.orders + x.st.orders, revenue: t.revenue + x.st.revenue }), { visits: 0, orders: 0, revenue: 0 });
  const kindName: Record<LinkKind, string> = { product: tx('منتج', 'Product'), category: tx('قسم', 'Category'), page: tx('صفحة', 'Page'), landing: tx('صفحة هبوط', 'Landing page'), coupon: tx('كوبون', 'Coupon') };
  const targetLabel = (l: ShortLink) => targets[l.kind].find((x) => x.value === l.target)?.label ?? l.target;
  const go = (e?: string) => replace(link('/dashboard/apps/free/qr', { edit: e }));
  const toggle = (l: ShortLink) => {
    saveAppSettings('qr', { links: s.links.map((x) => (x.id === l.id ? { ...x, on: !x.on } : x)) });
    logAction('apps', { ar: `${l.on ? 'أوقف' : 'شغّل'} الرابط ${l.code}`, en: `${l.on ? 'Paused' : 'Resumed'} link ${l.code}` }, { target: 'qr' });
  };
  const remove = (l: ShortLink) => {
    saveAppSettings('qr', { links: s.links.filter((x) => x.id !== l.id) });
    logAction('apps', { ar: `حذف الرابط ${l.code}`, en: `Deleted link ${l.code}` }, { target: 'qr' });
    setDel(null); toast({ tone: 'info', text: tx('حُذف الرابط. الطلبات المنسوبة إليه تبقى في سجل الطلبات.', 'Link deleted. Orders credited to it stay in the order book.') });
  };
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader id="qr-res" title={tx('النتائج', 'Results')} hint={tx('الزيارات من فتح الرابط في المتجر خلال هذه الجلسة (محاكاة)، والطلب يُنسب للرابط إن تم خلال ٧ أيام من زيارته.', 'Visits from opening the link in the store this session (simulated); an order is credited if placed within 7 days of the visit.')}
          action={<Button onClick={() => go('new')}><Plus className="size-4" aria-hidden="true" />{tx('رابط جديد', 'New link')}</Button>} />
        <div className="px-5 pb-5">
          <Stats>
            <Stat label={tx('روابط', 'Links')} value={s.links.length} />
            <Stat label={tx('زيارات', 'Visits')} value={sum.visits} />
            <Stat label={tx('طلبات', 'Orders')} value={sum.orders} />
            <Stat label={tx('مبيعات', 'Revenue')} value={<Money v={sum.revenue} />} hint={tx('إجمالي الطلبات المنسوبة غير الملغاة', 'Total of credited orders that aren’t cancelled')} />
          </Stats>
        </div>
      </Card>

      {edit && <Editor key={edit} id={edit} links={s.links} targets={targets} kindName={kindName} onDone={() => go(undefined)} />}

      <Card>
        <CardHeader id="qr-list" title={tx('الروابط', 'Links')} />
        <div className="px-5 pb-5">
          {!s.links.length ? (
            <EmptyState icon={<QrCode className="size-6" aria-hidden="true" />} title={tx('لا روابط بعد', 'No links yet')} action={<Button onClick={() => go('new')}><Plus className="size-4" aria-hidden="true" />{tx('رابط جديد', 'New link')}</Button>}>
              {tx('أنشئ رابطًا لكل لوحة محل أو منشور أو مؤثر لتعرف أثره.', 'Make one per shop sign, flyer or influencer to see what each brings.')}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {stats.map(({ l, st }) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button type="button" onClick={() => setQrFor(l)} className="grid size-12 shrink-0 place-items-center rounded-lg border border-border bg-white" aria-label={tx(`رمز QR للرابط ${l.code}`, `QR code for ${l.code}`)}><QrSvg text={linkUrl(base(), l)} size={44} /></button>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">{l.label}{!l.on && <Badge tone="gray">{tx('موقوف', 'Paused')}</Badge>}</p>
                    <p className="truncate text-xs text-muted"><Ref>{shortForm(l.code)}</Ref> · {kindName[l.kind]}: {targetLabel(l)} · <bdi dir="ltr">{l.utm.source}/{l.utm.medium}</bdi></p>
                  </div>
                  <dl className="flex gap-4 text-xs">
                    <div><dt className="text-muted">{tx('زيارات', 'Visits')}</dt><dd className="font-semibold tabular-nums text-fg">{st.visits}</dd></div>
                    <div><dt className="text-muted">{tx('طلبات', 'Orders')}</dt><dd className="font-semibold tabular-nums text-fg">{st.orders}</dd></div>
                    <div><dt className="text-muted">{tx('مبيعات', 'Revenue')}</dt><dd className="font-semibold text-fg"><Money v={st.revenue} /></dd></div>
                  </dl>
                  <div className="flex items-center gap-0.5">
                    <IconButton label={tx('رمز QR وتنزيله', 'QR code & download')} onClick={() => setQrFor(l)}><QrCode className="size-4" aria-hidden="true" /></IconButton>
                    <IconButton label={tx('عدّل', 'Edit')} onClick={() => go(l.id)}><Pencil className="size-4" aria-hidden="true" /></IconButton>
                    <IconButton label={l.on ? tx('أوقف', 'Pause') : tx('شغّل', 'Resume')} onClick={() => toggle(l)}>{l.on ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}</IconButton>
                    <IconButton label={tx('احذف', 'Delete')} onClick={() => setDel(l)}><Trash2 className="size-4" aria-hidden="true" /></IconButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {qrFor && <QrModal l={qrFor} onClose={() => setQrFor(null)} />}
      {del && (
        <Modal title={tx(`حذف الرابط ${del.code}؟`, `Delete link ${del.code}?`)} onClose={() => setDel(null)}
          footer={<><Button variant="secondary" onClick={() => setDel(null)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={() => remove(del)}><Trash2 className="size-4" aria-hidden="true" />{tx('احذف', 'Delete')}</Button></>}>
          <p className="text-sm text-muted">{tx('الرموز المطبوعة ستفتح المتجر دون أن تُحتسب. للإيقاف المؤقت استخدم «أوقف».', 'Printed codes will open the store without being counted. To stop for now, use Pause.')}</p>
        </Modal>
      )}
    </div>
  );
}

function blank(links: ShortLink[]): ShortLink {
  return { id: `QL-${Date.now().toString(36)}`, code: nextCode(links.map((l) => l.code), links.length + 7), label: '', kind: 'product', target: '', utm: { source: 'shop_sign', medium: 'qr', campaign: '' }, on: true, createdAt: '', by: '' };
}

function Editor({ id, links, targets, kindName, onDone }: { id: string; links: ShortLink[]; targets: Record<LinkKind, { value: string; label: string }[]>; kindName: Record<LinkKind, string>; onDone: () => void }) {
  const tx = useTx();
  const toast = useToast();
  const existing = links.find((l) => l.id === id);
  const start = useMemo(() => existing ?? blank(links), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [d, setD, clear] = useSessionDraft<ShortLink>(`freeApp.qr.${id}`, start);
  const dirty = JSON.stringify(d) !== JSON.stringify(start) || id === 'new';
  useUnsaved(JSON.stringify(d) !== JSON.stringify(start), { ar: 'رابط مختصر', en: 'Short link' });
  const [tried, setTried] = useState(false);
  const opts = targets[d.kind];
  const errs = linkErrors(d, links, opts.some((o) => o.value === d.target));
  const set = (p: Partial<ShortLink>) => setD({ ...d, ...p });
  const err = (k: string, ar: string, en: string) => (tried && errs.includes(k as never) ? tx(ar, en) : null);
  const save = () => {
    setTried(true);
    if (errs.length) return;
    const next: ShortLink = { ...d, label: d.label.trim(), createdAt: existing?.createdAt || new Date().toISOString(), by: existing?.by || currentActor().name };
    saveAppSettings('qr', { links: existing ? links.map((l) => (l.id === id ? next : l)) : [next, ...links] });
    logAction('apps', { ar: `${existing ? 'عدّل' : 'أنشأ'} الرابط ${next.code} (${next.label})`, en: `${existing ? 'Edited' : 'Created'} link ${next.code} (${next.label})` }, { target: 'qr' });
    clear(); onDone();
    toast({ tone: 'ok', text: tx('حُفظ الرابط. نزّل رمز QR من القائمة.', 'Link saved. Download its QR code from the list.') });
  };
  const url = linkUrl(base(), d);
  return (
    <Card>
      <CardHeader id="qr-ed" title={existing ? tx('تعديل الرابط', 'Edit link') : tx('رابط جديد', 'New link')} />
      <div className="grid gap-5 px-5 pb-5 lg:grid-cols-[1fr_auto]">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tx('اسم داخلي', 'Internal name')} className="sm:col-span-2" error={err('label', 'اكتب اسمًا', 'Enter a name') ?? (errs.includes('labelLong') ? tx('٤٠ حرفًا كحد أقصى', '40 characters at most') : null)}>
            {(p) => <Input {...p} placeholder={tx('لوحة فرع العليا', 'Olaya branch sign')} value={d.label} onChange={(e) => set({ label: e.target.value })} />}
          </Field>
          <Field label={tx('يفتح', 'Opens')}>{(p) => <Select {...p} value={d.kind} onChange={(e) => set({ kind: e.target.value as LinkKind, target: '' })}>{LINK_KINDS.map((k) => <option key={k} value={k}>{kindName[k]}</option>)}</Select>}</Field>
          <Field label={kindName[d.kind]} error={err('target', 'اختر الوجهة', 'Choose where it goes')}>
            {(p) => opts.length ? <Select {...p} value={d.target} onChange={(e) => set({ target: e.target.value, utm: { ...d.utm, campaign: d.utm.campaign || slugUtm(e.target.value) } })}><option value="">{tx('اختر…', 'Choose…')}</option>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
              : <p className="text-sm text-muted">{tx('لا عناصر متاحة من هذا النوع', 'Nothing of this kind is available')}</p>}
          </Field>
          <Field label="utm_source" error={err('source', 'حروف لاتينية وأرقام و-', 'Latin letters, digits, -')}>{(p) => <Input {...p} dir="ltr" list="qr-sources" value={d.utm.source} onChange={(e) => set({ utm: { ...d.utm, source: slugUtm(e.target.value) } })} />}</Field>
          <Field label="utm_medium" error={err('medium', 'حروف لاتينية وأرقام و-', 'Latin letters, digits, -')}>{(p) => <Input {...p} dir="ltr" list="qr-mediums" value={d.utm.medium} onChange={(e) => set({ utm: { ...d.utm, medium: slugUtm(e.target.value) } })} />}</Field>
          <Field label="utm_campaign" error={err('campaign', 'حروف لاتينية وأرقام و-', 'Latin letters, digits, -')}>{(p) => <Input {...p} dir="ltr" value={d.utm.campaign} onChange={(e) => set({ utm: { ...d.utm, campaign: slugUtm(e.target.value) } })} />}</Field>
          <Field label={tx('رمز الرابط', 'Link code')} error={err('code', '٣–١٢ حرفًا لاتينيًا أو رقمًا', '3–12 Latin letters or digits') ?? err('codeTaken', 'الرمز مستخدم', 'Code already used')}>{(p) => <Input {...p} dir="ltr" value={d.code} onChange={(e) => set({ code: normCode(e.target.value) })} />}</Field>
          <datalist id="qr-sources">{UTM_SOURCES.map((x) => <option key={x} value={x} />)}</datalist>
          <datalist id="qr-mediums">{UTM_MEDIUMS.map((x) => <option key={x} value={x} />)}</datalist>
          <p className="text-xs text-muted sm:col-span-2"><span className="font-medium text-fg"><Ref>{shortForm(d.code || '…')}</Ref></span> <Simulated /> → <bdi dir="ltr" className="break-all">#/store{storePath(d.kind, d.target)}?lk={d.code}</bdi></p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-xl border border-border bg-white p-2"><QrSvg text={url} size={168} /></div>
          <span className="text-xs text-muted">{tx('معاينة', 'Preview')}</span>
        </div>
      </div>
      <SaveBar dirty={dirty} onSave={save} onDiscard={() => { clear(); onDone(); }} saveLabel={existing ? tx('احفظ', 'Save') : tx('أنشئ الرابط', 'Create link')}
        error={tried && errs.length ? tx('صحّح الحقول المعلّمة', 'Fix the marked fields') : undefined} />
    </Card>
  );
}

function QrSvg({ text, size }: { text: string; size: number }) {
  const { size: n, d } = useMemo(() => qrPath(text), [text]);
  return <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} role="img" aria-hidden="true" shapeRendering="crispEdges"><rect width={n} height={n} fill="#fff" /><path d={d} fill="#000" /></svg>;
}

function svgText(text: string) {
  const { size: n, d } = qrPath(text);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${n * 10}" height="${n * 10}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
function save(name: string, href: string) {
  const a = document.createElement('a');
  a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
function downloadSvg(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([svgText(text)], { type: 'image/svg+xml' }));
  save(name, url); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadPng(text: string, name: string) {
  const m = qrMatrix(text);
  const scale = 12, q = 4, n = m.length + q * 2;
  const c = document.createElement('canvas');
  c.width = c.height = n * scale;
  const g = c.getContext('2d');
  if (!g) return;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
  m.forEach((row, y) => row.forEach((dark, x) => { if (dark) g.fillRect((x + q) * scale, (y + q) * scale, scale, scale); }));
  save(name, c.toDataURL('image/png'));
}

function QrModal({ l, onClose }: { l: ShortLink; onClose: () => void }) {
  const tx = useTx();
  const toast = useToast();
  const url = linkUrl(base(), l);
  const local = `#/store${storePath(l.kind, l.target)}?${url.split('?')[1]}`;
  const dl = (kind: 'png' | 'svg') => {
    if (kind === 'png') downloadPng(url, `qr-${l.code}.png`); else downloadSvg(url, `qr-${l.code}.svg`);
    logAction('apps', { ar: `نزّل رمز QR للرابط ${l.code} (${kind.toUpperCase()})`, en: `Downloaded QR for ${l.code} (${kind.toUpperCase()})` }, { target: 'qr' });
  };
  const copy = () => { navigator.clipboard?.writeText(url).then(() => toast({ tone: 'ok', text: tx('نُسخ الرابط', 'Link copied') }), () => toast({ tone: 'bad', text: tx('تعذّر النسخ؛ انسخه يدويًا', 'Couldn’t copy; copy it by hand') })); };
  return (
    <Modal title={l.label} description={shortForm(l.code)} onClose={onClose}
      footer={<><Button variant="secondary" onClick={() => dl('svg')}><Download className="size-4" aria-hidden="true" />SVG</Button><Button onClick={() => dl('png')}><Download className="size-4" aria-hidden="true" />PNG</Button></>}>
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-xl border border-border bg-white p-3"><QrSvg text={url} size={220} /></div>
        <p className="w-full break-all rounded-lg bg-surface-2 p-2 text-xs text-muted" dir="ltr">{url}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" variant="ghost" onClick={copy}><Copy className="size-4" aria-hidden="true" />{tx('انسخ الرابط', 'Copy link')}</Button>
          <LinkButton size="sm" variant="ghost" href={local}><ExternalLink className="size-4" aria-hidden="true" />{tx('جرّب كزائر', 'Try as a shopper')}</LinkButton>
        </div>
        {!l.on && <p className="text-xs text-amber-700 dark:text-amber-300"><Link2 className="me-1 inline size-3.5" aria-hidden="true" />{tx('الرابط موقوف: يفتح المتجر دون أن يُحتسب.', 'The link is paused: it opens the store without being counted.')}</p>}
      </div>
    </Modal>
  );
}
