// Settings screen of each free app, loaded only when opened. An app without its own screen yet shows a short note.
import { lazy, type ComponentType } from 'react';
import type { FreeAppId } from './registry';

export type AppScreen = ComponentType<{ id: FreeAppId }>;

export const SCREENS: Partial<Record<FreeAppId, AppScreen>> = {
  // Filled as each app is built, e.g. whatsapp: lazy(() => import('./whatsapp')),
};

export const hasScreen = (id: FreeAppId) => !!SCREENS[id];
void lazy;
