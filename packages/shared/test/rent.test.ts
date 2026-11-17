import { describe, expect, it } from 'vitest';
import { rentBalance } from '../src/finance/rent';

describe('остаток аренды', () => {
  it('складывает частичные платежи с точностью до копейки', () => {
    expect(rentBalance('50000.30', ['10000.10', '20000.20'])).toEqual({
      paidAmount: '30000.30', remainingAmount: '20000.00', overpaidAmount: '0.00', done: false,
    });
    expect(rentBalance('0.30', ['0.10', '0.20']).done).toBe(true);
  });
  it('отделяет переплату от остатка', () => {
    expect(rentBalance('1000', ['1200'])).toEqual({ paidAmount: '1200.00', remainingAmount: '0.00', overpaidAmount: '200.00', done: true });
  });
});
