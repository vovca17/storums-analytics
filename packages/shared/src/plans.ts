import type { SubscriptionPlan } from './enums';

/** Лимиты тарифов. null — без ограничений. */
export const PLAN_LIMITS: Record<SubscriptionPlan, { maxProperties: number | null }> = {
  BETA: { maxProperties: null },
  FREE: { maxProperties: 1 },
  PRO: { maxProperties: null },
};
