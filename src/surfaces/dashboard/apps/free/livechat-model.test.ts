import { describe, expect, it } from 'vitest';
import { CHAT_DEFAULTS, chatProblems, chatStats, isChat, isOpen, mobileKey, nextOpen, openChat, parseTime, shopperThread, startProblems } from './livechat-model';
import { replyCase } from '../../../merchant/inbox';

// 2026-11-26 is a Thursday. 10:00 Riyadh = 07:00 UTC.
const at = (iso: string) => Date.parse(iso);
const s = { ...CHAT_DEFAULTS, days: [0, 1, 2, 3, 4], from: '09:00', to: '17:00' };

describe('livechat hours (Riyadh)', () => {
  it('parses times with Arabic digits and rejects bad ones', () => {
    expect(parseTime('٠٩:٣٠')).toBe(570);
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('9')).toBeNull();
  });
  it('is open inside the window on an open day only', () => {
    expect(isOpen(s, at('2026-11-26T07:00:00Z'))).toBe(true); // Thu 10:00
    expect(isOpen(s, at('2026-11-26T14:30:00Z'))).toBe(false); // Thu 17:30
    expect(isOpen(s, at('2026-11-27T07:00:00Z'))).toBe(false); // Fri
  });
  it('handles windows past midnight on the day they open', () => {
    const night = { days: [4], from: '20:00', to: '02:00' };
    expect(isOpen(night, at('2026-11-26T22:00:00Z'))).toBe(true); // Fri 01:00, opened Thu
    expect(isOpen(night, at('2026-11-27T22:00:00Z'))).toBe(false); // Sat 01:00, Fri closed
  });
  it('finds the next opening', () => {
    // Thu 18:00 → next open Sun 09:00 Riyadh = Sun 06:00 UTC.
    expect(nextOpen(s, at('2026-11-26T15:00:00Z'))).toBe(at('2026-11-29T06:00:00Z'));
    expect(nextOpen({ ...s, days: [] }, Date.now())).toBeNull();
  });
  it('validates the settings', () => {
    expect(chatProblems(CHAT_DEFAULTS)).toEqual([]);
    expect(chatProblems({ ...CHAT_DEFAULTS, days: [], from: 'x', greeting: { ar: '', en: 'Hi' } })).toEqual(['days', 'from', 'greeting']);
    expect(chatProblems({ ...CHAT_DEFAULTS, from: '10:00', to: '10:00' })).toContain('same');
  });
});

describe('livechat cases', () => {
  it('needs a name, a Saudi mobile or email, and a message', () => {
    expect(mobileKey('٠٥٥ ١٢٣ ٤٥٦٧')).toBe('551234567');
    expect(mobileKey('+966 55 123 4567')).toBe('551234567');
    expect(mobileKey('0123')).toBeNull();
    expect(startProblems({ name: 'س', contact: 'x', text: '' })).toEqual(['name', 'contact', 'text']);
    expect(startProblems({ name: 'سارة', contact: 'a@b.co', text: 'مرحبا' })).toEqual([]);
  });
  it('opens a general-message case and shows store replies to the shopper', () => {
    const c = openChat([], { name: 'سارة', text: 'هل يتوفر مقاس M؟', lang: 'ar', offline: false, visitor: 'v1', customerId: 'C-1' }, 1000);
    expect(c).toMatchObject({ type: 'message', source: 'store', status: 'new', customerId: 'C-1' });
    expect(isChat(c)).toBe(true);
    const r = replyCase(c, { text: 'نعم متوفر', lang: 'ar', channel: 'sms', status: 'sent' }, 'فيصل', 1000 + 5 * 60_000);
    expect(shopperThread(r).map((m) => m.from)).toEqual(['customer', 'store']);
    const failed = replyCase(c, { text: 'x', lang: 'ar', channel: 'sms', status: 'failed' }, 'فيصل', 2000);
    expect(shopperThread(failed)).toHaveLength(1);
    const st = chatStats([r, openChat([r], { name: 'ب', text: 'hi', lang: 'en', offline: true, visitor: 'v2' }, 3000)], 10_000);
    expect(st).toMatchObject({ chats: 2, offline: 1, answered: 1, open: 1, avgReplyMs: 5 * 60_000 });
  });
});
