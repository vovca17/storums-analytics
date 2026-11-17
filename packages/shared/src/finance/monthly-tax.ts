import Decimal from 'decimal.js';
import { type Money, toMoney } from '../money';
import type { TaxRegime } from '../enums';
import { estimateRentalTax, type TaxIncome } from './tax';

export interface MonthIncome {
  /** "2026-03" */
  period: string;
  /** Доходы месяца; fromLegalEntity — для НПД 6% */
  incomes: TaxIncome[];
}

export interface MonthTax {
  period: string;
  income: Money;
  tax: Money;
}

export interface YearTax {
  regime: TaxRegime;
  months: MonthTax[];
  income: Money;
  tax: Money;
  /** Только НПД */
  npdLimitLeft?: Money;
  npdLimitExceeded?: boolean;
}

/**
 * Налог по месяцам одного года. Налог месяца = налог нарастающим итогом с начала года
 * минус налог за предыдущие месяцы — так прогрессия НДФЛ попадает в тот месяц,
 * где доход перешёл порог. Оценка, не налоговая консультация.
 */
export function monthlyTax(regime: TaxRegime, months: MonthIncome[]): YearTax {
  const sorted = [...months].sort((a, b) => a.period.localeCompare(b.period));
  const all: TaxIncome[] = [];
  let paid = new Decimal(0);
  const out: MonthTax[] = sorted.map((m) => {
    all.push(...m.incomes);
    const cumulative = new Decimal(estimateRentalTax(regime, all).tax);
    const tax = cumulative.minus(paid);
    paid = cumulative;
    const income = m.incomes.reduce((a, i) => a.plus(i.amount), new Decimal(0));
    return { period: m.period, income: toMoney(income), tax: toMoney(tax) };
  });
  const year = estimateRentalTax(regime, all);
  return {
    regime,
    months: out,
    income: year.income,
    tax: year.tax,
    ...(regime === 'NPD' && { npdLimitLeft: year.npdLimitLeft, npdLimitExceeded: year.npdLimitExceeded }),
  };
}
