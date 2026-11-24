import { describe, expect, it } from 'vitest';
import {
  alertsFor, backupCodes, checkCode, defaultPrefs, demoCode, needsReverify, normPrefs, profileErrors, revokeOthers, revokeSession, sessionFixtures,
  setPref, setupSecret, toAsciiDigits, weeklySms,
} from './account-model';

describe('my account', () => {
  it('validates the profile and asks to confirm a changed email or mobile', () => {
    const p = { name: 'سارة', email: 'owner@darnuwa.test', phone: '٠٥٥١٢٣٤٥٦٧', jobTitle: '' };
    expect(profileErrors(p)).toEqual({});
    expect(profileErrors({ ...p, email: 'x' })).toEqual({ email: 'invalid' });
    expect(needsReverify(p, { ...p, email: 'new@darnuwa.test' })).toEqual(['email']);
    expect(needsReverify(p, { ...p, phone: '0551234567' })).toEqual([]);
  });
  it('shows each role only the alerts it can act on; security alerts stay on by email', () => {
    expect(alertsFor('fulfilment').map((a) => a.id)).not.toContain('payout');
    expect(alertsFor('finance').map((a) => a.id)).toContain('payout');
    expect(alertsFor('marketing').map((a) => a.id)).toContain('newDevice');
    const p = defaultPrefs();
    expect(setPref(p, 'newDevice', 'email', false).newDevice.email).toBe(true);
    expect(normPrefs({ newOrder: { app: false, email: false, sms: false } } as never).paymentFailed.sms).toBe(true);
    expect(weeklySms(setPref(p, 'newOrder', 'sms', true), 'owner')).toBeGreaterThan(weeklySms(p, 'owner'));
  });
  it('signs out other devices but never the current one', () => {
    const s = sessionFixtures();
    expect(revokeSession(s, 's1')).toHaveLength(3);
    expect(revokeSession(s, 's2')).toHaveLength(2);
    expect(revokeOthers(s).map((x) => x.id)).toEqual(['s1']);
  });
  it('checks two-step codes, accepting Arabic digits', () => {
    const secret = setupSecret('u1-app');
    const code = demoCode(secret);
    expect(checkCode(code, secret)).toBeNull();
    expect(checkCode(code.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]), secret)).toBeNull();
    expect(checkCode('12', secret)).toBe('format');
    expect(checkCode(code === '000000' ? '111111' : '000000', secret)).toBe('wrong');
    expect(new Set(backupCodes(secret)).size).toBe(10);
    expect(toAsciiDigits('۱۲۳')).toBe('123');
  });
});
