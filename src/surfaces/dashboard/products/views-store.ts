// Saved product views, per viewer (owner = the acting member). Session store like every fixture store; "Reset data" clears it.
import { createStore } from '../../../core/store';
import { currentActor } from '../../merchant/stores';
import { viewFixtures, type SavedView } from './views';

export const productViewsStore = createStore.key('dashboard.productViews')<SavedView[]>(() => viewFixtures(currentActor().id));
