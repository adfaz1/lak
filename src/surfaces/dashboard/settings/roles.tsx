// Custom roles (BP-P03-STF-002, Pro plan): name a role, start from a fixed one, tick pages and actions with a
// live comparison, then assign it to members. In this version the screens still enforce the base role's checks;
// the matrix shows the custom role as its own column. Assigning needs the Pro plan.
import { useState } from 'react';
import { Pencil, Plus, Trash2, UserCog } from 'lucide-react';
import { useLang } from '../../../core/lang';
import { logAction, teamStore } from '../../merchant/stores';
import { MATRIX_ACTIONS, MATRIX_PAGES, type Action, type Page, type Role } from '../../merchant/perms';
import { PLANS, type Plan } from '../../merchant/finance';
import type { Member } from '../../merchant/workspace';
import { Badge, Button, InfoHint, useTx } from '../../../ds/ui';
import { Alert, Checkbox, Field, Input, Modal, Select } from '../../../ds/kit';
import { sectionHref } from '../pages';
import { CUSTOM_ROLE_PLAN, PERM_LABEL, ROLE_LABEL, customAllows, customRoleErrors, matrix, roleFrom, togglePerm, type CustomRole } from './model';
import { Section } from './common';
import { customRolesStore } from './stores';

export function RoleCustomBadge({ memberId }: { memberId: string }) {
  const { lang } = useLang();
  const c = customRolesStore.use();
  const r = c.roles.find((x) => x.id === c.assigned[memberId]);
  return r ? <Badge tone="sky">{r.name[lang] || r.name.ar || r.name.en}</Badge> : null;
}

export function CustomRoles({ members, plan }: { members: Member[]; plan: Plan }) {
  const tx = useTx();
  const { lang } = useLang();
  const c = customRolesStore.use();
  const [edit, setEdit] = useState<CustomRole | null>(null);
  const [del, setDel] = useState<CustomRole | null>(null);
  const allowed = PLANS.indexOf(plan) >= PLANS.indexOf(CUSTOM_ROLE_PLAN);
  const assignedTo = (id: string) => members.filter((m) => c.assigned[m.id] === id);
  return (
    <Section id="cr-h" title={<><UserCog className="size-4 text-muted" aria-hidden="true" />{tx('أدوار مخصصة', 'Custom roles')}<Badge tone="brand">Pro</Badge></>}
      hint={<InfoHint>{tx('ابدأ من دور ثابت وعدّل صلاحياته. في هذه النسخة تطبّق الشاشات صلاحيات الدور الأساسي، والمصفوفة تعرض الدور المخصص كعمود مستقل.', 'Start from a fixed role and adjust it. In this version the screens enforce the base role; the matrix shows the custom role as its own column.')}</InfoHint>}
      action={<Button size="sm" variant="secondary" onClick={() => setEdit(roleFrom('fulfilment', `cr${Date.now()}`))}><Plus className="size-4" aria-hidden="true" />{tx('دور جديد', 'New role')}</Button>}>
      {!allowed && <div className="mb-3"><Alert tone="info" action={<a href={sectionHref('finance', '', { tab: 'billing' })} className="shrink-0 text-[13px] font-semibold text-brand-700 hover:underline dark:text-brand-300">{tx('الخطة والفوترة', 'Plan & billing')}</a>}>{tx('يمكنك تصميم الأدوار ومعاينتها الآن؛ إسنادها للأعضاء يحتاج خطة Pro.', 'You can design and preview roles now; assigning them to members needs the Pro plan.')}</Alert></div>}
      {c.roles.length === 0 ? <p className="text-sm text-muted">{tx('لا أدوار مخصصة.', 'No custom roles.')}</p> : (
        <ul className="divide-y divide-border">
          {c.roles.map((r) => {
            const who = assignedTo(r.id);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg">{r.name[lang] || r.name.ar || r.name.en}</p>
                  <p className="text-xs text-muted">{tx(`مبني على ${ROLE_LABEL[r.base].ar} · ${r.pages.length} صفحات · ${r.actions.length} إجراءات`, `Based on ${ROLE_LABEL[r.base].en} · ${r.pages.length} pages · ${r.actions.length} actions`)}{who.length ? ` · ${who.map((m) => m.name).join(tx('، ', ', '))}` : ''}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEdit(r)}><Pencil className="size-4" aria-hidden="true" />{tx('عدّل', 'Edit')}</Button>
                <Button variant="ghost" size="sm" className="text-red-700 dark:text-red-400" onClick={() => setDel(r)}><Trash2 className="size-4" aria-hidden="true" />{tx('احذف', 'Delete')}</Button>
              </li>
            );
          })}
        </ul>
      )}
      {edit && <RoleEditor role={edit} members={members.filter((m) => m.role !== 'owner' && m.status !== 'expired')} allowed={allowed} onClose={() => setEdit(null)} />}
      {del && (
        <Modal title={tx(`حذف «${del.name[lang] || del.name.ar}»`, `Delete “${del.name[lang] || del.name.en}”`)} onClose={() => setDel(null)}
          description={assignedTo(del.id).length ? tx(`يعود ${assignedTo(del.id).length} أعضاء إلى دورهم الأساسي «${ROLE_LABEL[del.base].ar}».`, `${assignedTo(del.id).length} member(s) go back to the base role ${ROLE_LABEL[del.base].en}.`) : tx('لا أعضاء على هذا الدور.', 'No members have this role.')}
          footer={<><Button variant="secondary" onClick={() => setDel(null)}>{tx('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={() => {
            customRolesStore.set((x) => ({ roles: x.roles.filter((r) => r.id !== del.id), assigned: Object.fromEntries(Object.entries(x.assigned).filter(([, v]) => v !== del.id)) }));
            logAction('team', { ar: `حذف الدور المخصص «${del.name.ar || del.name.en}»`, en: `Deleted the custom role “${del.name.en || del.name.ar}”` });
            setDel(null);
          }}>{tx('احذف الدور', 'Delete role')}</Button></>} />
      )}
    </Section>
  );
}

function RoleEditor({ role, members, allowed, onClose }: { role: CustomRole; members: Member[]; allowed: boolean; onClose: () => void }) {
  const tx = useTx();
  const { lang } = useLang();
  const c = customRolesStore.use();
  const isNew = !c.roles.some((r) => r.id === role.id);
  const [r, setR] = useState<CustomRole>(role);
  const [who, setWho] = useState<string[]>(members.filter((m) => c.assigned[m.id] === role.id).map((m) => m.id));
  const [tried, setTried] = useState(false);
  const errs = customRoleErrors(r, c.roles);
  const rows = matrix();
  const base = (id: Page | Action) => rows.find((x) => x.id === id)!.allowed[r.base];
  const adds = [...MATRIX_PAGES, ...MATRIX_ACTIONS].filter((id) => customAllows(r, id) && !base(id));
  const drops = [...MATRIX_PAGES, ...MATRIX_ACTIONS].filter((id) => !customAllows(r, id) && base(id));
  const names = (ids: (Page | Action)[]) => ids.map((i) => PERM_LABEL[i]?.[lang]).filter(Boolean).join(tx('، ', ', ')) || '—';
  const save = () => {
    setTried(true);
    if (Object.keys(errs).length) return;
    customRolesStore.set((x) => {
      const assigned = Object.fromEntries(Object.entries(x.assigned).filter(([, v]) => v !== r.id));
      if (allowed) who.forEach((id) => { assigned[id] = r.id; });
      return { roles: isNew ? [...x.roles, r] : x.roles.map((y) => (y.id === r.id ? r : y)), assigned };
    });
    if (allowed) teamStore.set((t) => ({ ...t, members: t.members.map((m) => (who.includes(m.id) ? { ...m, role: r.base as Role } : m)) }));
    logAction('team', isNew ? { ar: `أنشأ الدور المخصص «${r.name.ar || r.name.en}»`, en: `Created the custom role “${r.name.en || r.name.ar}”` } : { ar: `عدّل الدور المخصص «${r.name.ar || r.name.en}»`, en: `Edited the custom role “${r.name.en || r.name.ar}”` }, { after: `${r.pages.length}p/${r.actions.length}a` });
    onClose();
  };
  const box = (id: Page | Action) => (
    <li key={id}><label className="flex cursor-pointer items-center gap-2 text-sm text-fg"><Checkbox checked={customAllows(r, id)} onChange={(v) => setR(togglePerm(r, id, v))} label={PERM_LABEL[id]?.[lang] ?? id} />{PERM_LABEL[id]?.[lang] ?? id}</label></li>
  );
  return (
    <Modal size="lg" title={isNew ? tx('دور مخصص جديد', 'New custom role') : tx('تعديل الدور', 'Edit role')} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>{tx('إلغاء', 'Cancel')}</Button><Button onClick={save}>{isNew ? tx('أنشئ الدور', 'Create role') : tx('احفظ الدور', 'Save role')}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={tx('الاسم بالعربية', 'Arabic name')} error={tried && errs.name ? (errs.name === 'taken' ? tx('الاسم مستخدم', 'Name in use') : tx('أدخل اسمًا', 'Enter a name')) : null}>{(f) => <Input {...f} dir="rtl" value={r.name.ar} onChange={(e) => setR({ ...r, name: { ...r.name, ar: e.target.value } })} />}</Field>
        <Field label={tx('الاسم بالإنجليزية', 'English name')} optional>{(f) => <Input {...f} dir="ltr" value={r.name.en} onChange={(e) => setR({ ...r, name: { ...r.name, en: e.target.value } })} />}</Field>
        <Field label={tx('ابدأ من', 'Start from')}>{(f) => <Select {...f} value={r.base} onChange={(e) => setR({ ...roleFrom(e.target.value as CustomRole['base'], r.id), name: r.name })}>{(['fulfilment', 'finance', 'marketing'] as const).map((b) => <option key={b} value={b}>{ROLE_LABEL[b][lang]}</option>)}</Select>}</Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset><legend className="mb-2 text-xs font-semibold text-muted">{tx('يرى الصفحات', 'Can open')}</legend><ul className="space-y-1.5">{MATRIX_PAGES.map(box)}</ul>
          {tried && errs.pages && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{tx('اختر صفحة واحدة على الأقل', 'Pick at least one page')}</p>}</fieldset>
        <fieldset><legend className="mb-2 text-xs font-semibold text-muted">{tx('يستطيع', 'Can do')}</legend><ul className="space-y-1.5">{MATRIX_ACTIONS.filter((a) => a !== 'team.manage').map(box)}</ul></fieldset>
      </div>
      <dl className="space-y-2 rounded-xl bg-surface-2 p-3 text-sm">
        <div><dt className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{tx(`زيادة على ${ROLE_LABEL[r.base].ar}`, `More than ${ROLE_LABEL[r.base].en}`)}</dt><dd className="text-fg">{names(adds)}</dd></div>
        <div><dt className="text-xs font-semibold text-red-700 dark:text-red-400">{tx(`أقل من ${ROLE_LABEL[r.base].ar}`, `Less than ${ROLE_LABEL[r.base].en}`)}</dt><dd className="text-fg">{names(drops)}</dd></div>
      </dl>
      <fieldset disabled={!allowed}>
        <legend className="mb-2 text-xs font-semibold text-muted">{tx('أسنده إلى', 'Assign to')}{!allowed && ` · ${tx('يحتاج Pro', 'needs Pro')}`}</legend>
        {members.length === 0 ? <p className="text-sm text-muted">{tx('لا أعضاء غير المالك.', 'No members besides the owner.')}</p> : (
          <ul className="space-y-1.5">{members.map((m) => <li key={m.id}><label className="flex cursor-pointer items-center gap-2 text-sm text-fg"><Checkbox checked={who.includes(m.id)} onChange={(v) => setWho(v ? [...who, m.id] : who.filter((x) => x !== m.id))} label={`${m.name} · ${m.email}`} />{m.name} <bdi dir="ltr" className="text-xs text-muted">{m.email}</bdi></label></li>)}</ul>
        )}
      </fieldset>
    </Modal>
  );
}
