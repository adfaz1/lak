import { useState } from 'react';
import { link } from '../../core/router';
import { Alert, Badge, Dialog, Field, PageHeader } from '../../core/ui';
import { can } from './perms';
import { settingsStore, testStore, themeStore } from './stores';
import { diffSections, moveSection, publishTheme, rollbackTheme, type Section, type SectionKind } from './workspace';
import { ActionLocked, Icon, Toggle, useTx } from './kit';

export function StorefrontPage() {
  const tx = useTx();
  const theme = themeStore.use();
  const settings = settingsStore.use();
  const role = testStore.use().role;
  const canPublish = can(role, 'theme.publish');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [review, setReview] = useState(false);
  const [note, setNote] = useState('');
  const [rollback, setRollback] = useState<number | null>(null);
  const [statusDlg, setStatusDlg] = useState<null | 'published' | 'accepting' | 'maintenance'>(null);
  const [published, setPublished] = useState<number | null>(null);
  const kind = (k: SectionKind) => ({ announcement: tx('شريط إعلان', 'Announcement bar'), hero: tx('بانر رئيسي', 'Hero banner'), featured: tx('منتجات مميزة', 'Featured products'), categories: tx('التصنيفات', 'Categories'), offers: tx('العروض', 'Offers'), video: tx('فيديو', 'Video'), newsletter: tx('النشرة البريدية', 'Newsletter') })[k];
  const changes = diffSections(theme.published.sections, theme.draft).filter((c) => c.kind !== 'unchanged');
  const setDraft = (draft: Section[]) => themeStore.set((t) => ({ ...t, draft }));
  const upd = (id: string, p: Partial<Section>) => setDraft(theme.draft.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const changeName = (k: string) => ({ moved: tx('نُقل', 'moved'), shown: tx('أُظهر', 'shown'), hidden: tx('أُخفي', 'hidden'), edited: tx('عُدّل', 'edited') } as Record<string, string>)[k];
  const st = settings.status;
  const setStatus = (p: Partial<typeof st>) => settingsStore.set((x) => ({ ...x, status: { ...x.status, ...p } }));
  const nextVersion = Math.max(...theme.history.map((h) => h.version)) + 1;

  return (
    <>
      <PageHeader title={tx('المتجر الإلكتروني', 'Online store')} sub={tx('الثيم: «هادئ» (ثيم تجريبي). التعديلات تُحفظ في المسودة ولا تظهر للعملاء حتى تنشر.', 'Theme: “Calm” (demo theme). Edits go to the draft and are invisible to shoppers until published.')}
        actions={<a className="btn" href={link('/store')}><Icon name="external" size={16} /> {tx('افتح المتجر المنشور', 'Open the live store')}</a>} />

      <section className="card pad" aria-labelledby="ss-h">
        <h2 id="ss-h">{tx('حالة المتجر', 'Store status')}</h2>
        <p className="small muted">{tx('ثلاثة قرارات منفصلة: الظهور، واستقبال الطلبات، ووضع الصيانة.', 'Three separate decisions: visibility, accepting orders, and maintenance mode.')}</p>
        <div className="m-status-grid">
          <div><Badge tone={st.published ? 'success' : 'neutral'}>{st.published ? tx('منشور', 'Published') : tx('غير منشور', 'Unpublished')}</Badge><button type="button" className="btn small" disabled={!canPublish} onClick={() => setStatusDlg('published')}>{st.published ? tx('أخفِ المتجر', 'Unpublish') : tx('انشر المتجر', 'Publish store')}</button></div>
          <div><Badge tone={st.accepting ? 'success' : 'warning'}>{st.accepting ? tx('يستقبل الطلبات', 'Accepting orders') : tx('الطلبات متوقفة', 'Orders paused')}</Badge><button type="button" className="btn small" disabled={!canPublish} onClick={() => setStatusDlg('accepting')}>{st.accepting ? tx('أوقف الطلبات', 'Pause orders') : tx('استقبل الطلبات', 'Accept orders')}</button></div>
          <div><Badge tone={st.maintenance ? 'warning' : 'neutral'}>{st.maintenance ? tx('وضع الصيانة', 'Maintenance on') : tx('بلا صيانة', 'No maintenance')}</Badge><button type="button" className="btn small" disabled={!canPublish} onClick={() => setStatusDlg('maintenance')}>{st.maintenance ? tx('أنهِ الصيانة', 'End maintenance') : tx('فعّل الصيانة', 'Start maintenance')}</button></div>
        </div>
        {!canPublish && <ActionLocked>{tx('تغيير الحالة والنشر يحتاج دور المالك.', 'Changing status and publishing need the Owner role.')}</ActionLocked>}
      </section>

      <div className="cols">
        <div className="col-main">
          <section className="card" aria-labelledby="th-h">
            <div className="card-head"><h2 id="th-h">{tx('أقسام الصفحة الرئيسية (مسودة)', 'Homepage sections (draft)')}</h2><span className="small">{tx(`المنشور: الإصدار ${theme.published.version}`, `Live: version ${theme.published.version}`)}</span></div>
            <ol className="m-sections">
              {theme.draft.map((s, i) => (
                <li key={s.id} className={s.visible ? '' : 'off'}>
                  <div className="m-sec-head">
                    <span className="strong grow">{i + 1}. {kind(s.kind)}</span>
                    {changes.find((c) => c.id === s.id) && <Badge tone="info">{changeName(changes.find((c) => c.id === s.id)!.kind)}</Badge>}
                    <button type="button" className="btn small" disabled={i === 0} onClick={() => setDraft(moveSection(theme.draft, s.id, -1))} aria-label={tx(`انقل ${kind(s.kind)} للأعلى`, `Move ${kind(s.kind)} up`)}><Icon name="up" size={16} /></button>
                    <button type="button" className="btn small" disabled={i === theme.draft.length - 1} onClick={() => setDraft(moveSection(theme.draft, s.id, 1))} aria-label={tx(`انقل ${kind(s.kind)} للأسفل`, `Move ${kind(s.kind)} down`)}><Icon name="down" size={16} /></button>
                  </div>
                  <div className="m-row-fields">
                    <Field id={`sec-${s.id}`} label={tx('العنوان', 'Heading')}><input id={`sec-${s.id}`} className="input" value={s.heading} onChange={(e) => upd(s.id, { heading: e.target.value })} /></Field>
                    <Toggle id={`vis-${s.id}`} checked={s.visible} onChange={(v) => upd(s.id, { visible: v })} label={tx('ظاهر', 'Visible')} />
                  </div>
                </li>
              ))}
            </ol>
            <div className="card-body">
              <p className="small">{changes.length ? tx(`${changes.length} تغييرات غير منشورة.`, `${changes.length} unpublished changes.`) : tx('المسودة مطابقة للمنشور.', 'The draft matches the live version.')}</p>
              <div className="actions">
                {canPublish ? <button type="button" className="btn primary" disabled={!changes.length} onClick={() => setReview(true)}>{tx('مراجعة ونشر', 'Review and publish')}</button> : <ActionLocked>{tx('يمكنك تعديل المسودة؛ النشر للمالك.', 'You can edit the draft; publishing is for the Owner.')}</ActionLocked>}
                <button type="button" className="btn" disabled={!changes.length} onClick={() => setDraft(theme.published.sections.map((s) => ({ ...s })))}>{tx('تجاهل تعديلات المسودة', 'Discard draft edits')}</button>
              </div>
              {published && <Alert tone="success">{tx(`نُشر الإصدار ${published} (محاكاة). يمكنك الرجوع لأي إصدار سابق.`, `Version ${published} published (simulated). You can roll back to any earlier version.`)}</Alert>}
            </div>
          </section>
          <section className="card pad" aria-labelledby="hist-h">
            <h2 id="hist-h">{tx('سجل الإصدارات', 'Version history')}</h2>
            <ul className="lines">
              {theme.history.map((h) => (
                <li key={h.version}><span className="grow">{tx(`الإصدار ${h.version}`, `Version ${h.version}`)} · <span className="muted">{h.note}</span></span>
                  {h.version === theme.published.version ? <Badge tone="success">{tx('منشور', 'Live')}</Badge> : canPublish && <button type="button" className="btn small" onClick={() => setRollback(h.version)}>{tx('ارجع لهذا', 'Roll back to this')}</button>}</li>
              ))}
            </ul>
          </section>
        </div>
        <aside className="col-side">
          <section className="card pad" aria-labelledby="pv-h">
            <h2 id="pv-h">{tx('معاينة المسودة', 'Draft preview')}</h2>
            <div className="views" role="group" aria-label={tx('الجهاز', 'Device')}>
              <button type="button" className="chip" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}>{tx('كمبيوتر', 'Desktop')}</button>
              <button type="button" className="chip" aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}>{tx('جوال', 'Mobile')}</button>
            </div>
            <div className={`m-preview-frame ${device}`} aria-label={tx('معاينة بألوان المتجر', 'Preview in the store’s colours')}>
              <div className="m-pv-top">Demo Store</div>
              {theme.draft.filter((s) => s.visible).map((s) => <div key={s.id} className={`m-pv m-pv-${s.kind}`}><span>{s.heading}</span></div>)}
            </div>
            <p className="small muted">{tx('المعاينة بألوان المتجر التجريبية، لا ألوان «لك».', 'Preview uses the demo store’s colours, not LAK’s.')}</p>
          </section>
        </aside>
      </div>

      {review && (
        <Dialog title={tx(`نشر الإصدار ${nextVersion}`, `Publish version ${nextVersion}`)} onClose={() => setReview(false)}
          footer={<><button type="button" className="btn primary" onClick={() => { themeStore.set((t) => publishTheme(t, note || 'Update')); setPublished(nextVersion); setReview(false); setNote(''); }}>{tx('انشر للعملاء', 'Publish to shoppers')}</button><button type="button" className="btn" onClick={() => setReview(false)}>{tx('إلغاء', 'Cancel')}</button></>}>
          <ul className="m-list">{changes.map((c) => { const s = theme.draft.find((x) => x.id === c.id)!; return <li key={c.id}>{kind(s.kind)}: {changeName(c.kind)}</li>; })}</ul>
          <Field id="pub-note" label={tx('ملاحظة الإصدار (اختياري)', 'Version note (optional)')}><input id="pub-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <p className="muted small">{tx(`سيرى العملاء التغيير فورًا. الإصدار ${theme.published.version} يبقى في السجل ويمكن الرجوع إليه.`, `Shoppers see the change immediately. Version ${theme.published.version} stays in history and can be restored.`)}</p>
        </Dialog>
      )}
      {rollback !== null && (
        <Dialog title={tx(`الرجوع إلى الإصدار ${rollback}`, `Roll back to version ${rollback}`)} onClose={() => setRollback(null)}
          footer={<><button type="button" className="btn primary" onClick={() => { themeStore.set((t) => rollbackTheme(t, rollback)); setPublished(nextVersion); setRollback(null); }}>{tx('ارجع وانشر', 'Roll back and publish')}</button><button type="button" className="btn" onClick={() => setRollback(null)}>{tx('إلغاء', 'Cancel')}</button></>}>
          <p>{tx(`يُنشر نسخة من الإصدار ${rollback} كإصدار جديد ${nextVersion}. تعديلات المسودة الحالية تُستبدل. السجل لا يُحذف.`, `A copy of version ${rollback} is published as new version ${nextVersion}. Current draft edits are replaced. History is not deleted.`)}</p>
        </Dialog>
      )}
      {statusDlg && (
        <Dialog title={tx('تأكيد تغيير حالة المتجر', 'Confirm store status change')} onClose={() => setStatusDlg(null)}
          footer={<><button type="button" className="btn primary" onClick={() => { if (statusDlg === 'published') setStatus({ published: !st.published }); if (statusDlg === 'accepting') setStatus({ accepting: !st.accepting }); if (statusDlg === 'maintenance') setStatus({ maintenance: !st.maintenance }); setStatusDlg(null); }}>{tx('تأكيد', 'Confirm')}</button><button type="button" className="btn" onClick={() => setStatusDlg(null)}>{tx('إلغاء', 'Cancel')}</button></>}>
          {statusDlg === 'published' && <p>{st.published ? tx('لن يجد العملاء المتجر، وتتوقف روابطه. الطلبات الحالية تبقى.', 'Shoppers will not find the store and its links stop working. Existing orders remain.') : tx('سيظهر المتجر للعملاء على عنوانه.', 'The store becomes visible to shoppers at its address.')}</p>}
          {statusDlg === 'accepting' && <p>{st.accepting ? tx('يبقى المتجر ظاهرًا لكن لا يمكن إتمام طلبات جديدة.', 'The store stays visible but new orders cannot be completed.') : tx('يمكن للعملاء إتمام الطلبات من جديد.', 'Shoppers can complete orders again.')}</p>}
          {statusDlg === 'maintenance' && (st.maintenance ? <p>{tx('يعود المتجر للعمل.', 'The store comes back.')}</p> : (
            <>
              <p>{tx('يرى العملاء رسالة الصيانة بدل المتجر.', 'Shoppers see the maintenance message instead of the store.')}</p>
              <Field id="mt-msg" label={tx('رسالة الصيانة', 'Maintenance message')}><input id="mt-msg" className="input" value={st.message} onChange={(e) => setStatus({ message: e.target.value })} /></Field>
            </>
          ))}
        </Dialog>
      )}
    </>
  );
}
