import { Injectable } from '@nestjs/common';
import {
  D,
  monthlyTax,
  portfolioYields,
  todayIso,
  toMoney,
  type PropertyYieldInput,
  type TransactionQuery,
} from '@storums/shared';
import { Prisma } from '@storums/db';
import { PrismaService } from '../../prisma/prisma.service';
import { transactionWhere } from './transactions.service';

const period = (d: Date) => d.toISOString().slice(0, 7);

/** Все месяцы между from и to включительно: ["2026-01", …] */
function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number) as [number, number];
  const end = to.slice(0, 7);
  for (let i = 0; i < 240; i++) {
    const p = `${y}-${String(m).padStart(2, '0')}`;
    if (p > end) break;
    out.push(p);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Доходы, расходы и прибыль по месяцам, расходы по статьям верхнего уровня и суммы по квартирам.
   * Суммирует база (GROUP BY), в код приходят только агрегаты. По умолчанию — последние 12 месяцев.
   */
  async monthly(ownerId: string, q: TransactionQuery) {
    // Текущий месяц — по Москве, как и в кабинете
    const [y, m] = todayIso().split('-').map(Number) as [number, number];
    const to = q.to ?? iso(new Date(Date.UTC(y, m, 0)));
    const from = q.from ?? iso(new Date(Date.UTC(y, m - 12, 1)));

    const where = [
      Prisma.sql`p."ownerId" = ${ownerId}::uuid`,
      Prisma.sql`t."date" BETWEEN ${from}::date AND ${to}::date`,
      ...(q.propertyId?.length ? [Prisma.sql`t."propertyId" = ANY(${q.propertyId}::uuid[])`] : []),
      ...(q.type ? [Prisma.sql`t."type" = ${q.type}::"TransactionType"`] : []),
      ...(q.categoryId
        ? [Prisma.sql`(t."categoryId" = ${q.categoryId}::uuid OR c."parentId" = ${q.categoryId}::uuid)`]
        : []),
    ];
    const rows = await this.prisma.$queryRaw<
      Array<{ period: string; type: 'INCOME' | 'EXPENSE'; propertyId: string; topId: string; total: Prisma.Decimal; n: bigint }>
    >(Prisma.sql`
      SELECT to_char(t."date", 'YYYY-MM') AS period, t."type"::text AS type, t."propertyId"::text AS "propertyId",
             COALESCE(c."parentId", c."id")::text AS "topId", SUM(t."amount") AS total, COUNT(*) AS n
      FROM "Transaction" t
      JOIN "Property" p ON p."id" = t."propertyId"
      JOIN "Category" c ON c."id" = t."categoryId"
      WHERE ${Prisma.join(where, ' AND ')}
      GROUP BY 1, 2, 3, 4`);

    const zero = () => ({ income: D(0), expense: D(0) });
    const months = new Map(monthsBetween(from, to).map((p) => [p, zero()]));
    const byProperty = new Map<string, ReturnType<typeof zero>>();
    const byCategory = new Map<string, ReturnType<typeof D>>();
    let count = 0;
    for (const r of rows) {
      const k = r.type === 'INCOME' ? 'income' : 'expense';
      const amount = D(r.total.toString());
      count += Number(r.n);
      const m = months.get(r.period);
      if (m) m[k] = m[k].plus(amount);
      const prop = byProperty.get(r.propertyId) ?? zero();
      prop[k] = prop[k].plus(amount);
      byProperty.set(r.propertyId, prop);
      if (k === 'expense') byCategory.set(r.topId, (byCategory.get(r.topId) ?? D(0)).plus(amount));
    }
    const cats = await this.prisma.category.findMany({
      where: { id: { in: [...byCategory.keys()] } },
      select: { id: true, name: true, systemKey: true },
    });

    const list = [...months].map(([p, v]) => ({
      period: p,
      income: toMoney(v.income),
      expense: toMoney(v.expense),
      profit: toMoney(v.income.minus(v.expense)),
    }));
    const income = list.reduce((a, m) => a.plus(m.income), D(0));
    const expense = list.reduce((a, m) => a.plus(m.expense), D(0));
    return {
      from,
      to,
      count,
      months: list,
      expenseByCategory: cats
        .map((c) => ({ ...c, total: byCategory.get(c.id)! }))
        .sort((a, b) => b.total.comparedTo(a.total))
        .map((c) => ({ ...c, total: toMoney(c.total) })),
      byProperty: [...byProperty].map(([propertyId, v]) => ({
        propertyId,
        income: toMoney(v.income),
        expense: toMoney(v.expense),
      })),
      totals: { income: toMoney(income), expense: toMoney(expense), profit: toMoney(income.minus(expense)) },
    };
  }

  /** Налог по месяцам за год по режиму пользователя. Доход от юрлица — по договору. */
  async tax(ownerId: string, year: number) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { taxRegime: true } });
    const rows = await this.prisma.transaction.findMany({
      where: transactionWhere(ownerId, { type: 'INCOME', from: `${year}-01-01`, to: `${year}-12-31` }),
      select: { amount: true, date: true, lease: { select: { tenant: { select: { isLegalEntity: true } } } } },
    });
    const months = monthsBetween(`${year}-01-01`, `${year}-12-31`).map((p) => ({
      period: p,
      incomes: rows
        .filter((r) => period(r.date) === p)
        .map((r) => ({ amount: r.amount.toString(), fromLegalEntity: r.lease?.tenant.isLegalEntity ?? false })),
    }));
    return { year, ...monthlyTax(user.taxRegime, months) };
  }

  /**
   * Чистая доходность неархивных квартир по фактическим операциям за последние 12 месяцев (включая текущий).
   * Расходы — без ипотеки и налога (налог считается по режиму пользователя), ипотека — отдельно.
   */
  async yield(ownerId: string) {
    const [y, m] = todayIso().split('-').map(Number) as [number, number];
    const to = iso(new Date(Date.UTC(y, m, 0)));
    const from = iso(new Date(Date.UTC(y, m - 12, 1)));

    const [user, props, rows] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { taxRegime: true } }),
      this.prisma.property.findMany({
        where: { ownerId, status: { not: 'ARCHIVED' } },
        select: { id: true, purchasePrice: true, mortgage: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.$queryRaw<Array<{ propertyId: string; kind: string; total: Prisma.Decimal; first: Date }>>(Prisma.sql`
        SELECT t."propertyId"::text AS "propertyId",
               CASE WHEN t."type" = 'INCOME' THEN CASE WHEN tn."isLegalEntity" THEN 'income_legal' ELSE 'income' END
                    WHEN COALESCE(pc."systemKey", c."systemKey") = 'mortgage' THEN 'mortgage'
                    WHEN COALESCE(pc."systemKey", c."systemKey") = 'rental_tax' THEN 'tax'
                    ELSE 'expense' END AS kind,
               SUM(t."amount") AS total, MIN(t."date") AS "first"
        FROM "Transaction" t
        JOIN "Property" p ON p."id" = t."propertyId"
        JOIN "Category" c ON c."id" = t."categoryId"
        LEFT JOIN "Category" pc ON pc."id" = c."parentId"
        LEFT JOIN "Lease" l ON l."id" = t."leaseId"
        LEFT JOIN "Tenant" tn ON tn."id" = l."tenantId"
        WHERE p."ownerId" = ${ownerId}::uuid AND p."status" <> 'ARCHIVED'
          AND t."date" BETWEEN ${from}::date AND ${to}::date
        GROUP BY 1, 2`),
    ]);

    const byProp = new Map<string, { sums: Record<string, ReturnType<typeof D>>; first: string }>();
    for (const r of rows) {
      const e = byProp.get(r.propertyId) ?? { sums: {}, first: '9999-12' };
      e.sums[r.kind] = D(r.total.toString());
      e.first = [e.first, iso(r.first).slice(0, 7)].sort()[0]!;
      byProp.set(r.propertyId, e);
    }

    const input: PropertyYieldInput[] = props.map((p) => {
      const e = byProp.get(p.id);
      const sums = e?.sums ?? {};
      const monthly = (p.mortgage as { monthlyPayment?: string | number } | null)?.monthlyPayment;
      let monthsOfData = 0;
      if (e) {
        const [fy, fm] = e.first.split('-').map(Number) as [number, number];
        monthsOfData = Math.min(12, Math.max(1, (y - fy) * 12 + (m - fm) + 1));
      }
      return {
        propertyId: p.id,
        purchasePrice: p.purchasePrice?.toString() ?? null,
        incomes: [
          ...(sums.income ? [{ amount: sums.income.toString() }] : []),
          ...(sums.income_legal ? [{ amount: sums.income_legal.toString(), fromLegalEntity: true }] : []),
        ],
        operatingExpenses: (sums.expense ?? D(0)).toString(),
        mortgagePaid: (sums.mortgage ?? D(0)).toString(),
        mortgageMonthly: monthly != null ? String(monthly) : null,
        monthsOfData,
      };
    });
    return { regime: user.taxRegime, from, to, ...portfolioYields(user.taxRegime, input) };
  }
}
