import { D, sum, toMoney, type MoneyInput } from '../money';

/** Полученное сверх начисления показываем отдельно: долг никогда не бывает отрицательным. */
export function rentBalance(expected: MoneyInput, payments: MoneyInput[]) {
  const paid = sum(payments);
  const balance = D(expected).minus(paid);
  return {
    paidAmount: toMoney(paid),
    remainingAmount: toMoney(balance.gt(0) ? balance : 0),
    overpaidAmount: toMoney(balance.lt(0) ? balance.negated() : 0),
    done: balance.lte(0),
  };
}
