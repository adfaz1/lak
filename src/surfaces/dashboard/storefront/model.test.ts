import { describe, expect, it } from 'vitest';
import { statusFixture, themeFixture } from '../../merchant/workspace';
import {
  canRollback, changeOf, discardDraft, headingError, maintenanceError, move, nextVersion, pendingChanges, previewSections, publish, publishBlock,
  rollbackTheme, shopperView, toggleStatus, updateSection,
} from './model';

describe('theme draft', () => {
  it('starts with a draft identical to the live version', () => {
    const t = themeFixture();
    expect(pendingChanges(t)).toEqual([]);
    expect(publishBlock(t)).toBe('noChanges');
    expect(nextVersion(t)).toBe(8);
  });
  it('tracks moves, visibility and headings as pending changes', () => {
    let t = move(themeFixture(), 's3', -1);
    t = updateSection(t, 's5', { visible: true });
    t = updateSection(t, 's7', { heading: 'Join the list' });
    expect(pendingChanges(t).map((c) => [c.id, c.kind])).toEqual([['s3', 'moved'], ['s2', 'moved'], ['s5', 'shown'], ['s7', 'edited']]);
    expect(changeOf(t, 's5')).toBe('shown');
    expect(changeOf(t, 's1')).toBeNull();
    expect(publishBlock(t)).toBeNull();
    expect(pendingChanges(discardDraft(t))).toEqual([]);
  });
  it('blocks publishing with an empty or too long heading', () => {
    expect(publishBlock(updateSection(themeFixture(), 's1', { heading: ' ' }))).toBe('invalid');
    expect(headingError('x'.repeat(61))).toBe('long');
    expect(headingError('Hello')).toBeNull();
  });
  it('previews only visible sections in draft order', () => {
    const t = move(themeFixture(), 's7', -1);
    expect(previewSections(t.draft).map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4', 's7']);
  });
});

describe('publish and rollback', () => {
  it('publishes the draft as the next version and keeps history', () => {
    const t = publish(updateSection(themeFixture(), 's5', { visible: true }), '  ');
    expect(t.published.version).toBe(8);
    expect(t.published.note).toBe('Update');
    expect(t.history.map((h) => h.version)).toEqual([8, 7, 6]);
    expect(pendingChanges(t)).toEqual([]);
  });
  it('rolls back by publishing a copy as a new version, never to the live one', () => {
    const t = themeFixture();
    expect(canRollback(t, 7)).toBe(false);
    expect(canRollback(t, 6)).toBe(true);
    const r = rollbackTheme(t, 6);
    expect(r.published.version).toBe(8);
    expect(r.published.sections.find((s) => s.id === 's2')?.heading).toBe('وصل حديثًا لموسم الخريف');
  });
});

describe('store status', () => {
  it('derives what shoppers experience; maintenance overrides ordering', () => {
    const s = statusFixture();
    expect(shopperView(s)).toBe('open');
    expect(shopperView({ ...s, accepting: false })).toBe('browseOnly');
    expect(shopperView({ ...s, accepting: false, maintenance: true })).toBe('maintenance');
    expect(shopperView({ ...s, published: false, maintenance: true })).toBe('hidden');
  });
  it('flips one switch at a time; maintenance needs a message', () => {
    const s = statusFixture();
    expect(toggleStatus(s, 'accepting')).toEqual({ ...s, accepting: false });
    expect(toggleStatus(s, 'maintenance', '')).toBeNull();
    expect(toggleStatus(s, 'maintenance', '  Back soon ')).toEqual({ ...s, maintenance: true, message: 'Back soon' });
    expect(toggleStatus({ ...s, maintenance: true, message: 'x' }, 'maintenance')).toMatchObject({ maintenance: false, published: true, accepting: true });
    expect(maintenanceError('x'.repeat(161))).toBe('long');
  });
});
