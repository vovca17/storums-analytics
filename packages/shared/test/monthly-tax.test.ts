import { describe, expect, it } from 'vitest';
import { monthlyTax, TransactionQuery } from '../src';

describe('monthlyTax', () => {
  it('НПД: налог по месяцам, 6% для юрлица, остаток лимита', () => {
    const r = monthlyTax('NPD', [
      { period: '2026-02', incomes: [{ amount: 50_000, fromLegalEntity: true }] },
      { period: '2026-01', incomes: [{ amount: 50_000 }] },
    ]);
    expect(r.months.map((m) => [m.period, m.tax])).toEqual([
      ['2026-01', '2000.00'],
      ['2026-02', '3000.00'],
    ]);
    expect(r.tax).toBe('5000.00');
    expect(r.npdLimitLeft).toBe('2300000.00');
  });

  it('НДФЛ: прогрессия попадает в месяц, где доход перешёл 2,4 млн', () => {
    const r = monthlyTax('NDFL', [
      { period: '2026-01', incomes: [{ amount: 2_000_000 }] },
      { period: '2026-02', incomes: [{ amount: 1_000_000 }] },
    ]);
    // январь 13% от 2 млн; февраль: 0.4M×13% + 0.6M×15% = 52 000 + 90 000
    expect(r.months[0]!.tax).toBe('260000.00');
    expect(r.months[1]!.tax).toBe('142000.00');
    expect(r.tax).toBe('402000.00');
    expect(r.npdLimitLeft).toBeUndefined();
  });

  it('месяц без дохода — нулевой налог', () => {
    const r = monthlyTax('USN6', [{ period: '2026-03', incomes: [] }]);
    expect(r.months[0]).toEqual({ period: '2026-03', income: '0.00', tax: '0.00' });
  });
});

describe('TransactionQuery', () => {
  it('разбирает список квартир через запятую', () => {
    const id = '7b3e1f9a-2c4d-4e5f-8a6b-1c2d3e4f5a6b';
    expect(TransactionQuery.parse({ propertyId: `${id},${id}`, limit: '20' })).toEqual({
      propertyId: [id, id],
      limit: 20,
    });
  });

  it('Без налога: все месяцы с нулевым налогом', () => {
    const r = monthlyTax('NONE', [
      { period: '2026-01', incomes: [{ amount: 100_000 }] },
      { period: '2026-02', incomes: [{ amount: 200_000 }] },
    ]);
    expect(r.months.map((m) => m.tax)).toEqual(['0.00', '0.00']);
    expect(r.tax).toBe('0.00');
    expect(r.income).toBe('300000.00');
  });
});
