import { z } from 'zod';
import type { TaxRegime } from './enums';

/** Блоки дашборда в порядке по умолчанию. */
export const DASHBOARD_BLOCKS = [
  'portfolio',
  'kpi',
  'cashflow',
  'yield',
  'expenses',
  'events',
  'lease-endings',
  'tax',
  'properties',
] as const;
export type DashboardBlock = (typeof DASHBOARD_BLOCKS)[number];

export const DASHBOARD_BLOCK_TITLE: Record<DashboardBlock, string> = {
  portfolio: 'Портфель',
  kpi: 'Показатели месяца',
  cashflow: 'Доходы и расходы',
  yield: 'Доходность по квартирам',
  expenses: 'Структура расходов',
  events: 'Ближайшие события',
  'lease-endings': 'Окончания договоров',
  tax: 'Налог',
  properties: 'Квартиры',
};

/** Ширина блока в сетке из 12 колонок. */
export const DASHBOARD_BLOCK_SPAN: Record<DashboardBlock, 4 | 12> = {
  portfolio: 4,
  kpi: 4,
  cashflow: 4,
  yield: 4,
  expenses: 4,
  events: 4,
  'lease-endings': 4,
  tax: 12,
  properties: 12,
};

export const DashboardLayout = z
  .array(z.enum(DASHBOARD_BLOCKS))
  .max(DASHBOARD_BLOCKS.length)
  .refine((ids) => new Set(ids).size === ids.length, 'Блоки повторяются');
export type DashboardLayout = z.infer<typeof DashboardLayout>;

/** Раскладка по умолчанию; «Окончания договоров» по умолчанию скрыты, при режиме «Без налога» нет и налога. */
export function defaultDashboardLayout(regime: TaxRegime): DashboardBlock[] {
  return DASHBOARD_BLOCKS.filter((b) => b !== 'lease-endings' && (b !== 'tax' || regime !== 'NONE'));
}

/** Сохранённое значение → раскладка: не массив — умолчание; иначе только известные id, без повторов. */
export function normalizeLayout(raw: unknown, regime: TaxRegime): DashboardBlock[] {
  if (!Array.isArray(raw)) return defaultDashboardLayout(regime);
  const known = new Set<string>(DASHBOARD_BLOCKS);
  const seen = new Set<string>();
  const out: DashboardBlock[] = [];
  for (const id of raw) {
    if (typeof id === 'string' && known.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id as DashboardBlock);
    }
  }
  return out;
}
