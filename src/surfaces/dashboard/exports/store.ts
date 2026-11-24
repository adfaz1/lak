// Session stores for export templates and the export log (simulated: files are generated in the browser).
import { createStore } from '../../../core/store';
import { logFixtures, templateFixtures, type ExportLog, type Template } from './model';

export const templatesStore = createStore.key('dashboard.exports.templates')<Template[]>(templateFixtures);
export const exportLogStore = createStore.key('dashboard.exports.log')<ExportLog[]>(logFixtures);
/** Review mode: the next scheduled e-mail fails, to show the failed state and resending. */
export const exportSimStore = createStore.key('dashboard.exports.sim')(() => ({ failEmail: false }));
