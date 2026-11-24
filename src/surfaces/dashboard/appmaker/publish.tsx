// Review & publish: what will be submitted, to which stores, and what customers will see — before anything is
// sent. Two paths: a settings update (no store review, reaches installed apps at next launch) or a new version
// (LAK review, then build, signing, upload and each store's review). Everything here is simulated.
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Layers, RefreshCw } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, navigate, replace, type Route } from '../../../core/router';
import { Badge, Button, Card, CardHeader, LinkButton, Segmented, cn, useTx } from '../../../ds/ui';
import { Alert, Checkbox, Modal, Simulated, useToast } from '../../../ds/kit';
import { PLATFORMS, STAGES, createConfigUpdate, createRelease, liveConfig, readiness, type Platform } from '../../appmaker/domain';
import { parseOs, pendingRelease, publishPlan, type OS } from './model';
import { MiniPhone } from './phone';
import { ChangeTag, Checklist, ah, useAppData, useS } from './parts';
import { StoreIcon } from './overview';
import { appStore, now } from './state';

export default function Publish({ route, empty }: { route: Route; empty: boolean }) {
  const tx = useTx();
  const S = useS();
  const { lang } = useLang();
  const toast = useToast();
  const { s, plan, catalog } = useAppData();
  const releases = empty ? [] : s.releases;
  const [picked, setPicked] = useState<Platform[]>(PLATFORMS);
  const [dlg, setDlg] = useState<'config' | 'binary' | null>(null);
  const state = { ...s, plan, releases };
  const pp = publishPlan(state, picked);
  const live = liveConfig(releases);
  const checks = readiness(state);
  const os = parseOs(route.query.get('os'));
  const Arrow = lang === 'ar' ? ArrowLeft : ArrowRight;
  const setOs = (v: OS) => replace(link('/dashboard/appmaker/publish', { os: v === 'ios' ? undefined : v }));
  const stores = (ps: Platform[]) => ps.map((p) => S.storeName[p]).join(lang === 'ar' ? ' و' : ' and ');

  const doConfig = () => {
    const id = `r${s.seq}`;
    const r = createConfigUpdate(releases, s.draft, now(), id);
    if (!r) return;
    appStore.set((x) => ({ ...x, releases: [...x.releases, r], seq: x.seq + 1 }));
    setDlg(null);
    toast({ tone: 'ok', text: tx('طُبّق تحديث الإعدادات (محاكاة)', 'Settings update applied (simulated)') });
    navigate(ah('releases', [id]));
  };
  const doBinary = () => {
    const id = `r${s.seq}`;
    const r = createRelease(releases, s.draft, pp.platforms, now(), id);
    appStore.set((x) => ({ ...x, releases: [...x.releases, r], seq: x.seq + 1 }));
    setDlg(null);
    toast({ tone: 'ok', text: tx(`أُرسل الإصدار ${r.version} لمراجعة «لك» (محاكاة)`, `Version ${r.version} sent to LAK review (simulated)`) });
    navigate(ah('releases', [id]));
  };

  const binWhy = pp.binaryBlock && {
    notEligible: tx('الإرسال يحتاج باقة Plus فأعلى وتفعيل الإضافة.', 'Submitting needs Plus or above and the add-on.'),
    active: tx('يوجد إصدار قيد المعالجة. انتظر نتيجته أولًا.', 'A version is still in progress. Wait for its result first.'),
    notReady: tx('أكمل بنود الجاهزية أولًا.', 'Complete the readiness items first.'),
    noPlatform: tx('اختر متجرًا متصلًا واحدًا على الأقل.', 'Choose at least one connected store.'),
    noChange: tx('لا تعديلات تحتاج إصدارًا جديدًا.', 'Nothing needs a new version.'),
  }[pp.binaryBlock];
  const cfgWhy = pp.configBlock && (pp.configBlock === 'notEligible' ? tx('يحتاج باقة Plus فأعلى وتفعيل الإضافة.', 'Needs Plus or above and the add-on.') : S.cfgBlocks[pp.configBlock]);
  const binaryPrimary = pp.path !== 'config';
  const pending = pendingRelease(releases, s.draft, pp.platforms, now());

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        <Card aria-labelledby="am-pb-see">
          <CardHeader id="am-pb-see" title={tx('ما سيراه عملاؤك', 'What customers will see')} hint={tx('الشاشة الرئيسية قبل وبعد. معاينة ويب لا تثبت سلوك التطبيق الأصلي.', 'The home screen before and after. A web preview does not prove native app behaviour.')}
            action={<Segmented<OS> label={tx('الجهاز', 'Device')} value={os} onChange={setOs} options={[{ value: 'ios', label: 'iOS' }, { value: 'android', label: 'Android' }]} />} />
          <div className="flex flex-wrap items-start justify-center gap-4 px-5 pb-5 sm:gap-8">
            {live && (
              <>
                <figure className="space-y-2 text-center"><MiniPhone tall scale={0.5} config={live} catalog={catalog} os={os} screen="home" label={tx('الآن لدى العملاء', 'Customers now')} /><figcaption className="text-xs font-semibold text-muted">{tx('الآن', 'Now')}</figcaption></figure>
                <Arrow className="hidden size-5 text-subtle sm:block" aria-hidden="true" />
              </>
            )}
            <figure className="space-y-2 text-center"><MiniPhone tall scale={0.5} config={s.draft} catalog={catalog} os={os} screen="home" label={tx('بعد النشر', 'After publishing')} /><figcaption className="text-xs font-semibold text-brand-700 dark:text-brand-300">{tx('بعد النشر', 'After publishing')}</figcaption></figure>
          </div>
          <div className="border-t border-border px-5 py-4">
            {pp.change.binary.length + pp.change.config.length === 0
              ? <p className="text-sm text-muted">{live ? tx('المسودة مطابقة لما لدى العملاء.', 'Your draft matches what customers have.') : tx('أول إصدار: كل الإعدادات تُرسل.', 'First version: every setting is submitted.')}</p>
              : <ul className="flex flex-wrap gap-x-5 gap-y-2">
                  {pp.change.binary.map((f) => <li key={f} className="flex items-center gap-2 text-sm text-fg">{S.binaryFields[f]}<ChangeTag kind="binary" /></li>)}
                  {pp.change.config.map((f) => <li key={f} className="flex items-center gap-2 text-sm text-fg">{S.configFields[f]}<ChangeTag kind="config" /></li>)}
                </ul>}
          </div>
        </Card>

        {pp.active && <Alert tone="info" title={tx(`الإصدار ${pp.active.version} قيد المعالجة`, `Version ${pp.active.version} is in progress`)} action={<LinkButton variant="secondary" size="sm" href={ah('releases', [pp.active.id])}>{tx('افتح', 'Open')}</LinkButton>} />}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card aria-labelledby="am-cfg" className={cn(!binaryPrimary && 'ring-2 ring-brand-500/40')}>
            <CardHeader id="am-cfg" title={<span className="inline-flex items-center gap-2"><RefreshCw className="size-4 text-sky-600" aria-hidden="true" />{tx('تحديث إعدادات', 'Settings update')}</span>} action={!binaryPrimary && <Badge tone="brand">{tx('المناسب لتعديلاتك', 'Fits your edits')}</Badge>} />
            <div className="space-y-3 px-5 pb-5">
              <ul className="space-y-1 text-[13px] text-muted">
                <li>{tx('الأقسام والألوان وعرض المنتجات', 'Sections, colours and product display')}</li>
                <li>{tx('بلا بناء ولا مراجعة متاجر', 'No build, no store review')}</li>
                <li>{tx('يصل عند فتح التطبيق التالي', 'Arrives at the next app launch')}</li>
              </ul>
              {cfgWhy && <p className="text-xs font-medium text-amber-800 dark:text-amber-300" id="am-cfg-why">{cfgWhy}</p>}
              <Button variant={binaryPrimary ? 'secondary' : 'primary'} disabled={!!pp.configBlock} aria-describedby={cfgWhy ? 'am-cfg-why' : undefined} onClick={() => setDlg('config')}>{tx('راجع تحديث الإعدادات', 'Review settings update')}</Button>
            </div>
          </Card>

          <Card aria-labelledby="am-bin" className={cn(binaryPrimary && 'ring-2 ring-brand-500/40')}>
            <CardHeader id="am-bin" title={<span className="inline-flex items-center gap-2"><Layers className="size-4 text-amber-600" aria-hidden="true" />{tx('إصدار جديد', 'New version')} <bdi dir="ltr" className="text-muted">{pp.version}</bdi></span>} action={binaryPrimary && <Badge tone="brand">{tx('المناسب لتعديلاتك', 'Fits your edits')}</Badge>}
              hint={S.lakWindow} />
            <div className="space-y-3 px-5 pb-5">
              <fieldset className="space-y-2">
                <legend className="mb-1 text-[13px] font-semibold text-fg">{tx('المتاجر', 'Stores')}</legend>
                {PLATFORMS.map((p) => {
                  const ok = s.accounts[p] === 'connected';
                  return (
                    <label key={p} className={cn('flex items-center gap-2.5 text-sm', ok ? 'text-fg' : 'text-muted')}>
                      {ok ? <Checkbox checked={picked.includes(p)} label={S.storeName[p]} onChange={(v) => setPicked((c) => (v ? [...c, p] : c.filter((x) => x !== p)))} /> : <span className="size-[18px] rounded border border-border" aria-hidden="true" />}
                      <StoreIcon p={p} className="size-4" />{S.storeName[p]}
                      {!ok && <a href={ah('accounts')} className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('غير متصل · اربط', 'Not connected · connect')}</a>}
                    </label>
                  );
                })}
              </fieldset>
              {binWhy && <p className="text-xs font-medium text-amber-800 dark:text-amber-300" id="am-bin-why">{binWhy}</p>}
              <Button variant={binaryPrimary ? 'primary' : 'secondary'} disabled={!!pp.binaryBlock} aria-describedby={binWhy ? 'am-bin-why' : undefined} onClick={() => setDlg('binary')}>{tx('راجع الإصدار قبل الإرسال', 'Review version before sending')}</Button>
            </div>
          </Card>
        </div>
      </div>

      <div className="min-w-0 space-y-6">
        <Card aria-labelledby="am-pb-r">
          <CardHeader id="am-pb-r" title={tx('الجاهزية', 'Readiness')} action={<span className="text-xs font-semibold text-muted tabular-nums">{checks.filter((c) => c.ok).length}/{checks.length}</span>} />
          <div className="border-t border-border"><Checklist checks={checks} /></div>
        </Card>
        <p className="text-xs leading-relaxed text-muted">{S.rollbackNote}</p>
      </div>

      {dlg === 'config' && (
        <Modal title={tx('نشر تحديث الإعدادات', 'Publish settings update')} description={tx('يصل لكل التطبيقات المثبتة على iOS وAndroid عند فتحها التالي.', 'Reaches every installed app on iOS and Android at its next launch.')} onClose={() => setDlg(null)}
          footer={<><Button variant="secondary" onClick={() => setDlg(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={doConfig}>{tx('انشر التحديث', 'Publish update')}</Button></>}>
          <ul className="divide-y divide-border rounded-xl border border-border">{pp.change.config.map((f) => <li key={f} className="flex items-center justify-between px-4 py-2.5 text-sm text-fg">{S.configFields[f]}<ChangeTag kind="config" /></li>)}</ul>
          <p className="text-[13px] text-muted">{tx('لا يمر بمراجعة Apple أو Google لأنه لا يغيّر ملف التطبيق. يمكن استعادة إعدادات سابقة من سجل الإصدارات.', 'No Apple or Google review: the app file does not change. Earlier settings can be restored from release history.')}</p>
          <Simulated />
        </Modal>
      )}
      {dlg === 'binary' && (
        <Modal size="lg" title={tx(`إرسال الإصدار ${pending.version}`, `Send version ${pending.version}`)} description={tx(`إلى ${stores(pp.platforms)}`, `To ${stores(pp.platforms)}`)} onClose={() => setDlg(null)}
          footer={<><Button variant="secondary" onClick={() => setDlg(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={doBinary}>{tx('أرسل لمراجعة «لك»', 'Send to LAK review')}</Button></>}>
          <dl className="divide-y divide-border rounded-xl border border-border text-sm">
            {[
              [tx('الإصدار', 'Version'), <bdi key="v" dir="ltr">{pending.version}</bdi>],
              [tx('رقم البناء', 'Build number'), <bdi key="b" dir="ltr">{PLATFORMS.filter((p) => pp.platforms.includes(p)).map((p) => `${S.storeName[p]} ${pending.platforms[p].build}`).join(' · ')}</bdi>],
              [tx('يتضمن', 'Includes'), tx('الهوية، الرئيسية، الميزات، بيانات المتجر واللقطات', 'Identity, home, features, store listing and screenshots')],
              [tx('العملاء', 'Customers'), live ? tx('يبقون على الإصدار الحالي حتى يقبل كل متجر الجديد', 'Stay on the current version until each store accepts the new one') : tx('لا يرون التطبيق حتى يقبله المتجر', 'See nothing until the store accepts it')],
            ].map(([k, v], i) => <div key={i} className="flex gap-3 px-4 py-2.5"><dt className="w-28 shrink-0 text-muted">{k}</dt><dd className="min-w-0 font-medium text-fg">{v}</dd></div>)}
          </dl>
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {STAGES.map((st, i) => <li key={st} className="flex items-center gap-1.5">{i > 0 && <Arrow className="size-3 text-subtle" aria-hidden="true" />}<span className="rounded-full bg-surface-2 px-2 py-0.5">{S.stageNames[st]}</span></li>)}
          </ol>
          <p className="text-[13px] text-muted">{S.lakWindow}</p>
          <Simulated />
        </Modal>
      )}
    </div>
  );
}
