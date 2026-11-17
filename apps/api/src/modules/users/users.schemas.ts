import { z } from 'zod';
import { DashboardLayout, TaxRegime } from '@storums/shared';

export const UpdateMe = z.object({
  /** null — стереть имя */
  name: z.string().trim().min(1).max(100).nullable().optional(),
  taxRegime: TaxRegime.optional(),
  /** null — сбросить к раскладке по умолчанию */
  dashboardLayout: DashboardLayout.nullable().optional(),
});
export type UpdateMe = z.infer<typeof UpdateMe>;
