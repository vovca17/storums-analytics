import { describe, expect, it } from 'vitest';
import { calcYield, ndflProgressive, portfolioYields, type PropertyYieldInput } from '../src';

describe('calcYield', () => {
  it('годовая доходность и окупаемость', () => {
    const r = calcYield({
      purchasePrice: 10_000_000,
      income: 600_000,
      operatingExpenses: 100_000,
      mortgagePayments: 300_000,
      periodDays: 365,
      occupiedDays: 330,
    });
    expect(r.noi).toBe('500000.00');
    expect(r.cashflow).toBe('200000.00');
    expect(r.grossYield).toBe(0.06);
    expect(r.netYield).toBe(0.05);
    expect(r.paybackYears).toBe(20);
    expect(r.occupancy).toBeCloseTo(0.904, 3);
  });

  it('приводит месяц к году', () => {
    const r = calcYield({ purchasePrice: 12_000_000, income: 50_000, operatingExpenses: 0, periodDays: 30 });
    expect(r.grossYield).toBeCloseTo(0.0507, 4);
  });

  it('отрицательный NOI — окупаемости нет', () => {
    const r = calcYield({ purchasePrice: 1, income: 0, operatingExpenses: 10, periodDays: 30 });
    expect(r.paybackYears).toBeNull();
  });
});

const row = (o: Partial<PropertyYieldInput> = {}): PropertyYieldInput => ({
  propertyId: 'a',
  purchasePrice: '6000000',
  incomes: [{ amount: '600000' }],
  operatingExpenses: '120000',
  mortgagePaid: '0',
  mortgageMonthly: null,
  monthsOfData: 12,
  ...o,
});

describe('portfolioYields', () => {
  it('12 месяцев: чистая доходность по фактическим операциям', () => {
    const [r] = portfolioYields('NONE', [row()]).properties;
    expect(r).toMatchObject({ status: 'OK', net: '480000.00', yieldPct: 8, annualized: false });
  });

  it('меньше года: пересчёт на год', () => {
    const [r] = portfolioYields('NONE', [
      row({ incomes: [{ amount: '200000' }], operatingExpenses: '40000', monthsOfData: 4 }),
    ]).properties;
    expect(r).toMatchObject({ net: '160000.00', annualNet: '480000.00', yieldPct: 8, annualized: true });
  });

  it('НПД учитывается в чистом доходе', () => {
    const [r] = portfolioYields('NPD', [row()]).properties;
    expect(r).toMatchObject({ tax: '24000.00', yieldPct: 7.6 });
  });

  it('НДФЛ делится по квартирам пропорционально доходу, сумма сходится', () => {
    const { properties } = portfolioYields('NDFL', [
      row({ propertyId: 'a', incomes: [{ amount: '3000000' }] }),
      row({ propertyId: 'b', incomes: [{ amount: '1000000' }] }),
    ]);
    const total = ndflProgressive(4_000_000);
    expect(properties[0]!.tax).toBe(total.times(0.75).toFixed(2));
    expect(properties[1]!.tax).toBe(total.times(0.25).toFixed(2));
    expect(Number(properties[0]!.tax) + Number(properties[1]!.tax)).toBeCloseTo(total.toNumber(), 2);
  });

  it('нет цены и нет операций', () => {
    expect(portfolioYields('NONE', [row({ purchasePrice: null })]).properties[0]).toMatchObject({
      status: 'NO_PRICE',
      yieldPct: null,
    });
    expect(portfolioYields('NONE', [row({ incomes: [], operatingExpenses: '0', monthsOfData: 0, mortgageMonthly: '30000' })]).properties[0]).toMatchObject({
      status: 'NO_DATA',
      yieldPct: null,
      cashflow: null,
      mortgageSource: null,
    });
  });

  it('ипотека: график или фактические платежи', () => {
    const sched = portfolioYields('NONE', [row({ mortgageMonthly: '30000' })]).properties[0]!;
    expect(sched).toMatchObject({ cashflow: '120000.00', mortgageSource: 'SCHEDULE' });
    const fact = portfolioYields('NONE', [row({ mortgageMonthly: '30000', mortgagePaid: '360000' })]).properties[0]!;
    expect(fact).toMatchObject({ cashflow: '120000.00', mortgageSource: 'TRANSACTIONS' });
    expect(portfolioYields('NONE', [row()]).properties[0]).toMatchObject({ cashflow: null, mortgageSource: null });
  });

  it('средняя доходность портфеля', () => {
    const { avgYieldPct } = portfolioYields('NONE', [
      row({ propertyId: 'a' }),
      row({ propertyId: 'b', purchasePrice: '4000000', incomes: [{ amount: '200000' }], operatingExpenses: '0' }),
    ]);
    expect(avgYieldPct).toBe(6.8);
    expect(portfolioYields('NONE', [row({ purchasePrice: null })]).avgYieldPct).toBeNull();
  });
});
