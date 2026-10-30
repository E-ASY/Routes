import { PlanFinish, TimeRange, VisitPlanPoint } from './map_service';

/**
 * Guarda el plan en el navegador para no perderlo si el móvil cierra la pestaña.
 * - Plan del día (trabajadoras, rutas, horas fijas): solo vale para hoy.
 * - Franjas y duración de la visita de cada usuaria: se mantienen de un día para otro.
 * Se borra todo al cerrar sesión. Si el navegador no deja guardar, la app sigue igual.
 */

/** Plan de una trabajadora */
export interface SavedPlan {
  origin: VisitPlanPoint | null;
  stops: VisitPlanPoint[];
  end: VisitPlanPoint | null;
  finish: PlanFinish;
  shift: TimeRange;
  postponed: VisitPlanPoint[];
}

export interface DayDraft {
  workers: string[];
  planningMode: boolean;
  planWorkerId: string | null;
  /** Plan de la trabajadora activa */
  current: SavedPlan;
  /** Planes de las demás trabajadoras seleccionadas */
  savedPlans: Record<string, SavedPlan>;
  fixedStarts: Record<string, number>;
  /** "Tu orden" de la trabajadora activa si difiere del actual (se aplicó una opción) */
  ownStops?: VisitPlanPoint[];
  /** Ya se había organizado el horario: al volver se recalculan las horas */
  scheduled: boolean;
}

const DAY_KEY = 'routes.plan-day.v1';
const AVAILABILITY_KEY = 'routes.availability.v1';
const DURATIONS_KEY = 'routes.visit-durations.v1';

function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Almacenamiento lleno o bloqueado (modo privado): se sigue sin guardar
  }
}

/** Plan guardado hoy, o null si no hay o es de otro día */
export function loadDayDraft(): DayDraft | null {
  const saved = read<{ date: string; draft: DayDraft }>(DAY_KEY);
  if (!saved || saved.date !== today() || !saved.draft || !Array.isArray(saved.draft.workers)) return null;
  return saved.draft;
}

export function saveDayDraft(draft: DayDraft): void {
  write(DAY_KEY, { date: today(), draft });
}

export function loadAvailability(): Record<string, TimeRange[]> {
  return read<Record<string, TimeRange[]>>(AVAILABILITY_KEY) ?? {};
}

export function saveAvailability(availability: Record<string, TimeRange[]>): void {
  write(AVAILABILITY_KEY, availability);
}

/** Duración de la visita por usuaria (minutos), solo las que no usan la duración por defecto */
export function loadDurations(): Record<string, number> {
  return read<Record<string, number>>(DURATIONS_KEY) ?? {};
}

export function saveDurations(durations: Record<string, number>): void {
  write(DURATIONS_KEY, durations);
}

/** Al cerrar sesión: no dejar datos de usuarias en el dispositivo */
export function clearSavedPlanData(): void {
  try {
    window.localStorage.removeItem(DAY_KEY);
    window.localStorage.removeItem(AVAILABILITY_KEY);
    window.localStorage.removeItem(DURATIONS_KEY);
  } catch {
    // Nada que borrar si el navegador no deja acceder
  }
}
