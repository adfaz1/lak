import { describe, expect, it } from 'vitest';
import { auditCsv, auditFixtures, filterAudit, nextAuditId } from './audit';

const now = Date.parse('2026-11-24T12:00:00Z');
const list = auditFixtures(now);
describe('account activity log', () => {
  it('filters by member, area, text and period, newest first', () => {
    expect(filterAudit(list, { member: 'u2' }, new Date(now)).map((e) => e.actor.name)).toEqual(['فيصل', 'فيصل']);
    expect(filterAudit(list, { area: 'store' }, new Date(now))).toHaveLength(1);
    expect(filterAudit(list, { q: 'returns' }, new Date(now))[0].id).toBe('A-1003');
    expect(filterAudit(list, { days: 1 }, new Date(now))).toHaveLength(2);
  });
  it('exports CSV with a BOM and quotes commas', () => {
    const csv = auditCsv([{ ...list[0], what: { ar: 'أ، ب', en: 'a, b' } }], 'en');
    expect(csv.startsWith('﻿Time,')).toBe(true);
    expect(csv).toContain('"a, b"');
    expect(nextAuditId(list)).toBe('A-1007');
  });
});
