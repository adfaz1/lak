import { useEffect, useState } from 'react';
import { useLang } from '../../core/lang';
import type { Route } from '../../core/router';
import { can, isLive, remainingMs, ROLES, SECTION_PERM, SECTIONS, type RoleId, type Section } from './domain';
import { ROLE_DESC, ROLE_LABEL, ROLE_PERSON, SECTION_LABEL, strings, type Strings } from './i18n';
import { flashStore, href, Icon, NoAccess, NotFound, type Ctx } from './kit';
import {
  accessStore, changesStore, contentStore, deliveriesStore, disputesStore, endAccess, kycStore, roleStore, storesStore, switchRole,
} from './state';
import Overview from './screens/overview';
import Kyc from './screens/kyc';
import Stores from './screens/stores';
import Plans from './screens/plans';
import Payments from './screens/payments';
import Shipping from './screens/shipping';
import Content from './screens/content';
import Health from './screens/health';
import Reports from './screens/reports';
import Announcements from './screens/announcements';
import Audit from './screens/audit';
import './styles.css';

const SCREENS: Record<Section, (p: Ctx) => JSX.Element> = {
  overview: Overview, kyc: Kyc, stores: Stores, plans: Plans, payments: Payments, shipping: Shipping,
  content: Content, health: Health, reports: Reports, announcements: Announcements, audit: Audit,
};

/** P02 — LAK platform super-admin. A separate shell from the merchant workspace. `route.path` is below /admin. */
export default function Admin({ route }: { route: Route }) {
  const { lang } = useLang();
  const t = strings[lang];
  const role = roleStore.use();
  const [menuOpen, setMenuOpen] = useState(false);
  const head = route.path[0] ?? 'overview';
  const section = (SECTIONS as string[]).includes(head) ? (head as Section) : null;

  // Close the collapsed menu after navigating.
  const key = route.path.join('/');
  useEffect(() => { setMenuOpen(false); }, [key]);

  const Screen = section ? SCREENS[section] : null;
  const sub: Route = { path: route.path.slice(1), query: route.query };

  return (
    <div className="shell adm-shell" data-surface="admin">
      <nav className="nav adm-nav" aria-label={t.shellLabel}>
        <div className="adm-brand">
          <span className="adm-mark"><img src="/lak-mark.png" alt="" width="20" height="28" /></span>
          <span className="adm-brand-text"><span className="adm-brand-title">{t.shellLabel}</span><span className="adm-brand-sub">{t.shellSub}</span></span>
        </div>
        <button type="button" className="adm-menu-btn" aria-expanded={menuOpen} aria-controls="adm-nav-links" onClick={() => setMenuOpen((o) => !o)}>
          <Icon name={menuOpen ? 'x' : 'menu'} /><span>{menuOpen ? t.menuClose : t.menuOpen}</span>
          <span className="adm-menu-current">{section ? SECTION_LABEL[section][lang] : ''}</span>
        </button>
        <NavLinks t={t} lang={lang} role={role} current={section} open={menuOpen} />
        <p className="nav-note adm-nav-note"><Icon name="shield" size={16} /> {t.twoFa}</p>
      </nav>
      <div className="main adm-main">
        <RoleBar t={t} lang={lang} role={role} />
        <AccessBanner t={t} lang={lang} />
        <Flash t={t} at={key} />
        {Screen && section ? (can(role, SECTION_PERM[section])
          ? <Screen t={t} lang={lang} role={role} route={sub} />
          : <NoAccess t={t} lang={lang} role={role} section={section} />)
          : <NotFound t={t} back={href('')} backLabel={SECTION_LABEL.overview[lang]} />}
      </div>
    </div>
  );
}

function NavLinks({ t, lang, role, current, open }: { t: Strings; lang: 'ar' | 'en'; role: RoleId; current: Section | null; open: boolean }) {
  const kyc = kycStore.use();
  const changes = changesStore.use();
  const disputes = disputesStore.use();
  const deliveries = deliveriesStore.use();
  const content = contentStore.use();
  const counts: Partial<Record<Section, number>> = {
    kyc: kyc.filter((a) => a.status === 'pending').length,
    plans: changes.filter((c) => c.status === 'pending').length,
    payments: disputes.filter((d) => d.state === 'open').length,
    shipping: deliveries.filter((d) => d.state === 'failed').length,
    content: content.filter((c) => c.state === 'review').length,
  };
  // Only sections the role may open are listed; counts are never computed for hidden sections.
  return (
    <div id="adm-nav-links" className={`nav-links adm-nav-links${open ? ' open' : ''}`}>
      {SECTIONS.filter((s) => can(role, SECTION_PERM[s])).map((s) => (
        <a key={s} className="nav-link" href={href(s === 'overview' ? '' : `/${s}`)} aria-current={current === s ? 'page' : undefined}>
          <span className="adm-nav-label"><Icon name={s} />{SECTION_LABEL[s][lang]}</span>
          {counts[s] ? <span className="count" aria-label={`${counts[s]} ${t.open}`}>{counts[s]}</span> : null}
        </a>
      ))}
    </div>
  );
}

function RoleBar({ t, lang, role }: { t: Strings; lang: 'ar' | 'en'; role: RoleId }) {
  return (
    <section className="adm-rolebar" aria-label={t.roleLabel}>
      <div className="adm-role-field">
        <label htmlFor="adm-role">{t.roleLabel}</label>
        <select id="adm-role" className="input" value={role} onChange={(e) => switchRole(e.target.value as RoleId)} aria-describedby="adm-role-desc">
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_PERSON[r][lang]}</option>)}
        </select>
      </div>
      <div className="grow adm-role-desc" id="adm-role-desc">
        <p><b>{ROLE_LABEL[role][lang]}:</b> {ROLE_DESC[role][lang]}</p>
        <p className="muted small"><Icon name="shield" size={16} /> {t.roleHint}</p>
      </div>
      <span className="tag adm-sim-tag" title={t.simData}>{t.simSnapshot}</span>
    </section>
  );
}

function AccessBanner({ t, lang }: { t: Strings; lang: 'ar' | 'en' }) {
  const sessions = accessStore.use();
  const stores = storesStore.use();
  const [, setTick] = useState(0); // bumped every second while a session is open, to re-render the countdown
  const now = Date.now();
  const live = sessions.find((s) => isLive(s, now)) ?? null;
  const expired = sessions.find((s) => !s.endedAt && !isLive(s, now));

  useEffect(() => {
    if (!sessions.some((s) => !s.endedAt)) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [sessions]);
  useEffect(() => { if (expired) endAccess(expired.id, 'expired'); }, [expired]);

  if (!live) return null;
  const store = stores.find((s) => s.id === live.storeId);
  const left = Math.ceil(remainingMs(live, now) / 1000);
  const mmss = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  return (
    <div className={`adm-access-banner ${live.mode}`} role="region" aria-label={t.bannerTitle}>
      <Icon name="shield" size={22} />
      <div className="grow">
        <p className="strong">{t.bannerTitle} · {live.mode === 'read' ? t.modeRead : t.modeWrite}</p>
        <p className="small">{t.bannerTo(store?.name[lang] ?? live.storeId)} · {t.reason.split(' (')[0]}: <q>{live.reason}</q></p>
      </div>
      <span className="adm-timer" aria-label={`${t.bannerLeft} ${mmss}`}><Icon name="clock" size={16} /><bdi dir="ltr">{mmss}</bdi></span>
      <a className="btn small" href={href(`/stores/${live.storeId}`)}>{t.goStore}</a>
      <button type="button" className="btn small" onClick={() => endAccess(live.id, 'ended')}>{t.endSession}</button>
    </div>
  );
}

function Flash({ t, at }: { t: Strings; at: string }) {
  const f = flashStore.use();
  if (!f || f.at !== at) return null;
  const msg = f.msg;
  return (
    <div className="adm-flash" role="status">
      <Icon name="check" size={18} /><span className="grow">{msg}</span>
      <button type="button" className="btn small" onClick={() => flashStore.set(null)}>{t.dismiss}</button>
    </div>
  );
}
