import { describe, expect, it } from 'vitest';
import { estimateRentalTax, ndflProgressive } from '../src';

describe('estimateRentalTax', () => {
  it('НПД: 4% с физлиц и 6% с юрлиц', () => {
    const r = estimateRentalTax('NPD', [
      { amount: 600_000 },
      { amount: 100_000, fromLegalEntity: true },
    ]);
    expect(r.tax).toBe('30000.00'); // 24 000 + 6 000
    expect(r.npdLimitLeft).toBe('1700000.00');
    expect(r.npdLimitExceeded).toBe(false);
  });

  it('НПД: отмечает превышение лимита 2,4 млн', () => {
    const r = estimateRentalTax('NPD', [{ amount: 2_500_000 }]);
    expect(r.npdLimitExceeded).toBe(true);
    expect(r.npdLimitLeft).toBe('0.00');
  });

  it('НДФЛ: 13% до 2,4 млн', () => {
    expect(estimateRentalTax('NDFL', [{ amount: 1_000_000 }]).tax).toBe('130000.00');
  });

  it('НДФЛ: прогрессия выше 2,4 млн', () => {
    // 2.4M × 13% + 0.6M × 15% = 312 000 + 90 000
    expect(ndflProgressive(3_000_000).toFixed(2)).toBe('402000.00');
    // 312 000 + 2.6M×15% + 1M×18% = 312 000 + 390 000 + 180 000
    expect(ndflProgressive(6_000_000).toFixed(2)).toBe('882000.00');
  });

  it('УСН 6%', () => {
    const r = estimateRentalTax('USN6', [{ amount: 500_000 }]);
    expect(r.tax).toBe('30000.00');
    expect(r.effectiveRate).toBe(0.06);
  });

  it('нулевой доход', () => {
    expect(estimateRentalTax('NDFL', []).effectiveRate).toBe(0);
  });

  it('Без налога: налог 0, ставка 0, без полей лимита НПД', () => {
    const r = estimateRentalTax('NONE', [{ amount: '600000' }]);
    expect(r).toMatchObject({ tax: '0.00', income: '600000.00', effectiveRate: 0 });
    expect(r.npdLimitLeft).toBeUndefined();
  });
});
