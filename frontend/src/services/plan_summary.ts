import { ScheduledVisit } from './map_service';

export interface DaySummary {
  visits: number;
  /** Minutos atendiendo (visitas) */
  attendMin: number;
  /** Minutos de coche, incluida la vuelta o la llegada */
  travelMin: number;
  /** Minutos esperando a que empiece una visita */
  waitMin: number;
  km: number | null;
}

/**
 * Resumen del día a partir del horario: el tiempo de coche es lo que queda de la
 * jornada real (salida → fin) quitando visitas y esperas.
 */
export function summarizeDay({
  times,
  departure,
  finishTime,
  km,
}: {
  times: ScheduledVisit[];
  departure: number;
  finishTime: number;
  km: number | null;
}): DaySummary {
  // Cada visita dura lo suyo (duración por usuaria)
  const attendMin = times.reduce((sum, time) => sum + (time.end - time.start), 0);
  const waitMin = times.reduce((sum, time) => sum + time.wait, 0);
  const travelMin = Math.max(0, finishTime - departure - attendMin - waitMin);
  return { visits: times.length, attendMin, travelMin, waitMin, km };
}

/** 45 → "45 min", 60 → "1 h", 80 → "1 h 20" */
export function formatDuration(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** "6 visitas · 6 h atendiendo · 1 h 20 de coche · 25 min de espera · 48,0 km" */
export function formatDaySummary(summary: DaySummary): string {
  return [
    `${summary.visits} ${summary.visits === 1 ? 'visita' : 'visitas'}`,
    `${formatDuration(summary.attendMin)} atendiendo`,
    `${formatDuration(summary.travelMin)} de coche`,
    summary.waitMin > 0 ? `${formatDuration(summary.waitMin)} de espera` : 'sin esperas',
    summary.km != null ? `${summary.km.toFixed(1).replace('.', ',')} km` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
