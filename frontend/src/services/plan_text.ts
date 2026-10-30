import { PlanFinish, ScheduleGoal, ScheduleOption, ScheduledVisit, VisitPlanPoint } from './map_service';
import { formatMinutes } from './time_ranges';

/** Nombre de cada criterio de las opciones de Organizar */
export const GOAL_LABELS: Record<ScheduleGoal, string> = {
  distance: 'Menos km',
  finish: 'Termina antes',
  idle: 'Menos esperas',
};

/** "Termina antes · Menos km" */
export function formatOptionGoals(option: ScheduleOption): string {
  return option.goals.map((goal) => GOAL_LABELS[goal]).join(' · ');
}

interface AgendaInput {
  workerLabel: string | null;
  origin: VisitPlanPoint;
  stops: VisitPlanPoint[];
  /** Horario por visita (mismo orden que stops), si se ha organizado */
  times: ScheduledVisit[] | null;
  departure: number | null;
  finishTime: number | null;
  finish: PlanFinish;
  end: VisitPlanPoint | null;
  mapsLinks: string[];
}

/**
 * Agenda del día en texto plano, lista para pegar en WhatsApp o un correo:
 *
 *   Ruta de Ana López
 *   08:50 Salida: Casa
 *   09:00–10:00 1. María Pérez
 *   ...
 *   14:20 Vuelta: Casa
 *
 *   Google Maps: https://...
 */
export function buildAgendaText(input: AgendaInput): string {
  const { workerLabel, origin, stops, times, departure, finishTime, finish, end, mapsLinks } = input;
  const at = (minutes: number | null) => (minutes != null ? `${formatMinutes(minutes)} ` : '');
  const lines: string[] = [];
  if (workerLabel) lines.push(`Ruta de ${workerLabel}`);
  lines.push(`${at(departure)}Salida: ${origin.label}`);
  stops.forEach((stop, index) => {
    const time = times?.[index];
    const slot = time ? `${formatMinutes(time.start)}–${formatMinutes(time.end)} ` : '';
    lines.push(`${slot}${index + 1}. ${stop.label}`);
  });
  if (finish === 'start') lines.push(`${at(finishTime)}Vuelta: ${origin.label}`);
  if (finish === 'custom' && end) lines.push(`${at(finishTime)}Llegada: ${end.label}`);
  if (mapsLinks.length > 0) {
    lines.push('');
    if (mapsLinks.length === 1) {
      lines.push(`Google Maps: ${mapsLinks[0]}`);
    } else {
      mapsLinks.forEach((link, i) => lines.push(`Google Maps (tramo ${i + 1}): ${link}`));
    }
  }
  return lines.join('\n');
}
