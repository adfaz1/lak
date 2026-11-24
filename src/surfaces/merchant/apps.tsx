import { useState } from 'react';
import type { Route } from '../../core/router';
import { Alert, Badge, Dialog, PageHeader, Sim, type Tone } from '../../core/ui';
import { PLANS } from './finance';
import { can } from './perms';
import { appsStore, settingsStore, testStore } from './stores';
import { PERSONAL_SCOPES, type App, type AppState, type Scope } from './workspace';
import { ActionLocked, mhref, useL, useTx } from './kit';

const S_TONE: Record<AppState, Tone> = { not_connected: 'neutral', connected: 'success', reauth: 'warning', error: 'danger' };

function useNames() {
  const tx = useTx();
  return {
    state: (s: AppState) => ({ not_connected: tx('غير مربوط', 'Not connected'), connected: tx('مربوط', 'Connected'), reauth: tx('يحتاج تجديد التفويض', 'Needs re-authorisation'), error: tx('تعذرت المزامنة', 'Sync failing') })[s],
    scope: (s: Scope) => ({ 'orders.read': tx('قراءة الطلبات', 'Read orders'), 'orders.write': tx('تعديل حالة الطلبات', 'Update order status'), 'customers.read': tx('قراءة بيانات العملاء (أسماء وتواصل)', 'Read customer data (names and contact)'), 'products.read': tx('قراءة المنتجات', 'Read products'), 'products.write': tx('تعديل المنتجات', 'Edit products'), 'inventory.read': tx('قراءة المخزون', 'Read inventory'), 'messages.send': tx('إرسال رسائل للعملاء باسم متجرك', 'Send messages to customers as your store') })[s],
  };
}

export function AppsPage({ route }: { route: Route }) {
  if (route.path[1]) return <AppDetail id={route.path[1]} />;
  return <Catalogue route={route} />;
}

function Catalogue({ route }: { route: Route }) {
  const tx = useTx();
  const l = useL();
  const n = useNames();
  const apps = appsStore.use();
  const fq = route.query.get('state') as AppState | null;
  const shown = apps.filter((a) => !fq || a.state === fq);
  return (
    <>
      <PageHeader title={tx('التطبيقات', 'Apps')} sub={tx('كتالوج تجريبي. كل الربط محاكاة ولا يتصل بأي خدمة خارجية.', 'A demo catalogue. Every connection is simulated and reaches no external service.')} />
      <div className="views" role="group" aria-label={tx('حالة الربط', 'Connection state')}>
        <a className="chip" href={mhref('apps')} aria-current={!fq ? 'true' : undefined}>{tx('الكل', 'All')} · {apps.length}</a>
        {(['connected', 'reauth', 'error', 'not_connected'] as AppState[]).map((s) => <a key={s} className="chip" href={mhref('apps', { state: s })} aria-current={fq === s ? 'true' : undefined}>{n.state(s)} · {apps.filter((a) => a.state === s).length}</a>)}
      </div>
      {shown.length === 0 ? <div className="card"><div className="empty"><span>{tx('لا تطبيقات بهذه الحالة.', 'No apps in this state.')}</span><a className="btn" href={mhref('apps')}>{tx('عرض الكل', 'Show all')}</a></div></div> : (
        <ul className="m-catgrid">
          {shown.map((a) => (
            <li key={a.id} className="card">
              <a className="m-cat" href={mhref(`apps/${a.id}`)}>
                <span className="m-thumb" aria-hidden="true">{l(a.name).slice(0, 1)}</span>
                <span className="grow"><span className="strong">{l(a.name)}</span><span className="small muted">{l(a.desc)}</span><span className="m-badges"><Badge tone={S_TONE[a.state]}>{n.state(a.state)}</Badge><Badge>{l(a.category)}</Badge></span></span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function AppDetail({ id }: { id: string }) {
  const tx = useTx();
  const l = useL();
  const n = useNames();
  const apps = appsStore.use();
  const plan = settingsStore.use().plan;
  const role = testStore.use().role;
  const a = apps.find((x) => x.id === id);
  const [dlg, setDlg] = useState<'connect' | 'disconnect' | 'reauth' | null>(null);
  const back = <a className="back" href={mhref('apps')}>{tx('العودة إلى التطبيقات', 'Back to apps')}</a>;
  if (!a) return <>{back}<Alert tone="danger">{tx('لا يوجد تطبيق بهذا المعرف.', 'No app with this id.')}</Alert></>;
  const inPlan = PLANS.indexOf(plan) >= PLANS.indexOf(a.minPlan);
  const set = (state: AppState) => { appsStore.set((as) => as.map((x) => (x.id === id ? { ...x, state, lastSync: state === 'connected' ? { ar: 'الآن', en: 'Just now' } : x.lastSync } : x))); setDlg(null); };
  const personal = a.scopes.filter((s) => PERSONAL_SCOPES.includes(s));
  const canManage = can(role, 'apps.manage');
  return (
    <>
      {back}
      <div className="title-row"><h1>{l(a.name)}</h1><Badge tone={S_TONE[a.state]}>{n.state(a.state)}</Badge><Sim /></div>
      <p>{l(a.desc)}</p>
      <div className="cols">
        <div className="col-main">
          <section className="card pad" aria-labelledby="ap-p">
            <h2 id="ap-p">{tx('الصلاحيات والبيانات التي يصل إليها', 'Permissions and data it can access')}</h2>
            <ul className="m-list">{a.scopes.map((s) => <li key={s}>{n.scope(s)} {PERSONAL_SCOPES.includes(s) && <Badge tone="warning">{tx('بيانات شخصية', 'Personal data')}</Badge>}</li>)}</ul>
            {personal.length > 0 && <p className="small muted">{tx('التطبيق يعالج بيانات عملائك وفق شروطه هو. راجعها قبل الربط.', 'The app processes your customers’ data under its own terms. Review them before connecting.')}</p>}
          </section>
          {a.state === 'error' && <Alert tone="danger" title={tx('تعذرت المزامنة منذ يومين.', 'Sync has failed for two days.')}>{tx('الملف المرسل من التطبيق رُفض: تنسيق غير صالح (محاكاة). لم تتغير أي بيانات في متجرك. المرجع: SYNC-4471', 'The app’s file was rejected: invalid format (simulated). No data in your store changed. Reference: SYNC-4471')}</Alert>}
          {a.state === 'reauth' && <Alert tone="warning">{tx('انتهى تفويض التطبيق. توقف إرسال الإشعارات حتى تجدده؛ لا شيء يُرسل الآن.', 'The app’s authorisation expired. Notifications stopped until you renew it; nothing is being sent now.')}</Alert>}
        </div>
        <aside className="col-side">
          <section className="card pad" aria-labelledby="ap-s">
            <h2 id="ap-s">{tx('الربط', 'Connection')}</h2>
            <p className="small">{tx('آخر مزامنة: ', 'Last sync: ')}{a.lastSync ? l(a.lastSync) : '—'}</p>
            {!inPlan ? <Alert tone="info">{tx(`يتطلب خطة ${a.minPlan} أو أعلى. هذا حد في الخطة وليس عطلًا أو نقص صلاحية.`, `Requires the ${a.minPlan} plan or higher. This is a plan limit, not a fault or missing permission.`)}</Alert>
              : !canManage ? <ActionLocked>{tx('ربط التطبيقات يحتاج دور المالك.', 'Connecting apps needs the Owner role.')}</ActionLocked>
                : (
                  <div className="actions">
                    {a.state === 'not_connected' && <button type="button" className="btn primary" onClick={() => setDlg('connect')}>{tx('اربط (محاكاة)', 'Connect (simulated)')}</button>}
                    {a.state === 'reauth' && <button type="button" className="btn primary" onClick={() => setDlg('reauth')}>{tx('جدّد التفويض', 'Renew authorisation')}</button>}
                    {a.state === 'error' && <button type="button" className="btn primary" onClick={() => set('connected')}>{tx('أعد المزامنة (محاكاة)', 'Retry sync (simulated)')}</button>}
                    {a.state !== 'not_connected' && <button type="button" className="btn" onClick={() => setDlg('disconnect')}>{tx('افصل', 'Disconnect')}</button>}
                  </div>
                )}
          </section>
        </aside>
      </div>
      {dlg && (
        <Dialog title={dlg === 'disconnect' ? tx(`فصل ${a.name.ar}`, `Disconnect ${a.name.en}`) : dlg === 'reauth' ? tx('تجديد التفويض', 'Renew authorisation') : tx(`ربط ${a.name.ar}`, `Connect ${a.name.en}`)} onClose={() => setDlg(null)}
          footer={<><button type="button" className="btn primary" onClick={() => set(dlg === 'disconnect' ? 'not_connected' : 'connected')}>{dlg === 'disconnect' ? tx('افصل', 'Disconnect') : tx('امنح الصلاحيات (محاكاة)', 'Grant access (simulated)')}</button><button type="button" className="btn" onClick={() => setDlg(null)}>{tx('إلغاء', 'Cancel')}</button></>}>
          {dlg === 'disconnect' ? (
            <ul className="m-list">
              <li>{tx('تتوقف المزامنة والإشعارات فورًا.', 'Sync and notifications stop immediately.')}</li>
              <li>{tx('البيانات التي أُرسلت للتطبيق تبقى لديه وفق شروطه؛ اطلب حذفها منه إن لزم.', 'Data already sent to the app stays with it under its terms; ask it to delete it if needed.')}</li>
              <li>{tx('بيانات متجرك لا تُحذف.', 'Your store data is not deleted.')}</li>
            </ul>
          ) : (
            <>
              <p>{tx('سيحصل التطبيق على:', 'The app will get:')}</p>
              <ul className="m-list">{a.scopes.map((s) => <li key={s}>{n.scope(s)}</li>)}</ul>
            </>
          )}
          <Sim />
        </Dialog>
      )}
    </>
  );
}
export type { App };
