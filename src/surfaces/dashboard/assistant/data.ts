// Gathers the store data the assistant reads and computes every answer once per render.
import { useMemo } from 'react';
import { automationsStore, cartsStore, couponsStore, customersStore, financeStore, levelsStore, ordersStore, testStore } from '../../merchant/stores';
import { historyFixtures } from '../../merchant/inventory';
import { history, TODAY } from '../analytics/model';
import { conversionInsight, lateInsight, questionsFor, restockInsight, returnsInsight, riskInsight, salesAnswer, stockInsight } from './model';

const HISTORY = historyFixtures();

export function useAnswers(days: 7 | 30, empty = false) {
  const orders = ordersStore.use();
  const levels = levelsStore.use();
  const autos = automationsStore.use();
  const carts = cartsStore.use();
  const role = testStore.use().role;
  const customers = customersStore.use();
  const coupons = couponsStore.use();
  const fin = financeStore.use();
  const series = useMemo(history, []);
  return useMemo(() => {
    const o = empty ? [] : orders, s = empty ? [] : series, l = empty ? [] : levels;
    return {
      role,
      questions: questionsFor(role),
      sales: salesAnswer(s, o, days, { levels: l, automations: autos, role }),
      stock: stockInsight(l, empty ? [] : HISTORY, o),
      late: lateInsight(o, autos),
      conversion: conversionInsight(s.length ? s : [], empty ? [] : carts, autos),
      returns: returnsInsight(o, empty ? [] : fin.txs, 30),
      risk: riskInsight(empty ? [] : customers, o, coupons.map((c) => c.code), TODAY),
      restock: restockInsight(l, empty ? [] : HISTORY, o),
    };
  }, [orders, levels, autos, carts, role, series, days, empty, customers, coupons, fin]);
}
export type Answers = ReturnType<typeof useAnswers>;
