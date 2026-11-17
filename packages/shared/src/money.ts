import Decimal from 'decimal.js';

/** Денежная сумма в рублях, строкой с двумя знаками ("1234.50") — как Prisma отдаёт Decimal. */
export type Money = string;

export type MoneyInput = Decimal.Value;

export const D = (v: MoneyInput) => new Decimal(v);

export const toMoney = (v: MoneyInput): Money =>
  new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

export const sum = (values: MoneyInput[]): Decimal =>
  values.reduce<Decimal>((acc, v) => acc.plus(v), new Decimal(0));

/** "1234.5" → "1 234,50 ₽" */
export const formatRub = (v: MoneyInput): string =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(
    new Decimal(v).toNumber(),
  );
