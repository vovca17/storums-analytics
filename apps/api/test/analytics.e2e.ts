import { beforeAll, describe, expect, it } from 'vitest';
import { todayIso } from '@storums/shared';
import { newUser } from './client';

/** Цифры аналитики на известном наборе операций. */
describe('аналитика', () => {
  let u: Awaited<ReturnType<typeof newUser>>;
  const p: Record<string, string> = {};
  const cat: Record<string, string> = {};

  beforeAll(async () => {
    u = await newUser('analytics');
    for (const t of ['A', 'B']) {
      p[t] = (await u.post('/properties', { title: `Кв ${t}`, address: 'г Москва, д 4', regionCode: '77', areaM2: '30' })).body.id;
    }
    for (const c of (await u.get('/categories')).body as Array<{ id: string; systemKey: string | null }>) {
      if (c.systemKey) cat[c.systemKey] = c.id;
    }
    const tx = (prop: string, type: string, key: string, amount: string, date: string) =>
      u.post('/transactions', { propertyId: p[prop], categoryId: cat[key], type, amount, date });
    await tx('A', 'INCOME', 'rent', '50000', '2026-09-10');
    await tx('A', 'INCOME', 'rent', '50000', '2026-10-10');
    await tx('A', 'EXPENSE', 'utilities', '1500.50', '2026-10-20');
    await tx('A', 'EXPENSE', 'utilities', '2499.50', '2026-10-21');
    await tx('B', 'EXPENSE', 'repair', '30000', '2026-10-15');
    await tx('B', 'EXPENSE', 'mortgage', '40000', '2026-09-05');
    await tx('B', 'INCOME', 'other_income', '1000', '2026-11-01'); // за пределами отрезка ниже
  });

  it('по месяцам, итоги, статьи верхнего уровня, по квартирам', async () => {
    const r = (await u.get('/analytics/monthly?from=2026-09-01&to=2026-10-31')).body;
    expect(r.count).toBe(6);
    expect(r.months).toEqual([
      { period: '2026-09', income: '50000.00', expense: '40000.00', profit: '10000.00' },
      { period: '2026-10', income: '50000.00', expense: '34000.00', profit: '16000.00' },
    ]);
    expect(r.totals).toEqual({ income: '100000.00', expense: '74000.00', profit: '26000.00' });
    expect(r.expenseByCategory.map((c: { systemKey: string; total: string }) => [c.systemKey, c.total])).toEqual([
      ['mortgage', '40000.00'],
      ['repair', '30000.00'],
      ['utilities', '4000.00'],
    ]);
    const byProp = Object.fromEntries(
      r.byProperty.map((x: { propertyId: string; income: string; expense: string }) => [x.propertyId, [x.income, x.expense]]),
    );
    expect(byProp[p.A!]).toEqual(['100000.00', '4000.00']);
    expect(byProp[p.B!]).toEqual(['0.00', '70000.00']);
  });

  it('фильтры: квартира, тип, родительская статья', async () => {
    const onlyA = (await u.get(`/analytics/monthly?from=2026-09-01&to=2026-10-31&propertyId=${p.A}`)).body;
    expect(onlyA.totals).toEqual({ income: '100000.00', expense: '4000.00', profit: '96000.00' });
    const util = (await u.get(`/analytics/monthly?from=2026-09-01&to=2026-10-31&categoryId=${cat.utilities}`)).body;
    expect(util.totals.expense).toBe('4000.00');
    expect(util.count).toBe(2);
    const inc = (await u.get('/analytics/monthly?from=2026-09-01&to=2026-12-31&type=INCOME')).body;
    expect(inc.totals).toEqual({ income: '101000.00', expense: '0.00', profit: '101000.00' });
    expect(inc.months).toHaveLength(4); // пустой декабрь тоже есть
  });

  it('налог НПД по месяцам', async () => {
    const t = (await u.get('/analytics/tax?year=2026')).body;
    expect(t.regime).toBe('NPD');
    expect(t.months.find((m: { period: string }) => m.period === '2026-09').tax).toBe('2000.00');
    expect(t.tax).toBe('4040.00'); // 4% от 101 000
  });

  it('режим «Без налога»: налог нулевой', async () => {
    const w = await newUser('analytics-none');
    expect((await w.patch('/me', { taxRegime: 'NONE' })).status).toBe(200);
    const prop = (await w.post('/properties', { title: 'Кв', address: 'г Москва, д 4', regionCode: '77', areaM2: '30' })).body.id;
    const rent = ((await w.get('/categories')).body as Array<{ id: string; systemKey: string | null }>).find((c) => c.systemKey === 'rent')!;
    const year = new Date().getFullYear();
    await w.post('/transactions', { propertyId: prop, categoryId: rent.id, type: 'INCOME', amount: '50000', date: `${year}-01-10` });
    const t = (await w.get(`/analytics/tax?year=${year}`)).body;
    expect(t.regime).toBe('NONE');
    expect(t.income).toBe('50000.00');
    expect(t.tax).toBe('0.00');
  });

  it('доходность: чистая, за фактический период, ипотека отдельно', async () => {
    const w = await newUser('analytics-yield');
    await w.patch('/me', { taxRegime: 'NONE' });
    const prop = (
      await w.post('/properties', { title: 'Кв', address: 'г Москва, д 4', regionCode: '77', areaM2: '30', purchasePrice: '6000000' })
    ).body.id;
    const c: Record<string, string> = {};
    for (const x of (await w.get('/categories')).body as Array<{ id: string; systemKey: string | null }>) {
      if (x.systemKey) c[x.systemKey] = x.id;
    }
    const date = todayIso();
    const tx = (type: string, key: string, amount: string) =>
      w.post('/transactions', { propertyId: prop, categoryId: c[key], type, amount, date });
    await tx('INCOME', 'rent', '50000');
    await tx('EXPENSE', 'repair', '10000');
    await tx('EXPENSE', 'mortgage', '5000');
    const r = (await w.get('/analytics/yield')).body;
    expect(r.regime).toBe('NONE');
    expect(r.properties).toHaveLength(1);
    expect(r.properties[0]).toMatchObject({
      propertyId: prop,
      status: 'OK',
      monthsOfData: 1,
      net: '40000.00',
      annualNet: '480000.00',
      yieldPct: 8,
      cashflow: '35000.00',
      mortgageSource: 'TRANSACTIONS',
    });
    expect(r.avgYieldPct).toBe(8);
  });

  it('доходность: подстатья ипотеки не попадает в операционные расходы', async () => {
    const w = await newUser('analytics-yield-sub');
    await w.patch('/me', { taxRegime: 'NONE' });
    const prop = (
      await w.post('/properties', { title: 'Кв', address: 'г Москва, д 4', regionCode: '77', areaM2: '30', purchasePrice: '6000000' })
    ).body.id;
    const cats = (await w.get('/categories')).body as Array<{ id: string; systemKey: string | null }>;
    const id = (k: string) => cats.find((x) => x.systemKey === k)!.id;
    const sub = await w.post('/categories', { name: 'Моя ипотека', type: 'EXPENSE', parentId: id('mortgage') });
    expect(sub.status).toBe(201);
    const date = todayIso();
    const tx = (type: string, categoryId: string, amount: string) =>
      w.post('/transactions', { propertyId: prop, categoryId, type, amount, date });
    await tx('INCOME', id('rent'), '50000');
    await tx('EXPENSE', sub.body.id, '5000');
    const r = (await w.get('/analytics/yield')).body.properties[0];
    expect(r).toMatchObject({ expenses: '0.00', net: '50000.00', cashflow: '45000.00', mortgageSource: 'TRANSACTIONS' });
  });
});
