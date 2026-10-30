import { describe, expect, it } from 'vitest';
import { formatMinutes, formatRanges, isValidRange, parseTime } from './time_ranges';

describe('horas en minutos', () => {
  it('formatMinutes y parseTime son inversas', () => {
    expect(formatMinutes(570)).toBe('09:30');
    expect(formatMinutes(0)).toBe('00:00');
    expect(parseTime('09:30')).toBe(570);
    expect(parseTime(formatMinutes(14 * 60 + 5))).toBe(14 * 60 + 5);
  });

  it('parseTime rechaza horas no válidas', () => {
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('9:60')).toBeNull();
    expect(parseTime('nueve')).toBeNull();
  });

  it('una franja debe terminar después de empezar', () => {
    expect(isValidRange({ start: 540, end: 600 })).toBe(true);
    expect(isValidRange({ start: 600, end: 600 })).toBe(false);
  });

  it('formatRanges', () => {
    expect(formatRanges([])).toBe('cualquier hora');
    expect(
      formatRanges([
        { start: 540, end: 600 },
        { start: 960, end: 1020 },
      ])
    ).toBe('09:00–10:00 · 16:00–17:00');
  });
});
