import Decimal from 'decimal.js';
import { D, type Money, type MoneyInput, toMoney } from '../money';
import type { TaxRegime } from '../enums';
import { estimateRentalTax, type TaxIncome } from './tax';

export interface YieldInput {
  /** Цена покупки квартиры. */
  purchasePrice: MoneyInput;
  /** Доход за период (аренда, компенсации). */
  income: MoneyInput;
  /** Операционные расходы за период: ЖКХ, ремонт, налоги, — без ипотеки. */
  operatingExpenses: MoneyInput;
  /** Платежи по ипотеке за период (тело + проценты). */
  mortgagePayments?: MoneyInput;
  /** Длина периода в днях, чтобы привести доходность к годовой. */
  periodDays: number;
  /** Сколько дней из периода квартира была сдана. */
  occupiedDays?: number;
}

export interface YieldResult {
  /** Чистый операционный доход: доход − операционные расходы. */
  noi: Money;
  /** Деньги на руках после ипотеки. */
  cashflow: Money;
  /** Годовая валовая доходность: доход за год / цена. */
  grossYield: number;
  /** Годовая чистая доходность: NOI за год / цена. */
  netYield: number;
  /** Окупаемость в годах по NOI; null, если NOI ≤ 0. */
  paybackYears: number | null;
  /** Загрузка, доля 0..1; null, если occupiedDays не передан. */
  occupancy: number | null;
}

export function calcYield(input: YieldInput): YieldResult {
  if (input.periodDays <= 0) throw new Error('periodDays должен быть больше 0');
  const price = D(input.purchasePrice);
  const income = D(input.income);
  const noi = income.minus(input.operatingExpenses);
  const cashflow = noi.minus(input.mortgagePayments ?? 0);
  const annualize = new Decimal(365).div(input.periodDays);
  const annualNoi = noi.times(annualize);

  const ratio = (v: Decimal) => (price.isZero() ? 0 : v.div(price).toDecimalPlaces(4).toNumber());

  return {
    noi: toMoney(noi),
    cashflow: toMoney(cashflow),
    grossYield: ratio(income.times(annualize)),
    netYield: ratio(annualNoi),
    paybackYears: annualNoi.lte(0) ? null : price.div(annualNoi).toDecimalPlaces(1).toNumber(),
    occupancy:
      input.occupiedDays === undefined
        ? null
        : Math.min(1, Math.max(0, input.occupiedDays / input.periodDays)),
  };
}

export interface PropertyYieldInput {
  propertyId: string;
  purchasePrice: MoneyInput | null;
  /** Доходы за окно для налога (юрлица 6% при НПД); допустимы агрегаты — по одной записи на признак «юрлицо» */
  incomes: TaxIncome[];
  /** Расходы за окно без статей mortgage и rental_tax */
  operatingExpenses: MoneyInput;
  /** Операции статьи mortgage за окно */
  mortgagePaid: MoneyInput;
  /** Property.mortgage.monthlyPayment, если ипотека заполнена */
  mortgageMonthly: MoneyInput | null;
  /** Месяцев от первой операции (в окне 12 мес.) до текущего включительно, 0 — операций нет */
  monthsOfData: number;
}

export interface PropertyYield {
  propertyId: string;
  status: 'OK' | 'NO_PRICE' | 'NO_DATA';
  income: Money;
  expenses: Money;
  tax: Money;
  /** income − expenses − tax за фактический период */
  net: Money;
  /** net × 12 / monthsOfData */
  annualNet: Money;
  monthsOfData: number;
  annualized: boolean; // monthsOfData < 12
  yieldPct: number | null; // annualNet / price × 100, 1 знак; null если не OK
  cashflow: Money | null; // net − платежи по ипотеке; null если ипотеки нет
  mortgageSource: 'TRANSACTIONS' | 'SCHEDULE' | null;
}

const pct = (v: Decimal) => v.times(100).toDecimalPlaces(1).toNumber();

/**
 * Чистая доходность по фактическим операциям за окно (до 12 месяцев): (доходы − расходы − налог) за год / цена.
 * Налог считается один раз на весь портфель (прогрессия НДФЛ, лимит НПД) и делится по квартирам пропорционально доходу.
 */
export function portfolioYields(
  regime: TaxRegime,
  rows: PropertyYieldInput[],
): { properties: PropertyYield[]; avgYieldPct: number | null } {
  const portfolioTax = D(estimateRentalTax(regime, rows.flatMap((r) => r.incomes)).tax);
  const incomes = rows.map((r) => r.incomes.reduce((a, i) => a.plus(i.amount), D(0)));
  const totalIncome = incomes.reduce((a, v) => a.plus(v), D(0));
  const lastWithIncome = incomes.reduce((acc, v, i) => (v.gt(0) ? i : acc), -1);

  // Доли налога: всем, кроме последней квартиры с доходом, — по пропорции; ей — остаток
  const taxes: Decimal[] = rows.map(() => D(0));
  let allocated = D(0);
  incomes.forEach((v, i) => {
    if (i === lastWithIncome || v.lte(0) || totalIncome.lte(0)) return;
    taxes[i] = D(toMoney(portfolioTax.times(v).div(totalIncome)));
    allocated = allocated.plus(taxes[i]!);
  });
  if (lastWithIncome >= 0) taxes[lastWithIncome] = portfolioTax.minus(allocated);

  let sumNet = D(0);
  let sumPrice = D(0);
  const properties = rows.map((r, i): PropertyYield => {
    const price = r.purchasePrice == null ? D(0) : D(r.purchasePrice);
    const months = r.monthsOfData;
    const income = incomes[i]!;
    const expenses = D(r.operatingExpenses);
    const net = income.minus(expenses).minus(taxes[i]!);
    const annualNet = months > 0 ? net.times(12).div(months) : D(0);
    const status = price.lte(0) ? 'NO_PRICE' : months === 0 ? 'NO_DATA' : 'OK';

    const paid = D(r.mortgagePaid);
    let mortgage: Decimal | null = null;
    let mortgageSource: PropertyYield['mortgageSource'] = null;
    if (months === 0) {
      // Нет операций — нет и периода, за который считать ипотеку
    } else if (paid.gt(0)) {
      mortgage = paid;
      mortgageSource = 'TRANSACTIONS';
    } else if (r.mortgageMonthly != null) {
      mortgage = D(r.mortgageMonthly).times(months);
      mortgageSource = 'SCHEDULE';
    }

    if (status === 'OK') {
      sumNet = sumNet.plus(annualNet);
      sumPrice = sumPrice.plus(price);
    }
    return {
      propertyId: r.propertyId,
      status,
      income: toMoney(income),
      expenses: toMoney(expenses),
      tax: toMoney(taxes[i]!),
      net: toMoney(net),
      annualNet: toMoney(annualNet),
      monthsOfData: months,
      annualized: months < 12,
      yieldPct: status === 'OK' ? pct(annualNet.div(price)) : null,
      cashflow: mortgage ? toMoney(net.minus(mortgage)) : null,
      mortgageSource,
    };
  });

  return { properties, avgYieldPct: sumPrice.gt(0) ? pct(sumNet.div(sumPrice)) : null };
}
