import { TimeRange } from './map_service';

/** PERF-013: horas como minutos desde medianoche */

/** 570 → "09:30" */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "09:30" → 570; null si no es una hora válida */
export function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export function isValidRange(range: TimeRange): boolean {
  return range.end > range.start;
}

export function formatRanges(ranges: TimeRange[]): string {
  return ranges.length === 0
    ? 'cualquier hora'
    : ranges.map((r) => `${formatMinutes(r.start)}–${formatMinutes(r.end)}`).join(' · ');
}
