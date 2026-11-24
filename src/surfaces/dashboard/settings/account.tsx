// My account (`#/dashboard/settings/account?tab=profile|alerts|security`): the signed-in member's profile,
// personal alerts per event and channel, signed-in devices with sign-out, and two-step verification setup.
// Open to every role. All simulated: no code is sent, no real session or authenticator exists.
import { useMemo, useState } from 'react';
import { CheckCircle2, Copy, Download, KeyRound, LogOut, Monitor, ShieldCheck, ShieldOff, Smartphone, UserRound } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { useRoute } from '../../../core/router';
import { currentActor, logAction, teamStore, testStore } from '../../merchant/stores';
import { Badge, Button, InfoHint, cn, useTx } from '../../../ds/ui';
import { Alert, Field, Input, Modal, SaveBar, Simulated, Switch, Tabs, useToast } from '../../../ds/kit';
import { useUnsaved } from '../unsaved';
import {
  ALERT_CHANNELS, accountFixture, alertsFor, backupCodes, checkCode, demoCode, initials, needsReverify, normPrefs, profileErrors, revokeOthers, revokeSession,
  setPref, setupSecret, weeklySms, type AccountRecord, type AlertChannel, type AlertPrefs, type Profile, type TwoFaMethod,
} from './account-model';
import { ROLE_LABEL } from './model';
import { Section, settingsHref } from './common';
import { accountsStore } from './stores';
import { useSessionDraft } from './drafts';

type Tab = 'profile' | 'alerts' | 'security';

function useAccount() {
  const actor = currentActor();
  const all = accountsStore.use();
  const rec = all[actor.id] ?? accountFixture(actor.id);
  const update = (fn: (r: AccountRecord) => AccountRecord) => accountsStore.set((a) => ({ ...a, [actor.id]: fn(a[actor.id] ?? accountFixture(actor.id)) }));
  return { actor, rec: { ...rec, prefs: normPrefs(rec.prefs) }, update };
}

export default function AccountPage() {
  const tx = useTx();
  const route = useRoute();
  testStore.use();
  teamStore.use();
  const q = route.query.get('tab');
  const tab: Tab = q === 'alerts' || q === 'security' ? q : 'profile';
  const { actor } = useAccount();
  return (
    <>
      <Tabs label={tx('حسابي', 'My account')} items={[
        { href: settingsHref('account'), label: tx('الملف الشخصي', 'Profile'), current: tab === 'profile' },
        { href: settingsHref('account', { tab: 'alerts' }), label: tx('تنبيهاتي', 'My alerts'), current: tab === 'alerts' },
        { href: settingsHref('account', { tab: 'security' }), label: tx('الأمان والأجهزة', 'Security & devices'), current: tab === 'security' },
      ]} />
      {actor.id.startsWith('role:') && <Alert tone="info">{tx('لا يوجد عضو نشط بهذا الدور في الفريق؛ تُعرض بيانات معاينة.', 'No active member has this role; showing preview data.')}</Alert>}
      {tab === 'profile' ? <ProfileTab key={actor.id} /> : tab === 'alerts' ? <AlertsTab key={actor.id} /> : <SecurityTab key={actor.id} />}
    </>
  );
}

function ProfileTab() {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const { actor, rec, update } = useAccount();
  const member = teamStore.get().members.find((m) => m.id === actor.id);
  const saved: Profile = { name: member?.name ?? actor.name, email: member?.email ?? '', phone: rec.phone, jobTitle: rec.jobTitle };
  const [p, setP, clear] = useSessionDraft<Profile>(`account:profile:${actor.id}`, saved);
  const [tried, setTried] = useState(false);
  const [verify, setVerify] = useState<('email' | 'phone')[] | null>(null);
  const [code, setCode] = useState('');
  const dirty = JSON.stringify(p) !== JSON.stringify(saved);
  useUnsaved(dirty, { ar: 'تعديلات الملف الشخصي', en: 'Profile edits' });
  const errs = profileErrors(p);
  const msg = (k: keyof Profile) => (!tried || !errs[k] ? null : errs[k] === 'required' ? tx('مطلوب', 'Required') : errs[k] === 'long' ? tx('40 حرفًا كحد أقصى', '40 characters maximum') : k === 'email' ? tx('بريد غير صالح', 'Invalid email') : tx('رقم جوال سعودي، مثل 05xxxxxxxx', 'A Saudi mobile, e.g. 05xxxxxxxx'));
  const commit = () => {
    teamStore.set((t) => ({ ...t, members: t.members.map((m) => (m.id === actor.id ? { ...m, name: p.name.trim(), email: p.email.trim() } : m)) }));
    update((r) => ({ ...r, phone: p.phone.trim(), jobTitle: p.jobTitle.trim() }));
    logAction('security', { ar: 'عدّل ملفه الشخصي', en: 'Edited their profile' }, { before: saved.name, after: p.name.trim() });
    clear(); setTried(false); setVerify(null); setCode('');
    toast({ tone: 'ok', text: tx('حُفظ ملفك', 'Profile saved') });
  };
  const onSave = () => {
    setTried(true);
    if (Object.keys(errs).length) return;
    const need = needsReverify(saved, p);
    if (need.length) setVerify(need); else commit();
  };
  return (
    <>
      <Section id="ac-p" title={tx('الملف الشخصي', 'Profile')} hint={<InfoHint>{tx('اسمك يظهر لفريقك وفي سجل النشاط.', 'Your name shows to your team and in the activity log.')}</InfoHint>}>
        <div className="mb-5 flex items-center gap-4">
          <span className="grid size-14 place-items-center rounded-full bg-brand-gradient text-lg font-bold text-white" aria-hidden="true">{initials(p.name)}</span>
          <div className="min-w-0"><p className="truncate font-semibold text-fg">{p.name || '—'}</p><p className="text-xs text-muted">{ROLE_LABEL[actor.role][lang]}</p></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tx('الاسم', 'Name')} error={msg('name')}>{(f) => <Input {...f} autoComplete="name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />}</Field>
          <Field label={tx('المسمى الوظيفي', 'Job title')} optional error={msg('jobTitle')}>{(f) => <Input {...f} value={p.jobTitle} onChange={(e) => setP({ ...p, jobTitle: e.target.value })} />}</Field>
          <Field label={tx('بريد الدخول', 'Sign-in email')} error={msg('email')} hint={tx('تغييره يتطلب تأكيدًا', 'Changing it needs confirming')}>{(f) => <Input {...f} type="email" dir="ltr" autoComplete="email" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} />}</Field>
          <Field label={tx('الجوال', 'Mobile')} optional error={msg('phone')}>{(f) => <Input {...f} type="tel" dir="ltr" autoComplete="tel" value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} />}</Field>
        </div>
      </Section>
      <SaveBar dirty={dirty} onSave={onSave} onDiscard={() => { clear(); setTried(false); }} error={tried && Object.keys(errs).length ? tx('صحّح الحقول المعلّمة', 'Fix the marked fields') : undefined} />
      {verify && (() => {
        const expected = demoCode(`${p.email}${p.phone}`);
        const err = code && checkCode(code, `${p.email}${p.phone}`);
        return (
          <Modal title={tx('أكّد بياناتك الجديدة', 'Confirm your new details')} onClose={() => setVerify(null)}
            description={verify.includes('email') ? tx(`أرسلنا رمزًا إلى ${p.email.trim()}. يبقى البريد القديم فعّالًا حتى تؤكد.`, `We sent a code to ${p.email.trim()}. Your old email keeps working until you confirm.`) : tx('أرسلنا رمزًا إلى جوالك الجديد.', 'We sent a code to your new mobile.')}
            footer={<><Button variant="secondary" onClick={() => setVerify(null)}>{tx('إلغاء', 'Cancel')}</Button><Button disabled={checkCode(code, `${p.email}${p.phone}`) !== null} onClick={commit}>{tx('أكّد واحفظ', 'Confirm and save')}</Button></>}>
            <Field label={tx('رمز التأكيد (6 أرقام)', 'Confirmation code (6 digits)')} error={err === 'wrong' ? tx('الرمز غير صحيح', 'Wrong code') : null}>{(f) => <Input {...f} inputMode="numeric" dir="ltr" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted"><Simulated />{tx(`لا يُرسل شيء فعليًا. الرمز التجريبي: ${expected}`, `Nothing is actually sent. Demo code: ${expected}`)}</p>
          </Modal>
        );
      })()}
    </>
  );
}

function AlertsTab() {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const { actor, rec, update } = useAccount();
  const [p, setP, clear] = useSessionDraft<AlertPrefs>(`account:alerts:${actor.id}`, rec.prefs);
  const prefs = normPrefs(p);
  const dirty = JSON.stringify(prefs) !== JSON.stringify(rec.prefs);
  useUnsaved(dirty, { ar: 'تعديلات التنبيهات', en: 'Alert edits' });
  const list = alertsFor(actor.role);
  const sms = weeklySms(prefs, actor.role);
  const ch = (c: AlertChannel) => ({ app: tx('داخل اللوحة', 'In dashboard'), email: tx('بريد', 'Email'), sms: tx('رسالة نصية', 'SMS') })[c];
  const GROUP = { orders: tx('الطلبات', 'Orders'), stock: tx('المخزون', 'Stock'), money: tx('الأموال', 'Money'), store: tx('المتجر', 'Store'), security: tx('الأمان', 'Security') };
  return (
    <Section id="ac-a" flush title={tx('تنبيهاتي', 'My alerts')} hint={<InfoHint>{tx('تنبيهاتك أنت فقط، حسب ما يسمح به دورك. تنبيهات بريد المتجر العام في «الإشعارات».', 'Your own alerts, limited to what your role can see. The store contact email’s alerts are under Notifications.')}</InfoHint>}
      action={<span className="text-xs text-muted tabular-nums">{tx(`≈ ${sms} رسالة نصية أسبوعيًا`, `≈ ${sms} SMS a week`)}</span>}>
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <caption className="sr-only">{tx('التنبيهات حسب الحدث والقناة', 'Alerts by event and channel')}</caption>
          <thead><tr className="border-y border-border text-xs text-muted"><th scope="col" className="px-5 py-2.5 text-start font-semibold">{tx('الحدث', 'Event')}</th>{ALERT_CHANNELS.map((c) => <th key={c} scope="col" className="w-24 px-2 py-2.5 font-semibold">{ch(c)}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">
            {list.map((a, i) => (
              <tr key={a.id}>
                <th scope="row" className="px-5 py-3 text-start font-medium text-fg">
                  {(i === 0 || list[i - 1].group !== a.group) && <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-subtle">{GROUP[a.group]}</span>}
                  {a.label[lang]}
                </th>
                {ALERT_CHANNELS.map((c) => {
                  const locked = a.locked?.includes(c);
                  return <td key={c} className="px-2 py-3"><span className="flex justify-center"><Switch checked={prefs[a.id][c]} disabled={locked} onChange={(v) => setP(setPref(prefs, a.id, c, v))} label={`${a.label[lang]} · ${ch(c)}${locked ? tx(' (إلزامي للأمان)', ' (required for security)') : ''}`} /></span></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap items-center gap-2 px-5 pt-3 text-xs text-muted"><Simulated />{tx('تنبيه الدخول من جهاز جديد يصل بالبريد دائمًا.', 'New-device sign-in alerts always go by email.')}</p>
      <SaveBar dirty={dirty} onDiscard={clear} onSave={() => { update((r) => ({ ...r, prefs })); clear(); logAction('security', { ar: 'عدّل تفضيلات تنبيهاته', en: 'Changed their alert preferences' }); toast({ tone: 'ok', text: tx('حُفظت تنبيهاتك', 'Alerts saved') }); }} />
    </Section>
  );
}

function SecurityTab() {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const { actor, rec, update } = useAccount();
  const [dlg, setDlg] = useState<{ k: 'revoke'; id: string } | { k: 'revokeAll' } | { k: 'setup' } | { k: 'disable' } | { k: 'codes' } | null>(null);
  const when = (iso: string) => {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 2) return tx('نشط الآن', 'Active now');
    if (mins < 60 * 24) return tx(`قبل ${Math.max(1, Math.round(mins / 60))} ساعة`, `${Math.max(1, Math.round(mins / 60))} h ago`);
    return tx(`قبل ${Math.round(mins / 1440)} يوم`, `${Math.round(mins / 1440)} days ago`);
  };
  const others = rec.sessions.filter((s) => !s.current).length;
  return (
    <>
      <Section id="ac-2fa" title={<><KeyRound className="size-4 text-muted" aria-hidden="true" />{tx('التحقق بخطوتين', 'Two-step verification')}</>}
        hint={<InfoHint>{tx('يطلب رمزًا من تطبيق المصادقة أو رسالة عند كل دخول من جهاز جديد.', 'Asks for a code from an authenticator app or SMS on every sign-in from a new device.')}</InfoHint>}
        action={<Simulated />}>
        {rec.twofa.enabled ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"><ShieldCheck className="size-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-fg">{tx('مفعّل', 'On')} · {rec.twofa.method === 'app' ? tx('تطبيق مصادقة', 'Authenticator app') : tx('رسالة نصية', 'SMS')}</p><p className="text-xs text-muted tabular-nums">{tx(`${rec.twofa.backupLeft} رموز احتياطية متبقية`, `${rec.twofa.backupLeft} backup codes left`)}</p></div>
            <Button variant="secondary" size="sm" onClick={() => setDlg({ k: 'codes' })}>{tx('رموز احتياطية جديدة', 'New backup codes')}</Button>
            <Button variant="ghost" size="sm" className="text-red-700 dark:text-red-400" onClick={() => setDlg({ k: 'disable' })}>{tx('أوقف', 'Turn off')}</Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300"><ShieldOff className="size-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-fg">{tx('غير مفعّل', 'Off')}</p><p className="text-xs text-muted">{tx('من يعرف كلمة مرورك يستطيع الدخول.', 'Anyone with your password can sign in.')}</p></div>
            <Button size="sm" onClick={() => setDlg({ k: 'setup' })}>{tx('فعّل التحقق بخطوتين', 'Turn on two-step')}</Button>
          </div>
        )}
      </Section>

      <Section id="ac-dev" flush title={<><Monitor className="size-4 text-muted" aria-hidden="true" />{tx('الأجهزة المسجّل دخولها', 'Signed-in devices')}</>}
        action={others > 0 ? <Button variant="secondary" size="sm" onClick={() => setDlg({ k: 'revokeAll' })}><LogOut className="size-4" aria-hidden="true" />{tx('اخرج من الأجهزة الأخرى', 'Sign out other devices')}</Button> : undefined}>
        <ul className="divide-y divide-border border-t border-border">
          {rec.sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="grid size-9 place-items-center rounded-xl bg-surface-2 text-muted">{/iPhone|آيفون/.test(s.device.en) ? <Smartphone className="size-4" aria-hidden="true" /> : <Monitor className="size-4" aria-hidden="true" />}</span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">{s.device[lang]} · {s.browser}{s.current && <Badge tone="green">{tx('هذا الجهاز', 'This device')}</Badge>}</p>
                <p className="text-xs text-muted">{s.city[lang]} · <bdi dir="ltr">{s.ip}</bdi> · {when(s.lastActive)}</p>
              </div>
              {!s.current && <Button variant="ghost" size="sm" onClick={() => setDlg({ k: 'revoke', id: s.id })}>{tx('أنهِ الجلسة', 'Sign out')}</Button>}
            </li>
          ))}
        </ul>
        <p className="flex items-center gap-2 px-5 pt-3 text-xs text-muted"><Simulated />{tx('قائمة الأجهزة الحقيقية تأتي من خادم «لك».', 'The real device list comes from the LAK server.')}</p>
      </Section>

      {dlg?.k === 'revoke' && (() => {
        const s = rec.sessions.find((x) => x.id === dlg.id)!;
        return <Modal title={tx('إنهاء الجلسة', 'Sign out this device')} onClose={() => setDlg(null)} description={tx(`يُطلب من «${s.device.ar}» تسجيل الدخول من جديد.`, `${s.device.en} will have to sign in again.`)}
          footer={<><Button variant="secondary" onClick={() => setDlg(null)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={() => { update((r) => ({ ...r, sessions: revokeSession(r.sessions, s.id) })); logAction('security', { ar: `أنهى جلسة ${s.device.ar}`, en: `Signed out ${s.device.en}` }); setDlg(null); toast({ tone: 'ok', text: tx('انتهت الجلسة (محاكاة)', 'Signed out (simulated)') }); }}>{tx('أنهِ الجلسة', 'Sign out')}</Button></>} />;
      })()}
      {dlg?.k === 'revokeAll' && <Modal title={tx('الخروج من كل الأجهزة الأخرى', 'Sign out all other devices')} onClose={() => setDlg(null)} description={tx(`تنتهي ${others} جلسات. تبقى مسجّلًا على هذا الجهاز.`, `${others} sessions end. You stay signed in here.`)}
        footer={<><Button variant="secondary" onClick={() => setDlg(null)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={() => { update((r) => ({ ...r, sessions: revokeOthers(r.sessions) })); logAction('security', { ar: `خرج من ${others} أجهزة أخرى`, en: `Signed out ${others} other devices` }); setDlg(null); toast({ tone: 'ok', text: tx('خرجت من الأجهزة الأخرى (محاكاة)', 'Signed out other devices (simulated)') }); }}>{tx('اخرج منها', 'Sign them out')}</Button></>} />}
      {dlg?.k === 'setup' && <TwoFaSetup seed={actor.id} onClose={() => setDlg(null)} onDone={(method) => { update((r) => ({ ...r, twofa: { enabled: true, method, enabledAt: new Date().toISOString(), backupLeft: 10 } })); logAction('security', { ar: 'فعّل التحقق بخطوتين', en: 'Turned on two-step verification' }); setDlg(null); toast({ tone: 'ok', text: tx('فُعّل التحقق بخطوتين', 'Two-step verification is on') }); }} />}
      {dlg?.k === 'disable' && <Modal title={tx('إيقاف التحقق بخطوتين؟', 'Turn off two-step verification?')} onClose={() => setDlg(null)} description={tx('يصبح حسابك محميًا بكلمة المرور فقط. يصلك بريد بهذا التغيير.', 'Your account will be protected by the password only. You’ll get an email about this change.')}
        footer={<><Button variant="secondary" onClick={() => setDlg(null)}>{tx('أبقِه مفعّلًا', 'Keep it on')}</Button><Button variant="danger" onClick={() => { update((r) => ({ ...r, twofa: { enabled: false, method: null, enabledAt: null, backupLeft: 0 } })); logAction('security', { ar: 'أوقف التحقق بخطوتين', en: 'Turned off two-step verification' }); setDlg(null); }}>{tx('أوقف', 'Turn off')}</Button></>} />}
      {dlg?.k === 'codes' && <CodesModal seed={`${actor.id}${Date.now() >> 16}`} onClose={() => setDlg(null)} onSaved={() => { update((r) => ({ ...r, twofa: { ...r.twofa, backupLeft: 10 } })); logAction('security', { ar: 'أنشأ رموزًا احتياطية جديدة', en: 'Generated new backup codes' }); setDlg(null); }} />}
    </>
  );
}

function CodesList({ codes }: { codes: string[] }) {
  const tx = useTx();
  const toast = useToast();
  const text = codes.join('\n');
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = 'lak-backup-codes.txt'; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-2">
      <ol dir="ltr" className="grid grid-cols-2 gap-1.5 rounded-xl bg-surface-2 p-3 font-mono text-sm text-fg">{codes.map((c) => <li key={c}>{c}</li>)}</ol>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => { navigator.clipboard?.writeText(text).then(() => toast({ tone: 'ok', text: tx('نُسخت الرموز', 'Codes copied') }), () => toast({ tone: 'bad', text: tx('تعذّر النسخ؛ انسخها يدويًا', 'Couldn’t copy; copy them by hand') })); }}><Copy className="size-4" aria-hidden="true" />{tx('انسخ', 'Copy')}</Button>
        <Button variant="secondary" size="sm" onClick={download}><Download className="size-4" aria-hidden="true" />{tx('نزّل', 'Download')}</Button>
      </div>
    </div>
  );
}

function CodesModal({ seed, onClose, onSaved }: { seed: string; onClose: () => void; onSaved: () => void }) {
  const tx = useTx();
  const codes = useMemo(() => backupCodes(setupSecret(seed)), [seed]);
  return (
    <Modal title={tx('رموز احتياطية جديدة', 'New backup codes')} onClose={onClose} description={tx('تبطل الرموز القديمة. كل رمز يُستخدم مرة واحدة.', 'Your old codes stop working. Each code works once.')}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={onSaved}>{tx('حفظتها', 'I’ve saved them')}</Button></>}>
      <CodesList codes={codes} />
    </Modal>
  );
}

/** Three steps: choose a method → scan/enter the secret and confirm a code → save backup codes. */
function TwoFaSetup({ seed, onClose, onDone }: { seed: string; onClose: () => void; onDone: (m: TwoFaMethod) => void }) {
  const tx = useTx();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [method, setMethod] = useState<TwoFaMethod>('app');
  const [code, setCode] = useState('');
  const [tried, setTried] = useState(false);
  const secret = useMemo(() => setupSecret(`${seed}-${method}`), [seed, method]);
  const err = checkCode(code, secret);
  const codes = useMemo(() => backupCodes(secret), [secret]);
  const footer = step === 1 ? <><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => setStep(2)}>{tx('التالي', 'Next')}</Button></>
    : step === 2 ? <><Button variant="secondary" onClick={() => setStep(1)}>{tx('رجوع', 'Back')}</Button><Button onClick={() => { setTried(true); if (!err) setStep(3); }}>{tx('تحقق', 'Verify')}</Button></>
      : <Button onClick={() => onDone(method)}><CheckCircle2 className="size-4" aria-hidden="true" />{tx('حفظت الرموز، فعّل', 'I saved them, turn on')}</Button>;
  return (
    <Modal title={tx(`التحقق بخطوتين · الخطوة ${step} من 3`, `Two-step verification · step ${step} of 3`)} onClose={onClose} footer={footer}>
      {step === 1 && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold text-fg">{tx('كيف تستلم الرمز؟', 'How will you get codes?')}</legend>
          {(['app', 'sms'] as const).map((m) => (
            <label key={m} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3', method === m ? 'border-brand-500 bg-brand-500/5' : 'border-border')}>
              <input type="radio" name="m" className="mt-1 accent-brand-600" checked={method === m} onChange={() => setMethod(m)} />
              <span><span className="block text-sm font-semibold text-fg">{m === 'app' ? tx('تطبيق مصادقة (موصى به)', 'Authenticator app (recommended)') : tx('رسالة نصية', 'Text message')}</span>
                <span className="block text-xs text-muted">{m === 'app' ? tx('Google Authenticator أو Microsoft Authenticator', 'Google Authenticator or Microsoft Authenticator') : tx('إلى جوالك المسجّل', 'To your registered mobile')}</span></span>
            </label>
          ))}
        </fieldset>
      )}
      {step === 2 && (
        <div className="space-y-4">
          {method === 'app' ? (
            <div className="flex flex-wrap items-center gap-4">
              <QrPlaceholder seed={secret} />
              <div className="min-w-0 flex-1 space-y-1"><p className="text-sm text-fg">{tx('امسح الرمز بتطبيق المصادقة، أو أدخل المفتاح:', 'Scan with your authenticator app, or enter the key:')}</p><p dir="ltr" className="font-mono text-sm font-semibold tracking-wider text-fg">{secret}</p></div>
            </div>
          ) : <p className="text-sm text-fg">{tx('أرسلنا رمزًا من 6 أرقام إلى جوالك.', 'We sent a 6-digit code to your mobile.')}</p>}
          <Field label={tx('الرمز من 6 أرقام', '6-digit code')} error={tried && err ? (err === 'format' ? tx('6 أرقام (تُقبل الأرقام العربية)', '6 digits (Arabic digits accepted)') : tx('الرمز غير صحيح؛ تأكد من وقت جهازك', 'Wrong code; check your device time')) : null}>
            {(f) => <Input {...f} inputMode="numeric" dir="ltr" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />}
          </Field>
          <p className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border p-3 text-xs text-muted"><Simulated /><UserRound className="size-3.5" aria-hidden="true" />{tx(`مصادِق تجريبي يعرض الآن: ${demoCode(secret)}`, `Demo authenticator shows: ${demoCode(secret)}`)}</p>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-3">
          <Alert tone="warn" title={tx('احفظ هذه الرموز الآن', 'Save these codes now')}>{tx('تستخدمها إن فقدت جوالك. لن تظهر مرة أخرى.', 'Use them if you lose your phone. They won’t be shown again.')}</Alert>
          <CodesList codes={codes} />
        </div>
      )}
    </Modal>
  );
}

/** A deterministic block pattern standing in for the QR code (simulated: not scannable). */
function QrPlaceholder({ seed }: { seed: string }) {
  const tx = useTx();
  const cells = useMemo(() => {
    let h = 0; const out: boolean[] = [];
    for (let i = 0; i < 121; i++) { h = (Math.imul(h ^ seed.charCodeAt(i % seed.length), 2654435761) + i) >>> 0; out.push(h % 3 === 0); }
    return out;
  }, [seed]);
  return (
    <div role="img" aria-label={tx('رمز QR تجريبي غير قابل للمسح', 'Demo QR code, not scannable')} className="grid size-28 shrink-0 grid-cols-11 gap-px rounded-lg border border-border bg-white p-1.5">
      {cells.map((on, i) => <span key={i} className={on ? 'bg-neutral-900' : 'bg-white'} />)}
    </div>
  );
}
