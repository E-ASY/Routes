import { describe, expect, it } from 'vitest';
import { planHint } from './plan_hint';

const base = {
  planningMode: true,
  workerCount: 1,
  hasPlanWorker: true,
  hasOrigin: true,
  originEditable: false,
  endPending: false,
  stopsCount: 2,
};

describe('planHint (siguiente paso)', () => {
  it('sigue el orden de los pasos', () => {
    expect(planHint({ ...base, planningMode: false })).toMatch(/Actívalo/);
    expect(planHint({ ...base, workerCount: 0 })).toMatch(/Filtros/);
    expect(planHint({ ...base, hasPlanWorker: false })).toMatch(/a qué trabajadora/);
    expect(planHint({ ...base, hasOrigin: false })).toMatch(/desde dónde sale/);
    expect(planHint({ ...base, stopsCount: 0 })).toMatch(/usuarias que visitará/);
    expect(planHint({ ...base, endPending: true })).toMatch(/dónde termina/);
    expect(planHint(base)).toMatch(/más usuarias/);
  });
});
