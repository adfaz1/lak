import { ohref } from './ui';
/** A return's page: `#/dashboard/orders/returns/<RMA id>`. */
export const rhref = (id: string, query?: Record<string, string | undefined>) => ohref(`returns/${id}`, query);
