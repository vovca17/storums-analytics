import { describe, expect, it } from 'vitest';
import { DashboardLayout, defaultDashboardLayout, normalizeLayout } from '../src/dashboard';

describe('раскладка дашборда', () => {
  it('по умолчанию налог есть, кроме режима «Без налога»', () => {
    expect(defaultDashboardLayout('NPD')).toContain('tax');
    expect(defaultDashboardLayout('NONE')).not.toContain('tax');
  });
  it('normalizeLayout оставляет известные блоки без повторов', () => {
    expect(normalizeLayout(['tax', 'bogus', 'tax', 'kpi'], 'NPD')).toEqual(['tax', 'kpi']);
  });
  it('не массив → умолчание', () => {
    expect(normalizeLayout(null, 'NPD')).toEqual(defaultDashboardLayout('NPD'));
  });
  it('пустой список уважается', () => {
    expect(normalizeLayout([], 'NPD')).toEqual([]);
  });
  it('схема отвергает повторы и неизвестные блоки', () => {
    expect(DashboardLayout.safeParse(['kpi', 'kpi']).success).toBe(false);
    expect(DashboardLayout.safeParse(['bogus']).success).toBe(false);
    expect(DashboardLayout.safeParse(['kpi', 'tax']).success).toBe(true);
  });
});
