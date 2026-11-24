// Links to the print view. Up to 40 orders travel in the URL; a larger selection is kept in a session job.
import { createStore } from '../../../core/store';
import { ohref } from './ui';

export type Doc = 'invoice' | 'label' | 'slip';
export const DOCS: Doc[] = ['invoice', 'slip', 'label'];
export const printJobStore = createStore.key('dashboard.orders.printJob')<{ id: string; refs: string[] }>(() => ({ id: '', refs: [] }));

export function printHref(doc: Doc, refs: string[]): string {
  if (refs.length <= 40) return ohref('print', { doc, refs: refs.join(',') });
  const id = Date.now().toString(36);
  printJobStore.set({ id, refs });
  return ohref('print', { doc, job: id });
}
