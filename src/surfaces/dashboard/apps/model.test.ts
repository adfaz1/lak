import { describe, expect, it } from 'vitest';
import { appFixtures } from '../../merchant/workspace';
import { actionsFor, applyAction, categories, filterApps, isWrite, limits, needsAttention, personalScopes, viewCounts } from './model';

const apps = appFixtures();
const by = (id: string) => apps.find((a) => a.id === id)!;

describe('catalogue', () => {
  it('groups apps by connection state and counts each view', () => {
    expect(viewCounts(apps)).toEqual({ all: 5, connected: 1, attention: 2, available: 2 });
    expect(filterApps(apps, { view: 'attention', q: '', category: '' }).map((a) => a.id)).toEqual(['wa', 'rev']);
  });
  it('searches names and descriptions in both languages and filters by category', () => {
    expect(filterApps(apps, { view: 'all', q: 'whatsapp', category: '' }).map((a) => a.id)).toEqual(['wa']);
    expect(filterApps(apps, { view: 'all', q: 'واتساب', category: '' }).map((a) => a.id)).toEqual(['wa']);
    expect(filterApps(apps, { view: 'all', q: '', category: 'Finance' }).map((a) => a.id)).toEqual(['acc']);
    expect(categories(apps).length).toBe(5);
  });
  it('flags personal-data scopes and write access', () => {
    expect(personalScopes(by('wa'))).toEqual(['orders.read', 'customers.read', 'messages.send']);
    expect(personalScopes(by('rev'))).toEqual([]);
    expect(isWrite('products.write')).toBe(true);
    expect(isWrite('messages.send')).toBe(true);
    expect(isWrite('orders.read')).toBe(false);
  });
});

describe('limits', () => {
  it('keeps plan limits separate from permission limits', () => {
    expect(limits(by('erp'), 'plus', 'owner')).toMatchObject({ inPlan: false, permitted: true, blockedBy: 'plan' });
    expect(limits(by('ga'), 'plus', 'marketing')).toMatchObject({ inPlan: true, permitted: false, blockedBy: 'permission' });
    expect(limits(by('ga'), 'plus', 'owner').blockedBy).toBeNull();
  });
});

describe('connection changes', () => {
  it('offers only actions that fit the state', () => {
    expect(actionsFor(by('ga'))).toEqual(['connect']);
    expect(actionsFor(by('wa'))).toEqual(['reauth', 'disconnect']);
    expect(actionsFor(by('rev'))).toEqual(['retry', 'disconnect']);
  });
  it('connects, re-authorises and disconnects without touching other apps', () => {
    const a = applyAction(apps, 'wa', 'reauth');
    expect(a.find((x) => x.id === 'wa')).toMatchObject({ state: 'connected', lastSync: { en: 'Just now' } });
    const b = applyAction(a, 'acc', 'disconnect');
    expect(b.find((x) => x.id === 'acc')).toMatchObject({ state: 'not_connected', lastSync: { en: '20 minutes ago' } });
    expect(applyAction(apps, 'ga', 'disconnect')).toEqual(apps);
    expect(needsAttention(b).map((x) => x.id)).toEqual(['rev']);
  });
});

describe('sync log and integration issues', () => {
  it('explains each failing app with its cause and the fixing action', async () => {
    const { appFixtures } = await import('../../merchant/workspace');
    const { integrationIssues, syncFixtures } = await import('./model');
    const issues = integrationIssues(appFixtures(), syncFixtures(Date.parse('2026-11-24T12:00:00Z')));
    expect(issues.map((i) => i.appId)).toEqual(['rev', 'wa']);
    expect(issues[0]).toMatchObject({ level: 'error', ref: 'SYNC-4471', fix: { action: 'retry', href: '#/dashboard/apps/rev' } });
    expect(issues[1].fix.action).toBe('reauth');
    expect(issues[0].since).toBeDefined();
  });
  it('records every action; a simulated failure keeps the app failing with the new cause', async () => {
    const { appFixtures } = await import('../../merchant/workspace');
    const { runAction, syncFixtures, currentCause, lastOk } = await import('./model');
    const log = syncFixtures(Date.parse('2026-11-24T12:00:00Z'));
    const ok = runAction(appFixtures(), log, 'rev', 'retry', '2026-11-24T13:00:00Z');
    expect(ok.apps.find((a) => a.id === 'rev')!.state).toBe('connected');
    expect(ok.entry).toMatchObject({ ok: true, kind: 'retry' });
    expect(lastOk([ok.entry, ...log], 'rev')!.at).toBe('2026-11-24T13:00:00Z');
    const bad = runAction(appFixtures(), log, 'acc', 'sync', '2026-11-24T13:00:00Z', 'timeout');
    expect(bad.apps.find((a) => a.id === 'acc')!.state).toBe('error');
    expect(currentCause([bad.entry, ...log], 'acc')!.cause).toBe('timeout');
  });
});
