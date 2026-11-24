/* App Maker domain: pure logic only (eligibility, layout edits, change classification, readiness, release state machine).
   Everything here is a simulation contract for the prototype; signing, builds and store uploads happen on a server, never here. */
import type { L } from '../../core/lang';

/* ---------- Plan and add-on eligibility (source: App Maker is a paid add-on from Plus upward) ---------- */

export type Plan = 'basic' | 'plus' | 'pro' | 'special';
export const PLANS: Plan[] = ['basic', 'plus', 'pro', 'special'];
export type Addon = 'none' | 'active';

export type Eligibility = { ok: true } | { ok: false; reason: 'plan' | 'addon' };

export function eligibility(plan: Plan, addon: Addon): Eligibility {
  if (plan === 'basic') return { ok: false, reason: 'plan' };
  if (addon !== 'active') return { ok: false, reason: 'addon' };
  return { ok: true };
}

/* ---------- App configuration ---------- */

export type SectionType = 'hero' | 'categories' | 'featured' | 'banner' | 'newArrivals' | 'bestSellers';
export const SECTION_TYPES: SectionType[] = ['hero', 'categories', 'featured', 'banner', 'newArrivals', 'bestSellers'];
export const MAX_SECTIONS = 8;
/** Sections that may appear only once on the home screen. */
export const SINGLE: SectionType[] = ['hero', 'categories'];

export interface Section { id: string; type: SectionType; title: L }

export interface Features { push: boolean; wishlist: boolean; loyalty: boolean; reviews: boolean; accountDeletion: boolean }
export const FEATURE_KEYS: (keyof Features)[] = ['push', 'wishlist', 'loyalty', 'reviews', 'accountDeletion'];

export interface AppConfig {
  name: L;
  iconId: string;
  splash: string;
  accent: string;
  productLayout: 'grid' | 'list';
  sections: Section[];
  features: Features;
}

export const NAME_MAX = 30;

export function nameIssues(name: L): { ar?: 'required' | 'tooLong'; en?: 'required' | 'tooLong' } {
  const check = (v: string) => (!v.trim() ? 'required' : v.trim().length > NAME_MAX ? 'tooLong' : undefined);
  const out: { ar?: 'required' | 'tooLong'; en?: 'required' | 'tooLong' } = {};
  const a = check(name.ar); const e = check(name.en);
  if (a) out.ar = a;
  if (e) out.en = e;
  return out;
}

export function canAdd(sections: Section[], type: SectionType): { ok: true } | { ok: false; reason: 'max' | 'single' } {
  if (sections.length >= MAX_SECTIONS) return { ok: false, reason: 'max' };
  if (SINGLE.includes(type) && sections.some((s) => s.type === type)) return { ok: false, reason: 'single' };
  return { ok: true };
}

export function addSection(sections: Section[], section: Section): Section[] {
  return canAdd(sections, section.type).ok ? [...sections, section] : sections;
}

export function removeSection(sections: Section[], id: string): Section[] {
  return sections.filter((s) => s.id !== id);
}

/** Move a section by `delta` positions (keyboard/button friendly; no drag needed). Out-of-range moves are no-ops. */
export function moveSection(sections: Section[], id: string, delta: number): Section[] {
  const from = sections.findIndex((s) => s.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= sections.length) return sections;
  const next = sections.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/* ---------- Config update vs binary update ---------- */

/** Fields baked into the installed binary: changing them needs a new build and store review. */
export type BinaryField = 'name' | 'icon' | 'splash' | 'features';
/** Fields the app downloads at launch: changing them is a config update with no store review. */
export type ConfigField = 'accent' | 'productLayout' | 'sections';

export interface ChangeSet { kind: 'none' | 'config' | 'binary'; binary: BinaryField[]; config: ConfigField[] }

export function classifyChange(live: AppConfig, draft: AppConfig): ChangeSet {
  const binary: BinaryField[] = [];
  const config: ConfigField[] = [];
  if (live.name.ar !== draft.name.ar || live.name.en !== draft.name.en) binary.push('name');
  if (live.iconId !== draft.iconId) binary.push('icon');
  if (live.splash !== draft.splash) binary.push('splash');
  if (FEATURE_KEYS.some((k) => live.features[k] !== draft.features[k])) binary.push('features');
  if (live.accent !== draft.accent) config.push('accent');
  if (live.productLayout !== draft.productLayout) config.push('productLayout');
  if (JSON.stringify(live.sections) !== JSON.stringify(draft.sections)) config.push('sections');
  return { kind: binary.length ? 'binary' : config.length ? 'config' : 'none', binary, config };
}

/* ---------- Store listing ---------- */

export interface Listing {
  subtitle: L;
  description: L;
  keywords: string;
  category: string;
  supportUrl: string;
  privacyUrl: string;
  reviewNotes: string;
  screenshots: number;
}
export const LIMITS = { subtitle: 30, description: 4000, keywords: 100 };
export const SCREENSHOT_SLOTS = 3;
export type ListingField = 'subtitleAr' | 'subtitleEn' | 'descriptionAr' | 'descriptionEn' | 'keywords' | 'category' | 'supportUrl' | 'privacyUrl' | 'screenshots';
export type ListingIssue = 'required' | 'tooLong' | 'url' | 'tooShort';

const isUrl = (v: string) => /^https:\/\/[^\s.]+\.[^\s]+$/.test(v.trim());

export function listingIssues(l: Listing): Partial<Record<ListingField, ListingIssue>> {
  const out: Partial<Record<ListingField, ListingIssue>> = {};
  const text = (f: ListingField, v: string, max: number, min = 1) => {
    const t = v.trim();
    if (!t) out[f] = 'required';
    else if (t.length > max) out[f] = 'tooLong';
    else if (t.length < min) out[f] = 'tooShort';
  };
  text('subtitleAr', l.subtitle.ar, LIMITS.subtitle);
  text('subtitleEn', l.subtitle.en, LIMITS.subtitle);
  text('descriptionAr', l.description.ar, LIMITS.description, 40);
  text('descriptionEn', l.description.en, LIMITS.description, 40);
  text('keywords', l.keywords, LIMITS.keywords);
  if (!l.category) out.category = 'required';
  if (!l.supportUrl.trim()) out.supportUrl = 'required'; else if (!isUrl(l.supportUrl)) out.supportUrl = 'url';
  if (!l.privacyUrl.trim()) out.privacyUrl = 'required'; else if (!isUrl(l.privacyUrl)) out.privacyUrl = 'url';
  if (l.screenshots < SCREENSHOT_SLOTS) out.screenshots = 'required';
  return out;
}

/* ---------- Publishing accounts ---------- */

export type Platform = 'ios' | 'android';
export const PLATFORMS: Platform[] = ['ios', 'android'];
export type AccountState = 'connected' | 'missing';
export type Accounts = Record<Platform, AccountState>;

/* ---------- Readiness ---------- */

export type CheckId = 'plan' | 'identity' | 'layout' | 'listing' | 'accounts';
export interface Check { id: CheckId; ok: boolean }

export function readiness(s: { plan: Plan; addon: Addon; draft: AppConfig; listing: Listing; accounts: Accounts }): Check[] {
  const named = Object.keys(nameIssues(s.draft.name)).length === 0 && !!s.draft.iconId && !!s.draft.splash;
  const hasProducts = s.draft.sections.some((x) => x.type === 'featured' || x.type === 'newArrivals' || x.type === 'bestSellers');
  return [
    { id: 'plan', ok: eligibility(s.plan, s.addon).ok },
    { id: 'identity', ok: named },
    { id: 'layout', ok: hasProducts },
    { id: 'listing', ok: Object.keys(listingIssues(s.listing)).length === 0 },
    { id: 'accounts', ok: PLATFORMS.some((p) => s.accounts[p] === 'connected') },
  ];
}

/* ---------- Release pipeline state machine ---------- */

export type LakReview = 'in_review' | 'approved' | 'changes' | 'none';
export type PState =
  | 'not_included' | 'waiting'
  | 'building' | 'build_failed'
  | 'uploading' | 'upload_failed'
  | 'in_review' | 'published' | 'rejected' | 'action_required';

export type IssueCode =
  | 'LAK_PRIVACY'
  | 'IOS_CERT_EXPIRED' | 'ANDROID_KEY_MISMATCH'
  | 'BUILD_NUMBER_USED'
  | 'APPLE_5_1_1' | 'GOOGLE_METADATA'
  | 'APPLE_DEMO_ACCOUNT' | 'GOOGLE_DATA_SAFETY';

/** Where the merchant fixes each issue, and whether the fix needs a new binary. */
export const ISSUES: Record<IssueCode, { fix: 'listing' | 'accounts' | 'layout' | 'rebuild' | 'resolve'; binary: boolean }> = {
  LAK_PRIVACY: { fix: 'listing', binary: false },
  IOS_CERT_EXPIRED: { fix: 'accounts', binary: false },
  ANDROID_KEY_MISMATCH: { fix: 'accounts', binary: false },
  BUILD_NUMBER_USED: { fix: 'rebuild', binary: false },
  APPLE_5_1_1: { fix: 'layout', binary: true },
  GOOGLE_METADATA: { fix: 'listing', binary: false },
  APPLE_DEMO_ACCOUNT: { fix: 'resolve', binary: false },
  GOOGLE_DATA_SAFETY: { fix: 'resolve', binary: false },
};

export interface PRun { state: PState; build: number; issue?: IssueCode }

export type LogKind =
  | 'submitted' | 'lakApproved' | 'lakChanges'
  | 'buildOk' | 'buildFail' | 'rebuild'
  | 'uploadOk' | 'uploadFail'
  | 'storeApproved' | 'storeRejected' | 'storeAction' | 'resolved'
  | 'configApplied';

export interface LogEntry { at: string; kind: LogKind; platform?: Platform; build?: number; issue?: IssueCode }

export interface Release {
  id: string;
  kind: 'binary' | 'config';
  version: string;
  /** Config revision on top of the binary version; 0 for the binary's own config. */
  rev: number;
  createdAt: string;
  lak: LakReview;
  lakIssue?: IssueCode;
  platforms: Record<Platform, PRun>;
  config: AppConfig;
  log: LogEntry[];
}

export type SimEvent =
  | { type: 'lak'; outcome: 'approve' | 'changes' }
  | { type: 'build'; platform: Platform; outcome: 'ok' | 'fail' }
  | { type: 'upload'; platform: Platform; outcome: 'ok' | 'fail' }
  | { type: 'store'; platform: Platform; outcome: 'approve' | 'reject' | 'action' }
  | { type: 'rebuild'; platform: Platform }
  | { type: 'resolve'; platform: Platform };

const BUILD_FAIL: Record<Platform, IssueCode> = { ios: 'IOS_CERT_EXPIRED', android: 'ANDROID_KEY_MISMATCH' };
const REJECT: Record<Platform, IssueCode> = { ios: 'APPLE_5_1_1', android: 'GOOGLE_METADATA' };
const ACTION: Record<Platform, IssueCode> = { ios: 'APPLE_DEMO_ACCOUNT', android: 'GOOGLE_DATA_SAFETY' };

function setRun(r: Release, p: Platform, run: PRun, entry: Omit<LogEntry, 'at'>, at: string): Release {
  return { ...r, platforms: { ...r.platforms, [p]: run }, log: [...r.log, { at, ...entry }] };
}

/** Apply one simulated pipeline event. Invalid transitions return the same release object (no-op). */
export function apply(r: Release, e: SimEvent, at: string): Release {
  if (r.kind !== 'binary') return r;
  if (e.type === 'lak') {
    if (r.lak !== 'in_review') return r;
    if (e.outcome === 'changes') return { ...r, lak: 'changes', lakIssue: 'LAK_PRIVACY', log: [...r.log, { at, kind: 'lakChanges', issue: 'LAK_PRIVACY' }] };
    const platforms = { ...r.platforms };
    for (const p of PLATFORMS) if (platforms[p].state === 'waiting') platforms[p] = { ...platforms[p], state: 'building' };
    return { ...r, lak: 'approved', platforms, log: [...r.log, { at, kind: 'lakApproved' }] };
  }
  const p = e.platform;
  const run = r.platforms[p];
  switch (e.type) {
    case 'build':
      if (run.state !== 'building') return r;
      return e.outcome === 'ok'
        ? setRun(r, p, { state: 'uploading', build: run.build }, { kind: 'buildOk', platform: p, build: run.build }, at)
        : setRun(r, p, { state: 'build_failed', build: run.build, issue: BUILD_FAIL[p] }, { kind: 'buildFail', platform: p, build: run.build, issue: BUILD_FAIL[p] }, at);
    case 'upload':
      if (run.state !== 'uploading') return r;
      return e.outcome === 'ok'
        ? setRun(r, p, { state: 'in_review', build: run.build }, { kind: 'uploadOk', platform: p, build: run.build }, at)
        : setRun(r, p, { state: 'upload_failed', build: run.build, issue: 'BUILD_NUMBER_USED' }, { kind: 'uploadFail', platform: p, build: run.build, issue: 'BUILD_NUMBER_USED' }, at);
    case 'store':
      if (run.state !== 'in_review') return r;
      if (e.outcome === 'approve') return setRun(r, p, { state: 'published', build: run.build }, { kind: 'storeApproved', platform: p, build: run.build }, at);
      if (e.outcome === 'reject') return setRun(r, p, { state: 'rejected', build: run.build, issue: REJECT[p] }, { kind: 'storeRejected', platform: p, build: run.build, issue: REJECT[p] }, at);
      return setRun(r, p, { state: 'action_required', build: run.build, issue: ACTION[p] }, { kind: 'storeAction', platform: p, build: run.build, issue: ACTION[p] }, at);
    case 'rebuild': {
      if (run.state !== 'build_failed' && run.state !== 'upload_failed') return r;
      const build = run.build + 1;
      return setRun(r, p, { state: 'building', build }, { kind: 'rebuild', platform: p, build }, at);
    }
    case 'resolve':
      if (run.state !== 'action_required') return r;
      return setRun(r, p, { state: 'in_review', build: run.build }, { kind: 'resolved', platform: p, build: run.build }, at);
  }
}

/** The step a platform is waiting on, if any — drives the test panel. */
export function awaiting(r: Release, p: Platform): 'lak' | 'build' | 'upload' | 'store' | null {
  if (r.kind !== 'binary') return null;
  const s = r.platforms[p].state;
  if (s === 'waiting') return r.lak === 'in_review' ? 'lak' : null;
  if (s === 'building') return 'build';
  if (s === 'uploading') return 'upload';
  if (s === 'in_review') return 'store';
  return null;
}

export type StageId = 'lak' | 'build' | 'upload' | 'review' | 'live';
export const STAGES: StageId[] = ['lak', 'build', 'upload', 'review', 'live'];
export type StageStatus = 'done' | 'current' | 'failed' | 'action' | 'todo';

const ORDER: PState[] = ['waiting', 'building', 'uploading', 'in_review', 'published'];
const rank = (s: PState): number => {
  if (s === 'build_failed') return 1;
  if (s === 'upload_failed') return 2;
  if (s === 'rejected' || s === 'action_required') return 3;
  return ORDER.indexOf(s);
};

/** Per-stage status for one platform. Build, upload, store review and availability are always separate. */
export function stages(r: Release, p: Platform): Record<StageId, StageStatus> {
  const s = r.platforms[p].state;
  const k = rank(s);
  const lak: StageStatus = r.lak === 'approved' ? 'done' : r.lak === 'changes' ? 'failed' : 'current';
  const at = (i: number, failState: PState[], action: PState[] = []): StageStatus =>
    failState.includes(s) ? 'failed' : action.includes(s) ? 'action' : k > i ? 'done' : k === i && r.lak === 'approved' ? 'current' : 'todo';
  return {
    lak,
    build: at(1, ['build_failed']),
    upload: at(2, ['upload_failed']),
    review: at(3, ['rejected'], ['action_required']),
    live: s === 'published' ? 'done' : 'todo',
  };
}

export const ACTIVE: PState[] = ['waiting', 'building', 'uploading', 'in_review'];

/** A binary release is still moving through the pipeline (blocks a parallel submission). */
export function isActive(r: Release): boolean {
  if (r.kind !== 'binary' || r.lak === 'changes') return false;
  return PLATFORMS.some((p) => ACTIVE.includes(r.platforms[p].state));
}

export function parseVersion(v: string): [number, number, number] {
  const [a = 0, b = 0, c = 0] = v.split('.').map((n) => Number.parseInt(n, 10) || 0);
  return [a, b, c];
}

export function nextVersion(releases: Release[]): string {
  const binaries = releases.filter((r) => r.kind === 'binary');
  if (!binaries.length) return '1.0.0';
  const [a, b] = binaries.map((r) => parseVersion(r.version)).sort((x, y) => y[0] - x[0] || y[1] - x[1] || y[2] - x[2])[0];
  return `${a}.${b + 1}.0`;
}

export function maxBuild(releases: Release[]): number {
  return releases.reduce((m, r) => Math.max(m, r.platforms.ios.build, r.platforms.android.build), 0);
}

export function createRelease(releases: Release[], config: AppConfig, platforms: Platform[], at: string, id: string): Release {
  const build = maxBuild(releases) + 1;
  const run = (p: Platform): PRun => ({ state: platforms.includes(p) ? 'waiting' : 'not_included', build: platforms.includes(p) ? build : 0 });
  return {
    id, kind: 'binary', version: nextVersion(releases), rev: 0, createdAt: at, lak: 'in_review',
    platforms: { ios: run('ios'), android: run('android') }, config, log: [{ at, kind: 'submitted' }],
  };
}

/** The version currently installed from each store, or null if never published there. */
export function liveVersion(releases: Release[], p: Platform): Release | null {
  for (let i = releases.length - 1; i >= 0; i--) {
    const r = releases[i];
    if (r.kind === 'binary' && r.platforms[p].state === 'published') return r;
  }
  return null;
}

/** The config installed apps load at launch: the newest applied config update or published binary. */
export function liveConfig(releases: Release[]): AppConfig | null {
  for (let i = releases.length - 1; i >= 0; i--) {
    const r = releases[i];
    if (r.kind === 'config') return r.config;
    if (PLATFORMS.some((p) => r.platforms[p].state === 'published')) return r.config;
  }
  return null;
}

export type ConfigBlock = 'noLive' | 'binaryChange' | 'noChange';

export function configUpdateBlock(releases: Release[], draft: AppConfig): ConfigBlock | null {
  const live = liveConfig(releases);
  if (!live) return 'noLive';
  const c = classifyChange(live, draft);
  if (c.kind === 'binary') return 'binaryChange';
  if (c.kind === 'none') return 'noChange';
  return null;
}

/** Config update: no build, no store review; installed apps pick it up at next launch. */
export function createConfigUpdate(releases: Release[], draft: AppConfig, at: string, id: string): Release | null {
  if (configUpdateBlock(releases, draft)) return null;
  const base = PLATFORMS.map((p) => liveVersion(releases, p)).filter(Boolean) as Release[];
  const version = base.map((r) => r.version).sort((x, y) => {
    const a = parseVersion(x); const b = parseVersion(y);
    return b[0] - a[0] || b[1] - a[1] || b[2] - a[2];
  })[0];
  const rev = releases.filter((r) => r.kind === 'config' && r.version === version).reduce((m, r) => Math.max(m, r.rev), 0) + 1;
  return {
    id, kind: 'config', version, rev, createdAt: at, lak: 'none',
    platforms: { ios: { state: 'not_included', build: 0 }, android: { state: 'not_included', build: 0 } },
    config: draft, log: [{ at, kind: 'configApplied' }],
  };
}
