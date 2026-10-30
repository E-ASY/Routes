import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DayDraft,
  clearSavedPlanData,
  loadAvailability,
  loadDayDraft,
  loadDurations,
  saveAvailability,
  saveDayDraft,
  saveDurations,
} from './plan_storage';

/** localStorage en memoria; `blocked` simula el modo privado */
function fakeStorage() {
  const data = new Map<string, string>();
  const state = { blocked: false };
  const check = () => {
    if (state.blocked) throw new Error('bloqueado');
  };
  return {
    state,
    data,
    localStorage: {
      getItem: (key: string) => (check(), data.get(key) ?? null),
      setItem: (key: string, value: string) => (check(), void data.set(key, value)),
      removeItem: (key: string) => void data.delete(key),
    },
  };
}

const draft: DayDraft = {
  workers: ['7'],
  planningMode: true,
  planWorkerId: '7',
  current: {
    origin: { lat: 28.4, lon: -16.3, label: 'Casa' },
    stops: [{ lat: 28.5, lon: -16.4, label: 'Carmen', userId: 3 }],
    end: null,
    finish: 'start',
    shift: { start: 480, end: 900 },
    postponed: [],
  },
  savedPlans: {},
  fixedStarts: { u3: 600 },
  scheduled: true,
};

describe('plan guardado en el navegador', () => {
  let storage: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal('window', { localStorage: storage.localStorage });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 20, 10, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('el plan de hoy se recupera tal cual', () => {
    saveDayDraft(draft);
    expect(loadDayDraft()).toEqual(draft);
  });

  it('el plan de otro día no se carga', () => {
    saveDayDraft(draft);
    vi.setSystemTime(new Date(2026, 9, 21, 8, 0));
    expect(loadDayDraft()).toBeNull();
  });

  it('las franjas se mantienen de un día para otro', () => {
    saveAvailability({ u3: [{ start: 540, end: 600 }] });
    vi.setSystemTime(new Date(2026, 9, 25, 8, 0));
    expect(loadAvailability()).toEqual({ u3: [{ start: 540, end: 600 }] });
  });

  it('la duración de cada usuaria se mantiene de un día para otro', () => {
    saveDurations({ u3: 90 });
    vi.setSystemTime(new Date(2026, 9, 25, 8, 0));
    expect(loadDurations()).toEqual({ u3: 90 });
  });

  it('al cerrar sesión se borra todo', () => {
    saveDayDraft(draft);
    saveAvailability({ u3: [] });
    saveDurations({ u3: 90 });
    clearSavedPlanData();
    expect(storage.data.size).toBe(0);
  });

  it('si el navegador no deja guardar, no falla', () => {
    storage.state.blocked = true;
    expect(() => saveDayDraft(draft)).not.toThrow();
    expect(loadDayDraft()).toBeNull();
    expect(loadAvailability()).toEqual({});
  });

  it('datos corruptos se ignoran', () => {
    storage.data.set('routes.plan-day.v1', '{no es json');
    expect(loadDayDraft()).toBeNull();
  });
});
