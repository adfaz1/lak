import { describe, expect, it } from 'vitest';
import { statusFixture } from '../../merchant/workspace';
import { channelCounts, channelRows, filterChannels } from './channels';

const facts = { status: statusFixture(), onlineProducts: 12, app: { addon: 'active', published: false, inApp: 10 }, market: { state: 'live' as const, listed: 4 } };
describe('sales channels', () => {
  it('lists every blueprint channel, POS and social included, with honest status', () => {
    const rows = channelRows(facts);
    expect(rows.map((r) => r.id)).toEqual(['online', 'app', 'market', 'pos', 'wholesale', 'tiktok', 'snapchat', 'ads']);
    const pos = rows.find((r) => r.id === 'pos')!;
    // Phase D (owner request 2026-11-25): POS, wholesale and ads are built as simulated tools with a pending decision.
    expect(pos.build).toBe('built');
    expect(pos.href).toEqual({ section: 'pos' });
    expect(pos.decision).toBeDefined();
    expect(rows.find((r) => r.id === 'tiktok')!.build).toBe('notBuilt');
    expect(rows.find((r) => r.id === 'app')!.state).toBe('setup');
  });
  it('reflects the store status and filters by build state or decision', () => {
    const rows = channelRows({ ...facts, status: { ...statusFixture(), maintenance: true, message: 'x' } });
    expect(rows[0].state).toBe('paused');
    const c = channelCounts(rows);
    expect(c.built + c.notBuilt).toBe(c.all);
    expect(filterChannels(rows, 'decision').every((r) => r.decision)).toBe(true);
  });
});
