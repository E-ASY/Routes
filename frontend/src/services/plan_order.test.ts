import { describe, expect, it } from 'vitest';
import { ScheduleOption, VisitPlanPoint } from './map_service';
import { moveItem, optionMatchesOrder, sameVisits, stopKey } from './plan_order';

const visit = (userId: number): VisitPlanPoint => ({ lat: userId, lon: -userId, label: `U${userId}`, userId });
const [a, b, c] = [visit(1), visit(2), visit(3)];

function option(order: number[], unscheduled: number[] = []): ScheduleOption {
  return {
    goals: ['finish'],
    order,
    visits: [],
    departure: 480,
    finish_time: 900,
    distance_m: 0,
    travel_min: 0,
    idle_min: 0,
    late_min: 0,
    overtime_min: 0,
    unscheduled: unscheduled.map((v) => ({ visit: v, reason: 'no_fit' })),
  };
}

describe('stopKey y sameVisits', () => {
  it('la clave es la usuaria, o las coordenadas si no hay usuaria', () => {
    expect(stopKey(a)).toBe('u1');
    expect(stopKey({ lat: 28.5, lon: -16.3, label: 'Mapa' })).toBe('28.5,-16.3');
  });

  it('mismas visitas aunque cambie el orden', () => {
    expect(sameVisits([a, b, c], [c, a, b])).toBe(true);
    expect(sameVisits([a, b], [a, c])).toBe(false);
    expect(sameVisits([a, b], [a, b, c])).toBe(false);
  });
});

describe('optionMatchesOrder ("Tu orden")', () => {
  const stops = [a, b, c];
  it('coincide si la opción deja las visitas en ese orden', () => {
    expect(optionMatchesOrder(option([2, 0, 1]), stops, [c, a, b])).toBe(true);
    expect(optionMatchesOrder(option([0, 1, 2]), stops, [c, a, b])).toBe(false);
  });

  it('una opción que aparta visitas no coincide', () => {
    expect(optionMatchesOrder(option([0, 1], [2]), stops, [a, b])).toBe(false);
  });
});

describe('moveItem (arrastrar en la agenda)', () => {
  it('mueve hacia abajo y hacia arriba', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('misma posición o fuera de rango: la misma lista', () => {
    const list = ['a', 'b'];
    expect(moveItem(list, 1, 1)).toBe(list);
    expect(moveItem(list, 0, 5)).toBe(list);
  });
});
