// Theme store (`#/dashboard/storefront/themes`): LAK's own original themes, built from the identity editor (layout of
// the homepage, header, typeface, colour, buttons). Preview on phone/desktop, then apply as a DRAFT: nothing reaches
// shoppers until the merchant publishes through the existing review-and-publish flow. Third-party themes and prices
// wait on a LAK decision. `?preview=<id>` opens a preview; `?apply=<id>` opens the apply confirmation.
import { useState } from 'react';
import { ArrowLeftRight, Brush, Check, Eye, Palette, Upload, Users } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { replace, type Route } from '../../../core/router';
import { canSee } from '../../merchant/perms';
import { logAction, settingsStore, themeStore } from '../../merchant/stores';
import type { ThemeState } from '../../merchant/workspace';
import { THEME_PRESETS, matchingPreset, orderSections, presetById, presetIdentity, type ThemePreset } from '../../merchant/commercial';
import { liveIdentity } from '../../storefront/theme';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, LinkButton, Segmented, Skeleton, useTx } from '../../../ds/ui';
import { Alert, Modal, PageHeader, Simulated, useToast } from '../../../ds/kit';
import { useDashState, setDashState } from '../review';
import { NoAccess, ReviewRole, useRole } from '../marketing/access';
import { DecisionMarker, Pending } from '../settings/decision-marker';
import { StoreTabs, storeHref } from './nav';
import { StorePreview } from './preview';
import { draftIdentity, identityChanges, setIdentity } from './identity';
import { pendingChanges } from './model';
import { useIdentityLabels } from './identity-panel';

const href = (q?: Record<string, string | undefined>) => storeHref('themes', q);

/** The draft a preset produces: identity from the preset (logo and favicon kept) and sections in its order. */
function applied(t: ThemeState, p: ThemePreset): ThemeState {
  const withId = setIdentity(t, presetIdentity(p, draftIdentity(t)));
  return { ...withId, draft: orderSections(t.draft, p.order) };
}

export default function ThemesPage({ route }: { route: Route }) {
  const tx = useTx();
  const { lang } = useLang();
  const role = useRole();
  const state = useDashState();
  const theme = themeStore.use();
  const store = settingsStore.use().store.name;
  const preview = presetById(route.query.get('preview'));
  const apply = presetById(route.query.get('apply'));
  const live = matchingPreset(liveIdentity(theme));
  const inDraft = matchingPreset(draftIdentity(theme));

  const header = (
    <>
      <PageHeader title={tx('متجر الثيمات', 'Theme store')} description={tx('ثيمات «لك» الأصلية · تُطبّق كمسودة ثم تنشرها أنت', 'LAK’s original themes · applied as a draft, then you publish')}
        meta={<Badge tone="green">{tx(`المنشور: الإصدار ${theme.published.version}`, `Live: version ${theme.published.version}`)}</Badge>}
        actions={<LinkButton variant="secondary" href={storeHref('theme', { edit: 'identity' })}><Brush className="size-4" aria-hidden="true" />{tx('محرر الهوية', 'Identity editor')}</LinkButton>} />
      <StoreTabs current="themes" />
      <ReviewRole />
    </>
  );
  if (!canSee(role, 'storefront')) return <div className="space-y-6"><ReviewRole /><NoAccess title={tx('المتجر الإلكتروني غير متاح لدورك', 'The online store is not available for your role')} /></div>;
  if (state === 'loading') return (
    <div className="space-y-6" aria-busy="true">{header}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3" role="status" aria-label="Loading">{[0, 1, 2].map((i) => <div key={i} className="space-y-3 rounded-2xl border border-border bg-surface p-4"><Skeleton className="h-64 w-full rounded-xl" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-3/4" /></div>)}</div>
    </div>
  );
  if (state === 'error') return (
    <div className="space-y-6">{header}
      <Card><ErrorState as="h2" title={tx('تعذّر تحميل الثيمات', 'Themes could not load')} onRetry={() => setDashState('live')}>{tx('متجرك المنشور لم يتغير. المرجع SIM-THEME-504.', 'Your live store did not change. Ref SIM-THEME-504.')}</ErrorState></Card>
    </div>
  );

  return (
    <div className="space-y-6">
      {header}
      {inDraft && inDraft !== live && (
        <Alert tone="info" title={tx(`ثيم «${presetById(inDraft)!.name.ar}» في المسودة`, `“${presetById(inDraft)!.name.en}” is in your draft`)}
          action={<LinkButton size="sm" href={storeHref('theme', { edit: 'identity' })}><Upload className="size-4" aria-hidden="true" />{tx('راجع وانشر', 'Review and publish')}</LinkButton>}>
          {tx('العملاء يرون الإصدار المنشور حتى تنشر المسودة.', 'Shoppers see the live version until you publish the draft.')}
        </Alert>
      )}
      <section aria-labelledby="h-lak-themes" className="space-y-3">
        <h2 id="h-lak-themes" className="flex items-center gap-1.5 text-[15px] font-semibold text-fg"><Palette className="size-4 text-muted" aria-hidden="true" />{tx('ثيمات لك', 'LAK themes')}<Badge>{THEME_PRESETS.length}</Badge></h2>
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {THEME_PRESETS.map((p) => (
            <li key={p.id}>
              <Card className="flex h-full flex-col overflow-hidden">
                <div className="pointer-events-none h-72 overflow-hidden border-b border-border bg-surface-2/50 px-4 pt-4" aria-hidden="true">
                  <StorePreview sections={orderSections(theme.draft, p.order)} identity={presetIdentity(p, draftIdentity(theme))} device="mobile" store={store} lang={lang} label={p.name[lang]} />
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="min-w-0 flex-1 text-[15px] font-semibold text-fg">{p.name[lang]}</h3>
                    {live === p.id && <Badge tone="green">{tx('منشور', 'Live')}</Badge>}
                    {inDraft === p.id && live !== p.id && <Badge tone="brand">{tx('في المسودة', 'In draft')}</Badge>}
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted">{p.tagline[lang]}</p>
                  <ul className="mt-3 flex-1 space-y-1 text-xs text-muted">{p.traits.map((t) => <li key={t.en} className="flex gap-1.5"><Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />{t[lang]}</li>)}</ul>
                  <p className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3 text-xs"><span className="text-muted">{tx('السعر', 'Price')}</span><Pending /></p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => replace(href({ preview: p.id }))}><Eye className="size-4" aria-hidden="true" />{tx('معاينة', 'Preview')}</Button>
                    <Button size="sm" disabled={inDraft === p.id} onClick={() => replace(href({ apply: p.id }))}>{inDraft === p.id ? tx('مطبّق في المسودة', 'Applied to draft') : tx('طبّق كمسودة', 'Apply as draft')}</Button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <Card>
        <CardHeader title={<span className="flex items-center gap-1.5"><Users className="size-4 text-muted" aria-hidden="true" />{tx('ثيمات المصممين', 'Designer themes')}</span>} action={<DecisionMarker id="themeRevenue" />} />
        <EmptyState icon={<Palette className="size-6" aria-hidden="true" />} title={tx('ثيمات المصممين الخارجيين بانتظار الاعتماد', 'Third-party designer themes are pending approval')}>
          {tx('لا نعرض ثيمات أو مصممين قبل اعتماد شروط المراجعة وحصة الإيراد.', 'No themes or designers are listed before review terms and revenue share are approved.')}
        </EmptyState>
      </Card>

      {preview && <PreviewModal p={preview} onClose={() => replace(href())} onApply={() => replace(href({ apply: preview.id }))} applied={inDraft === preview.id} />}
      {apply && <ApplyModal p={apply} onClose={() => replace(href())} />}
    </div>
  );
}

function PreviewModal({ p, onClose, onApply, applied: done }: { p: ThemePreset; onClose: () => void; onApply: () => void; applied: boolean }) {
  const tx = useTx();
  const { lang } = useLang();
  const theme = themeStore.use();
  const store = settingsStore.use().store.name;
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  return (
    <Modal size="lg" title={tx(`معاينة «${p.name.ar}»`, `Preview “${p.name.en}”`)} description={tx('بمنتجاتك وأقسامك الحالية', 'With your current products and sections')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إغلاق', 'Close')}</Button><Button disabled={done} onClick={onApply}>{done ? tx('مطبّق في المسودة', 'Applied to draft') : tx('طبّق كمسودة', 'Apply as draft')}</Button></>}>
      <Segmented label={tx('الجهاز', 'Device')} value={device} onChange={setDevice} options={[{ value: 'mobile', label: tx('جوال', 'Phone') }, { value: 'desktop', label: tx('كمبيوتر', 'Desktop') }]} />
      <StorePreview sections={orderSections(theme.draft, p.order)} identity={presetIdentity(p, draftIdentity(theme))} device={device} store={store} lang={lang} label={tx(`معاينة ${p.name.ar}`, `${p.name.en} preview`)} />
    </Modal>
  );
}

function ApplyModal({ p, onClose }: { p: ThemePreset; onClose: () => void }) {
  const tx = useTx();
  const toast = useToast();
  const L = useIdentityLabels();
  const theme = themeStore.use();
  const next = applied(theme, p);
  const idCh = identityChanges(draftIdentity(theme), draftIdentity(next));
  const moved = next.draft.filter((s, i) => theme.draft[i]?.id !== s.id).length;
  const hadDraft = pendingChanges(theme).length > 0 || identityChanges(liveIdentity(theme), draftIdentity(theme)).length > 0;
  const value = (k: string, v: string | null) => (k === 'font' ? L.font(v as never) : k === 'button' ? L.button(v as never) : k === 'header' ? L.header(v as never) : v ?? '—');
  const run = () => {
    const before = themeStore.get();
    themeStore.set((t) => applied(t, p));
    logAction('store', { ar: `طبّق ثيم «${p.name.ar}» على مسودة المتجر (لم يُنشر)`, en: `Applied the “${p.name.en}” theme to the store draft (not published)` }, { target: p.id });
    toast({ tone: 'ok', text: tx(`طُبّق «${p.name.ar}» على المسودة`, `“${p.name.en}” applied to the draft`), action: { label: tx('تراجع', 'Undo'), run: () => { themeStore.set(before); logAction('store', { ar: `تراجع عن تطبيق ثيم «${p.name.ar}» على المسودة`, en: `Undid applying the “${p.name.en}” theme to the draft` }, { target: p.id }); } } });
    onClose();
  };
  return (
    <Modal title={tx(`تطبيق «${p.name.ar}» على المسودة`, `Apply “${p.name.en}” to the draft`)} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={run}>{tx('طبّق على المسودة', 'Apply to draft')}</Button></>}>
      <div className="rounded-xl border border-border p-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-fg"><ArrowLeftRight className="size-3.5" aria-hidden="true" />{tx('ما يتغير في المسودة', 'What changes in the draft')}</p>
        <ul className="space-y-1.5 text-sm">
          {idCh.map((c) => (
            <li key={c.key} className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><span className="text-muted">{L.key(c.key)}:</span>
              {c.key === 'accent' ? <span className="inline-flex items-center gap-1.5"><span className="size-3.5 rounded-full border border-border" style={{ background: c.before ?? undefined }} />{tx('←', '→')}<span className="size-3.5 rounded-full border border-border" style={{ background: c.after ?? undefined }} /><bdi dir="ltr" className="text-xs">{c.after}</bdi></span>
                : <span>{value(c.key, c.before)} {tx('←', '→')} {value(c.key, c.after)}</span>}
            </li>
          ))}
          <li className="text-muted">{moved ? tx(`ترتيب ${moved} أقسام في الصفحة الرئيسية`, `Order of ${moved} homepage sections`) : tx('ترتيب الأقسام كما هو', 'Section order unchanged')}</li>
          {idCh.length === 0 && moved === 0 && <li className="text-muted">{tx('لا تغيير؛ المسودة تطابق هذا الثيم', 'No change; the draft already matches')}</li>}
        </ul>
      </div>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-muted">{tx('يبقى كما هو', 'Kept')}</dt><dd className="text-end">{tx('الشعار والأيقونة ونصوص الأقسام', 'Logo, favicon and section texts')}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">{tx('ما يراه العملاء', 'What shoppers see')}</dt><dd className="text-end">{tx('لا شيء حتى تنشر', 'Nothing until you publish')}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">{tx('السعر', 'Price')}</dt><dd><Pending /></dd></div>
      </dl>
      {hadDraft && <Alert tone="warn">{tx('لديك تعديلات غير منشورة؛ يستبدل الثيم اللون والخط والأزرار والرأس ويعيد ترتيب الأقسام فقط.', 'You have unpublished edits; the theme replaces colour, type, buttons and header and reorders sections only.')}</Alert>}
      <p className="flex items-center gap-2 text-xs text-muted"><Simulated />{tx('النشر من «راجع وانشر» في الصفحة الرئيسية، مع رجوع لأي إصدار.', 'Publish from “Review and publish” on Homepage, with rollback to any version.')}</p>
    </Modal>
  );
}
