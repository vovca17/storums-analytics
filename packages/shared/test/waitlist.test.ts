import { describe, expect, it } from 'vitest';
import { JoinWaitlist, formatMoscowDateTime, waitlistCsv } from '../src/waitlist';

describe('JoinWaitlist', () => {
  it('нормализует почту', () => {
    expect(JoinWaitlist.parse({ email: '  Ann@Example.TEST ', source: 'landing' }).email).toBe('ann@example.test');
  });
  it('отклоняет чужой источник и не-почту', () => {
    expect(JoinWaitlist.safeParse({ email: 'a@example.test', source: 'ads' }).success).toBe(false);
    expect(JoinWaitlist.safeParse({ email: 'не почта', source: 'landing' }).success).toBe(false);
  });
});

describe('formatMoscowDateTime', () => {
  it('переводит в московское время, в том числе через полночь', () => {
    expect(formatMoscowDateTime('2026-11-17T23:30:00.000Z')).toBe('18.11.2026 02:30');
  });
});

describe('waitlistCsv', () => {
  it('BOM, заголовок, разделитель ; и московская дата', () => {
    const csv = waitlistCsv([{ email: 'a@example.test', source: 'login', createdAt: '2026-11-17T09:05:00.000Z' }]);
    expect(csv.startsWith('﻿email;source;created_at\r\n')).toBe(true);
    expect(csv).toContain('a@example.test;login;17.11.2026 12:05');
  });
  it('экранирует ячейки-формулы и кавычки', () => {
    const csv = waitlistCsv([{ email: '=cmd@example.test', source: 'landing', createdAt: '2026-11-17T09:05:00.000Z' }]);
    expect(csv).toContain("'=cmd@example.test;");
    expect(waitlistCsv([{ email: 'a"b;c@example.test', source: 'landing', createdAt: '2026-11-17T09:05:00.000Z' }])).toContain('"a""b;c@example.test"');
  });
});
