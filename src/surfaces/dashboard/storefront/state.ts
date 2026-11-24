// Online-store content for the session (simulated): information pages, header/footer menus and store SEO.
// The shopper store (#/store) reads the live parts through storefront/bridge.ts. "Reset data" restores the fixture.
import { createStore } from '../../../core/store';
import { contentFixture, type ContentState } from './content';

export const contentStore = createStore.key('dashboard.storefront.content')<ContentState>(() => contentFixture());
