import { describe, expect, it } from 'vitest';
import { newUser } from './client';

describe('системные статьи', () => {
  it('«ЖКХ» — одна статья без системных подстатей', async () => {
    const u = await newUser('cat');
    const r = await u.get('/categories');
    expect(r.status).toBe(200);
    const list = r.body as { id: string; systemKey: string | null; parentId: string | null }[];
    const utilities = list.find((c) => c.systemKey === 'utilities');
    expect(utilities).toBeTruthy();
    expect(list.filter((c) => c.parentId === utilities!.id)).toEqual([]);
    expect(list.filter((c) => c.systemKey?.startsWith('utilities_') && c.systemKey !== 'utilities_compensation')).toEqual([]);
  });
});
