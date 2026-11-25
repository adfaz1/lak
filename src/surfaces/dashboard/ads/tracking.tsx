// Tracking (`#/dashboard/ads/tracking`) and catalogue feed (`#/dashboard/ads/feed`): pixel / Conversions API IDs per
// platform with format checks and a simulated connection and test event; a product feed URL protected by a token
// the merchant can rotate or switch off, with the products it leaves out and why.
import { useState } from 'react';
import { Copy, Plug, RefreshCw, Unplug, Zap } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { useReviewMode } from '../../../core/review';
import { currentActor, levelsStore, logAction, productsStore } from '../../merchant/stores';
import { AD_PLATFORMS, checkPixel, checkToken, cleanId, EVENTS, feedExclusion, feedUrl, ID_FORMAT, maskToken, newToken, PLATFORM_NAME, type AdPlatform, type FeedExclusion } from '../../merchant/ads';
import { Badge, Button, Card, CardHeader, InfoHint, ProductImage, Ref, useTx, type Tone } from '../../../ds/ui';
import { Alert, Field, Input, Modal, Simulated, Switch, useToast } from '../../../ds/kit';
import { listPhoto, stockOf } from '../products/model';
import { useUnsaved } from '../unsaved';
import { adsStore, setAds } from './state';

const STATE_TONE: Record<string, Tone> = { off: 'gray', checking: 'sky', connected: 'green', failed: 'red' };

function PlatformCard({ p, canManage }: { p: AdPlatform; canManage: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const review = useReviewMode();
  const t = adsStore.use().tracking[p];
  const [pixel, setPixel] = useState(t.pixel);
  const [token, setToken] = useState('');
  const [tried, setTried] = useState(false);
  const [fail, setFail] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const dirty = pixel !== t.pixel || !!token;
  useUnsaved(dirty, { ar: `ربط ${PLATFORM_NAME[p].ar}`, en: `${PLATFORM_NAME[p].en} connection` });
  const pe = tried ? checkPixel(p, pixel) : null;
  const te = tried ? checkToken(token) : null;
  const put = (patch: Partial<typeof t>) => setAds((s) => ({ tracking: { ...s.tracking, [p]: { ...s.tracking[p], ...patch } } }));
  const connect = () => {
    setTried(true);
    if (checkPixel(p, pixel) || checkToken(token)) return;
    const id = cleanId(p, pixel);
    put({ pixel: id, token: token.trim() || t.token, state: 'checking', error: undefined, by: currentActor().name, at: Date.now() });
    setPixel(id); setToken(''); setTried(false);
    setTimeout(() => {
      const ok = !(review && fail);
      put({ state: ok ? 'connected' : 'failed', error: ok ? undefined : 'not_found' });
      logAction('apps', { ar: `${ok ? 'ربط' : 'فشل ربط'} تتبع ${PLATFORM_NAME[p].ar}`, en: `${ok ? 'Connected' : 'Failed to connect'} ${PLATFORM_NAME[p].en} tracking` }, { target: id });
      toast({ tone: ok ? 'ok' : 'bad', text: ok ? tx(`تم ربط ${PLATFORM_NAME[p].ar} (محاكاة)`, `${PLATFORM_NAME[p].en} connected (simulated)`) : tx('لم تجد المنصة هذا المعرّف', 'The platform did not find this ID') });
    }, 900);
  };
  const test = () => { put({ lastEvent: { name: 'PageView', at: Date.now() } }); toast({ tone: 'ok', text: tx('وصل حدث تجريبي (محاكاة)', 'Test event received (simulated)') }); };
  const disconnect = () => {
    put({ state: 'off', token: '', lastEvent: undefined });
    logAction('apps', { ar: `ألغى ربط تتبع ${PLATFORM_NAME[p].ar}`, en: `Disconnected ${PLATFORM_NAME[p].en} tracking` });
    setConfirm(false);
  };
  const label = { off: tx('غير مربوط', 'Not connected'), checking: tx('جارٍ التحقق…', 'Checking…'), connected: tx('مربوط', 'Connected'), failed: tx('فشل الربط', 'Failed') }[t.state];
  return (
    <Card className="flex flex-col">
      <CardHeader title={PLATFORM_NAME[p][lang]} action={<Badge tone={STATE_TONE[t.state]}>{label}</Badge>} />
      <div className="flex-1 space-y-3 px-5 pb-4">
        <Field label={ID_FORMAT[p].label[lang]} error={pe === 'required' ? tx('مطلوب', 'Required') : pe ? tx(`الصيغة: ${ID_FORMAT[p].example}`, `Format: ${ID_FORMAT[p].example}`) : null}>
          {(fp) => <Input {...fp} disabled={!canManage} dir="ltr" value={pixel} placeholder={ID_FORMAT[p].example} onChange={(e) => setPixel(e.target.value)} />}
        </Field>
        <Field label={<span className="inline-flex items-center gap-1">{tx('رمز التتبع من الخادم (CAPI)', 'Server-side token (CAPI)')}<InfoHint>{tx('يرسل الشراء من الخادم أيضًا ليبقى القياس حين تمنع المتصفحات البكسل. يُحفظ مخفيًا.', 'Also sends purchases from the server so measurement holds when browsers block the pixel. Stored hidden.')}</InfoHint></span>} optional
          error={te ? tx('20 خانة على الأقل بلا مسافات', 'At least 20 characters, no spaces') : null} hint={t.token ? tx(`محفوظ ${maskToken(t.token)}`, `Saved ${maskToken(t.token)}`) : undefined}>
          {(fp) => <Input {...fp} disabled={!canManage} type="password" dir="ltr" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />}
        </Field>
        {t.state === 'failed' && <Alert tone="bad">{tx('لم تتعرف المنصة على المعرّف. انسخه من مدير الأحداث في حسابك وأعد المحاولة.', 'The platform did not recognise the ID. Copy it from your events manager and try again.')}</Alert>}
        {t.state === 'connected' && <p className="text-xs text-muted">{t.lastEvent ? tx(`آخر حدث: ${t.lastEvent.name} · ${new Date(t.lastEvent.at).toLocaleTimeString('ar-SA-u-nu-latn')}`, `Last event: ${t.lastEvent.name} · ${new Date(t.lastEvent.at).toLocaleTimeString('en-GB')}`) : tx('لم يصل حدث بعد', 'No event received yet')}</p>}
        {review && canManage && <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={fail} onChange={(e) => setFail(e.target.checked)} />{tx('مراجعة: اجعل الربط يفشل', 'Review: make the connection fail')}</label>}
      </div>
      {canManage && <div className="flex flex-wrap gap-2 border-t border-border px-5 py-3">
        <Button size="sm" onClick={connect} disabled={t.state === 'checking' || (!dirty && t.state === 'connected')}><Plug className="size-4" aria-hidden="true" />{t.state === 'connected' ? tx('حدّث', 'Update') : tx('اربط', 'Connect')}</Button>
        {t.state === 'connected' && <Button size="sm" variant="secondary" onClick={test}><Zap className="size-4" aria-hidden="true" />{tx('حدث تجريبي', 'Test event')}</Button>}
        {t.state !== 'off' && <Button size="sm" variant="ghost" className="ms-auto" onClick={() => setConfirm(true)}><Unplug className="size-4" aria-hidden="true" />{tx('ألغِ الربط', 'Disconnect')}</Button>}
      </div>}
      {confirm && <Modal title={tx(`إلغاء ربط ${PLATFORM_NAME[p].ar}`, `Disconnect ${PLATFORM_NAME[p].en}`)} description={tx('تتوقف أحداث المتجر عن الوصول للمنصة، ولا تُطلق حملات جديدة عليها. نتائج الطلبات بالروابط تبقى.', 'Store events stop reaching the platform and no new campaigns launch on it. Order results by link remain.')} onClose={() => setConfirm(false)}
        footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>{tx('رجوع', 'Back')}</Button><Button variant="danger" onClick={disconnect}>{tx('ألغِ الربط', 'Disconnect')}</Button></>} />}
    </Card>
  );
}

export function Tracking({ canManage }: { canManage: boolean }) {
  const tx = useTx();
  return (
    <div className="space-y-4">
      <Alert tone="info" title={tx('ما يُرسل', 'What is sent')}>{tx(`الأحداث: ${EVENTS.join('، ')} — فقط بعد موافقة الزائر على ملفات التتبع. لا أسماء ولا أرقام جوال صريحة.`, `Events: ${EVENTS.join(', ')} — only after the visitor accepts tracking cookies. No plain names or phone numbers.`)} <Simulated /></Alert>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{AD_PLATFORMS.map((p) => <PlatformCard key={p} p={p} canManage={canManage} />)}</div>
    </div>
  );
}

export function FeedPage({ canManage }: { canManage: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const s = adsStore.use();
  const products = productsStore.use();
  const levels = levelsStore.use();
  const [rotate, setRotate] = useState(false);
  const f = s.feed;
  const store = 'darnuwa';
  const rows = products.filter((p) => p.status !== 'archived').map((p) => ({ p, why: feedExclusion(p, stockOf(p, levels), !!listPhoto(p)) }));
  const inFeed = rows.filter((r) => !r.why);
  const out = rows.filter((r) => r.why);
  const why = (w: FeedExclusion) => ({ inactive: tx('غير نشط', 'Not active'), noPhoto: tx('بلا صورة', 'No photo'), noStock: tx('نفد المخزون', 'Out of stock'), noDesc: tx('وصف قصير', 'Description too short'), digital: tx('رقمي لا يُعلن عنه في الكتالوج', 'Digital, not catalogue-eligible') })[w];
  const copy = (u: string) => { try { void navigator.clipboard?.writeText(u); } catch { /* ignore */ } toast({ tone: 'ok', text: tx('نُسخ الرابط', 'Link copied') }); };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={tx('رابط كتالوج المنتجات', 'Product catalogue feed')} hint={tx('الصقه في مدير الكتالوج لدى المنصة فتُحدّث المنتجات والأسعار والمخزون تلقائيًا.', 'Paste it into the platform’s catalogue manager so products, prices and stock update automatically.')}
          action={canManage && <Switch checked={f.on} label={tx('تفعيل الرابط', 'Feed on')} onChange={(on) => { setAds((x) => ({ feed: { ...x.feed, on } })); logAction('marketing', { ar: on ? 'فعّل رابط الكتالوج' : 'أوقف رابط الكتالوج', en: on ? 'Turned the catalogue feed on' : 'Turned the catalogue feed off' }); }} />} />
        <div className="space-y-3 px-5 pb-5">
          <Alert tone="warn" title={tx('لا تشارك هذا الرابط', 'Do not share this link')}>{tx('من يملكه يرى كل منتجاتك وأسعارك ومخزونك. إن تسرّب، أنشئ رابطًا جديدًا فيتوقف القديم فورًا.', 'Anyone with it sees all your products, prices and stock. If it leaks, make a new one and the old one stops at once.')}</Alert>
          {f.on ? AD_PLATFORMS.map((p) => (
            <div key={p} className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
              <span className="w-28 shrink-0 font-semibold text-fg">{PLATFORM_NAME[p][lang].split(' (')[0]}</span>
              <code className="min-w-0 flex-1 truncate text-xs text-muted" dir="ltr">{feedUrl(store, f, p).replace(f.token, `${f.token.slice(0, 4)}••••`)}</code>
              <Button size="sm" variant="secondary" onClick={() => copy(feedUrl(store, f, p))}><Copy className="size-4" aria-hidden="true" />{tx('انسخ', 'Copy')}</Button>
            </div>
          )) : <p className="text-sm text-muted">{tx('الرابط متوقف؛ أي منصة تطلبه تتلقى رفضًا.', 'The feed is off; any platform that requests it is refused.')}</p>}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <Simulated /><span>{tx('آخر تجديد للرمز', 'Token last renewed')} {new Date(f.rotatedAt).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB')}{f.by && ` · ${f.by}`}</span>
            {canManage && <Button size="sm" variant="ghost" className="ms-auto" onClick={() => setRotate(true)}><RefreshCw className="size-4" aria-hidden="true" />{tx('أنشئ رابطًا جديدًا', 'Make a new link')}</Button>}
          </div>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={tx(`في الكتالوج (${inFeed.length})`, `In the feed (${inFeed.length})`)} />
          <ul className="divide-y divide-border">{inFeed.map(({ p }) => <li key={p.id} className="flex items-center gap-3 px-5 py-2.5 text-sm"><ProductImage src={listPhoto(p)} alt={p.name[lang]} size={32} /><span className="flex-1 truncate text-fg">{p.name[lang]}</span><Ref>{p.sku}</Ref></li>)}</ul>
        </Card>
        <Card>
          <CardHeader title={tx(`مستبعد (${out.length})`, `Left out (${out.length})`)} hint={tx('المنصات ترفض المنتج بلا صورة أو مخزون أو وصف.', 'Platforms reject items without a photo, stock or description.')} />
          <ul className="divide-y divide-border">{out.map(({ p, why: w }) => <li key={p.id} className="flex items-center gap-3 px-5 py-2.5 text-sm"><span className="flex-1 truncate text-fg">{p.name[lang]}</span><Badge tone="amber">{why(w!)}</Badge></li>)}</ul>
        </Card>
      </div>
      {rotate && <Modal title={tx('رابط جديد للكتالوج', 'New catalogue link')} description={tx('يتوقف الرابط الحالي فورًا. الصق الجديد في كل منصة تستخدمه، وإلا توقفت مزامنة منتجاتك لديها.', 'The current link stops at once. Paste the new one into every platform that uses it, or their product sync stops.')} onClose={() => setRotate(false)}
        footer={<><Button variant="secondary" onClick={() => setRotate(false)}>{tx('رجوع', 'Back')}</Button><Button onClick={() => { setAds((x) => ({ feed: { ...x.feed, token: newToken(), rotatedAt: Date.now(), by: currentActor().name } })); logAction('security', { ar: 'جدّد رمز رابط الكتالوج', en: 'Renewed the catalogue feed token' }); toast({ tone: 'ok', text: tx('أُنشئ رابط جديد وأُلغي القديم', 'New link made; the old one is revoked') }); setRotate(false); }}>{tx('أنشئ وألغِ القديم', 'Make new, revoke old')}</Button></>} />}
    </div>
  );
}
