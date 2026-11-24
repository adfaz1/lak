// Account activity log on the Team page: every recorded action (who, what, when, before → after), filtered by
// member, area, period and text, kept in the URL; CSV export. A member drawer shows one person's actions,
// their devices and two-step status, with "sign out everywhere" (simulated).
import { useMemo, useState } from 'react';
import { Download, History, KeyRound, LogOut, Search } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { link, replace, useRoute } from '../../../core/router';
import { auditStore, logAction } from '../../merchant/stores';
import { AUDIT_AREAS, auditCsv, filterAudit, type AuditArea, type AuditEntry } from '../../merchant/audit';
import type { Member } from '../../merchant/workspace';
import { Avatar, Badge, Button, EmptyState, InfoHint, LinkButton, useTx } from '../../../ds/ui';
import { Drawer, FilterChip, Modal, Pagination, SearchInput, Simulated, useToast } from '../../../ds/kit';
import { ROLE_LABEL } from './model';
import { accountFixture } from './account-model';
import { Section, settingsHref } from './common';
import { accountsStore, customRolesStore } from './stores';

const PER = 10;
export function useAreaLabel() {
  const tx = useTx();
  return (a: AuditArea) => ({ team: tx('الفريق', 'Team'), security: tx('الأمان', 'Security'), store: tx('المتجر', 'Store'), settings: tx('الإعدادات', 'Settings'), apps: tx('التطبيقات', 'Apps'), orders: tx('الطلبات', 'Orders'), products: tx('المنتجات', 'Products'), inventory: tx('المخزون', 'Inventory'), marketing: tx('التسويق', 'Marketing'), finance: tx('المالية', 'Finance') })[a];
}
export function useWhen() {
  const { lang } = useLang();
  return (iso: string) => new Date(iso).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function Entry({ e, showWho = true }: { e: AuditEntry; showWho?: boolean }) {
  const { lang } = useLang();
  const area = useAreaLabel();
  const when = useWhen();
  return (
    <li className="flex items-start gap-3 py-3">
      {showWho && <Avatar name={e.actor.name} />}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-fg">{showWho && <span className="font-semibold">{e.actor.name} </span>}<span className="text-muted">{e.what[lang]}</span></p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
          <time dateTime={e.at} className="tabular-nums">{when(e.at)}</time><span aria-hidden="true">·</span><span>{area(e.area)}</span>
          {e.target && <><span aria-hidden="true">·</span><bdi dir="ltr" className="truncate">{e.target}</bdi></>}
          {e.before !== undefined && e.after !== undefined && <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5"><bdi>{e.before}</bdi><span aria-hidden="true">→</span><bdi>{e.after}</bdi></span>}
        </p>
      </div>
    </li>
  );
}

export function ActivityLog({ members }: { members: Member[] }) {
  const tx = useTx();
  const { lang } = useLang();
  const route = useRoute();
  const area = useAreaLabel();
  const all = auditStore.use();
  const q = route.query.get('lq') ?? '';
  const m = route.query.get('lm') ?? '';
  const ar = (route.query.get('la') ?? '') as AuditArea | '';
  const days = Number(route.query.get('ld') ?? '') || null;
  const page = Math.max(1, Number(route.query.get('lp') ?? '1') || 1);
  const go = (patch: Record<string, string | undefined>) => {
    const cur = Object.fromEntries([...route.query.entries()]);
    replace(link('/dashboard/settings/team', { ...cur, lp: undefined, ...patch }));
  };
  const shown = useMemo(() => filterAudit(all, { member: m, area: ar, q, days }), [all, m, ar, q, days]);
  const pages = Math.max(1, Math.ceil(shown.length / PER));
  const cur = Math.min(page, pages);
  const actors = [...new Map([...members.filter((x) => x.status === 'active').map((x) => [x.id, x.name] as const), ...all.map((e) => [e.actor.id, e.actor.name] as const)]).entries()];
  const filtered = !!(q || m || ar || days);
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([auditCsv(shown, lang)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `lak-activity-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <Section id="lg-h" flush title={<><History className="size-4 text-muted" aria-hidden="true" />{tx('سجل النشاط', 'Activity log')}</>}
      hint={<InfoHint>{tx('كل إجراء له أثر: من قام به ومتى وما تغيّر. في هذه النسخة يُحفظ لجلسة المتصفح؛ السجل الدائم غير القابل للتعديل يحتاج الخادم.', 'Every action with an effect: who, when and what changed. In this version it lasts for the browser session; a permanent, tamper-proof log needs the server.')}</InfoHint>}
      action={<Button variant="secondary" size="sm" disabled={!shown.length} onClick={exportCsv}><Download className="size-4" aria-hidden="true" />{tx('صدّر CSV', 'Export CSV')}</Button>}>
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        <SearchInput value={q} onChange={(v) => go({ lq: v || undefined })} placeholder={tx('ابحث في السجل', 'Search the log')} />
        <FilterChip label={tx('العضو', 'Member')} value={m} onChange={(v) => go({ lm: v || undefined })} options={actors.map(([id, name]) => ({ value: id, label: name }))} />
        <FilterChip label={tx('المجال', 'Area')} value={ar} onChange={(v) => go({ la: v || undefined })} options={AUDIT_AREAS.map((a) => ({ value: a, label: area(a) }))} />
        <FilterChip label={tx('الفترة', 'Period')} value={days ? String(days) : ''} onChange={(v) => go({ ld: v || undefined })} options={[{ value: '1', label: tx('آخر 24 ساعة', 'Last 24 hours') }, { value: '7', label: tx('آخر 7 أيام', 'Last 7 days') }, { value: '30', label: tx('آخر 30 يومًا', 'Last 30 days') }]} />
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={<Search className="size-6" aria-hidden="true" />} title={filtered ? tx('لا نشاط يطابق التصفية', 'No activity matches the filters') : tx('لا نشاط بعد', 'No activity yet')}
          action={filtered ? <LinkButton variant="secondary" href={settingsHref('team')}>{tx('امسح التصفية', 'Clear filters')}</LinkButton> : undefined} />
      ) : (
        <>
          <ol className="divide-y divide-border border-t border-border px-5">{shown.slice((cur - 1) * PER, cur * PER).map((e) => <Entry key={e.id} e={e} />)}</ol>
          <Pagination page={cur} pages={pages} total={shown.length} hrefFor={(p) => link('/dashboard/settings/team', { ...Object.fromEntries([...route.query.entries()]), lp: String(p) })} />
        </>
      )}
    </Section>
  );
}

export function MemberDrawer({ member, onClose }: { member: Member; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const toast = useToast();
  const all = auditStore.use();
  const accounts = accountsStore.use();
  const custom = customRolesStore.use();
  const rec = accounts[member.id] ?? accountFixture(member.id);
  const mine = filterAudit(all, { member: member.id });
  const cr = custom.roles.find((r) => r.id === custom.assigned[member.id]);
  const [confirm, setConfirm] = useState(false);
  const others = rec.sessions.length;
  return (
    <Drawer title={member.name} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Avatar name={member.name} />
          <div className="min-w-0 flex-1"><p className="truncate font-semibold text-fg">{member.name}</p><bdi dir="ltr" className="block truncate text-xs text-muted">{member.email}</bdi></div>
          <Badge tone="brand">{cr ? (cr.name[lang] || cr.name.ar) : ROLE_LABEL[member.role][lang]}</Badge>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-surface-2 p-3"><dt className="text-xs text-muted">{tx('التحقق بخطوتين', 'Two-step')}</dt><dd className="mt-1 flex items-center gap-1.5 font-semibold text-fg"><KeyRound className="size-4" aria-hidden="true" />{rec.twofa.enabled ? tx('مفعّل', 'On') : tx('غير مفعّل', 'Off')}</dd></div>
          <div className="rounded-xl bg-surface-2 p-3"><dt className="text-xs text-muted">{tx('الأجهزة', 'Devices')}</dt><dd className="mt-1 font-semibold text-fg tabular-nums">{others}</dd></div>
        </dl>
        {member.role !== 'owner' && others > 0 && <Button variant="secondary" className="w-full" onClick={() => setConfirm(true)}><LogOut className="size-4" aria-hidden="true" />{tx('أخرجه من كل الأجهزة', 'Sign out of all devices')}</Button>}
        <div>
          <h3 className="mb-1 text-sm font-semibold text-fg">{tx('آخر نشاطه', 'Recent activity')}</h3>
          {mine.length === 0 ? <p className="text-sm text-muted">{tx('لا نشاط مسجّل.', 'No recorded activity.')}</p>
            : <ol className="divide-y divide-border">{mine.slice(0, 15).map((e) => <Entry key={e.id} e={e} showWho={false} />)}</ol>}
          {mine.length > 15 && <a className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300" href={settingsHref('team', { lm: member.id })} onClick={onClose}>{tx(`كل نشاطه (${mine.length})`, `All activity (${mine.length})`)}</a>}
        </div>
      </div>
      {confirm && (
        <Modal title={tx(`إخراج ${member.name} من كل الأجهزة`, `Sign ${member.name} out everywhere`)} onClose={() => setConfirm(false)}
          description={tx('ينتهي كل دخول له فورًا ويحتاج تسجيل الدخول من جديد. لا يتغير دوره.', 'Every session ends now and they must sign in again. Their role doesn’t change.')}
          footer={<><Button variant="secondary" onClick={() => setConfirm(false)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={() => {
            accountsStore.set((a) => ({ ...a, [member.id]: { ...rec, sessions: [] } }));
            logAction('security', { ar: `أخرج ${member.name} من كل الأجهزة`, en: `Signed ${member.name} out of all devices` }, { target: member.email });
            setConfirm(false);
            toast({ tone: 'ok', text: tx('انتهت جلساته (محاكاة)', 'Sessions ended (simulated)') });
          }}>{tx('أخرجه', 'Sign out')}</Button></>}>
          <Simulated />
        </Modal>
      )}
    </Drawer>
  );
}
