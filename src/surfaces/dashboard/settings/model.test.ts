import { describe, expect, it } from 'vitest';
import { livePolicyText, normPolicy, notifyFixture, policyFixtures, providerFixtures, storeFixture, teamFixture, zoneFixtures, domainFixture, type Member } from '../../merchant/workspace';
import { ROLES } from '../../merchant/perms';
import {
  CATEGORIES, applyProvider, canOpen, canPublish, canSelfCancel, changeRole, checkDomain, codAllowed, checkoutFixture, decodeLog, dnsRecords,
  encodeLog, hostOk, invite, inviteError, inviteStatus, matrix, nextState, normalise, notifyError, parseCheckout, parseCod, parseZone,
  planForSeats, removeMember, rolesFor, savePolicy, searchCategories, seats, shippingQuote, slugError, validateStore, visibleAtCheckout,
  withExpiry, zoneDraft, policyMissingLangs, policyHasDraft,
} from './model';

describe('settings index', () => {
  it('finds categories by Arabic or English words, keywords included, ignoring hamza forms', () => {
    expect(searchCategories('mada').map((c) => c.id)).toEqual(['payments']);
    expect(searchCategories('دعوة').map((c) => c.id)).toEqual(['team']);
    expect(searchCategories('اعدادات المتجر')).toEqual([]);
    expect(normalise('إتمام')).toBe(normalise('اتمام'));
    expect(searchCategories('  ')).toHaveLength(CATEGORIES.length);
  });
  it('opens categories by capability; language is open to every role', () => {
    for (const r of ROLES) expect(canOpen(r, 'language')).toBe(true);
    expect(canOpen('fulfilment', 'team')).toBe(false);
    expect(canOpen('owner', 'checkout')).toBe(true);
    expect(canOpen('marketing', 'checkout')).toBe(false);
    expect(rolesFor('team')).toEqual(['owner']);
  });
});

describe('store details', () => {
  it('requires a name of at most 60 characters and a valid email', () => {
    expect(validateStore(storeFixture())).toEqual({});
    expect(validateStore({ ...storeFixture(), name: ' ' }).name).toBe('required');
    expect(validateStore({ ...storeFixture(), name: 'x'.repeat(61) }).name).toBe('tooLong');
    expect(validateStore({ ...storeFixture(), email: 'owner@' }).email).toBe('invalid');
  });
  it('accepts Saudi mobile formats and rejects others', () => {
    expect(validateStore({ ...storeFixture(), phone: '0551234567' }).phone).toBeUndefined();
    expect(validateStore({ ...storeFixture(), phone: '+966 55 123 4567' }).phone).toBeUndefined();
    expect(validateStore({ ...storeFixture(), phone: '12345' }).phone).toBe('invalid');
  });
});

describe('team', () => {
  const team = teamFixture();
  it('counts pending invites as seats and blocks inviting beyond the plan', () => {
    expect(seats(team, 'plus')).toEqual({ used: 3, limit: 3, full: true, left: 0 });
    expect(inviteError(team, 'plus', 'new@x.test', 'marketing')).toBe('seats');
    expect(inviteError(team, 'pro', 'new@x.test', 'marketing')).toBeNull();
    expect(planForSeats(team, 'plus')).toBe('pro');
    expect(planForSeats(team, 'pro')).toBeNull();
  });
  it('rejects invalid, duplicate and owner invites', () => {
    expect(inviteError(team, 'pro', 'nope', 'finance')).toBe('email');
    expect(inviteError(team, 'pro', 'FAISAL@darnuwa.test', 'finance')).toBe('duplicate');
    expect(inviteError(team, 'pro', 'a@b.test', 'owner')).toBe('role');
  });
  it('expires invites after 7 days, which frees the seat', () => {
    const s = inviteStatus('2026-11-20T09:00:00Z', new Date('2026-11-24T09:00:00Z'));
    expect(s).toEqual({ expired: false, daysLeft: 3, expiresOn: '2026-11-27' });
    expect(inviteStatus('2026-11-10T09:00:00Z', new Date('2026-11-24T09:00:00Z')).expired).toBe(true);
    const m = withExpiry(team, { u3: '2026-11-10T09:00:00Z' }, new Date('2026-11-24T09:00:00Z'));
    expect(m.find((x) => x.id === 'u3')!.status).toBe('expired');
    expect(seats(m, 'plus').full).toBe(false);
  });
  it('never changes or removes the owner, and re-invites over an expired invite', () => {
    expect(changeRole(team, 'u1', 'finance')[0].role).toBe('owner');
    expect(changeRole(team, 'u2', 'owner')[1].role).toBe('fulfilment');
    expect(changeRole(team, 'u2', 'marketing')[1].role).toBe('marketing');
    expect(removeMember(team, 'u1')).toHaveLength(3);
    const expired: Member[] = [...team, { id: 'u9', name: 'x', email: 'x@y.test', role: 'finance', status: 'expired' }];
    const next = invite(expired, 'x@y.test', 'marketing', 'u10');
    expect(next.filter((m) => m.email === 'x@y.test')).toEqual([{ id: 'u10', name: 'x', email: 'x@y.test', role: 'marketing', status: 'invited' }]);
  });
  it('round-trips structured log entries and leaves plain legacy text alone', () => {
    const e = { k: 'invite', email: 'a@b.test', role: 'finance', at: '2026-11-24T10:00:00Z' } as const;
    expect(decodeLog(encodeLog(e))).toEqual(e);
    expect(decodeLog('Invited a@b.test as Finance')).toBeNull();
  });
  it('builds the matrix from the same tables as the checks', () => {
    const rows = matrix();
    const team_ = rows.find((r) => r.id === 'team.manage')!;
    expect(team_.allowed).toEqual({ owner: true, fulfilment: false, finance: false, marketing: false });
    expect(rows.find((r) => r.id === 'finance')!.allowed.finance).toBe(true);
  });
});

describe('payments', () => {
  it('moves through not connected → pending → active, with document requests in between', () => {
    expect(nextState('not_connected', 'connect')).toBe('pending');
    expect(nextState('pending', 'approve')).toBe('active');
    expect(nextState('pending', 'requestDoc')).toBe('action_required');
    expect(nextState('action_required', 'sendDoc')).toBe('pending');
    expect(nextState('active', 'connect')).toBe('active');
    expect(nextState('active', 'disconnect')).toBe('not_connected');
  });
  it('shows shoppers only active methods inside the plan', () => {
    const list = applyProvider(providerFixtures(), 'mada', 'approve');
    expect(visibleAtCheckout(list, 'plus').map((p) => p.id)).toEqual(['cod', 'bank', 'mada']);
    expect(visibleAtCheckout(list, 'basic').map((p) => p.id)).toEqual(['cod', 'bank']);
  });
  it('parses COD limits in riyals and requires max above min', () => {
    expect(parseCod('', '2000')).toEqual({ ok: true, min: 0, max: 200000 });
    expect(parseCod('50', '50')).toEqual({ ok: false, error: 'order' });
    expect(parseCod('abc', '50')).toEqual({ ok: false, error: 'min' });
    expect(parseCod('0', '')).toEqual({ ok: false, error: 'max' });
  });
});

describe('shipping', () => {
  const [riyadh, , rest] = zoneFixtures();
  it('charges flat, by started kilogram, or nothing above the free threshold', () => {
    expect(shippingQuote(riyadh, 20000, 1)).toBe(2500);
    expect(shippingQuote(riyadh, 30000, 1)).toBe(0);
    expect(shippingQuote(rest, 30000, 1)).toBe(2500);
    expect(shippingQuote(rest, 30000, 2.2)).toBe(2500 + 2 * 500);
  });
  it('validates a zone draft and keeps the other language name', () => {
    const d = zoneDraft(riyadh, 'en', 'z1');
    const ok = parseZone({ ...d, name: 'Riyadh & Kharj', free: '250' }, riyadh, 'en');
    expect(ok.ok && ok.zone).toMatchObject({ name: { ar: 'منطقة الرياض', en: 'Riyadh & Kharj' }, freeOver: 25000 });
    const bad = parseZone({ ...d, name: '', rate: 'x', rateType: 'weight', perKg: '0' }, riyadh, 'en');
    expect(!bad.ok && bad.errors).toEqual({ name: true, rate: true, perKg: true });
  });
});

describe('checkout', () => {
  it('validates the COD limit per customer', () => {
    expect(parseCheckout({ guest: true, cancelMinutes: 30, codLimitOn: true, codPerCustomer: '3' })).toEqual({ ok: true, value: { guest: true, cancelMinutes: 30, codPerCustomer: 3 } });
    expect(parseCheckout({ guest: true, cancelMinutes: 30, codLimitOn: true, codPerCustomer: '0' }).ok).toBe(false);
    expect(parseCheckout({ guest: false, cancelMinutes: null, codLimitOn: false, codPerCustomer: 'x' })).toEqual({ ok: true, value: { guest: false, cancelMinutes: null, codPerCustomer: null } });
  });
  it('allows self-cancel inside the window and before fulfilment only', () => {
    const s = checkoutFixture();
    expect(canSelfCancel(s, 20, false)).toBe(true);
    expect(canSelfCancel(s, 31, false)).toBe(false);
    expect(canSelfCancel(s, 5, true)).toBe(false);
    expect(canSelfCancel({ ...s, cancelMinutes: null }, 1, false)).toBe(false);
    expect(codAllowed(s, 1)).toBe(true);
    expect(codAllowed(s, 2)).toBe(false);
  });
});

describe('domains', () => {
  it('validates the free link and custom hosts', () => {
    expect(slugError('demo-store', 'demo-store')).toBe('same');
    expect(slugError('Demo Store', 'demo-store')).toBe('format');
    expect(slugError('my-shop', 'demo-store')).toBeNull();
    expect(hostOk('https://Shop.Example.com/')).toBe(true);
    expect(hostOk('shop')).toBe(false);
  });
  it('verifies only when both records are found, and counts checks', () => {
    const d = { ...domainFixture(), host: 'shop.example.com', state: 'pending' as const };
    expect(dnsRecords(d.host).map((r) => r.type)).toEqual(['CNAME', 'TXT']);
    expect(dnsRecords(d.host)[1].value).toBe(dnsRecords('shop.example.com')[1].value);
    const half = checkDomain(d, ['CNAME']);
    expect(half.next).toMatchObject({ state: 'failed', checks: 1 });
    expect(half.checks).toEqual([{ record: 'CNAME', ok: true }, { record: 'TXT', ok: false }]);
    expect(checkDomain(half.next, ['CNAME', 'TXT']).next).toMatchObject({ state: 'verified', checks: 2 });
  });
});

describe('policies and notifications', () => {
  it('publishes only with enough text; a draft edit keeps the published state honest', () => {
    // Policies are bilingual now (owner request): {ar, en}, each store language needs its own text.
    const both = { ar: 'نحفظ بياناتك لإتمام طلباتك فقط ولا نبيعها.', en: 'We keep your data for orders only.' };
    expect(canPublish({ ar: 'قصير', en: 'short' })).toBe(false);
    expect(canPublish({ ar: '', en: both.en }, { ar: false, en: true })).toBe(true);
    expect(policyMissingLangs({ ar: '', en: both.en })).toEqual(['ar']);
    const list = policyFixtures();
    expect(savePolicy(list, 'privacy', both, false).find((p) => p.id === 'privacy')!.state).toBe('draft');
    expect(savePolicy(list, 'privacy', both, true).find((p) => p.id === 'privacy')!.state).toBe('published');
    expect(savePolicy(list, 'returns', list[0].text, false)[0].state).toBe('published');
  });
  it('a draft edit never changes the live text shoppers read', () => {
    const list = policyFixtures();
    const edited = savePolicy(list, 'returns', { ar: 'نص جديد للاسترجاع خلال 30 يومًا من الاستلام.', en: 'New returns text: 30 days from delivery.' }, false)[0];
    expect(edited.live).toEqual(list[0].live);
    expect(livePolicyText(edited, 'en')).toMatch(/14 days/);
    expect(policyHasDraft(edited)).toBe(true);
    expect(livePolicyText(savePolicy(list, 'returns', edited.text, true)[0], 'en')).toMatch(/30 days/);
  });
  it('reads policies saved by the earlier one-text version', () => {
    const old = { id: 'returns' as const, state: 'published' as const, text: 'Returns within 7 days.' };
    expect(normPolicy(old).live).toEqual({ ar: 'Returns within 7 days.', en: 'Returns within 7 days.' });
    expect(livePolicyText(undefined, 'ar')).toBe('');
  });
  it('keeps at least one channel for failed payments', () => {
    const n = notifyFixture();
    expect(notifyError(n)).toBeNull();
    expect(notifyError({ ...n, paymentFailed: { email: false, sms: false } })).toBe('paymentFailed');
  });
});

describe('index status', () => {
  it('flags the category that needs the merchant', async () => {
    const { categoryStatus } = await import('./model');
    const d = { providers: providerFixtures(), zones: zoneFixtures(), domain: domainFixture(), policies: policyFixtures(), members: teamFixture(), plan: 'plus' as const };
    expect(categoryStatus('payments', d)).toEqual({ tone: 'red', code: 'action', n: 1 });
    expect(categoryStatus('shipping', { ...d, zones: [] })).toEqual({ tone: 'red', code: 'missing' });
    expect(categoryStatus('policies', d)).toEqual({ tone: 'amber', code: 'missing', n: 3 });
    expect(categoryStatus('team', d)).toEqual({ tone: 'amber', code: 'seats', n: 3 });
    expect(categoryStatus('domains', d)).toBeNull();
  });
});

describe('role change preview', () => {
  it('lists what a role change grants and withdraws', async () => {
    const { roleDiff } = await import('./model');
    const d = roleDiff('fulfilment', 'finance');
    expect(d.gains).toContain('finance');
    expect(d.gains).toContain('order.refund');
    expect(d.loses).toContain('inventory');
    expect(d.loses).toContain('order.fulfil');
    expect(roleDiff('finance', 'finance')).toEqual({ gains: [], loses: [] });
  });
});

describe('social links and custom roles', () => {
  it('accepts links or handles for the right platform only', async () => {
    const { parseSocial } = await import('./model');
    expect(parseSocial('instagram', '@darnuwa')).toEqual({ ok: true, url: 'https://instagram.com/darnuwa' });
    expect(parseSocial('instagram', 'tiktok.com/@darnuwa')).toEqual({ ok: false, error: 'host' });
    expect(parseSocial('x', 'http://twitter.com/darnuwa')).toEqual({ ok: true, url: 'https://twitter.com/darnuwa' });
    expect(parseSocial('youtube', '')).toEqual({ ok: true, url: '' });
  });
  it('builds a custom role from a fixed one and keeps actions tied to their page', async () => {
    const { roleFrom, togglePerm, customRoleErrors, customAllows } = await import('./model');
    const r = roleFrom('fulfilment', 'x');
    expect(customAllows(r, 'order.fulfil')).toBe(true);
    const noOrders = togglePerm(r, 'orders', false);
    expect(customAllows(noOrders, 'order.fulfil')).toBe(false);
    const refund = togglePerm(noOrders, 'order.refund', true);
    expect(customAllows(refund, 'orders')).toBe(true);
    expect(customRoleErrors({ ...r, name: { ar: 'المالية', en: '' } }, [])).toMatchObject({ name: 'taken' });
    expect(customRoleErrors({ ...r, name: { ar: 'مراجع', en: '' }, pages: [] }, [])).toMatchObject({ pages: 'required' });
  });
});
