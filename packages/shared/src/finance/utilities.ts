import Decimal from 'decimal.js';
import { D, type Money, type MoneyInput, toMoney } from '../money';
import type { FixedChargeCalc, MeterKind } from '../enums';

export interface MeterUsage {
  meterId: string;
  kind: MeterKind;
  previous: MoneyInput;
  current: MoneyInput;
}

export interface FixedChargeInput {
  name: string;
  calc: FixedChargeCalc;
  rate: MoneyInput;
}

export interface UtilityCalcInput {
  meters: MeterUsage[];
  /** Цена за единицу по виду счётчика (уже выбранная: своя ставка пользователя или региональная). */
  tariffs: Partial<Record<MeterKind, MoneyInput>>;
  fixedCharges: FixedChargeInput[];
  areaM2: MoneyInput;
  residents: number;
}

export interface UtilityLine {
  name: string;
  meterId?: string;
  kind?: MeterKind;
  quantity: string;
  rate: Money;
  amount: Money;
}

export interface UtilityCalcResult {
  lines: UtilityLine[];
  total: Money;
}

export class UtilityCalcError extends Error {}

/** Водоотведение по умолчанию считается от суммы холодной и горячей воды. */
const SEWAGE_SOURCES: MeterKind[] = ['COLD_WATER', 'HOT_WATER'];

export function calcUtilityBill(input: UtilityCalcInput): UtilityCalcResult {
  const lines: UtilityLine[] = [];
  let waterVolume = new Decimal(0);

  for (const m of input.meters) {
    const used = D(m.current).minus(m.previous);
    if (used.isNegative()) {
      throw new UtilityCalcError(
        `Показание меньше предыдущего (счётчик ${m.meterId}). Если счётчик меняли, введите новое начальное показание.`,
      );
    }
    const rate = input.tariffs[m.kind];
    if (rate === undefined) {
      throw new UtilityCalcError(`Нет тарифа для ${m.kind}. Укажите тариф в настройках квартиры.`);
    }
    if (SEWAGE_SOURCES.includes(m.kind)) waterVolume = waterVolume.plus(used);
    lines.push({
      name: m.kind,
      meterId: m.meterId,
      kind: m.kind,
      quantity: used.toString(),
      rate: toMoney(rate),
      amount: toMoney(used.times(rate)),
    });
  }

  const sewageRate = input.tariffs.WATER_DISPOSAL;
  const hasSewageMeter = input.meters.some((m) => m.kind === 'WATER_DISPOSAL');
  if (sewageRate !== undefined && !hasSewageMeter && waterVolume.gt(0)) {
    lines.push({
      name: 'WATER_DISPOSAL',
      kind: 'WATER_DISPOSAL',
      quantity: waterVolume.toString(),
      rate: toMoney(sewageRate),
      amount: toMoney(waterVolume.times(sewageRate)),
    });
  }

  for (const c of input.fixedCharges) {
    const quantity =
      c.calc === 'PER_M2' ? D(input.areaM2) : c.calc === 'PER_PERSON' ? D(input.residents) : D(1);
    lines.push({
      name: c.name,
      quantity: quantity.toString(),
      rate: toMoney(c.rate),
      amount: toMoney(quantity.times(c.rate)),
    });
  }

  const total = lines.reduce((acc, l) => acc.plus(l.amount), new Decimal(0));
  return { lines, total: toMoney(total) };
}
