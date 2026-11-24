import { useEffect, useState, type ReactNode } from 'react';
import { useLang, type L, type Lang } from '../../core/lang';
import { link, navigate, replace, type Route } from '../../core/router';
import { createStore } from '../../core/store';
import { Alert, Badge, Card, Dialog, Empty, Field, Id, LinkTabs, PageHeader, Sim, type Tone } from '../../core/ui';
import {
  ACTIVE, FEATURE_KEYS, ISSUES, LIMITS, MAX_SECTIONS, NAME_MAX, PLANS, PLATFORMS, SCREENSHOT_SLOTS, SECTION_TYPES, STAGES,
  addSection, apply, awaiting, canAdd, classifyChange, configUpdateBlock, createConfigUpdate, createRelease, eligibility,
  isActive, listingIssues, liveConfig, liveVersion, moveSection, nameIssues, readiness, removeSection, stages,
  type Accounts, type Addon, type AppConfig, type CheckId, type IssueCode, type Listing, type ListingField, type PState,
  type Plan, type Platform, type Release, type SectionType, type SimEvent,
} from './domain';
import { ACCENTS, ICONS, MERCHANT, SPLASHES, initialAccounts, initialDraft, initialListing, initialReleases } from './fixtures';
import { Ico, IconArt } from './icons';
import { strings, type StepId, type Strings } from './i18n';
import { PhonePreview, SCREENS, type OS, type Screen } from './preview';
import './styles.css';

interface AMState { plan: Plan; addon: Addon; draft: AppConfig; listing: Listing; accounts: Accounts; releases: Release[]; seq: number }

export const appStore = createStore<AMState>(() => ({
  plan: 'plus', addon: 'active', draft: initialDraft(), listing: initialListing(), accounts: initialAccounts(), releases: initialReleases(), seq: 10,
}));

const STEPS: StepId[] = ['overview', 'plan', 'identity', 'layout', 'listing', 'accounts', 'publish', 'releases'];
const STEP_CHECK: Partial<Record<StepId, CheckId>> = { plan: 'plan', identity: 'identity', layout: 'layout', listing: 'listing', accounts: 'accounts' };
const CHECK_STEP: Record<CheckId, StepId> = { plan: 'plan', identity: 'identity', layout: 'layout', listing: 'listing', accounts: 'accounts' };

const href = (step: StepId, rest: string[] = [], q?: Record<string, string | undefined>) =>
  link(`/appmaker${step === 'overview' ? '' : `/${step}`}${rest.map((r) => `/${encodeURIComponent(r)}`).join('')}`, q);

const now = () => new Date().toISOString();
const updDraft = (fn: (d: AppConfig) => AppConfig) => appStore.set((s) => ({ ...s, draft: fn(s.draft) }));

export function fmtDate(iso: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(iso));
}

export function stateTone(s: PState): Tone {
  if (s === 'published') return 'success';
  if (s === 'rejected' || s === 'build_failed' || s === 'upload_failed') return 'danger';
  if (s === 'action_required') return 'warning';
  if (s === 'not_included') return 'neutral';
  return 'info';
}

interface Ctx { t: Strings; lang: Lang; s: AMState; route: Route }

/** App Maker: the merchant designs and publishes a branded shopping app for their customers. `route` is below /appmaker. */
export default function AppMaker({ route }: { route: Route }) {
  const { lang } = useLang();
  const t = strings[lang];
  const s = appStore.use();
  const step = (STEPS.includes(route.path[0] as StepId) ? route.path[0] : 'overview') as StepId;
  const checks = readiness(s);
  const ctx: Ctx = { t, lang, s, route };

  return (
    <div className="am">
      <aside className="am-side">
        <div className="am-side-head">
          <span className="am-kicker">{t.title}</span>
          <strong className="am-merchant">{MERCHANT.name[lang]}</strong>
          <span className="muted small">{t.appFor}</span>
        </div>
        <nav aria-label={t.stepsLabel}>
          <ol className="am-steps">
            {STEPS.map((id, i) => {
              const c = STEP_CHECK[id] ? checks.find((x) => x.id === STEP_CHECK[id]) : undefined;
              return (
                <li key={id}>
                  <a href={href(id)} aria-current={step === id ? 'page' : undefined} className="am-step">
                    <span className={`am-step-n${c ? (c.ok ? ' ok' : ' no') : ''}`} aria-hidden="true">{c?.ok ? <Ico.check /> : i}</span>
                    <span className="grow">{t.steps[id]}</span>
                    {c && <span className="sr">{c.ok ? t.done : t.todo}</span>}
                    {c && !c.ok && <span className="am-step-flag" aria-hidden="true" />}
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>
        <p className="am-side-note"><Sim /> {t.simNote}</p>
      </aside>
      <div className="am-main">
        {step === 'overview' && <Overview {...ctx} />}
        {step === 'plan' && <PlanPage {...ctx} />}
        {step === 'identity' && <IdentityPage {...ctx} />}
        {step === 'layout' && <LayoutPage {...ctx} />}
        {step === 'listing' && <ListingPage {...ctx} />}
        {step === 'accounts' && <AccountsPage {...ctx} />}
        {step === 'publish' && <PublishPage {...ctx} />}
        {step === 'releases' && (route.path[1] ? <ReleaseDetail key={route.path[1]} {...ctx} id={route.path[1]} /> : <ReleasesPage {...ctx} />)}
      </div>
    </div>
  );
}

/* ---------- Shared pieces ---------- */

function EligibilityAlert({ t, s }: Ctx) {
  const e = eligibility(s.plan, s.addon);
  if (e.ok) return null;
  return <Alert tone="warning">{e.reason === 'plan' ? t.blockedPlan : t.blockedAddon} <a href={href('plan')}>{t.steps.plan}</a></Alert>;
}

function Tag({ kind, t }: { kind: 'binary' | 'config'; t: Strings }) {
  return <span className={`am-tag ${kind}`}>{kind === 'binary' ? <Ico.layers /> : <Ico.refresh />}{kind === 'binary' ? t.binaryTag : t.configTag}</span>;
}

/** Side preview panel: screen and device live in the URL so reload and deep links keep them. */
function Preview({ t, s, route, config }: Ctx & { config?: AppConfig }) {
  const screen = (SCREENS.includes(route.query.get('screen') as Screen) ? route.query.get('screen') : 'home') as Screen;
  const os = (route.query.get('os') === 'android' ? 'android' : 'ios') as OS;
  const [splashKey, setSplashKey] = useState(0);
  const base = `/appmaker/${route.path.join('/')}`;
  const q = (patch: Record<string, string | undefined>) => {
    const cur: Record<string, string> = {};
    route.query.forEach((v, k) => { cur[k] = v; });
    return link(base, { ...cur, ...patch });
  };
  return (
    <section className="am-preview" aria-labelledby="am-pv-h">
      <div className="am-preview-head">
        <h2 id="am-pv-h">{t.preview}</h2>
        <LinkTabs label={t.device} items={(['ios', 'android'] as OS[]).map((o) => ({ href: q({ os: o === 'ios' ? undefined : o }), label: o === 'ios' ? 'iOS' : 'Android', current: os === o }))} />
      </div>
      <LinkTabs label={t.screenLabel} items={SCREENS.map((sc) => ({ href: q({ screen: sc === 'home' ? undefined : sc }), label: t.screens[sc], current: screen === sc }))} />
      <PhonePreview config={config ?? s.draft} t={t} screen={screen} os={os} splashKey={splashKey} onScreen={(sc) => replace(q({ screen: sc === 'home' ? undefined : sc }))} />
      <div className="am-preview-foot">
        <button type="button" className="btn small" onClick={() => setSplashKey((k) => k + 1)}><Ico.play /> {t.replaySplash}</button>
        <p className="muted small">{t.previewNote}</p>
      </div>
    </section>
  );
}

function Work({ children, ctx, config }: { children: ReactNode; ctx: Ctx; config?: AppConfig }) {
  return (
    <div className="am-work">
      <div className="am-editor">{children}</div>
      <Preview {...ctx} config={config} />
    </div>
  );
}

/* ---------- Overview ---------- */

function Overview(ctx: Ctx) {
  const { t, s } = ctx;
  const checks = readiness(s);
  const live = liveConfig(s.releases);
  const change = live ? classifyChange(live, s.draft) : null;
  return (
    <>
      <PageHeader title={t.ovTitle} sub={t.notAdmin} actions={<a className="btn primary" href={href('publish')}>{t.goPublish}</a>} />
      <EligibilityAlert {...ctx} />
      <Work ctx={ctx}>
        <Card title={t.ovPlatforms} id="am-ov-p">
          <div className="am-platforms">
            {PLATFORMS.map((p) => {
              const lv = liveVersion(s.releases, p);
              const latest = [...s.releases].reverse().find((r) => r.kind === 'binary' && r.platforms[p].state !== 'not_included');
              const st = latest?.platforms[p];
              return (
                <div key={p} className="am-platform">
                  <div className="am-platform-head">{p === 'ios' ? <Ico.apple /> : <Ico.play />}<strong>{t.storeName[p]}</strong></div>
                  <dl className="am-dl">
                    <div><dt>{t.live}</dt><dd>{lv ? <><Id>{lv.version}</Id> <span className="muted small">· {t.buildN(lv.platforms[p].build)}</span></> : <span className="muted">{t.notLive}</span>}</dd></div>
                    {latest && st && latest !== lv && (
                      <div><dt>{t.latest}</dt><dd className="am-stack">
                        <span><Id>{latest.version}</Id> <Badge tone={stateTone(st.state)}>{t.pstates[st.state]}</Badge></span>
                        {st.issue && <span className="small">{t.issueText[st.issue].title}</span>}
                        {lv && st.state !== 'published' && <span className="muted small">{t.stillLive(lv.version)}</span>}
                      </dd></div>
                    )}
                  </dl>
                  {latest && <a className="btn small" href={href('releases', [latest.id])}>{t.openRelease} <Id>{latest.version}</Id></a>}
                </div>
              );
            })}
          </div>
        </Card>
        <Card title={t.ovChanges} id="am-ov-c">
          {!change || change.kind === 'none' ? <p className="muted">{t.ovNoChanges}</p> : (
            <>
              <p>{change.kind === 'binary' ? t.ovBinaryChanges : t.ovConfigChanges}</p>
              <ul className="am-chips">
                {change.binary.map((f) => <li key={f}><Tag kind="binary" t={t} /> {t.binaryFields[f]}</li>)}
                {change.config.map((f) => <li key={f}><Tag kind="config" t={t} /> {t.configFields[f]}</li>)}
              </ul>
              <a className="btn" href={href('publish')}>{t.goPublish}</a>
            </>
          )}
        </Card>
        <Card title={t.ovReady} id="am-ov-r"><Checklist t={t} checks={checks} /></Card>
      </Work>
    </>
  );
}

function Checklist({ t, checks }: { t: Strings; checks: { id: CheckId; ok: boolean }[] }) {
  return (
    <ul className="am-checks">
      {checks.map((c) => (
        <li key={c.id} className={c.ok ? 'ok' : 'no'}>
          <span className="am-check-ico" aria-hidden="true">{c.ok ? <Ico.check /> : <Ico.dot />}</span>
          <span className="grow">{t.checks[c.id]} <span className="sr">— {c.ok ? t.done : t.todo}</span></span>
          {!c.ok && <a className="btn small" href={href(CHECK_STEP[c.id])}>{t.fix}</a>}
        </li>
      ))}
    </ul>
  );
}

/* ---------- Plan ---------- */

function PlanPage({ t, s }: Ctx) {
  const [open, setOpen] = useState(false);
  const e = eligibility(s.plan, s.addon);
  return (
    <>
      <PageHeader title={t.planTitle} sub={t.planSub} />
      <ul className="am-plans" aria-label={t.planTitle}>
        {PLANS.map((p) => (
          <li key={p} className={`card am-plan${p === s.plan ? ' current' : ''}`}>
            <div className="am-plan-head"><strong>{t.plans[p]}</strong>{p === s.plan && <Badge tone="info">{t.yourPlan}</Badge>}</div>
            <span className={p === 'basic' ? 'muted' : ''}>{p === 'basic' ? t.notAvailable : t.asAddon}</span>
            <span className="muted small">{p === 'basic' ? '—' : t.priceTba}</span>
          </li>
        ))}
      </ul>
      <p className="muted small">{t.planNames}</p>
      {s.plan === 'basic' && <Alert tone="warning">{t.upgradeNeeded}</Alert>}
      <Card title={t.addon} id="am-addon" actions={<Badge tone={s.addon === 'active' ? 'success' : 'neutral'}>{s.addon === 'active' ? t.addonActive : t.addonNone}</Badge>}>
        <p>{t.addonWhy}</p>
        <p className="muted small">{t.priceTba}</p>
        {s.addon !== 'active' && (
          <div className="actions">
            <button type="button" className="btn primary" disabled={s.plan === 'basic'} aria-describedby={s.plan === 'basic' ? 'am-addon-why' : undefined} onClick={() => setOpen(true)}>{t.requestAddon}</button>
            <Sim />
            {s.plan === 'basic' && <span id="am-addon-why" className="muted small">{t.blockedPlan}</span>}
          </div>
        )}
        {!e.ok && e.reason === 'addon' && <p className="muted small">{t.blockedAddon}</p>}
      </Card>
      <TestPanel t={t}>
        <p className="muted small">{t.testPlanNote}</p>
        <div className="grid-2">
          <Field id="am-sim-plan" label={t.simPlan}>
            <select id="am-sim-plan" className="input" value={s.plan} onChange={(ev) => appStore.set((x) => ({ ...x, plan: ev.target.value as Plan }))}>
              {PLANS.map((p) => <option key={p} value={p}>{t.plans[p]}</option>)}
            </select>
          </Field>
          <Field id="am-sim-addon" label={t.simAddon}>
            <select id="am-sim-addon" className="input" value={s.addon} onChange={(ev) => appStore.set((x) => ({ ...x, addon: ev.target.value as Addon }))}>
              <option value="active">{t.addonActive}</option>
              <option value="none">{t.addonNone}</option>
            </select>
          </Field>
        </div>
      </TestPanel>
      {open && (
        <Dialog title={t.addonDialog} onClose={() => setOpen(false)} footer={<>
          <button type="button" className="btn" onClick={() => setOpen(false)}>{t.cancel}</button>
          <button type="button" className="btn primary" onClick={() => { appStore.set((x) => ({ ...x, addon: 'active' })); setOpen(false); }}>{t.confirmAddon}</button>
        </>}>
          <p>{t.addonScope}</p><p>{t.addonCost}</p><p>{t.addonEffect}</p><Sim />
        </Dialog>
      )}
    </>
  );
}

function TestPanel({ t, children, open }: { t: Strings; children: ReactNode; open?: boolean }) {
  return (
    <details className="am-test" open={open}>
      <summary><Ico.layers /> {t.testPanel} <Sim /></summary>
      <div className="am-test-body">{children}</div>
    </details>
  );
}

/* ---------- Identity ---------- */

function IdentityPage(ctx: Ctx) {
  const { t, lang, s } = ctx;
  const d = s.draft;
  const issues = nameIssues(d.name);
  const letter = (d.name[lang] || d.name.ar || '؟').slice(0, 1);
  const nameField = (k: keyof L, label: string) => {
    const err = issues[k];
    const v = d.name[k];
    return (
      <Field id={`am-name-${k}`} label={label} hint={t.nameHint(v.trim().length, NAME_MAX)} error={err ? (err === 'required' ? t.required : t.tooLong(NAME_MAX)) : undefined}>
        <input id={`am-name-${k}`} className="input" dir={k === 'ar' ? 'rtl' : 'ltr'} lang={k} value={v} aria-invalid={err ? 'true' : undefined}
          aria-describedby={err ? `am-name-${k}-err` : `am-name-${k}-hint`}
          onChange={(e) => updDraft((x) => ({ ...x, name: { ...x.name, [k]: e.target.value } }))} />
      </Field>
    );
  };
  return (
    <>
      <PageHeader title={t.idTitle} sub={t.idSub} />
      <EligibilityAlert {...ctx} />
      <Work ctx={ctx}>
        <Card title={<>{t.idTitle} <Tag kind="binary" t={t} /></>} id="am-id-name">
          <div className="grid-2">{nameField('ar', t.nameAr)}{nameField('en', t.nameEn)}</div>
        </Card>
        <Card title={<>{t.icon} <Tag kind="binary" t={t} /></>} id="am-id-icon">
          <fieldset>
            <legend className="sr">{t.icon}</legend>
            <p className="muted small">{t.iconHint} <Sim /></p>
            <div className="am-tiles">
              {ICONS.map((ic, i) => (
                <label key={ic.id} className="am-tile">
                  <input className="sr" type="radio" name="am-icon" value={ic.id} checked={d.iconId === ic.id} onChange={() => updDraft((x) => ({ ...x, iconId: ic.id }))} />
                  <IconArt tile={ic} letter={letter} size={64} />
                  <span className="small">{t.iconN(i + 1)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </Card>
        <Card title={t.splash} id="am-id-splash" actions={<Tag kind="binary" t={t} />}>
          <Swatches name="am-splash" label={t.splash} t={t} values={SPLASHES} value={d.splash} onChange={(c) => updDraft((x) => ({ ...x, splash: c }))} />
        </Card>
        <Card title={t.accent} id="am-id-accent" actions={<Tag kind="config" t={t} />}>
          <p className="muted small">{t.accentHint}</p>
          <Swatches name="am-accent" label={t.accent} t={t} values={ACCENTS} value={d.accent} onChange={(c) => updDraft((x) => ({ ...x, accent: c }))} />
        </Card>
      </Work>
    </>
  );
}

function Swatches({ name, label, values, value, onChange, t }: { name: string; label: string; values: string[]; value: string; onChange: (v: string) => void; t: Strings }) {
  return (
    <fieldset>
      <legend className="sr">{label}</legend>
      <div className="am-swatches">
        {values.map((c) => (
          <label key={c} className="am-swatch" title={c}>
            <input className="sr" type="radio" name={name} value={c} checked={value === c} onChange={() => onChange(c)} />
            <span style={{ background: c }} aria-hidden="true" />
            <span className="sr">{t.colour(c)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ---------- Home layout ---------- */

function LayoutPage(ctx: Ctx) {
  const { t, lang, s, route } = ctx;
  const d = s.draft;
  const [msg, setMsg] = useState('');
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => { if (focus) { document.getElementById(focus)?.focus(); setFocus(null); } }, [focus]);
  useEffect(() => {
    if (route.query.get('focus') === 'features') document.getElementById('am-features')?.scrollIntoView({ block: 'start' });
  }, [route.query]);

  const label = (type: SectionType) => t.sectionTypes[type];
  const move = (id: string, delta: number, i: number) => {
    const next = moveSection(d.sections, id, delta);
    if (next === d.sections) return;
    updDraft((x) => ({ ...x, sections: next }));
    const sec = d.sections[i];
    const pos = i + delta;
    setMsg(t.moved(sec.title[lang] || label(sec.type), pos + 1));
    const edge = (delta < 0 && pos === 0) || (delta > 0 && pos === d.sections.length - 1);
    setFocus(`am-sec-${id}-${edge ? (delta < 0 ? 'down' : 'up') : delta < 0 ? 'up' : 'down'}`);
  };
  const remove = (id: string, i: number) => {
    const sec = d.sections[i];
    updDraft((x) => ({ ...x, sections: removeSection(x.sections, id) }));
    setMsg(t.removed(sec.title[lang] || label(sec.type)));
    const neighbour = d.sections[i + 1] ?? d.sections[i - 1];
    setFocus(neighbour ? `am-sec-${neighbour.id}-title` : 'am-add-h');
  };
  const add = (type: SectionType) => {
    const id = `s${Date.now().toString(36)}`;
    const title: L = { ar: strings.ar.sectionTypes[type], en: strings.en.sectionTypes[type] };
    updDraft((x) => ({ ...x, sections: addSection(x.sections, { id, type, title }) }));
    setMsg(t.added(label(type)));
  };

  return (
    <>
      <PageHeader title={t.layTitle} sub={t.laySub} />
      <EligibilityAlert {...ctx} />
      <p className="sr" role="status" aria-live="polite">{msg}</p>
      <Work ctx={ctx}>
        <Card title={<>{t.sections} <Tag kind="config" t={t} /></>} id="am-sections" pad={false}>
          {d.sections.length === 0 ? <Empty>{t.noSections}</Empty> : (
            <ol className="am-sections">
              {d.sections.map((sec, i) => (
                <li key={sec.id} className="am-section">
                  <span className="am-section-n" aria-hidden="true">{i + 1}</span>
                  <div className="am-section-main">
                    <strong id={`am-sec-${sec.id}-title`} tabIndex={-1}>{label(sec.type)}</strong>
                    <span className="muted small">{t.sectionHelp[sec.type]}</span>
                    <div className="am-section-fields">
                      {(['ar', 'en'] as const).map((k) => (
                        <div key={k} className="field">
                          <label htmlFor={`am-sec-${sec.id}-${k}`} className="small">{k === 'ar' ? t.titleAr : t.titleEn}</label>
                          <input id={`am-sec-${sec.id}-${k}`} className="input" dir={k === 'ar' ? 'rtl' : 'ltr'} lang={k} value={sec.title[k]} maxLength={40}
                            onChange={(e) => updDraft((x) => ({ ...x, sections: x.sections.map((y) => y.id === sec.id ? { ...y, title: { ...y.title, [k]: e.target.value } } : y) }))} />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="am-section-tools">
                    <button id={`am-sec-${sec.id}-up`} type="button" className="btn am-icon-btn" disabled={i === 0} aria-label={t.moveUp(label(sec.type))} onClick={() => move(sec.id, -1, i)}><Ico.up /></button>
                    <button id={`am-sec-${sec.id}-down`} type="button" className="btn am-icon-btn" disabled={i === d.sections.length - 1} aria-label={t.moveDown(label(sec.type))} onClick={() => move(sec.id, 1, i)}><Ico.down /></button>
                    <button type="button" className="btn am-icon-btn danger" aria-label={t.remove(label(sec.type))} onClick={() => remove(sec.id, i)}><Ico.trash /></button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card title={<span id="am-add-h" tabIndex={-1}>{t.addSection}</span>} id="am-add">
          {d.sections.length >= MAX_SECTIONS && <p className="muted small">{t.maxReached(MAX_SECTIONS)}</p>}
          <ul className="am-palette">
            {SECTION_TYPES.map((type) => {
              const ok = canAdd(d.sections, type);
              return (
                <li key={type}>
                  <button type="button" className="am-palette-btn" disabled={!ok.ok} onClick={() => add(type)} aria-describedby={`am-pal-${type}`}>
                    <Ico.plus /><span className="grow"><strong>{label(type)}</strong><span id={`am-pal-${type}`} className="muted small">{!ok.ok && ok.reason === 'single' ? t.singleOnly : t.sectionHelp[type]}</span></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title={t.productLayout} id="am-pl" actions={<Tag kind="config" t={t} />}>
          <fieldset>
            <legend className="sr">{t.productLayout}</legend>
            <div className="am-seg">
              {(['grid', 'list'] as const).map((v) => (
                <label key={v} className="radio"><input type="radio" name="am-pl" checked={d.productLayout === v} onChange={() => updDraft((x) => ({ ...x, productLayout: v }))} />{t[v]}</label>
              ))}
            </div>
          </fieldset>
        </Card>
        <section className="card" id="am-features" aria-labelledby="am-features-h">
          <div className="card-head"><h2 id="am-features-h">{t.features}</h2><Tag kind="binary" t={t} /></div>
          <div className="card-body">
            <p className="muted small">{t.featuresHint}</p>
            <ul className="am-features">
              {FEATURE_KEYS.map((k) => (
                <li key={k}>
                  <label className="check">
                    <input type="checkbox" checked={d.features[k]} onChange={(e) => updDraft((x) => ({ ...x, features: { ...x.features, [k]: e.target.checked } }))} aria-describedby={`am-f-${k}`} />
                    <span><strong>{t.featureNames[k]}</strong><span id={`am-f-${k}`} className="muted small am-block">{t.featureHelp[k]}</span></span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </Work>
    </>
  );
}

/* ---------- Store listing ---------- */

function ListingPage(ctx: Ctx) {
  const { t, s } = ctx;
  const l = s.listing;
  const issues = listingIssues(l);
  const set = (patch: Partial<Listing>) => appStore.set((x) => ({ ...x, listing: { ...x.listing, ...patch } }));
  const err = (f: ListingField) => (issues[f] ? t.issues[issues[f]!] : undefined);
  const desc = (f: ListingField, hint?: string) => ({ 'aria-invalid': issues[f] ? ('true' as const) : undefined, 'aria-describedby': issues[f] ? `am-${f}-err` : hint ? `am-${f}-hint` : undefined });

  const textField = (f: ListingField, label: string, value: string, onChange: (v: string) => void, max: number, opts: { area?: boolean; dir?: 'rtl' | 'ltr'; wide?: boolean } = {}) => (
    <div className={opts.wide ? 'am-wide' : undefined}>
      <Field id={`am-${f}`} label={label} hint={t.count(value.trim().length, max)} error={err(f)}>
        {opts.area
          ? <textarea id={`am-${f}`} className="input" dir={opts.dir} value={value} onChange={(e) => onChange(e.target.value)} {...desc(f, 'h')} />
          : <input id={`am-${f}`} className="input" dir={opts.dir} value={value} onChange={(e) => onChange(e.target.value)} {...desc(f, 'h')} />}
      </Field>
    </div>
  );

  return (
    <>
      <PageHeader title={t.lsTitle} sub={t.lsSub} />
      <EligibilityAlert {...ctx} />
      <Work ctx={ctx}>
        <Card title={t.lsTitle} id="am-ls">
          <p className="muted small">{t.draftKept}</p>
          <div className="am-form">
            {textField('subtitleAr', t.subtitleAr, l.subtitle.ar, (v) => set({ subtitle: { ...l.subtitle, ar: v } }), LIMITS.subtitle, { dir: 'rtl' })}
            {textField('subtitleEn', t.subtitleEn, l.subtitle.en, (v) => set({ subtitle: { ...l.subtitle, en: v } }), LIMITS.subtitle, { dir: 'ltr' })}
            {textField('descriptionAr', t.descriptionAr, l.description.ar, (v) => set({ description: { ...l.description, ar: v } }), LIMITS.description, { area: true, dir: 'rtl', wide: true })}
            {textField('descriptionEn', t.descriptionEn, l.description.en, (v) => set({ description: { ...l.description, en: v } }), LIMITS.description, { area: true, dir: 'ltr', wide: true })}
            {textField('keywords', t.keywords, l.keywords, (v) => set({ keywords: v }), LIMITS.keywords, { wide: true })}
            <Field id="am-category" label={t.category} error={err('category')}>
              <select id="am-category" className="input" value={l.category} onChange={(e) => set({ category: e.target.value })} {...desc('category')}>
                <option value="">{t.choose}</option>
                {Object.entries(t.cats).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <span />
            <Field id="am-supportUrl" label={t.supportUrl} hint={t.urlHint} error={err('supportUrl')}>
              <input id="am-supportUrl" className="input" dir="ltr" type="url" inputMode="url" value={l.supportUrl} onChange={(e) => set({ supportUrl: e.target.value })} {...desc('supportUrl', 'h')} />
            </Field>
            <Field id="am-privacyUrl" label={t.privacyUrl} hint={t.urlHint} error={err('privacyUrl')}>
              <input id="am-privacyUrl" className="input" dir="ltr" type="url" inputMode="url" value={l.privacyUrl} onChange={(e) => set({ privacyUrl: e.target.value })} {...desc('privacyUrl', 'h')} />
            </Field>
            <div className="am-wide">
              <Field id="am-reviewNotes" label={t.reviewNotes} hint={t.reviewNotesHint}>
                <textarea id="am-reviewNotes" className="input" value={l.reviewNotes} onChange={(e) => set({ reviewNotes: e.target.value })} aria-describedby="am-reviewNotes-hint" />
              </Field>
            </div>
          </div>
        </Card>
        <Card title={t.screenshots} id="am-shots" actions={<Sim />}>
          <p className="muted small">{t.screenshotsHint}</p>
          {issues.screenshots && <p className="error" role="alert">{t.shotsNeeded(SCREENSHOT_SLOTS)}</p>}
          <ul className="am-shots">
            {Array.from({ length: SCREENSHOT_SLOTS }, (_, i) => (
              <li key={i} className={i < l.screenshots ? 'filled' : ''}>
                {i < l.screenshots ? <MiniShot config={s.draft} n={i} /> : <span className="am-shot-empty"><Ico.image /></span>}
                <span className="small">{t.slot(i + 1)} · {t.placeholder}</span>
              </li>
            ))}
          </ul>
          <div className="actions">
            <button type="button" className="btn" onClick={() => set({ screenshots: SCREENSHOT_SLOTS })}>{l.screenshots ? t.regenerate : t.generate}</button>
            {l.screenshots > 0 && <button type="button" className="btn" onClick={() => set({ screenshots: 0 })}>{t.clearShots}</button>}
          </div>
        </Card>
      </Work>
    </>
  );
}

/** A schematic screenshot placeholder in the merchant's colours. */
function MiniShot({ config, n }: { config: AppConfig; n: number }) {
  const a = config.accent;
  return (
    <svg viewBox="0 0 90 160" className="am-shot" aria-hidden="true">
      <rect width="90" height="160" rx="8" fill="#fffaf3" />
      {n === 0 && <><rect x="6" y="14" width="78" height="44" rx="5" fill={a} /><rect x="6" y="66" width="36" height="40" rx="4" fill="#e7dccd" /><rect x="48" y="66" width="36" height="40" rx="4" fill="#e7dccd" /><rect x="6" y="112" width="36" height="40" rx="4" fill="#e7dccd" /><rect x="48" y="112" width="36" height="40" rx="4" fill="#e7dccd" /></>}
      {n === 1 && <><rect x="0" y="10" width="90" height="70" fill="#e7dccd" /><rect x="8" y="88" width="50" height="7" rx="3" fill="#3a2a20" /><rect x="8" y="100" width="30" height="6" rx="3" fill={a} /><rect x="8" y="136" width="74" height="14" rx="7" fill={a} /></>}
      {n === 2 && <>{[20, 44, 68].map((y) => <g key={y}><rect x="8" y={y} width="18" height="18" rx="3" fill="#e7dccd" /><rect x="32" y={y + 3} width="40" height="5" rx="2" fill="#3a2a20" /><rect x="32" y={y + 11} width="22" height="4" rx="2" fill={a} /></g>)}<rect x="8" y="136" width="74" height="14" rx="7" fill={a} /></>}
    </svg>
  );
}

/* ---------- Publishing accounts ---------- */

function AccountsPage({ t, s }: Ctx) {
  const [confirm, setConfirm] = useState<Platform | null>(null);
  const setAcc = (p: Platform, v: 'connected' | 'missing') => appStore.set((x) => ({ ...x, accounts: { ...x.accounts, [p]: v } }));
  return (
    <>
      <PageHeader title={t.acTitle} sub={t.acSub} />
      <div className="am-signing" role="note"><Ico.shield /><div><strong>{t.signing}</strong><p>{t.signingBody}</p></div></div>
      <div className="am-accounts">
        {PLATFORMS.map((p) => {
          const st = s.accounts[p];
          const name = p === 'ios' ? t.apple : t.google;
          return (
            <section key={p} className="card am-account" aria-labelledby={`am-acc-${p}`}>
              <div className="card-head">
                <h2 id={`am-acc-${p}`} className="am-row">{p === 'ios' ? <Ico.apple /> : <Ico.play />}{name}</h2>
                <Badge tone={st === 'connected' ? 'success' : 'danger'}>{st === 'connected' ? t.connected : t.missing}</Badge>
              </div>
              <div className="card-body">
                {st === 'connected'
                  ? <p><span className="muted">{t.team}:</span> <Id>{p === 'ios' ? 'Nakhla Roasting Co. (7XK2M4Q9TA)' : 'Nakhla Roasting Co. · 4821-0937'}</Id></p>
                  : <Alert tone="warning">{t.missingNote}</Alert>}
                <div>
                  <strong className="small">{t.needs}</strong>
                  <ul className="am-needs">
                    {(p === 'ios' ? t.appleNeeds : t.googleNeeds).map((n) => (
                      <li key={n} className={st === 'connected' ? 'ok' : 'no'}>
                        <span aria-hidden="true">{st === 'connected' ? <Ico.check /> : <Ico.dot />}</span>{n}
                        <span className="sr"> — {st === 'connected' ? t.done : t.todo}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="actions">
                  {st === 'connected'
                    ? <button type="button" className="btn" onClick={() => setConfirm(p)}>{t.disconnect}</button>
                    : <button type="button" className="btn primary" onClick={() => setAcc(p, 'connected')}>{t.connect}</button>}
                </div>
              </div>
            </section>
          );
        })}
      </div>
      {confirm && (
        <Dialog title={t.disconnectTitle(confirm === 'ios' ? t.apple : t.google)} onClose={() => setConfirm(null)} footer={<>
          <button type="button" className="btn" onClick={() => setConfirm(null)}>{t.cancel}</button>
          <button type="button" className="btn primary" onClick={() => { setAcc(confirm, 'missing'); setConfirm(null); }}>{t.disconnect}</button>
        </>}>
          <p>{t.disconnectBody}</p><Sim />
        </Dialog>
      )}
    </>
  );
}

/* ---------- Review & publish ---------- */

function PublishPage(ctx: Ctx) {
  const { t, s } = ctx;
  const checks = readiness(s);
  const ready = checks.every((c) => c.ok);
  const live = liveConfig(s.releases);
  const change = live ? classifyChange(live, s.draft) : null;
  const cfgBlock = configUpdateBlock(s.releases, s.draft);
  const active = s.releases.find(isActive);
  const [platforms, setPlatforms] = useState<Platform[]>(PLATFORMS.filter((p) => s.accounts[p] === 'connected'));
  const chosen = platforms.filter((p) => s.accounts[p] === 'connected');
  const [dialog, setDialog] = useState<'config' | 'binary' | null>(null);
  const pending = createRelease(s.releases, s.draft, chosen, now(), 'preview');
  const submitBlock = active ? t.activeBlock : !ready ? t.notReady : !chosen.length ? t.noPlatform : null;

  const doConfig = () => {
    const id = `r${s.seq}`;
    const r = createConfigUpdate(s.releases, s.draft, now(), id);
    if (!r) return;
    appStore.set((x) => ({ ...x, releases: [...x.releases, r], seq: x.seq + 1 }));
    setDialog(null);
    navigate(href('releases', [id]));
  };
  const doSubmit = () => {
    const id = `r${s.seq}`;
    const r = createRelease(s.releases, s.draft, chosen, now(), id);
    appStore.set((x) => ({ ...x, releases: [...x.releases, r], seq: x.seq + 1 }));
    setDialog(null);
    navigate(href('releases', [id]));
  };

  return (
    <>
      <PageHeader title={t.pbTitle} sub={t.pbSub} />
      <EligibilityAlert {...ctx} />
      {active && <Alert tone="info">{t.activeBlock} <a href={href('releases', [active.id])}>{t.openRelease} <Id>{active.version}</Id></a></Alert>}
      <div className="cols">
        <div className="col-main">
          <Card title={t.changesSince} id="am-pb-ch">
            {!change || change.kind === 'none' ? <p className="muted">{t.ovNoChanges}</p> : (
              <div className="am-diff">
                <div><Tag kind="binary" t={t} /><ul>{change.binary.length ? change.binary.map((f) => <li key={f}>{t.binaryFields[f]}</li>) : <li className="muted">{t.none}</li>}</ul></div>
                <div><Tag kind="config" t={t} /><ul>{change.config.length ? change.config.map((f) => <li key={f}>{t.configFields[f]}</li>) : <li className="muted">{t.none}</li>}</ul></div>
              </div>
            )}
          </Card>
          <div className="am-paths">
            <section className="card am-path" aria-labelledby="am-cfg-h">
              <div className="card-body">
                <span className="am-path-ico"><Ico.refresh /></span>
                <h2 id="am-cfg-h">{t.cfgTitle}</h2>
                <p className="muted">{t.cfgBody}</p>
                {cfgBlock && <p className="small" id="am-cfg-why">{t.cfgBlocks[cfgBlock]}</p>}
                <div className="actions">
                  <button type="button" className="btn primary" disabled={!!cfgBlock || !eligibility(s.plan, s.addon).ok} aria-describedby={cfgBlock ? 'am-cfg-why' : undefined} onClick={() => setDialog('config')}>{t.cfgBtn}</button>
                  <Sim />
                </div>
              </div>
            </section>
            <section className="card am-path" aria-labelledby="am-bin-h">
              <div className="card-body">
                <span className="am-path-ico"><Ico.layers /></span>
                <h2 id="am-bin-h">{t.binTitle} <Id>{pending.version}</Id></h2>
                <p className="muted">{t.binBody}</p>
                <p className="small">{t.lakWindow}</p>
                <fieldset>
                  <legend className="small">{t.platformsLabel}</legend>
                  {PLATFORMS.map((p) => {
                    const ok = s.accounts[p] === 'connected';
                    return (
                      <label key={p} className="check">
                        <input type="checkbox" disabled={!ok} checked={ok && platforms.includes(p)} onChange={(e) => setPlatforms((cur) => e.target.checked ? [...cur, p] : cur.filter((x) => x !== p))} />
                        <span>{t.storeName[p]}{!ok && <span className="muted small"> — {t.noAccount} · <a href={href('accounts')}>{t.steps.accounts}</a></span>}</span>
                      </label>
                    );
                  })}
                </fieldset>
                {submitBlock && <p className="small" id="am-bin-why">{submitBlock}</p>}
                <div className="actions">
                  <button type="button" className="btn primary" disabled={!!submitBlock} aria-describedby={submitBlock ? 'am-bin-why' : undefined} onClick={() => setDialog('binary')}>{t.submit}</button>
                  <Sim />
                </div>
              </div>
            </section>
          </div>
        </div>
        <div className="col-side">
          <Card title={t.ovReady} id="am-pb-r"><Checklist t={t} checks={checks} /></Card>
          <p className="muted small">{t.rollbackNote}</p>
        </div>
      </div>
      {dialog === 'config' && (
        <Dialog title={t.cfgDialog} onClose={() => setDialog(null)} footer={<>
          <button type="button" className="btn" onClick={() => setDialog(null)}>{t.cancel}</button>
          <button type="button" className="btn primary" onClick={doConfig}>{t.cfgConfirm}</button>
        </>}>
          <p>{t.cfgScope}</p>
          <ul className="am-bullets">{change?.config.map((f) => <li key={f}>{t.configFields[f]}</li>)}</ul>
          <p>{t.cfgNoReview}</p><Sim />
        </Dialog>
      )}
      {dialog === 'binary' && (
        <Dialog title={t.submitDialog} onClose={() => setDialog(null)} footer={<>
          <button type="button" className="btn" onClick={() => setDialog(null)}>{t.cancel}</button>
          <button type="button" className="btn primary" onClick={doSubmit}>{t.submitConfirm}</button>
        </>}>
          <p className="strong">{t.submitScope(pending.version, chosen.map((p) => t.storeName[p]).join(' + '))}</p>
          <p>{t.submitWhat}</p>
          <p className="muted small">{t.lakWindow}</p>
          <Sim />
        </Dialog>
      )}
    </>
  );
}

/* ---------- Release history ---------- */

function ReleasesPage({ t, lang, s }: Ctx) {
  const rows = [...s.releases].reverse();
  const cell = (r: Release, p: Platform) => {
    if (r.kind === 'config') return <span className="muted small">{t.applied}</span>;
    const run = r.platforms[p];
    if (run.state === 'not_included') return <span className="muted small">{t.pstates.not_included}</span>;
    return <span className="am-stack"><Badge tone={stateTone(run.state)}>{t.pstates[run.state]}</Badge><span className="muted small">{t.buildN(run.build)}</span></span>;
  };
  return (
    <>
      <PageHeader title={t.rlTitle} sub={t.rlSub} />
      <section className="card" aria-label={t.rlTitle}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t.version}</th><th>{t.type}</th><th>{t.created}</th><th>{t.lakReview}</th><th>{t.ios}</th><th>{t.android}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><a href={href('releases', [r.id])} className="strong">{r.kind === 'config' ? t.configRev(r.version, r.rev) : <Id>{r.version}</Id>}</a></td>
                  <td>{r.kind === 'binary' ? t.kindBinary : t.kindConfig}</td>
                  <td className="small">{fmtDate(r.createdAt, lang)}</td>
                  <td>{r.kind === 'config' ? <span className="muted small">{t.lakStates.none}</span> : <Badge tone={r.lak === 'approved' ? 'success' : r.lak === 'changes' ? 'warning' : 'info'}>{t.lakStates[r.lak]}</Badge>}</td>
                  <td>{cell(r, 'ios')}</td>
                  <td>{cell(r, 'android')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="muted small">{t.rollbackNote}</p>
    </>
  );
}

const STAGE_ICON = { done: Ico.check, current: Ico.clock, failed: Ico.x, action: Ico.alert, todo: Ico.dot };

function ReleaseDetail({ t, lang, s, id }: Ctx & { id: string }) {
  const r = s.releases.find((x) => x.id === id);
  const [restored, setRestored] = useState(false);
  if (!r) return <><a className="back" href={href('releases')}>{t.allReleases}</a><Empty>{t.notFound}</Empty></>;
  const update = (e: SimEvent) => appStore.set((x) => ({ ...x, releases: x.releases.map((y) => (y.id === r.id ? apply(y, e, now()) : y)) }));

  if (r.kind === 'config') {
    return (
      <>
        <a className="back" href={href('releases')}>{t.allReleases}</a>
        <PageHeader title={t.configRev(r.version, r.rev)} sub={fmtDate(r.createdAt, lang)} actions={<Badge tone="success">{t.applied}</Badge>} />
        <Card title={t.cfgTitle} id="am-rc">
          <p>{t.cfgBody}</p>
          <p className="muted small">{t.rollbackNote}</p>
          <div className="actions">
            <button type="button" className="btn" onClick={() => { updDraft(() => r.config); setRestored(true); }}>{t.restore}</button>
          </div>
          {restored && <Alert tone="success">{t.restored} <a href={href('publish')}>{t.steps.publish}</a></Alert>}
        </Card>
        <Log t={t} lang={lang} r={r} />
      </>
    );
  }

  const included = PLATFORMS.filter((p) => r.platforms[p].state !== 'not_included');
  return (
    <>
      <a className="back" href={href('releases')}>{t.allReleases}</a>
      <PageHeader title={<>{t.kindBinary} <Id>{r.version}</Id></>} sub={fmtDate(r.createdAt, lang)}
        actions={<Badge tone={r.lak === 'approved' ? 'success' : r.lak === 'changes' ? 'warning' : 'info'}>{t.lakReview}: {t.lakStates[r.lak]}</Badge>} />
      {r.lak === 'changes' && r.lakIssue && <IssueBox t={t} code={r.lakIssue} />}
      <div className="am-runs">
        {included.map((p) => {
          const run = r.platforms[p];
          const st = stages(r, p);
          const lv = liveVersion(s.releases, p);
          return (
            <section key={p} className="card am-run" aria-labelledby={`am-run-${p}`}>
              <div className="card-head">
                <h2 id={`am-run-${p}`} className="am-row">{p === 'ios' ? <Ico.apple /> : <Ico.play />}{t.storeName[p]} <span className="muted small">· {t.buildN(run.build)}</span></h2>
                <Badge tone={stateTone(run.state)}>{t.pstates[run.state]}</Badge>
              </div>
              <div className="card-body">
                <ol className="am-stages" aria-label={t.stagesLabel(t.storeName[p])}>
                  {STAGES.map((sid) => {
                    const I = STAGE_ICON[st[sid]];
                    return (
                      <li key={sid} className={`am-stage ${st[sid]}`}>
                        <span className="am-stage-ico" aria-hidden="true"><I /></span>
                        <span className="am-stage-text"><span>{t.stageNames[sid]}</span><span className="small">{t.stageStatus[st[sid]]}</span></span>
                      </li>
                    );
                  })}
                </ol>
                {run.state !== 'published' && (ACTIVE.includes(run.state) || run.issue) && (
                  <p className="muted small">{t.notPublished(t.storeName[p])}{lv && lv.id !== r.id ? ` ${t.stillLive(lv.version)}` : ''}</p>
                )}
                {run.issue && <IssueBox t={t} code={run.issue} />}
                <div className="actions">
                  {(run.state === 'build_failed' || run.state === 'upload_failed') && <><button type="button" className="btn primary" onClick={() => update({ type: 'rebuild', platform: p })}>{t.rebuild}</button><Sim /></>}
                  {run.state === 'action_required' && <><button type="button" className="btn primary" onClick={() => update({ type: 'resolve', platform: p })}>{t.resolve}</button><Sim /></>}
                  {run.state === 'rejected' && <a className="btn primary" href={href('publish')}>{t.newVersion}</a>}
                </div>
              </div>
            </section>
          );
        })}
      </div>
      <SimPanel t={t} r={r} included={included} onRun={update} />
      <Log t={t} lang={lang} r={r} />
    </>
  );
}

function IssueBox({ t, code }: { t: Strings; code: IssueCode }) {
  const it = t.issueText[code];
  const meta = ISSUES[code];
  const target = meta.fix === 'listing' ? href('listing') : meta.fix === 'accounts' ? href('accounts') : meta.fix === 'layout' ? href('layout', [], { focus: 'features' }) : null;
  return (
    <div className="am-issue" role="group" aria-label={it.title}>
      <div className="am-row"><Ico.alert /><strong>{it.title}</strong>{meta.binary && <span className="am-tag binary">{t.needsBinary}</span>}</div>
      <dl className="am-dl">
        <div><dt>{t.cause}</dt><dd>{it.cause}</dd></div>
        <div><dt>{t.howFix}</dt><dd>{it.fix}</dd></div>
      </dl>
      {target && <a className="btn small" href={target}>{t.fixLinks[meta.fix as 'listing' | 'accounts' | 'layout']}</a>}
    </div>
  );
}

function SimPanel({ t, r, included, onRun }: { t: Strings; r: Release; included: Platform[]; onRun: (e: SimEvent) => void }) {
  const [lak, setLak] = useState<'approve' | 'changes'>('approve');
  const [pick, setPick] = useState<Record<string, string>>({});
  const waitingLak = r.lak === 'in_review';
  return (
    <TestPanel t={t} open={isActive(r)}>
      <p className="muted small">{t.testHint}</p>
      <p className="small">{t.qa21}</p>
      {waitingLak && (
        <div className="am-sim-row">
          <strong>{t.steps2.lak}</strong>
          <Field id="am-sim-lak" label={t.outcome}>
            <select id="am-sim-lak" className="input" value={lak} onChange={(e) => setLak(e.target.value as 'approve' | 'changes')}>
              <option value="approve">{t.outcomes.approve}</option><option value="changes">{t.outcomes.changes}</option>
            </select>
          </Field>
          <button type="button" className="btn" onClick={() => onRun({ type: 'lak', outcome: lak })}>{t.run}</button>
        </div>
      )}
      {!waitingLak && included.map((p) => {
        const step = awaiting(r, p);
        if (!step || step === 'lak') return <p key={p} className="muted small">{t.storeName[p]}: {t.nothingToRun}</p>;
        const options = step === 'store' ? ['approve', 'reject', 'action'] : ['ok', 'fail'];
        const key = `${p}-${step}`;
        const value = pick[key] ?? options[0];
        const run = () => {
          if (step === 'store') onRun({ type: 'store', platform: p, outcome: value as 'approve' | 'reject' | 'action' });
          else onRun({ type: step, platform: p, outcome: value as 'ok' | 'fail' });
        };
        return (
          <div key={p} className="am-sim-row">
            <strong>{t.storeName[p]} · {t.steps2[step]}</strong>
            <Field id={`am-sim-${key}`} label={t.outcome}>
              <select id={`am-sim-${key}`} className="input" value={value} onChange={(e) => setPick((x) => ({ ...x, [key]: e.target.value }))}>
                {options.map((o) => <option key={o} value={o}>{t.outcomes[o as keyof Strings['outcomes']]}</option>)}
              </select>
            </Field>
            <button type="button" className="btn" onClick={run}>{t.run}</button>
          </div>
        );
      })}
    </TestPanel>
  );
}

function Log({ t, lang, r }: { t: Strings; lang: Lang; r: Release }) {
  const items = [...r.log].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Card title={t.history} id="am-log">
      <ol className="am-log">
        {items.map((e, i) => (
          <li key={i}>
            <span className="muted small am-when">{fmtDate(e.at, lang)}</span>
            <span className="grow">{e.platform && <b>{t.storeName[e.platform]} · </b>}{t.log[e.kind]}{e.build ? <span className="muted"> · {t.buildN(e.build)}</span> : null}{e.issue && <span className="muted"> — {t.issueText[e.issue].title}</span>}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
