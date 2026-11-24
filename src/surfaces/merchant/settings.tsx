import { useState } from 'react';
import { useLang } from '../../core/lang';
import type { Route } from '../../core/router';
import { Alert, Badge, Dialog, Field, PageHeader, SaveBar, Sim, type Tone } from '../../core/ui';
import { parseMoney } from './catalog';
import { STAFF_LIMIT, entitled } from './finance';
import { MATRIX_ACTIONS, MATRIX_PAGES, ROLES, can, canSee, canSeeSettings, type Action, type Page, type Role, type SettingsCat } from './perms';
import { settingsStore, teamStore, testStore } from './stores';
import {
  NOTIFY_EVENTS, seatsUsed, validEmail, validHost, validSlug,
  type Notify, type NotifyEvent, type PolicyId, type ProviderState, type StoreDetails, type Zone,
} from './workspace';
import { ActionLocked, Icon, KV, Money, NoAccess, ROLE_NAMES, mhref, mreplace, useL, useTx, type IconName } from './kit';

type Cat = { id: SettingsCat; icon: IconName; ar: string; en: string; dAr: string; dEn: string; keys: string };
const CATS: Cat[] = [
  { id: 'store', icon: 'store', ar: 'بيانات المتجر', en: 'Store details', dAr: 'الاسم والفئة والتواصل', dEn: 'Name, category, contact', keys: 'name email phone category الاسم البريد الجوال' },
  { id: 'team', icon: 'team', ar: 'الفريق والصلاحيات', en: 'Team & permissions', dAr: 'الأعضاء والأدوار والدعوات والسجل', dEn: 'Members, roles, invites, log', keys: 'staff roles invite rbac موظف دور دعوة صلاحية' },
  { id: 'payments', icon: 'finance', ar: 'المدفوعات', en: 'Payments', dAr: 'المزودون وحالات التحقق والدفع عند الاستلام', dEn: 'Providers, verification states, COD', keys: 'mada visa apple pay stc tabby tamara cod مدى تابي تمارا استلام' },
  { id: 'shipping', icon: 'orders', ar: 'الشحن', en: 'Shipping', dAr: 'المناطق والأسعار والشحن المجاني', dEn: 'Zones, rates, free shipping', keys: 'zones rates free carrier مناطق أسعار مجاني ناقل' },
  { id: 'domains', icon: 'external', ar: 'النطاقات', en: 'Domains', dAr: 'المسار المجاني والنطاق الخاص وDNS', dEn: 'Free path, custom domain, DNS', keys: 'domain dns cname slug نطاق رابط' },
  { id: 'policies', icon: 'help', ar: 'السياسات', en: 'Policies', dAr: 'الاسترجاع والشحن والخصوصية والشروط', dEn: 'Returns, shipping, privacy, terms', keys: 'returns privacy terms استرجاع خصوصية شروط' },
  { id: 'notifications', icon: 'alert', ar: 'الإشعارات', en: 'Notifications', dAr: 'تنبيهات التاجر لكل حدث', dEn: 'Merchant alerts per event', keys: 'alerts email sms تنبيه إشعار' },
  { id: 'language', icon: 'settings', ar: 'اللغة والمنطقة', en: 'Language & region', dAr: 'لغة اللوحة ولغات المتجر والعملة والتوقيت', dEn: 'Admin language, store languages, currency, time zone', keys: 'language currency timezone لغة عملة توقيت' },
  { id: 'billing', icon: 'finance', ar: 'الخطة والفوترة', en: 'Plan & billing', dAr: 'المزايا وطريقة الدفع', dEn: 'Entitlements and payment method', keys: 'plan billing subscription خطة اشتراك فوترة' },
];

export function SettingsPage({ route }: { route: Route }) {
  const tx = useTx();
  const role = testStore.use().role;
  const cat = route.path[1] as SettingsCat | undefined;
  if (!cat) return <SettingsIndex route={route} />;
  const c = CATS.find((x) => x.id === cat);
  const back = <a className="back" href={mhref('settings')}>{tx('العودة إلى الإعدادات', 'Back to settings')}</a>;
  if (!c) return <>{back}<Alert tone="danger">{tx('لا يوجد قسم إعدادات بهذا الاسم.', 'No settings section with this name.')}</Alert></>;
  if (!canSeeSettings(role, c.id)) return <>{back}<NoAccess what={tx(c.ar, c.en)} /></>;
  if (c.id === 'billing') return <>{back}<section className="card pad"><p>{tx('الخطة والفوترة جزء من الأموال.', 'Plan and billing live in Finance.')}</p><a className="btn primary" href={mhref('finance', { tab: 'billing' })}>{tx('افتح الخطة والفوترة', 'Open plan & billing')}</a></section></>;
  return (
    <>
      {back}
      <PageHeader title={tx(c.ar, c.en)} sub={tx(c.dAr, c.dEn)} />
      {c.id === 'store' && <StoreForm />}
      {c.id === 'team' && <Team />}
      {c.id === 'payments' && <Payments />}
      {c.id === 'shipping' && <Shipping />}
      {c.id === 'domains' && <Domains />}
      {c.id === 'policies' && <Policies />}
      {c.id === 'notifications' && <Notifications />}
      {c.id === 'language' && <Language />}
    </>
  );
}

function SettingsIndex({ route }: { route: Route }) {
  const tx = useTx();
  const role = testStore.use().role;
  const q = (route.query.get('q') ?? '').trim().toLowerCase();
  const shown = CATS.filter((c) => !q || `${c.ar} ${c.en} ${c.dAr} ${c.dEn} ${c.keys}`.toLowerCase().includes(q));
  return (
    <>
      <PageHeader title={tx('الإعدادات', 'Settings')} sub={tx('ابحث عن إعداد أو اختر قسمًا.', 'Search for a setting or choose a section.')} />
      <input className="input search" type="search" aria-label={tx('ابحث في الإعدادات', 'Search settings')} placeholder={tx('مثال: مدى، نطاق، دعوة', 'e.g. Mada, domain, invite')} value={route.query.get('q') ?? ''} onChange={(e) => mreplace('settings', { q: e.target.value || undefined })} />
      {shown.length === 0 ? <div className="card"><div className="empty"><span>{tx('لا إعدادات تطابق البحث.', 'No settings match your search.')}</span><a className="btn" href={mhref('settings')}>{tx('مسح البحث', 'Clear search')}</a></div></div> : (
        <ul className="m-catgrid">
          {shown.map((c) => {
            const ok = canSeeSettings(role, c.id);
            return (
              <li key={c.id} className="card">
                <a className="m-cat" href={c.id === 'billing' && ok ? mhref('finance', { tab: 'billing' }) : mhref(`settings/${c.id}`)}>
                  <Icon name={c.icon} /><span className="grow"><span className="strong">{tx(c.ar, c.en)}</span><span className="small muted">{tx(c.dAr, c.dEn)}</span></span>
                  {!ok && <Badge><Icon name="lock" size={12} /> {tx('غير متاح لدورك', 'Not in your role')}</Badge>}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function StoreForm() {
  const tx = useTx();
  const s = settingsStore.use();
  const [d, setD] = useState<StoreDetails>(s.store);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(s.store);
  const errs = { name: !d.name.trim() ? tx('مطلوب.', 'Required.') : d.name.length > 60 ? tx('60 حرفًا كحد أقصى.', '60 characters maximum.') : '', email: validEmail(d.email) ? '' : tx('بريد غير صالح.', 'Invalid email.') };
  const [tried, setTried] = useState(false);
  const save = () => { setTried(true); if (errs.name || errs.email) return; settingsStore.set((x) => ({ ...x, store: d })); setSaved(true); setTried(false); };
  return (
    <section className="card pad">
      {saved && !dirty && <Alert tone="success">{tx('حُفظت بيانات المتجر.', 'Store details saved.')}</Alert>}
      <div className="grid-2">
        <Field id="st-name" label={tx('اسم المتجر', 'Store name')} error={tried ? errs.name || undefined : undefined} hint={`${d.name.length}/60`}><input id="st-name" className="input" value={d.name} aria-invalid={tried && !!errs.name} onChange={(e) => { setD({ ...d, name: e.target.value }); setSaved(false); }} /></Field>
        <Field id="st-cat" label={tx('فئة المتجر', 'Store category')}>
          <select id="st-cat" className="input" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })}>
            {[['fashion', 'أزياء', 'Fashion'], ['beauty', 'تجميل', 'Beauty'], ['home', 'منزل', 'Home'], ['food', 'أغذية', 'Food'], ['electronics', 'إلكترونيات', 'Electronics'], ['digital', 'منتجات رقمية', 'Digital'], ['charity', 'خيري', 'Charity']].map(([v, ar, en]) => <option key={v} value={v}>{tx(ar, en)}</option>)}
          </select>
        </Field>
        <Field id="st-email" label={tx('بريد التواصل', 'Contact email')} error={tried ? errs.email || undefined : undefined}><input id="st-email" className="input" dir="ltr" type="email" value={d.email} aria-invalid={tried && !!errs.email} onChange={(e) => { setD({ ...d, email: e.target.value }); setSaved(false); }} /></Field>
        <Field id="st-phone" label={tx('جوال التواصل', 'Contact mobile')}><input id="st-phone" className="input" dir="ltr" type="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} /></Field>
      </div>
      {dirty && <SaveBar message={tx('تغييرات غير محفوظة في بيانات المتجر', 'Unsaved changes to store details')} onSave={save} onDiscard={() => { setD(s.store); setTried(false); }} saveLabel={tx('احفظ', 'Save')} discardLabel={tx('تجاهل', 'Discard')} />}
    </section>
  );
}

function Team() {
  const tx = useTx();
  const l = useL();
  const t = teamStore.use();
  const s = settingsStore.use();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('fulfilment');
  const [err, setErr] = useState('');
  const [revoke, setRevoke] = useState<string | null>(null);
  const limit = STAFF_LIMIT[s.plan];
  const used = seatsUsed(t.members);
  const full = limit !== null && used >= limit;
  const log = (what: string) => teamStore.set((x) => ({ ...x, log: [{ who: 'You', what }, ...x.log] }));
  const invite = () => {
    if (!validEmail(email)) { setErr(tx('أدخل بريدًا صالحًا.', 'Enter a valid email.')); return; }
    if (t.members.some((m) => m.email.toLowerCase() === email.trim().toLowerCase() && m.status !== 'expired')) { setErr(tx('هذا البريد عضو أو مدعو بالفعل.', 'This email is already a member or invited.')); return; }
    if (full) return;
    teamStore.set((x) => ({ ...x, members: [...x.members, { id: `u${Date.now()}`, name: email.split('@')[0], email: email.trim(), role, status: 'invited' }] }));
    log(tx(`دُعي ${email} بدور ${ROLE_NAMES[role].ar}`, `Invited ${email} as ${ROLE_NAMES[role].en}`));
    setEmail('');
    setErr('');
  };
  const pageName: Record<Page, string> = { home: tx('الرئيسية', 'Home'), orders: tx('الطلبات', 'Orders'), products: tx('المنتجات', 'Products'), inventory: tx('المخزون', 'Inventory'), customers: tx('العملاء', 'Customers'), analytics: tx('التحليلات', 'Analytics'), finance: tx('الأموال', 'Finance'), marketing: tx('التسويق', 'Marketing'), automations: tx('الأتمتة', 'Automations'), storefront: tx('المتجر الإلكتروني', 'Online store'), apps: tx('التطبيقات', 'Apps'), settings: tx('الإعدادات', 'Settings'), help: tx('المساعدة', 'Help') };
  const actName: Partial<Record<Action, string>> = { 'order.fulfil': tx('تجهيز الطلبات', 'Fulfil orders'), 'order.refund': tx('الاسترداد', 'Refunds'), 'product.edit': tx('تعديل المنتجات', 'Edit products'), 'inventory.adjust': tx('تعديل المخزون', 'Adjust stock'), 'customer.message': tx('مراسلة العملاء', 'Message customers'), 'marketing.send': tx('إرسال الحملات', 'Send campaigns'), 'theme.publish': tx('نشر الثيم', 'Publish theme'), 'apps.manage': tx('ربط التطبيقات', 'Connect apps'), 'team.manage': tx('إدارة الفريق', 'Manage team'), 'billing.manage': tx('الفوترة', 'Billing') };
  const yes = <><Icon name="check" size={16} /><span className="sr">{tx('مسموح', 'Allowed')}</span></>;
  const no = <span className="muted" aria-label={tx('غير مسموح', 'Not allowed')}>—</span>;
  return (
    <>
      <section className="card" aria-labelledby="tm-h">
        <div className="card-head"><h2 id="tm-h">{tx('الأعضاء', 'Members')}</h2><span className="small">{tx(`المقاعد: ${used} من ${limit ?? 'غير محدود'} (خطة ${s.plan})`, `Seats: ${used} of ${limit ?? 'unlimited'} (${s.plan} plan)`)}</span></div>
        <ul className="queue">
          {t.members.map((m) => (
            <li key={m.id}>
              <div className="grow"><div className="strong">{m.name} {m.status !== 'active' && <Badge tone={m.status === 'invited' ? 'info' : 'neutral'}>{m.status === 'invited' ? tx('دعوة معلقة (تنتهي خلال 7 أيام)', 'Invite pending (expires in 7 days)') : tx('دعوة منتهية', 'Invite expired')}</Badge>}</div><div className="small muted"><bdi dir="ltr">{m.email}</bdi></div></div>
              {m.role === 'owner' ? <Badge tone="info">{l(ROLE_NAMES.owner)}</Badge> : (
                <>
                  <label className="sr" htmlFor={`tr-${m.id}`}>{tx(`دور ${m.name}`, `Role for ${m.name}`)}</label>
                  <select id={`tr-${m.id}`} className="input" value={m.role} onChange={(e) => { const r = e.target.value as Role; teamStore.set((x) => ({ ...x, members: x.members.map((y) => (y.id === m.id ? { ...y, role: r } : y)) })); log(tx(`تغيّر دور ${m.name} إلى ${ROLE_NAMES[r].ar}`, `${m.name}’s role changed to ${ROLE_NAMES[r].en}`)); }}>
                    {ROLES.filter((r) => r !== 'owner').map((r) => <option key={r} value={r}>{l(ROLE_NAMES[r])}</option>)}
                  </select>
                  <button type="button" className="btn small" onClick={() => setRevoke(m.id)}>{m.status === 'active' ? tx('إزالة', 'Remove') : tx('إلغاء الدعوة', 'Revoke invite')}</button>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="card-body">
          <h3>{tx('دعوة عضو', 'Invite a member')}</h3>
          {full ? <Alert tone="info">{tx(`بلغت حد المقاعد في خطتك (${limit}). هذا حد في الخطة وليس نقص صلاحية. يمكنك إلغاء دعوة أو معاينة خطة أعلى من الفوترة.`, `You have reached your plan’s seat limit (${limit}). This is a plan limit, not a permission issue. Revoke an invite or preview a higher plan in Billing.`)} <a href={mhref('finance', { tab: 'billing' })}>{tx('الفوترة', 'Billing')}</a></Alert> : (
            <div className="m-row-fields">
              <Field id="tm-email" label={tx('البريد', 'Email')} error={err || undefined}><input id="tm-email" className="input" dir="ltr" type="email" value={email} aria-invalid={!!err} onChange={(e) => { setEmail(e.target.value); setErr(''); }} /></Field>
              <Field id="tm-role" label={tx('الدور', 'Role')}><select id="tm-role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.filter((r) => r !== 'owner').map((r) => <option key={r} value={r}>{l(ROLE_NAMES[r])}</option>)}</select></Field>
              <button type="button" className="btn primary" onClick={invite}>{tx('أرسل الدعوة (محاكاة)', 'Send invite (simulated)')}</button>
            </div>
          )}
          {!entitled(s.plan, 'segments') && <p className="small muted">{tx('الأدوار المخصصة وسجل كل موظف مذكورة في المخطط لخطة Pro؛ الأدوار الأربعة الأساسية والعزل متاحة لكل خطة.', 'Custom roles and per-staff audit are listed for Pro in the blueprint; the four base roles and isolation apply to every plan.')}</p>}
        </div>
      </section>
      <section className="card" aria-labelledby="rm-h">
        <div className="card-head"><h2 id="rm-h">{tx('الأدوار والصلاحيات', 'Roles and permissions')}</h2></div>
        <div className="table-wrap">
          <table>
            <caption className="sr">{tx('مصفوفة الأدوار', 'Role matrix')}</caption>
            <thead><tr><th scope="col">{tx('الصلاحية', 'Permission')}</th>{ROLES.map((r) => <th key={r} scope="col" className="end">{l(ROLE_NAMES[r])}</th>)}</tr></thead>
            <tbody>
              {MATRIX_PAGES.map((p) => <tr key={p}><th scope="row">{tx('عرض: ', 'View: ')}{pageName[p]}</th>{ROLES.map((r) => <td key={r} className="end">{canSee(r, p) ? yes : no}</td>)}</tr>)}
              {MATRIX_ACTIONS.map((a) => <tr key={a}><th scope="row">{actName[a]}</th>{ROLES.map((r) => <td key={r} className="end">{can(r, a) ? yes : no}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
        <div className="card-body"><p className="small muted">{tx('جرّب الأدوار من لوحة الاختبار في الأعلى. في المنصة الحقيقية يُفرض المنع على الخادم لكل صفحة ورابط مباشر وتصدير.', 'Try the roles from the test panel above. On the real platform the server enforces this for every page, deep link and export.')}</p></div>
      </section>
      <section className="card pad" aria-labelledby="tl-h">
        <h2 id="tl-h">{tx('سجل نشاط الفريق', 'Team activity log')}</h2>
        <ol className="log">{t.log.map((e, i) => <li key={i}><span className="muted when">{e.who}</span><span className="grow">{e.what}</span></li>)}{t.log.length === 0 && <li className="muted">{tx('لا نشاط في هذه الجلسة.', 'No activity in this session.')}</li>}</ol>
      </section>
      {revoke && (() => {
        const m = t.members.find((x) => x.id === revoke)!;
        return (
          <Dialog title={m.status === 'active' ? tx(`إزالة ${m.name}`, `Remove ${m.name}`) : tx('إلغاء الدعوة', 'Revoke invite')} onClose={() => setRevoke(null)}
            footer={<><button type="button" className="btn primary" onClick={() => { teamStore.set((x) => ({ ...x, members: x.members.filter((y) => y.id !== revoke) })); log(tx(`أُزيل ${m.name}`, `Removed ${m.name}`)); setRevoke(null); }}>{tx('تأكيد', 'Confirm')}</button><button type="button" className="btn" onClick={() => setRevoke(null)}>{tx('إلغاء', 'Cancel')}</button></>}>
            <p>{tx('تنتهي جلساته فورًا ويفقد الوصول. ما سجّله من نشاط يبقى في السجل.', 'Their sessions end immediately and access is lost. Their recorded activity stays in the log.')}</p>
          </Dialog>
        );
      })()}
    </>
  );
}

const PV_TONE: Record<ProviderState, Tone> = { not_connected: 'neutral', pending: 'warning', active: 'success', action_required: 'danger' };
function Payments() {
  const tx = useTx();
  const l = useL();
  const s = settingsStore.use();
  const [dlg, setDlg] = useState<{ id: string; kind: 'connect' | 'disconnect' | 'document' } | null>(null);
  const [cod, setCod] = useState({ min: (s.cod.min / 100).toFixed(2), max: (s.cod.max / 100).toFixed(2) });
  const [codMsg, setCodMsg] = useState<'ok' | 'err' | null>(null);
  const state = (st: ProviderState) => ({ not_connected: tx('غير مربوط', 'Not connected'), pending: tx('بانتظار تحقق المزود', 'Pending provider verification'), active: tx('مفعّل', 'Active'), action_required: tx('يحتاج إجراءً منك', 'Action required') })[st];
  const setState = (id: string, st: ProviderState) => settingsStore.set((x) => ({ ...x, providers: x.providers.map((p) => (p.id === id ? { ...p, state: st } : p)) }));
  const p = dlg && s.providers.find((x) => x.id === dlg.id);
  return (
    <>
      <Alert tone="info">{tx('كل الربط هنا محاكاة. وجود اسم مزود لا يعني تعاقدًا أو تفعيلًا فعليًا؛ الأسعار والتغطية غير مثبتة.', 'All connections here are simulated. A provider name does not mean a contract or real activation; rates and coverage are not confirmed.')}</Alert>
      <section className="card" aria-labelledby="pv-h">
        <div className="card-head"><h2 id="pv-h">{tx('مزودو الدفع', 'Payment providers')}</h2></div>
        <ul className="queue">
          {s.providers.map((x) => {
            const inPlan = entitled(s.plan, x.minPlan === 'basic' ? 'cod' : 'epay');
            return (
              <li key={x.id}>
                <div className="grow"><div className="strong">{l(x.name)} <Badge tone={PV_TONE[x.state]}>{state(x.state)}</Badge></div><div className="small muted">{l(x.kind)}</div></div>
                {!inPlan ? <span className="small muted">{tx('غير مشمول في خطتك', 'Not in your plan')}</span>
                  : x.state === 'not_connected' ? <button type="button" className="btn small" onClick={() => setDlg({ id: x.id, kind: 'connect' })}>{tx('اربط', 'Connect')}</button>
                    : x.state === 'pending' ? <span className="m-simtools"><span className="small muted">{tx('اختبار:', 'Test:')}</span><button type="button" className="btn small" onClick={() => setState(x.id, 'active')}>{tx('حاكِ القبول', 'Simulate approval')}</button><button type="button" className="btn small" onClick={() => setState(x.id, 'action_required')}>{tx('حاكِ طلب مستند', 'Simulate document request')}</button></span>
                      : x.state === 'action_required' ? <button type="button" className="btn small" onClick={() => setDlg({ id: x.id, kind: 'document' })}>{tx('ارفع المستند المطلوب', 'Upload requested document')}</button>
                        : <button type="button" className="btn small" onClick={() => setDlg({ id: x.id, kind: 'disconnect' })}>{tx('افصل', 'Disconnect')}</button>}
              </li>
            );
          })}
        </ul>
      </section>
      <section className="card pad" aria-labelledby="cod-h">
        <h2 id="cod-h">{tx('حدود الدفع عند الاستلام', 'Cash on delivery limits')}</h2>
        <div className="m-row-fields">
          <Field id="cod-min" label={tx('أقل قيمة طلب (ر.س)', 'Minimum order (SAR)')}><input id="cod-min" className="input" dir="ltr" inputMode="decimal" value={cod.min} onChange={(e) => { setCod({ ...cod, min: e.target.value }); setCodMsg(null); }} /></Field>
          <Field id="cod-max" label={tx('أعلى قيمة طلب (ر.س)', 'Maximum order (SAR)')}><input id="cod-max" className="input" dir="ltr" inputMode="decimal" value={cod.max} onChange={(e) => { setCod({ ...cod, max: e.target.value }); setCodMsg(null); }} /></Field>
          <button type="button" className="btn primary" onClick={() => {
            const min = parseMoney(cod.min); const max = parseMoney(cod.max);
            if (min === null || max === null || max <= min) { setCodMsg('err'); return; }
            settingsStore.set((x) => ({ ...x, cod: { min, max } })); setCodMsg('ok');
          }}>{tx('احفظ الحدود', 'Save limits')}</button>
        </div>
        {codMsg === 'err' && <p className="error" role="alert">{tx('أدخل مبلغين صالحين، والأعلى أكبر من الأقل.', 'Enter two valid amounts, the maximum above the minimum.')}</p>}
        {codMsg === 'ok' && <p className="small" role="status">{tx('حُفظت الحدود: ', 'Limits saved: ')}<Money v={s.cod.min} /> – <Money v={s.cod.max} /></p>}
      </section>
      {dlg && p && (
        <Dialog title={dlg.kind === 'connect' ? tx(`ربط ${p.name.ar}`, `Connect ${p.name.en}`) : dlg.kind === 'document' ? tx('رفع المستند', 'Upload document') : tx(`فصل ${p.name.ar}`, `Disconnect ${p.name.en}`)} onClose={() => setDlg(null)}
          footer={<><button type="button" className="btn primary" onClick={() => { setState(p.id, dlg.kind === 'disconnect' ? 'not_connected' : 'pending'); setDlg(null); }}>
            {dlg.kind === 'connect' ? tx('أرسل طلب الربط (محاكاة)', 'Send connection request (simulated)') : dlg.kind === 'document' ? tx('أرسل المستند (محاكاة)', 'Send document (simulated)') : tx('افصل', 'Disconnect')}</button>
            <button type="button" className="btn" onClick={() => setDlg(null)}>{tx('إلغاء', 'Cancel')}</button></>}>
          {dlg.kind === 'connect' && <p>{tx('في المنصة الحقيقية تنتقل إلى المزود لإكمال بياناتك، ثم يراجعها. تبقى الطريقة «بانتظار التحقق» ولا تظهر للعملاء حتى يقبلها المزود.', 'On the real platform you continue at the provider to complete your details, then they review. The method stays “pending verification” and is hidden from shoppers until approved.')}</p>}
          {dlg.kind === 'document' && <p>{tx('طلب المزود صورة واضحة لشهادة الحساب البنكي (محاكاة). لا يُرفع ملف فعليًا هنا.', 'The provider asked for a clear bank account certificate (simulated). No file is actually uploaded here.')}</p>}
          {dlg.kind === 'disconnect' && <p>{tx('تختفي الطريقة من صفحة الدفع فورًا. الطلبات السابقة والاستردادات الجارية تبقى مرتبطة بالمزود حتى تكتمل.', 'The method disappears from checkout immediately. Past orders and refunds in progress stay with the provider until complete.')}</p>}
          <Sim />
        </Dialog>
      )}
    </>
  );
}

function Shipping() {
  const tx = useTx();
  const l = useL();
  const s = settingsStore.use();
  const [edit, setEdit] = useState<{ zone: Zone; rate: string; perKg: string; free: string; err: string } | null>(null);
  const [del, setDel] = useState<Zone | null>(null);
  const open = (z: Zone) => setEdit({ zone: z, rate: (z.rate / 100).toFixed(2), perKg: (z.perKg / 100).toFixed(2), free: z.freeOver === null ? '' : (z.freeOver / 100).toFixed(2), err: '' });
  const save = () => {
    if (!edit) return;
    const rate = parseMoney(edit.rate); const perKg = edit.zone.rateType === 'weight' ? parseMoney(edit.perKg) : 0; const free = edit.free.trim() ? parseMoney(edit.free) : null;
    if (rate === null || perKg === null || (edit.free.trim() && free === null) || !l(edit.zone.name).trim()) { setEdit({ ...edit, err: tx('تحقق من الاسم والمبالغ.', 'Check the name and amounts.') }); return; }
    const z: Zone = { ...edit.zone, rate, perKg, freeOver: free };
    settingsStore.set((x) => ({ ...x, zones: x.zones.some((y) => y.id === z.id) ? x.zones.map((y) => (y.id === z.id ? z : y)) : [...x.zones, z] }));
    setEdit(null);
  };
  return (
    <>
      <section className="card" aria-labelledby="zn-h">
        <div className="card-head"><h2 id="zn-h">{tx('مناطق الشحن', 'Shipping zones')}</h2><button type="button" className="btn small" onClick={() => open({ id: `z${Date.now()}`, name: { ar: '', en: '' }, cities: { ar: '', en: '' }, rateType: 'flat', rate: 2500, perKg: 0, freeOver: null })}>{tx('أضف منطقة', 'Add zone')}</button></div>
        <ul className="queue">
          {s.zones.map((z) => (
            <li key={z.id}>
              <div className="grow"><div className="strong">{l(z.name)}</div><div className="small muted">{l(z.cities)}</div>
                <div className="small">{z.rateType === 'flat' ? <>{tx('سعر ثابت', 'Flat rate')} <Money v={z.rate} /></> : <>{tx('حسب الوزن: ', 'By weight: ')}<Money v={z.rate} /> + <Money v={z.perKg} /> {tx('لكل كجم', 'per kg')}</>}{z.freeOver !== null && <> · {tx('مجاني فوق', 'Free over')} <Money v={z.freeOver} /></>}</div></div>
              <button type="button" className="btn small" onClick={() => open(z)}>{tx('تعديل', 'Edit')}</button>
              <button type="button" className="btn small" onClick={() => setDel(z)}>{tx('حذف', 'Delete')}</button>
            </li>
          ))}
          {s.zones.length === 0 && <li className="muted">{tx('لا مناطق: لن يستطيع العملاء إتمام طلبات تُشحن.', 'No zones: shoppers cannot complete shipped orders.')}</li>}
        </ul>
      </section>
      {edit && (
        <section className="card pad" aria-labelledby="ze-h">
          <h2 id="ze-h">{l(edit.zone.name) || tx('منطقة جديدة', 'New zone')}</h2>
          <div className="grid-2">
            <Field id="ze-n" label={tx('اسم المنطقة', 'Zone name')}><input id="ze-n" className="input" value={l(edit.zone.name)} onChange={(e) => setEdit({ ...edit, zone: { ...edit.zone, name: { ar: e.target.value, en: e.target.value } } })} /></Field>
            <Field id="ze-c" label={tx('المدن', 'Cities')}><input id="ze-c" className="input" value={l(edit.zone.cities)} onChange={(e) => setEdit({ ...edit, zone: { ...edit.zone, cities: { ar: e.target.value, en: e.target.value } } })} /></Field>
            <Field id="ze-t" label={tx('طريقة السعر', 'Rate type')}><select id="ze-t" className="input" value={edit.zone.rateType} onChange={(e) => setEdit({ ...edit, zone: { ...edit.zone, rateType: e.target.value as Zone['rateType'] } })}><option value="flat">{tx('ثابت', 'Flat')}</option><option value="weight">{tx('حسب الوزن', 'By weight')}</option></select></Field>
            <Field id="ze-r" label={tx('السعر الأساسي (ر.س)', 'Base rate (SAR)')}><input id="ze-r" className="input" dir="ltr" inputMode="decimal" value={edit.rate} onChange={(e) => setEdit({ ...edit, rate: e.target.value })} /></Field>
            {edit.zone.rateType === 'weight' && <Field id="ze-k" label={tx('لكل كجم إضافي (ر.س)', 'Per extra kg (SAR)')}><input id="ze-k" className="input" dir="ltr" inputMode="decimal" value={edit.perKg} onChange={(e) => setEdit({ ...edit, perKg: e.target.value })} /></Field>}
            <Field id="ze-f" label={tx('مجاني فوق (ر.س، اختياري)', 'Free over (SAR, optional)')}><input id="ze-f" className="input" dir="ltr" inputMode="decimal" value={edit.free} onChange={(e) => setEdit({ ...edit, free: e.target.value })} /></Field>
          </div>
          {edit.err && <p className="error" role="alert">{edit.err}</p>}
          <div className="actions"><button type="button" className="btn primary" onClick={save}>{tx('احفظ المنطقة', 'Save zone')}</button><button type="button" className="btn" onClick={() => setEdit(null)}>{tx('إلغاء', 'Cancel')}</button></div>
        </section>
      )}
      {del && (
        <Dialog title={tx(`حذف ${del.name.ar}`, `Delete ${del.name.en}`)} onClose={() => setDel(null)}
          footer={<><button type="button" className="btn primary" onClick={() => { settingsStore.set((x) => ({ ...x, zones: x.zones.filter((z) => z.id !== del.id) })); setDel(null); }}>{tx('احذف', 'Delete')}</button><button type="button" className="btn" onClick={() => setDel(null)}>{tx('إلغاء', 'Cancel')}</button></>}>
          <p>{tx('لن يستطيع العملاء في هذه المدن إتمام طلبات تُشحن حتى تضيف منطقة تغطيها. الطلبات الحالية لا تتأثر.', 'Shoppers in these cities cannot complete shipped orders until another zone covers them. Existing orders are unaffected.')}</p>
        </Dialog>
      )}
    </>
  );
}

function Domains() {
  const tx = useTx();
  const s = settingsStore.use();
  const d = s.domain;
  const [slug, setSlug] = useState(d.slug);
  const [host, setHost] = useState(d.host);
  const [err, setErr] = useState('');
  const [hostErr, setHostErr] = useState('');
  const [failNext, setFailNext] = useState(false);
  const set = (p: Partial<typeof d>) => settingsStore.set((x) => ({ ...x, domain: { ...x.domain, ...p } }));
  const dState = { none: '', pending: tx('بانتظار DNS', 'Waiting for DNS'), verified: tx('متحقق ومتصل', 'Verified and connected'), failed: tx('لم نجد السجلات', 'Records not found') };
  return (
    <>
      <section className="card pad" aria-labelledby="dm-1">
        <h2 id="dm-1">{tx('المسار المجاني', 'Free path')}</h2>
        <p className="small muted">{tx('المخطط يسمّيه «نطاقًا فرعيًا» لكنه مسار تحت نطاق المنصة. الصيغة النهائية تحتاج قرارًا.', 'The blueprint calls it a “subdomain” but it is a path under the platform domain. The final format needs a decision.')}</p>
        <div className="m-row-fields">
          <Field id="dm-slug" label={tx('المسار', 'Path')} hint={<bdi dir="ltr">platform.example/{slug || '…'}</bdi>} error={err || undefined}><input id="dm-slug" className="input" dir="ltr" value={slug} aria-invalid={!!err} onChange={(e) => { setSlug(e.target.value.toLowerCase()); setErr(''); }} /></Field>
          <button type="button" className="btn primary" disabled={slug === d.slug} onClick={() => { if (!validSlug(slug)) { setErr(tx('حروف لاتينية صغيرة وأرقام وشرطات، 3–40 حرفًا.', 'Lowercase letters, digits and hyphens, 3–40 characters.')); return; } set({ slug }); }}>{tx('احفظ المسار', 'Save path')}</button>
        </div>
        {slug !== d.slug && <p className="small m-warn">{tx('تغيير المسار يكسر الروابط القديمة التي شاركتها.', 'Changing the path breaks old links you have shared.')}</p>}
      </section>
      <section className="card pad" aria-labelledby="dm-2">
        <h2 id="dm-2">{tx('نطاق خاص', 'Custom domain')} {d.state !== 'none' && <Badge tone={d.state === 'verified' ? 'success' : d.state === 'failed' ? 'danger' : 'warning'}>{dState[d.state]}</Badge>}</h2>
        {d.state === 'none' ? (
          <div className="m-row-fields">
            <Field id="dm-host" label={tx('نطاقك', 'Your domain')} error={hostErr || undefined}><input id="dm-host" className="input" dir="ltr" placeholder="shop.example.com" value={host} aria-invalid={!!hostErr} onChange={(e) => { setHost(e.target.value); setHostErr(''); }} /></Field>
            <button type="button" className="btn primary" onClick={() => { if (!validHost(host)) { setHostErr(tx('أدخل نطاقًا صالحًا مثل shop.example.com.', 'Enter a valid domain such as shop.example.com.')); return; } set({ host: host.trim().toLowerCase(), state: 'pending' }); }}>{tx('أضف النطاق', 'Add domain')}</button>
          </div>
        ) : (
          <>
            <ol className="m-list">
              <li>{tx('افتح لوحة مزود نطاقك.', 'Open your domain provider’s DNS settings.')}</li>
              <li>{tx('أضف السجلين التاليين كما هما:', 'Add these two records exactly:')}
                <div className="table-wrap"><table className="m-compact"><caption className="sr">DNS</caption><thead><tr><th scope="col">{tx('النوع', 'Type')}</th><th scope="col">{tx('الاسم', 'Name')}</th><th scope="col">{tx('القيمة', 'Value')}</th></tr></thead>
                  <tbody><tr><td>CNAME</td><td><bdi dir="ltr">{d.host}</bdi></td><td><bdi dir="ltr">stores.platform.example</bdi></td></tr><tr><td>TXT</td><td><bdi dir="ltr">_verify.{d.host}</bdi></td><td><bdi dir="ltr">lak-verify=demo-7f3a</bdi></td></tr></tbody></table></div></li>
              <li>{tx('قد يستغرق انتشار السجلات حتى 48 ساعة. اضغط «افحص» بعد الإضافة.', 'Records can take up to 48 hours to propagate. Press “Check” after adding.')}</li>
            </ol>
            {d.state === 'failed' && <Alert tone="danger">{tx('لم نجد سجل TXT (محاكاة). تأكد من الاسم والقيمة ثم أعد الفحص.', 'TXT record not found (simulated). Check the name and value, then check again.')}</Alert>}
            {d.state === 'verified' && <Alert tone="success">{tx('النطاق متصل (محاكاة). المسار المجاني يبقى يعمل ويحوّل إليه.', 'Domain connected (simulated). The free path keeps working and redirects to it.')}</Alert>}
            <div className="actions">
              {d.state !== 'verified' && <button type="button" className="btn primary" onClick={() => set({ state: failNext ? 'failed' : 'verified', checks: d.checks + 1 })}>{tx('افحص DNS (محاكاة)', 'Check DNS (simulated)')}</button>}
              <button type="button" className="btn" onClick={() => { set({ host: '', state: 'none' }); setHost(''); }}>{tx('أزل النطاق', 'Remove domain')}</button>
            </div>
            {d.state !== 'verified' && <label className="check"><input type="checkbox" checked={failNext} onChange={(e) => setFailNext(e.target.checked)} /> {tx('أداة اختبار: حاكِ عدم وجود السجلات', 'Test tool: simulate records not found')}</label>}
          </>
        )}
        <p className="small muted">{tx('شراء النطاق ونقله وإدارة DNS من اللوحة مذكورة في المخطط لخطة Plus وغير مبنية هنا.', 'Buying, transferring and managing DNS in the dashboard are listed for Plus in the blueprint and are not built here.')}</p>
      </section>
    </>
  );
}

function Policies() {
  const tx = useTx();
  const s = settingsStore.use();
  const [texts, setTexts] = useState<Record<PolicyId, string>>(() => Object.fromEntries(s.policies.map((p) => [p.id, p.text])) as Record<PolicyId, string>);
  const [pub, setPub] = useState<PolicyId | null>(null);
  const name: Record<PolicyId, string> = { returns: tx('سياسة الاسترجاع', 'Return policy'), shipping: tx('سياسة الشحن', 'Shipping policy'), privacy: tx('سياسة الخصوصية', 'Privacy policy'), terms: tx('الشروط والأحكام', 'Terms and conditions') };
  const st = { missing: tx('غير موجودة', 'Missing'), draft: tx('مسودة', 'Draft'), published: tx('منشورة', 'Published') };
  const save = (id: PolicyId, state: 'draft' | 'published') => settingsStore.set((x) => ({ ...x, policies: x.policies.map((p) => (p.id === id ? { ...p, text: texts[id], state } : p)) }));
  return (
    <>
      <Alert tone="info">{tx('النصوص من كتابتك. «لك» لا تقدّم استشارة قانونية ولا تضمن الامتثال.', 'The text is yours. LAK does not give legal advice or guarantee compliance.')}</Alert>
      {s.policies.map((p) => (
        <section key={p.id} className="card pad" aria-labelledby={`po-${p.id}`}>
          <h2 id={`po-${p.id}`}>{name[p.id]} <Badge tone={p.state === 'published' ? 'success' : p.state === 'draft' ? 'neutral' : 'warning'}>{st[p.state]}</Badge></h2>
          <Field id={`pt-${p.id}`} label={tx('النص', 'Text')}><textarea id={`pt-${p.id}`} className="input" value={texts[p.id]} onChange={(e) => setTexts({ ...texts, [p.id]: e.target.value })} /></Field>
          <div className="actions">
            <button type="button" className="btn" disabled={texts[p.id] === p.text && p.state !== 'missing'} onClick={() => save(p.id, 'draft')}>{tx('احفظ مسودة', 'Save draft')}</button>
            <button type="button" className="btn primary" disabled={texts[p.id].trim().length < 20} onClick={() => setPub(p.id)}>{tx('انشر', 'Publish')}</button>
          </div>
          {texts[p.id].trim().length < 20 && <p className="small muted">{tx('اكتب 20 حرفًا على الأقل للنشر.', 'Write at least 20 characters to publish.')}</p>}
        </section>
      ))}
      {pub && (
        <Dialog title={tx(`نشر ${name[pub]}`, `Publish ${name[pub]}`)} onClose={() => setPub(null)}
          footer={<><button type="button" className="btn primary" onClick={() => { save(pub, 'published'); setPub(null); }}>{tx('انشر في المتجر', 'Publish to the store')}</button><button type="button" className="btn" onClick={() => setPub(null)}>{tx('إلغاء', 'Cancel')}</button></>}>
          <p>{tx('ستظهر في تذييل المتجر وصفحة الدفع فورًا، وتنطبق على الطلبات الجديدة.', 'It appears in the store footer and checkout immediately and applies to new orders.')}</p>
        </Dialog>
      )}
    </>
  );
}

function Notifications() {
  const tx = useTx();
  const s = settingsStore.use();
  const [n, setN] = useState<Notify>(s.notify);
  const dirty = JSON.stringify(n) !== JSON.stringify(s.notify);
  const name: Record<NotifyEvent, string> = { newOrder: tx('طلب جديد', 'New order'), paymentFailed: tx('تعثر دفع', 'Payment failed'), lowStock: tx('مخزون منخفض', 'Low stock'), payout: tx('تحويل بنكي', 'Payout sent'), review: tx('تقييم جديد', 'New review') };
  return (
    <section className="card">
      <div className="table-wrap">
        <table className="m-compact">
          <caption className="sr">{tx('إشعارات التاجر', 'Merchant notifications')}</caption>
          <thead><tr><th scope="col">{tx('الحدث', 'Event')}</th><th scope="col">{tx('بريد', 'Email')}</th><th scope="col">SMS</th></tr></thead>
          <tbody>{NOTIFY_EVENTS.map((e) => (
            <tr key={e}><th scope="row">{name[e]}</th>
              {(['email', 'sms'] as const).map((c) => <td key={c}><label className="check"><input type="checkbox" checked={n[e][c]} onChange={(ev) => setN({ ...n, [e]: { ...n[e], [c]: ev.target.checked } })} /><span className="sr">{name[e]} {c}</span></label></td>)}</tr>
          ))}</tbody>
        </table>
      </div>
      <div className="card-body"><p className="small muted">{tx('هذه تنبيهات لك ولفريقك، وليست رسائل للعملاء.', 'These alert you and your team; they are not customer messages.')}</p></div>
      {dirty && <SaveBar message={tx('تغييرات غير محفوظة في الإشعارات', 'Unsaved notification changes')} onSave={() => settingsStore.set((x) => ({ ...x, notify: n }))} onDiscard={() => setN(s.notify)} saveLabel={tx('احفظ', 'Save')} discardLabel={tx('تجاهل', 'Discard')} />}
    </section>
  );
}

function Language() {
  const tx = useTx();
  const { lang, setLang } = useLang();
  const s = settingsStore.use();
  const [langs, setLangs] = useState(s.storeLangs);
  const [store, setStore] = useState(s.store);
  const [msg, setMsg] = useState('');
  const save = () => {
    if (!langs.ar && !langs.en) { setMsg(tx('اختر لغة واحدة على الأقل للمتجر.', 'Choose at least one store language.')); return; }
    settingsStore.set((x) => ({ ...x, storeLangs: langs, store: { ...x.store, timezone: store.timezone, weightUnit: store.weightUnit } }));
    setMsg(tx('حُفظ.', 'Saved.'));
  };
  return (
    <>
      <section className="card pad" aria-labelledby="lg-1">
        <h2 id="lg-1">{tx('لغة لوحة التحكم (لك وحدك)', 'Admin language (just for you)')}</h2>
        <fieldset className="m-inline-radios"><legend className="sr">{tx('لغة اللوحة', 'Admin language')}</legend>
          <label className="radio"><input type="radio" checked={lang === 'ar'} onChange={() => setLang('ar')} /> العربية</label>
          <label className="radio"><input type="radio" checked={lang === 'en'} onChange={() => setLang('en')} /> English</label>
        </fieldset>
        <p className="small muted">{tx('يتغير فورًا. لغة اللوحة مستقلة عن لغات المتجر والعملة والمنطقة الزمنية.', 'Changes immediately. Admin language is separate from store languages, currency and time zone.')}</p>
      </section>
      {canSeeSettings(testStore.get().role, 'store') ? (
        <section className="card pad" aria-labelledby="lg-2">
          <h2 id="lg-2">{tx('المتجر والمنطقة', 'Store and region')}</h2>
          <fieldset><legend>{tx('لغات المتجر', 'Store languages')}</legend>
            <label className="check"><input type="checkbox" checked={langs.ar} onChange={(e) => { setLangs({ ...langs, ar: e.target.checked }); setMsg(''); }} /> العربية</label>
            <label className="check"><input type="checkbox" checked={langs.en} onChange={(e) => { setLangs({ ...langs, en: e.target.checked }); setMsg(''); }} /> English</label>
          </fieldset>
          <KV rows={[[tx('العملة الأساسية', 'Primary currency'), tx('ريال سعودي (SAR)', 'Saudi riyal (SAR)')]]} />
          <div className="m-row-fields">
            <Field id="lg-tz" label={tx('المنطقة الزمنية للتقارير', 'Reporting time zone')}><select id="lg-tz" className="input" value={store.timezone} onChange={(e) => setStore({ ...store, timezone: e.target.value })}><option value="Asia/Riyadh">Asia/Riyadh (UTC+3)</option><option value="Asia/Dubai">Asia/Dubai (UTC+4)</option></select></Field>
            <Field id="lg-w" label={tx('وحدة الوزن', 'Weight unit')}><select id="lg-w" className="input" value={store.weightUnit} onChange={(e) => setStore({ ...store, weightUnit: e.target.value as 'g' | 'kg' })}><option value="kg">{tx('كيلوغرام', 'Kilogram')}</option><option value="g">{tx('غرام', 'Gram')}</option></select></Field>
          </div>
          <div className="actions"><button type="button" className="btn primary" onClick={save}>{tx('احفظ', 'Save')}</button>{msg && <span role="status" className="small">{msg}</span>}</div>
          <p className="small muted">{tx('العملات المتعددة تُجمع كل عملة على حدة ولا تُوحّد دون سعر صرف ومصدر وتاريخ.', 'With multiple currencies each is totalled separately, never combined without a rate, source and date.')}</p>
        </section>
      ) : <ActionLocked>{tx('إعدادات المتجر الإقليمية تحتاج صلاحية الإعدادات.', 'Store regional settings need settings permission.')}</ActionLocked>}
    </>
  );
}
