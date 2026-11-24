import { describe, expect, it } from 'vitest';
import {
  applicationFixtures, disputeFixtures, deliveryFixtures, holdPayout, ledgerFixtures, releasePayout, SERVICES, storeFixtures,
  submissionFixtures, TODAY,
} from './domain';
import {
  attention, categorySales, listApps, listAudit, listDisputes, listLedger, listStores, mmss, paginate, payoutRows, platformCounters,
  readAppQuery, readLedgerQuery, readStoreQuery, reportCsv, reportRows, searchAll, storeFlags, storesCsv,
} from './model';

const stores = storeFixtures();
const data = { stores, apps: applicationFixtures(), changes: [], disputes: disputeFixtures(), deliveries: deliveryFixtures(), content: submissionFixtures(), services: SERVICES };
const REASON = 'Chargeback review pending evidence';

describe('payout hold', () => {
  const s = stores.find((x) => x.id === 's-1001')!;
  it('holds pending merchant funds with a reason, for finance only', () => {
    expect(holdPayout(s, REASON, 'ops', 1)).toEqual({ ok: false, error: 'noPerm' });
    expect(holdPayout(s, 'short', 'finance', 1)).toEqual({ ok: false, error: 'reasonRequired' });
    const r = holdPayout(s, REASON, 'finance', 1);
    expect(r.ok && r.value.payoutHold).toEqual({ reason: REASON, by: 'finance', at: 1 });
    expect(r.ok && r.value.pendingPayout).toBe(s.pendingPayout);
    if (r.ok) {
      expect(holdPayout(r.value, REASON, 'finance', 2)).toEqual({ ok: false, error: 'alreadyHeld' });
      const back = releasePayout(r.value, REASON, 'owner');
      expect(back.ok && back.value.payoutHold).toBeUndefined();
    }
  });
  it('refuses a hold when nothing is pending and a release when nothing is held', () => {
    expect(holdPayout(stores.find((x) => x.id === 's-1004')!, REASON, 'finance', 1)).toEqual({ ok: false, error: 'noPayout' });
    expect(releasePayout(s, REASON, 'finance')).toEqual({ ok: false, error: 'notHeld' });
  });
});

describe('stores list', () => {
  it('reads views from the URL, keeps the old status link working and ignores junk', () => {
    expect(readStoreQuery(new URLSearchParams('status=suspended')).view).toBe('suspended');
    expect(readStoreQuery(new URLSearchParams('view=nope&plan=gold&page=x'))).toEqual({ view: 'all', q: '', plan: '', page: 1 });
  });
  it('counts saved views over the searched set and pages the rows', () => {
    const r = listStores(stores, { view: 'all', q: '', plan: '', page: 2 }, 8);
    expect(r.counts).toMatchObject({ all: 12, active: 9, onboarding: 1, suspended: 2 });
    expect(r.pages).toBe(2);
    expect(r.pageRows).toHaveLength(4);
    expect(r.rows[0].id).toBe('s-1008');
    expect(listStores(stores, { view: 'suspended', q: 'safa', plan: '', page: 1 }).rows.map((s) => s.id)).toEqual(['s-1012']);
  });
  it('flags stores that need operations attention', () => {
    expect(storeFlags(stores.find((s) => s.id === 's-1007')!)).toEqual(['errors', 'domain', 'tickets']);
    expect(storeFlags(stores.find((s) => s.id === 's-1002')!)).toEqual([]);
  });
  it('clamps the page into range', () => {
    expect(paginate([1, 2, 3], 9, 2)).toEqual({ page: 2, pages: 2, pageRows: [3] });
    expect(paginate([], 1, 5)).toEqual({ page: 1, pages: 1, pageRows: [] });
  });
  it('exports selected stores as CSV with plain decimal money', () => {
    const csv = storesCsv([stores[0]], 'en');
    expect(csv.split('\r\n')[1]).toBe('s-1001,Dar Al Oud,Dar Al Oud Trading Co.,Pro,Live,Riyadh,612,184200.00');
  });
});

describe('applications queue', () => {
  it('works oldest first and counts each status', () => {
    const r = listApps(data.apps, readAppQuery(new URLSearchParams('status=pending')));
    expect(r.rows.map((a) => a.id)).toEqual(['a-2053', 'a-2052', 'a-2051', 'a-2055']);
    expect(r.counts).toMatchObject({ '': 6, pending: 4, info: 1, approved: 1 });
    expect(listApps(data.apps, readAppQuery(new URLSearchParams('type=charity'))).rows).toHaveLength(1);
  });
});

describe('overview', () => {
  it('lists only work the role may see, money first', () => {
    expect(attention('owner', data).map((a) => a.id)).toEqual(['disputes', 'kyc', 'deliveries', 'content', 'health']);
    expect(attention('support', data).map((a) => a.id)).not.toContain('disputes');
    expect(attention('finance', data).map((a) => a.id)).toEqual(['disputes']);
  });
  it('counts platform activity without suspended stores in orders', () => {
    expect(platformCounters(stores, TODAY)).toMatchObject({ active: 8, total: 12, onboarding: 1, suspended: 2 });
  });
});

describe('search', () => {
  it('finds stores, applications and transactions only where the role may look', () => {
    const d = { stores, apps: data.apps, disputes: data.disputes, ledger: ledgerFixtures() };
    expect(searchAll('owner', 'TX-884', d).every((h) => h.kind === 'transaction')).toBe(true);
    expect(searchAll('support', 'TX-884', d)).toEqual([]);
    expect(searchAll('finance', 'ward', d).map((h) => h.kind)).toEqual(['store']);
    expect(searchAll('owner', 'w', d)).toEqual([]);
  });
});

describe('payments', () => {
  it('filters the ledger by book and keeps newest first', () => {
    const r = listLedger(ledgerFixtures(), readLedgerQuery(new URLSearchParams('fund=lak')));
    expect(r.rows.every((e) => e.kind === 'subscription')).toBe(true);
    expect(listLedger(ledgerFixtures(), readLedgerQuery(new URLSearchParams(''))).rows[0].ref).toBe('TX-88412');
  });
  it('orders disputes by deadline with closed cases last', () => {
    expect(listDisputes(disputeFixtures(), '').map((d) => d.id)).toEqual(['DP-308', 'DP-305', 'DP-311', 'DP-312', 'DP-297']);
  });
  it('lists stores with pending payouts, held ones first', () => {
    const held = stores.map((s) => (s.id === 's-1010' ? { ...s, payoutHold: { reason: REASON, by: 'finance' as const, at: 1 } } : s));
    expect(payoutRows(held)[0].id).toBe('s-1010');
    expect(payoutRows(held).every((s) => s.pendingPayout > 0)).toBe(true);
  });
});

describe('reports and audit', () => {
  it('builds the same rows for screen and CSV, sales shares summing to 100%', () => {
    const cats = categorySales(stores);
    expect(cats.reduce((a, c) => a + c.shareBp, 0)).toBeGreaterThanOrEqual(9_998);
    expect(reportRows('subs', stores, 'en').rows).toHaveLength(4);
    const { csv, count } = reportCsv('revenue', stores, 'en');
    expect(count).toBe(4);
    expect(csv.split('\r\n')[1]).toBe('Central region,151200.00,18400.00,5200.00,174800.00');
  });
  it('filters the audit log by action and role', () => {
    const e = [{ id: '1', at: 1, role: 'ops' as const, action: 'storeSuspended' as const, target: 's', targetLabel: { ar: '', en: '' } },
      { id: '2', at: 2, role: 'finance' as const, action: 'payoutHeld' as const, target: 's', targetLabel: { ar: '', en: '' } }];
    expect(listAudit(e, { action: '', role: 'finance', page: 1 }).rows.map((x) => x.id)).toEqual(['2']);
  });
  it('formats a countdown', () => { expect(mmss(61_000)).toBe('01:01'); expect(mmss(-5)).toBe('00:00'); });
});
