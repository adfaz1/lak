import { describe, expect, it } from 'vitest';
import { decide, notStartedFixture, verificationFixture, type Verification } from '../../merchant/verification';
import { canOpen, categoryStatus, searchCategories } from './model';
import { verificationWorkItem } from './verification-work';

const step = (v: Verification, to: Parameters<typeof decide>[1], reason = '') => (decide(v, to, 'R', 1, reason) as { v: Verification }).v;

describe('store verification in settings', () => {
  it('is a settings category for owner and finance only, found by its words', () => {
    expect(canOpen('owner', 'verification')).toBe(true);
    expect(canOpen('finance', 'verification')).toBe(true);
    expect(canOpen('fulfilment', 'verification')).toBe(false);
    expect(canOpen('marketing', 'verification')).toBe(false);
    expect(searchCategories('سجل تجاري').map((c) => c.id)).toEqual(['verification']);
    expect(searchCategories('kyc').map((c) => c.id)).toEqual(['verification']);
  });
  it('the settings card reads the same status as the payouts notice', () => {
    const d = { providers: [], zones: [], domain: { state: 'none' } as never, policies: [], members: [], plan: 'basic' as never };
    expect(categoryStatus('verification', { ...d, verification: 'verified' })).toEqual({ tone: 'green', code: 'kyc', kyc: 'verified' });
    expect(categoryStatus('verification', { ...d, verification: 'needs_info' })).toMatchObject({ tone: 'red', kyc: 'needs_info' });
    expect(categoryStatus('verification', d)).toBeNull();
  });
});

describe('verificationWorkItem', () => {
  it('nothing to do when verified or while a review runs', () => {
    expect(verificationWorkItem(verificationFixture())).toBeNull();
    const sub = { ...notStartedFixture(), status: 'submitted' as const, form: verificationFixture().form };
    expect(verificationWorkItem(sub)).toBeNull();
    expect(verificationWorkItem(step(sub, 'under_review'))).toBeNull();
  });
  it('not started, needs info and rejected open verification, with the reason', () => {
    const ns = verificationWorkItem(notStartedFixture(), 125_000)!;
    expect(ns).toMatchObject({ kind: 'verification', severity: 2, money: 125_000, action: { section: 'settings', path: 'verification' }, settings: 'billing' });
    const sub = { ...notStartedFixture(), status: 'submitted' as const, form: verificationFixture().form };
    const ni = verificationWorkItem(step(step(sub, 'under_review'), 'needs_info', 'IBAN letter unreadable'))!;
    expect(ni.severity).toBe(3);
    expect(ni.why.en).toContain('IBAN letter unreadable');
    expect(ni.fingerprint).not.toBe(ns.fingerprint);
  });
});
