import { ScheduleOption, VisitPlanPoint } from './map_service';

/** Clave estable de una usuaria para guardar su disponibilidad aunque cambie el orden */
export function stopKey(stop: VisitPlanPoint): string {
  return stop.userId != null ? `u${stop.userId}` : `${stop.lat},${stop.lon}`;
}

/** Mismas visitas, sin importar el orden */
export function sameVisits(a: VisitPlanPoint[], b: VisitPlanPoint[]): boolean {
  if (a.length !== b.length) return false;
  const keys = new Set(a.map(stopKey));
  return b.every((stop) => keys.has(stopKey(stop)));
}

/** La opción deja las visitas en el orden `order` y no aparta ninguna */
export function optionMatchesOrder(option: ScheduleOption, stops: VisitPlanPoint[], order: VisitPlanPoint[]): boolean {
  return (
    option.unscheduled.length === 0 &&
    option.order.length === order.length &&
    option.order.every((visit, i) => stops[visit] != null && stopKey(stops[visit]) === stopKey(order[i]))
  );
}

/** Copia de `list` con el elemento de `from` movido a la posición `to` (arrastrar en la agenda) */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
