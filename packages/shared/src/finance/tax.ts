import Decimal from 'decimal.js';
import { D, type Money, type MoneyInput, toMoney } from '../money';
import type { TaxRegime } from '../enums';

/** Годовой лимит дохода для самозанятых (422-ФЗ). */
export const NPD_ANNUAL_LIMIT = 2_400_000;

/**
 * Прогрессивная шкала НДФЛ с 2025 г. (ст. 224 НК РФ). Аренда входит в основную налоговую базу.
 * [верхняя граница диапазона, ставка]
 */
const NDFL_BRACKETS: Array<[number, number]> = [
  [2_400_000, 0.13],
  [5_000_000, 0.15],
  [20_000_000, 0.18],
  [50_000_000, 0.2],
  [Infinity, 0.22],
];

export interface TaxIncome {
  amount: MoneyInput;
  /** Арендатор — юрлицо или ИП. Для НПД ставка 6% вместо 4%. */
  fromLegalEntity?: boolean;
}

export interface TaxEstimate {
  regime: TaxRegime;
  income: Money;
  tax: Money;
  /** Эффективная ставка, доля (0.04 = 4%). */
  effectiveRate: number;
  /** Только для НПД: сколько ещё можно заработать до лимита (не меньше 0). */
  npdLimitLeft?: Money;
  npdLimitExceeded?: boolean;
}

export function ndflProgressive(income: MoneyInput): Decimal {
  let rest = D(income);
  let prevTop = 0;
  let tax = new Decimal(0);
  for (const [top, rate] of NDFL_BRACKETS) {
    if (rest.lte(0)) break;
    const width = top === Infinity ? rest : Decimal.min(rest, top - prevTop);
    tax = tax.plus(width.times(rate));
    rest = rest.minus(width);
    prevTop = top;
  }
  return tax;
}

/**
 * Оценка налога на доход от аренды за календарный год (или его часть с начала года).
 * Это оценка для дашборда, а не налоговая консультация.
 */
export function estimateRentalTax(regime: TaxRegime, incomes: TaxIncome[]): TaxEstimate {
  const total = incomes.reduce((acc, i) => acc.plus(i.amount), new Decimal(0));
  let tax: Decimal;
  const extra: Partial<TaxEstimate> = {};

  switch (regime) {
    case 'NPD': {
      tax = incomes.reduce(
        (acc, i) => acc.plus(D(i.amount).times(i.fromLegalEntity ? 0.06 : 0.04)),
        new Decimal(0),
      );
      extra.npdLimitLeft = toMoney(Decimal.max(0, D(NPD_ANNUAL_LIMIT).minus(total)));
      extra.npdLimitExceeded = total.gt(NPD_ANNUAL_LIMIT);
      break;
    }
    case 'NDFL':
      tax = ndflProgressive(total);
      break;
    case 'USN6':
      // Без уменьшения на страховые взносы ИП — это добавим позже.
      tax = total.times(0.06);
      break;
    case 'NONE':
      tax = new Decimal(0);
      break;
  }

  return {
    regime,
    income: toMoney(total),
    tax: toMoney(tax),
    effectiveRate: total.isZero() ? 0 : tax.div(total).toDecimalPlaces(4).toNumber(),
    ...extra,
  };
}
