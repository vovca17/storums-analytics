import { describe, expect, it } from 'vitest';
import { calcUtilityBill, UtilityCalcError } from '../src';

const base = {
  tariffs: { COLD_WATER: '60.00', HOT_WATER: '300.00', WATER_DISPOSAL: '45.00', ELECTRICITY: '7.50' },
  fixedCharges: [
    { name: 'Содержание жилья', calc: 'PER_M2' as const, rate: '35.50' },
    { name: 'Вывоз ТКО', calc: 'PER_PERSON' as const, rate: '120' },
    { name: 'Домофон', calc: 'FIXED' as const, rate: '80' },
  ],
  areaM2: '42.5',
  residents: 2,
};

describe('calcUtilityBill', () => {
  it('считает счётчики, водоотведение и постоянные начисления', () => {
    const r = calcUtilityBill({
      ...base,
      meters: [
        { meterId: 'c', kind: 'COLD_WATER', previous: 100, current: 105 },
        { meterId: 'h', kind: 'HOT_WATER', previous: 50, current: 53 },
        { meterId: 'e', kind: 'ELECTRICITY', previous: 1000, current: 1150 },
      ],
    });
    // 5×60 + 3×300 + 150×7.5 + 8×45 + 42.5×35.5 + 2×120 + 80
    // 300 + 900 + 1125 + 360 + 1508.75 + 240 + 80
    expect(r.total).toBe('4513.75');
    expect(r.lines.find((l) => l.kind === 'WATER_DISPOSAL')?.quantity).toBe('8');
  });

  it('ошибка, если показание уменьшилось', () => {
    expect(() =>
      calcUtilityBill({ ...base, meters: [{ meterId: 'c', kind: 'COLD_WATER', previous: 10, current: 9 }] }),
    ).toThrow(UtilityCalcError);
  });

  it('ошибка, если нет тарифа', () => {
    expect(() =>
      calcUtilityBill({ ...base, meters: [{ meterId: 'g', kind: 'GAS', previous: 0, current: 1 }] }),
    ).toThrow(/Нет тарифа/);
  });
});
