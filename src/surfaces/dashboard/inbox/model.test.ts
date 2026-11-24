import { describe, expect, it } from 'vitest';
import { allOrders } from '../../merchant/domain';
import { reviewFixtures } from '../../merchant/growth';
import { customerFixtures } from '../../merchant/workspace';
import { openReturn, caseMessage } from '../../merchant/ops';
import {
  addCaseNote, assignCase, cannedFixtures, cannedProblems, carrierAnswers, caseFixtures, customerWrites, escalate, fillCanned, openFromStore,
  replyCase, replyProblem, setStatus, shopperProblems, shopperState, sla,
} from '../../merchant/inbox';
import { buildCases, bulkPlan, caseContext, inboxWorkItems, listCases, readQuery, scriptMismatch, toParams, upsert, viewNameError } from './model';

const NOW = Date.UTC(2026, 10, 24, 9);
const H = 3_600_000;
const src = () => ({ orders: allOrders(), reviews: reviewFixtures(), customers: customerFixtures() });

describe('one inbox from five places', () => {
  it('derives negative reviews (≤3★) and questions, not good reviews', () => {
    const all = buildCases(caseFixtures(NOW), src());
    const ids = all.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['CS-RV-117', 'CS-RV-115', 'CS-RV-111', 'CS-QA-208', 'CS-QA-206', 'CS-QA-207']));
    expect(ids).not.toContain('CS-RV-118');
    expect(all.find((c) => c.id === 'CS-QA-207')!.status).toBe('resolved');
    expect(all.find((c) => c.id === 'CS-RV-117')!.type).toBe('review');
  });
  it('derives a return case from an order return and follows its stage', () => {
    const s = src();
    const o = s.orders.find((x) => x.ref === '10476')!;
    const r = openReturn(o, [{ idx: 0, qty: 1, reason: 'تالف' }], { name: 'customer', role: 'customer' }, NOW);
    s.orders = s.orders.map((x) => (x.ref === o.ref ? r.order : x));
    const c = buildCases([], s).find((x) => x.sourceId === r.id)!;
    expect(c.type).toBe('return');
    expect(c.status).toBe('new');
    expect(c.orderRef).toBe('10476');
  });
  it('a stored derived case wins over the derived copy, and reads resolved once its source closes', () => {
    const s = src();
    const d = buildCases([], s).find((c) => c.id === 'CS-QA-208')!;
    const stored = upsert([], assignCase(d, 'فيصل', 'سارة', NOW));
    expect(buildCases(stored, s).find((c) => c.id === 'CS-QA-208')!.assignee).toBe('فيصل');
    s.reviews = s.reviews.map((r) => (r.id === 'QA-208' ? { ...r, reply: { text: 'نعم', by: 'سارة', at: '2026-11-24' } } : r));
    expect(buildCases(stored, s).find((c) => c.id === 'CS-QA-208')!.status).toBe('resolved');
  });
  it('links the order and customer value inline', () => {
    const all = buildCases(caseFixtures(NOW), src());
    const c = all.find((x) => x.id === 'CS-2046')!;
    const ctx = caseContext(c, all, src());
    expect(ctx.order?.ref).toBe('10476');
    expect(ctx.customer?.name.en).toBe('Lama Alzahrani');
    expect(ctx.value.orders).toBeGreaterThan(0);
    expect(ctx.value.spent).toBeGreaterThan(0);
  });
});

describe('SLA', () => {
  const c = caseFixtures(NOW).find((x) => x.id === 'CS-2046')!;
  it('breaches when waiting on us past the priority target', () => expect(sla(c, NOW).state).toBe('breached'));
  it('pauses while waiting on the customer', () => expect(sla(setStatus(c, 'customer', 'x', NOW), NOW).state).toBe('paused'));
  it('restarts when the customer writes again', () => {
    const w = customerWrites(setStatus(c, 'customer', 'x', NOW), 'any news?', NOW);
    expect(w.status).toBe('us');
    expect(sla(w, NOW + H).state).toBe('ok');
  });
  it('carrier ticket has its own 48h clock', () => {
    const lost = caseFixtures(NOW).find((x) => x.id === 'CS-2047')!;
    expect(sla(lost, NOW).state).not.toBe('breached');
    expect(sla(lost, NOW + 30 * H).state).toBe('breached');
  });
});

describe('case actions', () => {
  const base = caseFixtures(NOW).find((x) => x.id === 'CS-2048')!;
  it('reply sets first reply and waits on the customer; failed send keeps the case with us', () => {
    const ok = replyCase(base, { text: 'نعتذر', lang: 'ar', channel: 'sms', status: 'sent' }, 'سارة', NOW);
    expect(ok.status).toBe('customer');
    expect(ok.firstReplyAt).toBe(NOW);
    const bad = replyCase(base, { text: 'نعتذر', lang: 'ar', channel: 'sms', status: 'failed' }, 'سارة', NOW);
    expect(bad.status).toBe('new');
    expect(bad.firstReplyAt).toBeUndefined();
    expect(replyCase(base, { text: 'تم', lang: 'ar', channel: 'sms', status: 'sent', close: true }, 'سارة', NOW).status).toBe('resolved');
  });
  it('validates replies: empty, unfilled placeholders', () => {
    expect(replyProblem('  ')).toBe('empty');
    expect(replyProblem('Hi {customer}')).toBe('vars');
    expect(replyProblem('Hi Sara')).toBeNull();
  });
  it('escalates a shipping case to the carrier and gets an answer back', () => {
    const e = escalate(base, 'a', 'TRK1', 'فيصل', NOW);
    expect(e.status).toBe('carrier');
    expect(e.ship?.ticket?.state).toBe('open');
    const a = carrierAnswers(e, NOW + H);
    expect(a.status).toBe('us');
    expect(a.messages.at(-1)?.from).toBe('carrier');
    expect(escalate(base, 'a', 'TRK1', 'فيصل', NOW, true).status).toBe(base.status);
  });
  it('notes are internal and trimmed; empty is ignored', () => {
    expect(addCaseNote(base, '   ', 'x', NOW)).toBe(base);
    expect(addCaseNote(base, ' اتصل به ', 'x', NOW).notes.at(-1)?.text).toBe('اتصل به');
  });
  it('records the reply in the order message log', () => {
    const o = allOrders().find((x) => x.ref === '10477')!;
    const n = caseMessage(o, { channel: 'sms', lang: 'ar', to: '+966500000000', body: 'نعتذر', caseId: 'CS-2048' }, { name: 'سارة', role: 'owner' }, NOW);
    expect(n.messages?.at(-1)).toMatchObject({ event: 'caseReply', status: 'sent', body: 'نعتذر' });
    expect(caseMessage(o, { channel: 'email', lang: 'ar', body: 'x' }, { name: 'سارة', role: 'owner' }, NOW).messages?.at(-1)?.status).toBe('skipped');
  });
});

describe('list, URL and bulk', () => {
  const all = buildCases(caseFixtures(NOW), src());
  it('reads and writes the query with defaults left out', () => {
    const q = readQuery(new URLSearchParams('view=breach&type=shipping&page=2&bogus=1'));
    expect(q).toMatchObject({ view: 'breach', type: 'shipping', page: 2, sort: 'due' });
    expect(toParams(readQuery(new URLSearchParams('')))).toEqual(expect.objectContaining({ view: undefined, sort: undefined }));
  });
  it('filters by view and puts breached first', () => {
    const r = listCases(all, readQuery(new URLSearchParams('')), 'سارة', NOW);
    expect(r.rows.every((c) => c.status !== 'resolved')).toBe(true);
    expect(sla(r.rows[0], NOW).state).toBe('breached');
    expect(r.counts.carrier).toBe(1);
    expect(listCases(all, readQuery(new URLSearchParams('q=10476')), 'سارة', NOW).rows.map((c) => c.id)).toContain('CS-2046');
  });
  it('bulk close skips resolved and flags work left open elsewhere', () => {
    const p = bulkPlan(all, ['CS-2042', 'CS-2047', 'CS-2048'], 'close');
    expect(p.skipped).toBe(1);
    expect(p.loose).toEqual(['CS-2047']);
  });
  it('saved view names are checked', () => {
    expect(viewNameError(' ', [])).toBe('empty');
    expect(viewNameError('Late', [{ id: '1', name: 'late', params: {} }])).toBe('taken');
  });
  it('work centre gets breached and escalated cases', () => {
    const items = inboxWorkItems(all, allOrders(), NOW);
    expect(items.map((i) => i.id)).toEqual(['inbox-breach', 'inbox-carrier']);
    expect(items[0].facts.count).toBeGreaterThan(0);
    expect(items[0].action).toEqual({ section: 'inbox', query: { view: 'breach' } });
  });
  it('script mismatch warns when the reply is in the other language', () => {
    expect(scriptMismatch('Hello there, your order is coming', 'ar')).toBe(true);
    expect(scriptMismatch('أهلًا، طلبك في الطريق إليك', 'ar')).toBe(false);
  });
});

describe('shopper side and canned replies', () => {
  it('opens a shipping case from the store order page with the issue filled', () => {
    const c = openFromStore(caseFixtures(NOW), { orderRef: '10477', customer: { ar: 'فهد', en: 'Fahad' }, topic: 'damaged', text: 'وصل مكسور', lang: 'ar' }, NOW);
    expect(c).toMatchObject({ id: 'CS-2049', type: 'shipping', status: 'new', priority: 'high', ship: { issue: 'damaged' } });
    expect(shopperState(c)).toBe('received');
    expect(shopperState(replyCase(c, { text: 'نعتذر', lang: 'ar', channel: 'sms', status: 'sent' }, 'x', NOW))).toBe('answered');
    expect(shopperProblems('nope', 'hi')).toEqual(['topic', 'text']);
  });
  it('canned replies are bilingual and fill known variables only', () => {
    for (const c of cannedFixtures()) expect(cannedProblems(c)).toEqual([]);
    expect(cannedProblems({ title: { ar: 'x', en: 'x' }, body: { ar: '{foo}', en: 'y' } })).toContain('unknownVar');
    expect(fillCanned('أهلًا {customer} {order}', { customer: 'سارة' })).toBe('أهلًا سارة {order}');
  });
});
