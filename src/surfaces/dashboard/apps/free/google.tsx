// Google Analytics & Merchant Center app settings (`#/dashboard/apps/free/google`): IDs with format checks, simulated
// connection and test event, the consent-gated tag (what is sent and when), and product-feed health with fix links.
import { useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Link2, PackageCheck, Send, ShieldCheck, Wrench, XCircle } from 'lucide-react';
import { useLang } from '../../../../core/lang';
import { link } from '../../../../core/router';
import { useReviewMode } from '../../../../core/review';
import { catalogXStore, logAction, productsStore } from '../../../merchant/stores';
import { Badge, Button, Card, CardHeader, EmptyState, ProductImage, Ref, Segmented, useTx } from '../../../../ds/ui';
import { Field, FilterChip, Input, SaveBar, Select, Simulated, Switch, useToast } from '../../../../ds/kit';
import { freeAppsStore, saveAppSettings } from './registry';
import {
  GA_EVENTS, GA_EVENT_INFO, GOOGLE_DEFAULTS, ISSUE_FOCUS, feedHealth, googleErrors, normGa4, normMc, sentEvents, validGa4, validMc,
  type FeedIssue, type GaEvent, type GoogleSettings,
} from './google-model';
import { AppStates, Stat, Stats, useAppForm } from './integrations-ui';
import { productPhoto } from '../../model/media';

export default function GoogleApp() {
  return <AppStates><Screen /></AppStates>;
}

const settingsOf = (raw: Record<string, unknown> | undefined): GoogleSettings => {
  const s = (raw ?? {}) as Partial<GoogleSettings>;
  return { ...GOOGLE_DEFAULTS, ...s, events: { ...GOOGLE_DEFAULTS.events, ...s.events }, connected: { ...s.connected }, tests: s.tests ?? [] };
};

function Screen() {
  const tx = useTx();
  const toast = useToast();
  const apps = freeAppsStore.use();
  const saved = settingsOf(apps.google?.settings);
  type Form = Pick<GoogleSettings, 'ga4' | 'mc' | 'events'>;
  const base: Form = { ga4: saved.ga4, mc: saved.mc, events: saved.events };
  const f = useAppForm<Form>('google', base, { ar: 'إعدادات Google', en: 'Google settings' });
  const d = f.draft;
  const errs = googleErrors(d);
  const save = () => {
    if (errs.length) return;
    const ga4 = d.ga4.trim() ? normGa4(d.ga4) : '';
    const mc = d.mc.trim() ? normMc(d.mc) : '';
    // A changed ID needs connecting again.
    const connected = { ga4: ga4 === saved.ga4 ? saved.connected.ga4 : undefined, mc: mc === saved.mc ? saved.connected.mc : undefined };
    f.commit({ ga4, mc, events: d.events }, { ar: 'حفظ إعدادات Google Analytics و Merchant Center', en: 'Saved Google Analytics & Merchant Center settings' }, (n) => saveAppSettings('google', { ...n, connected }));
  };
  return (
    <div className="space-y-6">
      <Accounts saved={saved} d={d} set={f.set} dirty={f.dirty} errs={errs} />
      <Tag d={d} set={f.set} />
      <Feed />
      <SaveBar dirty={f.dirty} saving={f.saving} onSave={save} onDiscard={() => { f.discard(); toast({ tone: 'info', text: tx('تُجوهلت التعديلات', 'Edits discarded') }); }}
        error={errs.length ? tx('صحّح المعرّفات المعلّمة', 'Fix the marked IDs') : undefined} />
    </div>
  );
}

function Accounts({ saved, d, set, dirty, errs }: { saved: GoogleSettings; d: Pick<GoogleSettings, 'ga4' | 'mc' | 'events'>; set: (p: Partial<typeof d>) => void; dirty: boolean; errs: string[] }) {
  const tx = useTx();
  const toast = useToast();
  const review = useReviewMode();
  const [ev, setEv] = useState<GaEvent>('page_view');
  const [fail, setFail] = useState(false);
  const connect = (k: 'ga4' | 'mc') => {
    saveAppSettings('google', { connected: { ...saved.connected, [k]: new Date().toISOString() } });
    logAction('apps', { ar: `ربط ${k === 'ga4' ? 'Google Analytics' : 'Merchant Center'} (${k === 'ga4' ? saved.ga4 : saved.mc})`, en: `Connected ${k === 'ga4' ? 'Google Analytics' : 'Merchant Center'} (${k === 'ga4' ? saved.ga4 : saved.mc})` }, { target: 'google' });
    toast({ tone: 'ok', text: tx('رُبط الحساب (محاكاة)', 'Connected (simulated)') });
  };
  const disconnect = (k: 'ga4' | 'mc') => {
    saveAppSettings('google', { connected: { ...saved.connected, [k]: undefined } });
    logAction('apps', { ar: `فصل ${k === 'ga4' ? 'Google Analytics' : 'Merchant Center'}`, en: `Disconnected ${k === 'ga4' ? 'Google Analytics' : 'Merchant Center'}` }, { target: 'google' });
  };
  const test = () => {
    const ok = !fail && !!saved.connected.ga4 && saved.events[ev];
    const row = { at: new Date().toISOString(), event: ev, ok, id: `T-${Date.now().toString(36).toUpperCase()}` };
    saveAppSettings('google', { tests: [row, ...saved.tests].slice(0, 8) });
    logAction('apps', { ar: `حدث تجريبي ${ev} إلى Google Analytics: ${ok ? 'وصل' : 'فشل'}`, en: `Test event ${ev} to Google Analytics: ${ok ? 'received' : 'failed'}` }, { target: 'google' });
    toast({ tone: ok ? 'ok' : 'bad', text: ok ? tx('وصل الحدث التجريبي (محاكاة)', 'Test event received (simulated)') : tx('لم يصل الحدث. تأكد أن الحدث مفعّل وأعد المحاولة.', 'The event didn’t arrive. Check the event is on and retry.') });
  };
  const row = (k: 'ga4' | 'mc') => {
    const val = k === 'ga4' ? saved.ga4 : saved.mc;
    const valid = k === 'ga4' ? validGa4(val) : validMc(val);
    const at = saved.connected[k];
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {at ? <Badge tone="green" icon={<CheckCircle2 className="size-3.5" aria-hidden="true" />}>{tx('مربوط', 'Connected')}</Badge> : <Badge tone="gray">{tx('غير مربوط', 'Not connected')}</Badge>}
        {at ? <Button size="sm" variant="ghost" onClick={() => disconnect(k)}>{tx('افصل', 'Disconnect')}</Button>
          : <Button size="sm" variant="secondary" disabled={!valid || dirty} onClick={() => connect(k)}><Link2 className="size-4" aria-hidden="true" />{tx('اربط', 'Connect')}</Button>}
        {!at && (!valid || dirty) && <span className="text-xs text-muted">{dirty ? tx('احفظ أولًا', 'Save first') : tx('أدخل المعرّف واحفظه', 'Enter and save the ID')}</span>}
      </div>
    );
  };
  return (
    <Card>
      <CardHeader id="g-acc" title={tx('الحسابات', 'Accounts')} hint={tx('الربط والأحداث التجريبية محاكاة في هذه المعاينة؛ لا يصل شيء إلى Google.', 'Connecting and test events are simulated here; nothing reaches Google.')} action={<Simulated />} />
      <div className="grid gap-5 px-5 pb-5 lg:grid-cols-2">
        <div className="space-y-2">
          <Field label={tx('معرّف القياس GA4', 'GA4 measurement ID')} hint="G-XXXXXXXXXX" error={errs.includes('ga4') ? tx('الصيغة: G- ثم ١٠ أحرف أو أرقام', 'Format: G- then 10 letters or digits') : null}>
            {(p) => <Input {...p} dir="ltr" placeholder="G-XXXXXXXXXX" value={d.ga4} onChange={(e) => set({ ga4: e.target.value })} />}
          </Field>
          {row('ga4')}
        </div>
        <div className="space-y-2">
          <Field label={tx('رقم حساب Merchant Center', 'Merchant Center ID')} hint={tx('من ٦ إلى ١٢ رقمًا', '6 to 12 digits')} error={errs.includes('mc') ? tx('أرقام فقط، من ٦ إلى ١٢', 'Digits only, 6 to 12') : null}>
            {(p) => <Input {...p} dir="ltr" inputMode="numeric" value={d.mc} onChange={(e) => set({ mc: e.target.value })} />}
          </Field>
          {row('mc')}
        </div>
        <div className="space-y-3 rounded-xl bg-surface-2 p-4 lg:col-span-2">
          <div className="flex flex-wrap items-end gap-2">
            <Field label={tx('حدث تجريبي', 'Test event')} className="w-48">{(p) => <Select {...p} dir="ltr" value={ev} onChange={(e) => setEv(e.target.value as GaEvent)}>{GA_EVENTS.map((x) => <option key={x} value={x}>{x}</option>)}</Select>}</Field>
            <Button variant="secondary" onClick={test} disabled={!saved.connected.ga4}><Send className="size-4" aria-hidden="true" />{tx('أرسل حدثًا تجريبيًا', 'Send a test event')}</Button>
            {!saved.connected.ga4 && <span className="pb-2 text-xs text-muted">{tx('اربط Google Analytics أولًا', 'Connect Google Analytics first')}</span>}
            {review && <span className="ms-auto pb-2"><Switch checked={fail} onChange={setFail} label={tx('محاكاة: فشل الإرسال', 'Simulate: delivery fails')} /></span>}
          </div>
          {saved.tests.length > 0 && (
            <ul className="space-y-1 text-sm">
              {saved.tests.map((t) => <li key={t.id} className="flex flex-wrap items-center gap-2">{t.ok ? <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" /> : <XCircle className="size-4 text-red-600" aria-hidden="true" />}<Ref>{t.event}</Ref><span className="text-muted">{t.ok ? tx('وصل', 'Received') : tx('لم يصل', 'Not received')}</span><span className="text-xs text-muted"><Ref>{t.at.slice(0, 16).replace('T', ' ')}</Ref></span></li>)}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

function Tag({ d, set }: { d: Pick<GoogleSettings, 'ga4' | 'mc' | 'events'>; set: (p: Partial<typeof d>) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const [consent, setConsent] = useState<'yes' | 'no'>('yes');
  const sent = sentEvents(d, consent === 'yes');
  return (
    <Card>
      <CardHeader id="g-tag" title={tx('وسم القياس والموافقة', 'Measurement tag and consent')} hint={tx('لا يُحمَّل الوسم ولا يُرسل شيء قبل موافقة الزائر على ملفات القياس. لا يُرسل اسم أو جوال أو بريد أو عنوان.', 'The tag doesn’t load and nothing is sent before the visitor accepts analytics cookies. No name, mobile, email or address is sent.')} />
      <div className="space-y-4 px-5 pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <ShieldCheck className="size-5 text-emerald-600" aria-hidden="true" />
          <Segmented label={tx('الزائر', 'Visitor')} value={consent} onChange={setConsent} options={[{ value: 'yes', label: tx('وافق على القياس', 'Accepted analytics') }, { value: 'no', label: tx('رفض', 'Declined') }]} />
          <span className="text-sm text-muted">{sent.length ? tx(`يُرسل ${sent.length} أحداث`, `${sent.length} events sent`) : tx('لا يُرسل شيء', 'Nothing is sent')}</span>
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {GA_EVENTS.map((e) => (
            <li key={e} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg"><Ref>{e}</Ref><span className="font-normal text-muted">· {GA_EVENT_INFO[e].when[lang]}</span>{sent.includes(e) ? <Badge tone="green">{tx('يُرسل', 'Sent')}</Badge> : <Badge tone="gray">{tx('لا يُرسل', 'Not sent')}</Badge>}</p>
                <p className="mt-1 text-xs text-muted" dir="ltr">{GA_EVENT_INFO[e].params.join(' · ')}</p>
              </div>
              <Switch checked={d.events[e]} onChange={(v) => set({ events: { ...d.events, [e]: v } })} label={tx(`أرسل ${e}`, `Send ${e}`)} />
            </li>
          ))}
        </ul>
        {!validGa4(d.ga4) && <p className="text-xs text-muted">{tx('بدون معرّف قياس صحيح لا يُرسل أي حدث.', 'Without a valid measurement ID no event is sent.')}</p>}
      </div>
    </Card>
  );
}

function Feed() {
  const tx = useTx();
  const { lang } = useLang();
  const products = productsStore.use();
  const brands = catalogXStore.use().brands;
  const h = useMemo(() => feedHealth(products, brands.map((b) => b.id)), [products, brands]);
  const [only, setOnly] = useState<'' | FeedIssue | 'gtinAny'>('');
  const issueName: Record<FeedIssue, string> = { gtin: tx('بلا GTIN', 'No GTIN'), gtinInvalid: tx('GTIN غير صالح', 'Invalid GTIN'), brand: tx('بلا علامة تجارية', 'No brand'), description: tx('وصف قصير', 'Short description'), image: tx('بلا صورة', 'No image') };
  const rows = h.rows.filter((r) => r.issues.length && (!only || (only === 'gtinAny' ? r.issues.some((i) => i === 'gtin' || i === 'gtinInvalid') : r.issues.includes(only))));
  return (
    <Card>
      <CardHeader id="g-feed" title={tx('صحة ملف المنتجات', 'Product feed health')} hint={tx('المنتجات النشطة المعروضة في المتجر الإلكتروني. Google يرفض المنتج الناقص.', 'Active products shown in the online store. Google rejects incomplete products.')} action={<Badge tone={h.ready === h.total ? 'green' : 'amber'}>{tx(`${h.ready} من ${h.total} جاهز`, `${h.ready} of ${h.total} ready`)}</Badge>} />
      <div className="space-y-4 px-5 pb-5">
        <Stats>
          <Stat label={tx('بلا GTIN صالح', 'No valid GTIN')} value={h.by.gtin} tone={h.by.gtin ? 'bad' : 'ok'} hint={tx('الباركود العالمي (EAN/UPC) برقم تحقق صحيح', 'Global barcode (EAN/UPC) with a valid check digit')} />
          <Stat label={tx('بلا علامة تجارية', 'No brand')} value={h.by.brand} tone={h.by.brand ? 'bad' : 'ok'} />
          <Stat label={tx('وصف قصير', 'Short description')} value={h.by.description} tone={h.by.description ? 'bad' : 'ok'} hint={tx('أقل من ٣٠ حرفًا بالعربية والإنجليزية', 'Under 30 characters in both languages')} />
          <Stat label={tx('بلا صورة', 'No image')} value={h.by.image} tone={h.by.image ? 'bad' : 'ok'} />
        </Stats>
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip label={tx('المشكلة', 'Issue')} value={only} onChange={(v) => setOnly(v as typeof only)} options={[{ value: '', label: tx('الكل', 'All') }, { value: 'gtinAny', label: 'GTIN' }, { value: 'brand', label: issueName.brand }, { value: 'description', label: issueName.description }, { value: 'image', label: issueName.image }]} />
          <span className="text-xs text-muted">{tx(`${rows.length} منتج يحتاج إصلاحًا`, `${rows.length} products need a fix`)}</span>
        </div>
        {!h.total ? <EmptyState icon={<BarChart3 className="size-6" aria-hidden="true" />} title={tx('لا منتجات نشطة في المتجر', 'No active products in the store')} />
          : !rows.length ? <EmptyState icon={<PackageCheck className="size-6" aria-hidden="true" />} title={only ? tx('لا منتج بهذه المشكلة', 'No product with this issue') : tx('كل المنتجات جاهزة', 'Every product is ready')} />
          : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {rows.map(({ p, issues }) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <ProductImage src={productPhoto(p.id)} alt={p.name[lang]} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{p.name[lang]}</p>
                    <p className="text-xs text-muted"><Ref>{p.sku}</Ref></p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {issues.map((i) => (
                      <a key={i} href={link(`/dashboard/products/${p.id}`, { focus: ISSUE_FOCUS[i] })} className="inline-flex h-7 items-center gap-1 rounded-full border border-border px-2.5 text-xs font-medium text-fg hover:border-brand-300 hover:text-brand-700 dark:hover:text-brand-300">
                        <Wrench className="size-3" aria-hidden="true" />{issueName[i]}
                      </a>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
      </div>
    </Card>
  );
}
