// Roles and capabilities for the merchant workspace (simulated).
// The UI uses these checks to withhold pages and actions, but a UI check is not a permission system:
// the real platform must enforce the same rules on the server for every page, API call and export.

export type Role = 'owner' | 'fulfilment' | 'finance' | 'marketing';
export const ROLES: Role[] = ['owner', 'fulfilment', 'finance', 'marketing'];

export type Page =
  | 'home' | 'orders' | 'products' | 'inventory' | 'customers'
  | 'analytics' | 'finance' | 'marketing' | 'automations'
  | 'storefront' | 'apps' | 'settings' | 'help';

export type Action =
  | 'order.fulfil' | 'order.bulk' | 'order.refund'
  | 'product.edit' | 'product.import'
  | 'inventory.adjust' | 'inventory.transfer'
  | 'customer.contact' | 'customer.note' | 'customer.message'
  | 'marketing.manage' | 'marketing.send' | 'automation.manage'
  | 'theme.publish' | 'apps.manage'
  | 'settings.manage' | 'team.manage' | 'billing.manage';

const PAGES: Record<Role, Page[]> = {
  owner: ['home', 'orders', 'products', 'inventory', 'customers', 'analytics', 'finance', 'marketing', 'automations', 'storefront', 'apps', 'settings', 'help'],
  fulfilment: ['home', 'orders', 'products', 'inventory', 'settings', 'help'],
  finance: ['home', 'orders', 'analytics', 'finance', 'settings', 'help'],
  marketing: ['home', 'products', 'customers', 'analytics', 'marketing', 'automations', 'storefront', 'settings', 'help'],
};

const ACTIONS: Record<Role, Action[]> = {
  owner: [
    'order.fulfil', 'order.bulk', 'order.refund', 'product.edit', 'product.import', 'inventory.adjust', 'inventory.transfer',
    'customer.contact', 'customer.note', 'customer.message', 'marketing.manage', 'marketing.send', 'automation.manage',
    'theme.publish', 'apps.manage', 'settings.manage', 'team.manage', 'billing.manage',
  ],
  fulfilment: ['order.fulfil', 'order.bulk', 'inventory.adjust', 'inventory.transfer'],
  finance: ['order.refund', 'billing.manage'],
  marketing: ['product.edit', 'customer.contact', 'customer.note', 'customer.message', 'marketing.manage', 'marketing.send', 'automation.manage'],
};

export const canSee = (role: Role, page: Page): boolean => PAGES[role].includes(page);
export const can = (role: Role, action: Action): boolean => ACTIONS[role].includes(action);

/** Settings categories: personal language is open to everyone, the rest need specific capabilities. */
export type SettingsCat = 'store' | 'team' | 'payments' | 'shipping' | 'domains' | 'policies' | 'notifications' | 'language' | 'billing';
const SETTINGS_NEED: Record<SettingsCat, Action | null> = {
  store: 'settings.manage', team: 'team.manage', payments: 'settings.manage', shipping: 'settings.manage', domains: 'settings.manage',
  policies: 'settings.manage', notifications: 'settings.manage', language: null, billing: 'billing.manage',
};
export const canSeeSettings = (role: Role, cat: SettingsCat): boolean => {
  const need = SETTINGS_NEED[cat];
  return need === null || can(role, need);
};

/** Matrix rows shown on the Team & permissions screen, derived from the same tables the checks use. */
export const MATRIX_PAGES: Page[] = ['orders', 'products', 'inventory', 'customers', 'analytics', 'finance', 'marketing', 'automations', 'storefront', 'apps'];
export const MATRIX_ACTIONS: Action[] = ['order.fulfil', 'order.refund', 'product.edit', 'inventory.adjust', 'customer.message', 'marketing.send', 'theme.publish', 'apps.manage', 'team.manage', 'billing.manage'];
