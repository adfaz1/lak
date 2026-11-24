import { describe, expect, it } from 'vitest';
import {
  addSection, apply, awaiting, canAdd, classifyChange, configUpdateBlock, createConfigUpdate, createRelease, eligibility,
  isActive, listingIssues, liveConfig, liveVersion, moveSection, nextVersion, readiness, removeSection, stages,
  type Release, type Section,
} from './domain';
import { initialAccounts, initialDraft, initialListing, initialReleases } from './fixtures';

const T = '2026-11-24T10:00:00Z';

describe('eligibility', () => {
  it('requires Plus or above and the add-on', () => {
    expect(eligibility('basic', 'active')).toEqual({ ok: false, reason: 'plan' });
    expect(eligibility('plus', 'none')).toEqual({ ok: false, reason: 'addon' });
    expect(eligibility('pro', 'active')).toEqual({ ok: true });
  });
});

describe('home layout', () => {
  const s = (id: string, type: Section['type']): Section => ({ id, type, title: { ar: id, en: id } });
  const base = [s('a', 'hero'), s('b', 'featured'), s('c', 'banner')];
  it('moves sections with bounds and keeps others intact', () => {
    expect(moveSection(base, 'c', -1).map((x) => x.id)).toEqual(['a', 'c', 'b']);
    expect(moveSection(base, 'a', -1)).toBe(base);
    expect(moveSection(base, 'c', 1)).toBe(base);
  });
  it('limits single-use sections and the total', () => {
    expect(canAdd(base, 'hero')).toEqual({ ok: false, reason: 'single' });
    expect(addSection(base, s('d', 'hero'))).toBe(base);
    const full = Array.from({ length: 8 }, (_, i) => s(`x${i}`, 'banner'));
    expect(canAdd(full, 'banner')).toEqual({ ok: false, reason: 'max' });
    expect(removeSection(base, 'b').map((x) => x.id)).toEqual(['a', 'c']);
  });
});

describe('config vs binary update', () => {
  const live = liveConfig(initialReleases())!;
  it('treats layout changes as config-only', () => {
    const c = classifyChange(live, initialDraft());
    expect(c).toEqual({ kind: 'config', binary: [], config: ['sections'] });
  });
  it('treats icon, name, splash and native features as binary changes', () => {
    const d = { ...initialDraft(), iconId: 'i2', features: { ...live.features, accountDeletion: true } };
    const c = classifyChange(live, d);
    expect(c.kind).toBe('binary');
    expect(c.binary).toEqual(['icon', 'features']);
    expect(configUpdateBlock(initialReleases(), d)).toBe('binaryChange');
  });
  it('applies a config update without store review and bumps the revision', () => {
    const rs = initialReleases();
    const u = createConfigUpdate(rs, initialDraft(), T, 'r9')!;
    expect(u.kind).toBe('config');
    expect(u.lak).toBe('none');
    expect(u.version).toBe('1.1.0');
    expect(u.rev).toBe(1);
    expect(liveConfig([...rs, u])).toBe(u.config);
    expect(createConfigUpdate([...rs, u], initialDraft(), T, 'r10')).toBeNull();
  });
});

describe('listing and readiness', () => {
  it('flags invalid URLs, long subtitles and missing screenshots', () => {
    const l = { ...initialListing(), supportUrl: 'nakhla', subtitle: { ar: 'x'.repeat(31), en: 'ok' }, screenshots: 1 };
    expect(listingIssues(l)).toEqual({ subtitleAr: 'tooLong', supportUrl: 'url', screenshots: 'required' });
    expect(listingIssues(initialListing())).toEqual({});
  });
  it('is not ready when no publishing account is connected', () => {
    const r = readiness({ plan: 'plus', addon: 'active', draft: initialDraft(), listing: initialListing(), accounts: { ios: 'missing', android: 'missing' } });
    expect(r.find((c) => c.id === 'accounts')!.ok).toBe(false);
    expect(readiness({ plan: 'plus', addon: 'active', draft: initialDraft(), listing: initialListing(), accounts: initialAccounts() }).every((c) => c.ok)).toBe(true);
  });
});

describe('release pipeline', () => {
  const fresh = (): Release => createRelease(initialReleases(), initialDraft(), ['ios', 'android'], T, 'r4');

  it('numbers versions and builds', () => {
    const r = fresh();
    expect(r.version).toBe('1.2.0');
    expect(r.platforms.ios.build).toBe(4);
    expect(nextVersion([])).toBe('1.0.0');
    expect(createRelease(initialReleases(), initialDraft(), ['android'], T, 'x').platforms.ios.state).toBe('not_included');
  });

  it('waits for LAK review before building', () => {
    const r = fresh();
    expect(apply(r, { type: 'build', platform: 'ios', outcome: 'ok' }, T)).toBe(r);
    expect(awaiting(r, 'ios')).toBe('lak');
    const ok = apply(r, { type: 'lak', outcome: 'approve' }, T);
    expect(ok.platforms.ios.state).toBe('building');
    const changes = apply(r, { type: 'lak', outcome: 'changes' }, T);
    expect(changes.lak).toBe('changes');
    expect(isActive(changes)).toBe(false);
  });

  it('QA21: a successful build then an Apple rejection is never shown as published', () => {
    let r = apply(fresh(), { type: 'lak', outcome: 'approve' }, T);
    r = apply(r, { type: 'build', platform: 'ios', outcome: 'ok' }, T);
    r = apply(r, { type: 'upload', platform: 'ios', outcome: 'ok' }, T);
    r = apply(r, { type: 'store', platform: 'ios', outcome: 'reject' }, T);
    expect(r.platforms.ios).toMatchObject({ state: 'rejected', issue: 'APPLE_5_1_1' });
    expect(stages(r, 'ios')).toEqual({ lak: 'done', build: 'done', upload: 'done', review: 'failed', live: 'todo' });
    expect(liveVersion([...initialReleases(), r], 'ios')!.version).toBe('1.0.0');
  });

  it('rebuilds a failed build with a new build number, and resolves store actions', () => {
    let r = apply(fresh(), { type: 'lak', outcome: 'approve' }, T);
    r = apply(r, { type: 'build', platform: 'android', outcome: 'fail' }, T);
    expect(stages(r, 'android').build).toBe('failed');
    r = apply(r, { type: 'rebuild', platform: 'android' }, T);
    expect(r.platforms.android).toEqual({ state: 'building', build: 5 });
    r = apply(r, { type: 'build', platform: 'android', outcome: 'ok' }, T);
    r = apply(r, { type: 'upload', platform: 'android', outcome: 'ok' }, T);
    r = apply(r, { type: 'store', platform: 'android', outcome: 'action' }, T);
    expect(stages(r, 'android').review).toBe('action');
    r = apply(r, { type: 'resolve', platform: 'android' }, T);
    r = apply(r, { type: 'store', platform: 'android', outcome: 'approve' }, T);
    expect(r.platforms.android.state).toBe('published');
    expect(r.log.map((l) => l.kind)).toEqual(['submitted', 'lakApproved', 'buildFail', 'rebuild', 'buildOk', 'uploadOk', 'storeAction', 'resolved', 'storeApproved']);
  });

  it('fixture QA21 case keeps platform outcomes separate', () => {
    const rs = initialReleases();
    expect(liveVersion(rs, 'android')!.version).toBe('1.1.0');
    expect(liveVersion(rs, 'ios')!.version).toBe('1.0.0');
  });
});
