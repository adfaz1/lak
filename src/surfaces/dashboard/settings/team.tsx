// Team & permissions: members, roles, invites with expiry, seat limits, read-only matrix, activity log, role preview.
import { useMemo, useState } from 'react';
import { Check, Minus, UserPlus, Users, History, Mail } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { settingsStore, teamStore, testStore } from '../../merchant/stores';
import { ROLES, type Role } from '../../merchant/perms';
import type { Member } from '../../merchant/workspace';
import { Avatar, Badge, Button, InfoHint, cn, useTx } from '../../../ds/ui';
import { Alert, DataTable, Field, Input, Modal, Select, Simulated, useToast, type Column } from '../../../ds/kit';
import { useDashState } from '../review';
import { sectionHref } from '../pages';
import {
  INVITE_DAYS, PERM_LABEL, ROLE_LABEL, changeRole, decodeLog, encodeLog, invite, inviteError, inviteStatus, matrix, planForSeats, removeMember,
  resend, roleDiff, seats, withExpiry, type LogEvent,
} from './model';
import { inviteDatesStore } from './stores';
import { Section } from './common';

const PLAN_LABEL = { basic: 'Basic', plus: 'Plus', pro: 'Pro', special: 'Special' } as const;

export default function TeamPage() {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const empty = useDashState() === 'empty';
  const team = teamStore.use();
  const dates = inviteDatesStore.use();
  const plan = settingsStore.use().plan;
  const role = testStore.use().role;
  const now = useMemo(() => new Date(), []);
  const all = withExpiry(team.members, dates, now);
  const members = empty ? all.filter((m) => m.role === 'owner') : all;
  const seat = seats(members, plan);
  const upgrade = planForSeats(members, plan);
  const [inviting, setInviting] = useState(false);
  const [roleChange, setRoleChange] = useState<{ m: Member; to: Role } | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);

  const log = (e: LogEvent) => teamStore.set((x) => ({ ...x, log: [{ who: tx('أنت', 'You'), what: encodeLog(e) }, ...x.log] }));
  const at = () => new Date().toISOString();
  const status = (m: Member) => {
    if (m.status === 'active') return <Badge tone="green">{tx('نشط', 'Active')}</Badge>;
    if (m.status === 'expired') return <Badge tone="gray">{tx('انتهت الدعوة', 'Invite expired')}</Badge>;
    const s = dates[m.id] ? inviteStatus(dates[m.id], now) : null;
    return <Badge tone="amber">{s ? tx(`دعوة معلّقة · تنتهي خلال ${s.daysLeft} ي`, `Invite pending · ${s.daysLeft}d left`) : tx('دعوة معلّقة', 'Invite pending')}</Badge>;
  };
  const doResend = (m: Member) => {
    teamStore.set((x) => ({ ...x, members: resend(x.members, m.id) }));
    inviteDatesStore.set((d) => ({ ...d, [m.id]: at() }));
    log({ k: 'resend', email: m.email, at: at() });
    toast({ tone: 'ok', text: tx(`أُعيد إرسال الدعوة إلى ${m.email} (محاكاة). صالحة ${INVITE_DAYS} أيام.`, `Invite re-sent to ${m.email} (simulated). Valid for ${INVITE_DAYS} days.`) });
  };

  const cols: Column<Member>[] = [
    { key: 'who', header: tx('العضو', 'Member'), cell: (m) => (
      <span className="flex items-center gap-3"><Avatar name={m.name.replace(/[^\p{L}\s]/gu, '').trim()} /><span className="min-w-0"><span className="block truncate font-semibold text-fg">{m.name}</span><bdi dir="ltr" className="block truncate text-xs text-muted">{m.email}</bdi></span></span>
    ) },
    { key: 'role', header: tx('الدور', 'Role'), cell: (m) => <RoleCell m={m} onChange={(to) => setRoleChange({ m, to })} /> },
    { key: 'status', header: tx('الحالة', 'Status'), cell: status, hideBelow: 'lg' },
    { key: 'act', header: <span className="sr-only">{tx('إجراءات', 'Actions')}</span>, align: 'end', cell: (m) => <Actions m={m} onResend={() => doResend(m)} onRemove={() => setRemoving(m)} /> },
  ];

  return (
    <>
      <Section id="tm-h" flush title={tx('الأعضاء', 'Members')}
        hint={<InfoHint>{tx('الأعضاء النشطون والدعوات المعلّقة يشغلون مقاعد؛ الدعوات المنتهية لا تشغلها.', 'Active members and pending invites use seats; expired invites do not.')}</InfoHint>}
        action={<Button size="sm" onClick={() => setInviting(true)}><UserPlus className="size-4" aria-hidden="true" />{tx('ادعُ عضوًا', 'Invite member')}</Button>}>
        <p className="-mt-1 px-5 pb-3 text-xs text-muted tabular-nums">{seat.limit === null ? tx(`${seat.used} مقاعد · غير محدود في ${PLAN_LABEL[plan]}`, `${seat.used} seats · unlimited on ${PLAN_LABEL[plan]}`) : tx(`${seat.used} من ${seat.limit} مقاعد · ${PLAN_LABEL[plan]}`, `${seat.used} of ${seat.limit} seats · ${PLAN_LABEL[plan]}`)}</p>
        {seat.full && (
          <div className="px-5 pb-3"><Alert tone="warn" title={tx('اكتملت مقاعد خطتك', 'Your plan’s seats are full')}
            action={<a href={sectionHref('finance', '', { tab: 'billing' })} className="shrink-0 text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('الخطة والفوترة', 'Plan & billing')}</a>}>
            {upgrade ? tx(`ألغِ دعوة أو انتقل إلى ${PLAN_LABEL[upgrade]} لإضافة عضو. هذا حدّ في الخطة وليس نقص صلاحية.`, `Revoke an invite or move to ${PLAN_LABEL[upgrade]} to add someone. This is a plan limit, not a permission issue.`) : tx('ألغِ دعوة لإضافة عضو.', 'Revoke an invite to add someone.')}
          </Alert></div>
        )}
        {members.length <= 1 && (
          <div className="flex flex-col items-center px-6 pt-4 pb-2 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-brand-500/10 text-brand-600 dark:text-brand-300"><Users className="size-6" aria-hidden="true" /></span>
            <h3 className="mt-3 text-[15px] font-semibold text-fg">{tx('أنت وحدك في المتجر الآن', 'It’s just you for now')}</h3>
            <p className="mt-1 max-w-sm text-sm text-muted">{tx('ادعُ موظفًا وحدّد دوره؛ يرى فقط ما يسمح به دوره.', 'Invite someone and choose a role; they see only what that role allows.')}</p>
          </div>
        )}
        <DataTable label={tx('أعضاء الفريق', 'Team members')} rows={members} rowKey={(m) => m.id} columns={cols}
          card={(m) => (
            <div className="space-y-3">
              <div className="flex items-center gap-3"><Avatar name={m.name.replace(/[^\p{L}\s]/gu, '').trim()} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-fg">{m.name}</p><bdi dir="ltr" className="block truncate text-xs text-muted">{m.email}</bdi></div></div>
              <div className="flex flex-wrap items-center gap-2">{status(m)}</div>
              <div className="flex flex-wrap items-center gap-2"><RoleCell m={m} onChange={(to) => setRoleChange({ m, to })} /><span className="ms-auto"><Actions m={m} onResend={() => doResend(m)} onRemove={() => setRemoving(m)} /></span></div>
            </div>
          )} />
      </Section>

      <Section id="pm-h" flush title={tx('الأدوار والصلاحيات', 'Roles and permissions')}
        hint={<InfoHint>{tx('الأدوار الأربعة ثابتة في هذه النسخة. في المنصة الفعلية يُفرض المنع على الخادم لكل صفحة ورابط مباشر وتصدير.', 'The four roles are fixed in this version. On the real platform the server enforces this for every page, deep link and export.')}</InfoHint>}>
        <Matrix current={role} />
      </Section>

      <Section id="lg-h" title={<><History className="size-4 text-muted" aria-hidden="true" />{tx('سجل نشاط الفريق', 'Team activity log')}</>}
        hint={<InfoHint>{tx('تغييرات العضوية والأدوار في هذه الجلسة. سجل كل إجراء لكل موظف يحتاج الخادم.', 'Membership and role changes in this session. A per-member log of every action needs the server.')}</InfoHint>}>
        {team.log.length === 0 ? <p className="text-sm text-muted">{tx('لا نشاط بعد في هذه الجلسة.', 'No activity in this session yet.')}</p> : (
          <ol className="divide-y divide-border">
            {team.log.slice(0, 20).map((e, i) => <LogRow key={i} who={e.who} what={e.what} />)}
          </ol>
        )}
      </Section>

      {inviting && <InviteModal members={all} plan={plan} onClose={() => setInviting(false)} onDone={(email, r) => {
        const id = `u${Date.now()}`;
        teamStore.set((x) => ({ ...x, members: invite(x.members, email, r, id) }));
        inviteDatesStore.set((d) => ({ ...d, [id]: at() }));
        log({ k: 'invite', email: email.trim(), role: r, at: at() });
        setInviting(false);
        toast({ tone: 'ok', text: tx(`أُرسلت الدعوة إلى ${email.trim()} (محاكاة)`, `Invite sent to ${email.trim()} (simulated)`) });
      }} />}

      {roleChange && (() => {
        const d = roleDiff(roleChange.m.role, roleChange.to);
        const names = (ids: typeof d.gains) => ids.map((i) => PERM_LABEL[i]?.[lang]).filter(Boolean).join(tx('، ', ', '));
        return (
          <Modal title={tx(`تغيير دور ${roleChange.m.name}`, `Change ${roleChange.m.name}’s role`)} description={tx(`من «${ROLE_LABEL[roleChange.m.role].ar}» إلى «${ROLE_LABEL[roleChange.to].ar}». يسري من الطلب التالي.`, `From ${ROLE_LABEL[roleChange.m.role].en} to ${ROLE_LABEL[roleChange.to].en}. Applies from their next request.`)} onClose={() => setRoleChange(null)}
            footer={<><Button variant="secondary" onClick={() => setRoleChange(null)}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={() => {
              teamStore.set((x) => ({ ...x, members: changeRole(x.members, roleChange.m.id, roleChange.to) }));
              log({ k: 'role', name: roleChange.m.name, from: roleChange.m.role, to: roleChange.to, at: at() });
              setRoleChange(null);
              toast({ tone: 'ok', text: tx('تغيّر الدور', 'Role changed') });
            }}>{tx('غيّر الدور', 'Change role')}</Button></>}>
            <dl className="space-y-3 text-sm">
              <div><dt className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{tx('سيتمكن من', 'Will gain')}</dt><dd className="mt-1 text-fg">{names(d.gains) || '—'}</dd></div>
              <div><dt className="text-xs font-semibold text-red-700 dark:text-red-400">{tx('سيفقد', 'Will lose')}</dt><dd className="mt-1 text-fg">{names(d.loses) || '—'}</dd></div>
            </dl>
          </Modal>
        );
      })()}

      {removing && (
        <Modal title={removing.status === 'active' ? tx(`إزالة ${removing.name}`, `Remove ${removing.name}`) : tx(`إلغاء دعوة ${removing.email}`, `Revoke invite for ${removing.email}`)} onClose={() => setRemoving(null)}
          description={removing.status === 'active' ? tx('يفقد الوصول فورًا وتنتهي جلساته. نشاطه المسجّل يبقى في السجل.', 'They lose access immediately and their sessions end. Their recorded activity stays in the log.') : tx('يتوقف رابط الدعوة عن العمل ويتحرر المقعد.', 'The invite link stops working and the seat is freed.')}
          footer={<><Button variant="secondary" onClick={() => setRemoving(null)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={() => {
            teamStore.set((x) => ({ ...x, members: removeMember(x.members, removing.id) }));
            log(removing.status === 'active' ? { k: 'remove', name: removing.name, at: at() } : { k: 'revoke', email: removing.email, at: at() });
            setRemoving(null);
          }}>{removing.status === 'active' ? tx('أزل العضو', 'Remove member') : tx('ألغِ الدعوة', 'Revoke invite')}</Button></>} />
      )}
    </>
  );
}

function RoleCell({ m, onChange }: { m: Member; onChange: (r: Role) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  if (m.role === 'owner') return <Badge tone="brand">{ROLE_LABEL.owner[lang]}</Badge>;
  return (
    <Select aria-label={tx(`دور ${m.name}`, `Role for ${m.name}`)} className="h-9 w-auto min-w-36" value={m.role} onChange={(e) => onChange(e.target.value as Role)}>
      {ROLES.filter((r) => r !== 'owner').map((r) => <option key={r} value={r}>{ROLE_LABEL[r][lang]}</option>)}
    </Select>
  );
}

function Actions({ m, onResend, onRemove }: { m: Member; onResend: () => void; onRemove: () => void }) {
  const tx = useTx();
  if (m.role === 'owner') return <span className="text-xs text-subtle">{tx('لا يُزال المالك', 'Owner can’t be removed')}</span>;
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      {m.status !== 'active' && <Button variant="ghost" size="sm" onClick={onResend}><Mail className="size-4" aria-hidden="true" />{tx('أعد الإرسال', 'Resend')}</Button>}
      <Button variant="ghost" size="sm" className="text-red-700 hover:text-red-700 dark:text-red-400" onClick={onRemove}>{m.status === 'active' ? tx('إزالة', 'Remove') : tx('ألغِ الدعوة', 'Revoke')}</Button>
    </span>
  );
}

function InviteModal({ members, plan, onClose, onDone }: { members: Member[]; plan: Parameters<typeof seats>[1]; onClose: () => void; onDone: (email: string, role: Role) => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('fulfilment');
  const [tried, setTried] = useState(false);
  const err = inviteError(members, plan, email, role);
  const expires = new Date(Date.now() + INVITE_DAYS * 86_400_000).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'long' });
  const seat = seats(members, plan);
  const msg = !tried || !err ? null : err === 'email' ? tx('أدخل بريدًا صالحًا', 'Enter a valid email') : err === 'duplicate' ? tx('هذا البريد عضو أو مدعو بالفعل', 'Already a member or invited') : null;
  return (
    <Modal title={tx('دعوة عضو', 'Invite a member')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button disabled={seat.full} onClick={() => { setTried(true); if (!err) onDone(email, role); }}>{tx('أرسل الدعوة', 'Send invite')}</Button></>}>
      {seat.full ? <Alert tone="warn">{tx('اكتملت مقاعد خطتك. ألغِ دعوة أو غيّر الخطة من المالية.', 'Your plan’s seats are full. Revoke an invite or change plan in Finance.')}</Alert> : null}
      <Field label={tx('البريد الإلكتروني', 'Email')} error={msg}>{(p) => <Input {...p} type="email" dir="ltr" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />}</Field>
      <Field label={tx('الدور', 'Role')}>{(p) => <Select {...p} value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.filter((r) => r !== 'owner').map((r) => <option key={r} value={r}>{ROLE_LABEL[r][lang]}</option>)}</Select>}</Field>
      <p className="text-[13px] text-muted">{tx(`يرى: ${matrix().filter((x) => x.kind === 'page' && x.allowed[role]).map((x) => PERM_LABEL[x.id]?.ar).join('، ')}`, `Can see: ${matrix().filter((x) => x.kind === 'page' && x.allowed[role]).map((x) => PERM_LABEL[x.id]?.en).join(', ')}`)}</p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{tx(`تنتهي الدعوة في ${expires} (${INVITE_DAYS} أيام) · تشغل مقعدًا حتى تُقبل أو تنتهي`, `Expires ${expires} (${INVITE_DAYS} days) · uses a seat until accepted or expired`)}</span>
        <Simulated />
      </div>
    </Modal>
  );
}

function Matrix({ current }: { current: Role }) {
  const tx = useTx();
  const { lang } = useLang();
  const rows = matrix();
  const yes = <><Check className="mx-auto size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /><span className="sr-only">{tx('مسموح', 'Allowed')}</span></>;
  const no = <><Minus className="mx-auto size-4 text-subtle" aria-hidden="true" /><span className="sr-only">{tx('غير مسموح', 'Not allowed')}</span></>;
  const group = (kind: 'page' | 'action', title: string) => (
    <>
      <tr><th colSpan={5} scope="colgroup" className="bg-surface-2/60 px-4 py-2 text-start text-xs font-semibold text-muted">{title}</th></tr>
      {rows.filter((r) => r.kind === kind).map((r) => (
        <tr key={r.id} className="border-t border-border">
          <th scope="row" className="px-4 py-2.5 text-start text-[13px] font-medium text-fg">{PERM_LABEL[r.id]?.[lang]}</th>
          {ROLES.map((ro) => <td key={ro} className={cn('px-4 py-2.5 text-center', ro === current && 'bg-brand-500/5')}>{r.allowed[ro] ? yes : no}</td>)}
        </tr>
      ))}
    </>
  );
  return (
    <div className="scrollbar-thin relative overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <caption className="sr-only">{tx('مصفوفة الصلاحيات حسب الدور', 'Permissions by role')}</caption>
        <thead><tr className="text-xs text-muted"><th scope="col" className="px-4 py-2 text-start font-semibold">{tx('الصلاحية', 'Permission')}</th>
          {ROLES.map((r) => <th key={r} scope="col" className={cn('w-24 px-4 py-2 text-center font-semibold', r === current && 'text-brand-700 dark:text-brand-300')}>{ROLE_LABEL[r][lang]}</th>)}</tr></thead>
        <tbody>{group('page', tx('يرى الصفحة', 'Can open'))}{group('action', tx('يستطيع', 'Can do'))}</tbody>
      </table>
    </div>
  );
}

function LogRow({ who, what }: { who: string; what: string }) {
  const tx = useTx();
  const { lang } = useLang();
  const e = decodeLog(what);
  const r = (x: Role) => ROLE_LABEL[x][lang];
  const text = !e ? what
    : e.k === 'invite' ? tx(`دعا ${e.email} بدور ${r(e.role)}`, `Invited ${e.email} as ${r(e.role)}`)
      : e.k === 'role' ? tx(`غيّر دور ${e.name} من ${r(e.from)} إلى ${r(e.to)}`, `Changed ${e.name} from ${r(e.from)} to ${r(e.to)}`)
        : e.k === 'remove' ? tx(`أزال ${e.name}`, `Removed ${e.name}`)
          : e.k === 'revoke' ? tx(`ألغى دعوة ${e.email}`, `Revoked the invite for ${e.email}`)
            : tx(`أعاد إرسال دعوة ${e.email}`, `Re-sent the invite to ${e.email}`);
  const when = e ? new Date(e.at).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 text-sm">
      <span className="font-semibold text-fg">{who}</span><span className="min-w-0 flex-1 text-muted">{text}</span>
      {when && <time dateTime={e!.at} className="text-xs text-subtle tabular-nums">{when}</time>}
    </li>
  );
}
