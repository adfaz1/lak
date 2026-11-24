// Channel fixture state (simulated): whether the merchant shows products in «سوق لك», the store's verification
// as LAK records it, and LAK's review decisions per product. Not a permission or review system.
import { createStore } from '../../../core/store';
import type { Reviews } from './model';

export interface ChannelFx { enabled: boolean; verified: boolean; reviews: Reviews }
export const channelStore = createStore.key('dashboard.channel')<ChannelFx>(() => ({
  enabled: true,
  verified: true,
  reviews: { p1: { review: 'approved' }, p3: { review: 'approved' }, p4: { review: 'approved' }, p5: { review: 'approved' } },
}));
