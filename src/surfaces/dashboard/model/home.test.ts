import { describe, expect, it } from 'vitest';
import { allOrders, VIEWS } from '../../merchant/domain';
import { initialLevels } from '../../merchant/inventory';
import { productFixtures, skusOf } from '../../merchant/catalog';
import { analyticsSeries } from '../../merchant/growth';
import { channelsToday, headline, salesToday, stockAlerts, tasks, topProducts } from './home';
import { productPhoto, skuPhoto } from './media';
import { DEFAULT_WS, sanitizeWs, moveIn, toggleIn, figureAllowed, cardAllowed } from './home';
import { TOOLS, canUseTool } from './tools';
import { ROLES } from '../../merchant/perms';

const orders = allOrders();
const levels = initialLevels(productFixtures().flatMap(skusOf));

describe('home tasks', () => {
  const t = tasks(orders, levels);
  it('ranks money and lateness before fulfilment and stock', () => {
    const sev = t.map((x) => x.severity);
    expect([...sev].sort((a, b) => b - a)).toEqual(sev);
    expect(t[t.length - 1].id).toBe('stock');
  });
  it('never counts a late order twice', () => {
    const late = t.find((x) => x.id === 'late')!.count;
    const fulfil = t.find((x) => x.id === 'fulfil')!.count;
    expect(late + fulfil).toBe(orders.filter(VIEWS.needs).length);
  });
  it('hides tasks with nothing to do', () => {
    expect(tasks([], []).length).toBe(0);
  });
});

describe('headline figures', () => {
  const series = analyticsSeries();
  it('reports four figures and compares equal periods', () => {
    const m = headline(series, 7);
    expect(m.map((x) => x.id)).toEqual(['net', 'orders', 'aov', 'conversion']);
    expect(m[0].value).toBe(series.slice(-7).reduce((s, d) => s + d.net, 0));
  });
  it('changes with the period', () => {
    expect(headline(series, 30)[1].value).toBeGreaterThan(headline(series, 7)[1].value!);
  });
});

describe('lists', () => {
  it('ranks best sellers by revenue and excludes failed payments', () => {
    const top = topProducts(orders);
    expect(top.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < top.length; i++) expect(top[i - 1].revenue).toBeGreaterThanOrEqual(top[i].revenue);
    expect(topProducts(orders.filter((o) => o.pay === 'failed'))).toEqual([]);
  });
  it('orders stock alerts from the emptiest', () => {
    const s = stockAlerts(levels);
    for (let i = 1; i < s.length; i++) expect(s[i - 1].available).toBeLessThanOrEqual(s[i].available);
  });
  it('counts only today’s paid sales', () => {
    expect(salesToday(orders)).toBeGreaterThan(0);
    expect(salesToday(orders.filter((o) => o.pay === 'failed'))).toBe(0);
  });
});

describe('product photos', () => {
  it('only maps photos that show the product itself', () => {
    expect(productPhoto('p1')).toBe('/products/thumb/p1.jpg');
    expect(productPhoto('p7')).toBeUndefined();
    expect(productPhoto('p10')).toBeUndefined();
    expect(skuPhoto('ABY-LIN-BLA-M', 'large')).toBe('/products/p1.jpg');
  });
});

describe('channels today', () => {
  it('splits today\u2019s orders by channel', () => {
    const c = channelsToday(orders);
    expect(c.reduce((s, x) => s + x.orders, 0)).toBe(orders.filter((o) => o.hoursAgo < 12).length);
    expect(channelsToday([]).every((x) => x.share === 0)).toBe(true);
  });
});

describe('role-aware work queue', () => {
  it('shows each role only the tasks it can open', async () => {
    const { tasks, tasksFor } = await import('./home');
    const { allOrders } = await import('../../merchant/domain');
    const { initialLevels } = await import('../../merchant/inventory');
    const { productFixtures, skusOf } = await import('../../merchant/catalog');
    const all = tasks(allOrders(), initialLevels(productFixtures().flatMap(skusOf)));
    expect(tasksFor('owner', all)).toEqual(all);
    expect(tasksFor('marketing', all)).toEqual([]);
    expect(tasksFor('finance', all).some((t) => t.id === 'stock')).toBe(false);
    expect(tasksFor('fulfilment', all).map((t) => t.id)).toContain('stock');
  });
});

describe('per-role workspace', () => {
  const ok = (role: (typeof ROLES)[number]) => (id: string, view: boolean) => { const t = TOOLS.find((x) => x.id === id); return !!t && canUseTool(t, role) && (!view || !!t.query); };
  it('defaults only use figures, cards and tools the role may open', () => {
    for (const r of ROLES) {
      const d = DEFAULT_WS[r];
      expect(d.figures.every((f) => figureAllowed(r, f))).toBe(true);
      expect(d.cards.every((c) => cardAllowed(r, c))).toBe(true);
      expect(sanitizeWs(d, r, ok(r))).toEqual(d);
    }
  });
  it('drops stale or forbidden entries and falls back on unreadable data', () => {
    const ws = sanitizeWs({ figures: ['net', 'available', 'bogus'], cards: ['top', 'recent', 'stock'], shortcuts: ['payouts', 'orders'], views: ['orders-late'] }, 'marketing', ok('marketing'));
    expect(ws.figures).toEqual(['net']);
    expect(ws.cards).toEqual(['top']);
    expect(ws.shortcuts).toEqual([]);
    expect(ws.views).toEqual([]);
    expect(sanitizeWs('garbage', 'owner', ok('owner'))).toEqual(DEFAULT_WS.owner);
  });
  it('hiding a card is per role', () => {
    const owner = sanitizeWs({ ...DEFAULT_WS.owner, cards: DEFAULT_WS.owner.cards.filter((c) => c !== 'top') }, 'owner', ok('owner'));
    expect(owner.cards.includes('top')).toBe(false);
    expect(DEFAULT_WS.marketing.cards.includes('top')).toBe(true);
  });
  it('moves and toggles keep order and limits', () => {
    expect(moveIn(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b']);
    expect(moveIn(['a', 'b'], 'a', -1)).toEqual(['a', 'b']);
    expect(toggleIn(['a'], 'b', 1)).toEqual(['a']);
    expect(toggleIn(['a', 'b'], 'a')).toEqual(['b']);
  });
});
