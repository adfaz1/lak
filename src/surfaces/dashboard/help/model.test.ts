import { describe, expect, it } from 'vitest';
import { appFixtures, articles, domainFixture, providerFixtures } from '../../merchant/workspace';
import { allOrders } from '../../merchant/domain';
import { countBySection, diagnostics, groupBySection, integrationIssues, issuesFor, looksSensitive, nextTicketRef, searchArticles, validateTicket } from './model';

const list = articles();

describe('help search', () => {
  it('finds articles in either language, by title or step, title matches first', () => {
    expect(searchArticles(list, 'refund').map((a) => a.id)[0]).toBe('h2');
    expect(searchArticles(list, 'استرداد').map((a) => a.id)).toContain('h2');
    expect(searchArticles(list, 'CSV').map((a) => a.id)).toEqual(['h3']);
    expect(searchArticles(list, 'nothing-like-this')).toEqual([]);
  });
  it('filters by section and groups in a stable order', () => {
    expect(searchArticles(list, '', 'orders').map((a) => a.id)).toEqual(['h1', 'h2']);
    expect(groupBySection(list).map((g) => g.section)).toEqual(['orders', 'products', 'inventory', 'finance', 'marketing', 'settings']);
    expect(countBySection(list).orders).toBe(2);
  });
});

describe('integration status', () => {
  const issues = integrationIssues(appFixtures(), providerFixtures(), domainFixture());
  it('lists broken apps and providers needing action, errors first', () => {
    expect(issues.map((i) => i.id)).toEqual(['app-rev', 'app-wa', 'pay-stcpay']);
  });
  it('places each issue in the sections where it shows up', () => {
    expect(issuesFor(issues, 'products').map((i) => i.id)).toEqual(['app-rev']);
    expect(issuesFor(issues, 'marketing').map((i) => i.id)).toEqual(['app-wa']);
    expect(issuesFor(issues, 'finance').map((i) => i.id)).toEqual(['pay-stcpay']);
    expect(issuesFor(issues, 'inventory')).toEqual([]);
  });
  it('reports a failed domain check under settings', () => {
    const d = integrationIssues([], [], { slug: 's', host: 'shop.example.com', state: 'failed', checks: 1 });
    expect(d).toMatchObject([{ id: 'domain', sections: ['settings'] }]);
  });
});

describe('support ticket', () => {
  const refs = allOrders().map((o) => o.ref);
  const ok = { topic: 'orders' as const, subject: 'Label not issued', details: 'The carrier label for this order failed twice today.', orderRef: `#${refs[0]}` };
  it('accepts a complete ticket and an existing order number', () => {
    expect(validateTicket(ok, refs)).toEqual({});
  });
  it('flags missing, short, unknown and sensitive input', () => {
    expect(validateTicket({ topic: '', subject: 'Hi', details: 'short', orderRef: '99' }, refs)).toEqual({ topic: 'required', subject: 'short', details: 'short', orderRef: 'unknown' });
    expect(validateTicket({ ...ok, details: 'My card is 4111 1111 1111 1111 please check' }, refs).details).toBe('sensitive');
    expect(looksSensitive('password: hunter2')).toBe(true);
    expect(looksSensitive('Order 10482 was late')).toBe(false);
  });
  it('numbers references without reuse', () => {
    expect(nextTicketRef([])).toBe('SUP-5101');
    expect(nextTicketRef([{ id: 'SUP-5103' }, { id: 'SUP-5101' }])).toBe('SUP-5104');
  });
  it('attaches only non-sensitive context', () => {
    const d = diagnostics({ page: '#/dashboard/help', now: new Date('2026-11-24T10:05:00Z'), store: 'Demo Store', role: 'owner', lang: 'ar', issues: [] });
    expect(d).toEqual({ page: '#/dashboard/help', time: '2026-11-24 10:05 UTC', store: 'Demo Store', role: 'owner', language: 'ar', issues: [] });
  });
});
