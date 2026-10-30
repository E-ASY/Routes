import { describe, expect, it } from 'vitest';
import { formatDaySummary, formatDuration, summarizeDay } from './plan_summary';

const H = (h: number, m = 0) => h * 60 + m;

describe('resumen del día', () => {
  it('coche = salida→fin menos visitas y esperas', () => {
    // Sale 8:50, visita 9–10, espera 15 min, visita 10:30–11:30, vuelve 11:50
    const summary = summarizeDay({
      times: [
        { visit: 0, arrival: H(9), start: H(9), end: H(10), wait: 0, late: 0 },
        { visit: 1, arrival: H(10, 15), start: H(10, 30), end: H(11, 30), wait: 15, late: 0 },
      ],
      departure: H(8, 50),
      finishTime: H(11, 50),
      km: 23.4,
    });
    expect(summary).toEqual({ visits: 2, attendMin: 120, travelMin: 45, waitMin: 15, km: 23.4 });
    expect(formatDaySummary(summary)).toBe(
      '2 visitas · 2 h atendiendo · 45 min de coche · 15 min de espera · 23,4 km'
    );
  });

  it('sin esperas ni km', () => {
    expect(formatDaySummary({ visits: 1, attendMin: 60, travelMin: 80, waitMin: 0, km: null })).toBe(
      '1 visita · 1 h atendiendo · 1 h 20 de coche · sin esperas'
    );
  });

  it('formatDuration', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(65)).toBe('1 h 05');
  });
});
