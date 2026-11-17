import { z } from 'zod';

export const TaxRegime = z.enum(['NPD', 'NDFL', 'USN6', 'NONE']);
export type TaxRegime = z.infer<typeof TaxRegime>;

export const TransactionType = z.enum(['INCOME', 'EXPENSE']);
export type TransactionType = z.infer<typeof TransactionType>;

export const TransactionSource = z.enum(['MANUAL', 'UTILITY_CALC', 'LEASE_SCHEDULE', 'IMPORT']);
export type TransactionSource = z.infer<typeof TransactionSource>;

export const UtilitiesPaidBy = z.enum(['OWNER', 'TENANT', 'SPLIT']);
export type UtilitiesPaidBy = z.infer<typeof UtilitiesPaidBy>;

export const MeterKind = z.enum([
  'COLD_WATER',
  'HOT_WATER',
  'WATER_DISPOSAL',
  'ELECTRICITY',
  'ELECTRICITY_DAY',
  'ELECTRICITY_NIGHT',
  'GAS',
  'HEAT',
]);
export type MeterKind = z.infer<typeof MeterKind>;

export const FixedChargeCalc = z.enum(['FIXED', 'PER_M2', 'PER_PERSON']);
export type FixedChargeCalc = z.infer<typeof FixedChargeCalc>;

export const SubscriptionPlan = z.enum(['BETA', 'FREE', 'PRO']);
export type SubscriptionPlan = z.infer<typeof SubscriptionPlan>;

/** Период начислений: "2026-10" */
export const Period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Формат периода: YYYY-MM');
export type Period = z.infer<typeof Period>;
