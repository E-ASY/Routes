/**
 * PERF-013: tests del horario de visitas con franjas (node:test).
 *
 * En instancias pequeñas se prueban TODAS las secuencias de todos los subconjuntos
 * (fuerza bruta): el nº de visitas, los km mínimos y el fin más temprano deben
 * coincidir con los del planificador, y todo horario devuelto debe ser válido.
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  scheduleVisits,
  startIntervals,
  evaluateOrder,
  planDay,
  withTravelMargin,
  annotateTravelMargins,
  travelMarginMinutes,
} = require('../services/visitScheduler');
const { parseScheduleBody } = require('../utils/queryParams');

const H = (h, m = 0) => h * 60 + m;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Matriz simétrica de minutos con distancia = minutos × 700 m */
function randomInstance(m, rand, finish = 'start') {
  const n = m + 1 + (finish === 'custom' ? 1 : 0);
  const T = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) T[i][j] = T[j][i] = 5 + Math.floor(rand() * 30);
  }
  const D = T.map((row) => row.map((t) => t * 700));
  const windows = Array.from({ length: m }, () => {
    const r = rand();
    if (r < 0.2) return [];
    const count = r < 0.7 ? 1 : 2;
    return Array.from({ length: count }, () => {
      const start = H(8) + Math.floor(rand() * 12) * 30;
      return { start, end: start + 60 + Math.floor(rand() * 4) * 30 };
    });
  });
  return {
    durations: T,
    distances: D,
    origin: 0,
    visits: Array.from({ length: m }, (_, i) => i + 1),
    windows,
    shift: { start: H(8), end: H(15) },
    finish,
    endNode: finish === 'custom' ? n - 1 : null,
    serviceMinutes: 60,
  };
}

/** Programación lo antes posible de una secuencia (óptima para factibilidad y fin) */
function earliest(input, order) {
  const { durations: T, distances: D, origin, visits, shift, finish, endNode } = input;
  const service = input.serviceMinutes;
  let t = shift.start;
  let node = origin;
  let dist = 0;
  for (const j of order) {
    const to = visits[j];
    const arrival = t + T[node][to];
    const options = startIntervals(input.windows[j], shift, service)
      .filter(([, b]) => arrival <= b)
      .map(([a]) => Math.max(a, arrival));
    if (options.length === 0) return null;
    t = Math.min(...options) + service;
    dist += D[node][to];
    node = to;
  }
  const closing = finish === 'start' ? origin : finish === 'custom' ? endNode : null;
  if (closing != null) {
    t += T[node][closing];
    dist += D[node][closing];
  }
  return t <= shift.end ? { finish: t, dist } : null;
}

function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((x, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [x, ...p])
  );
}

function bruteForce(input) {
  const m = input.visits.length;
  let best = { count: 0, dist: Infinity, finish: Infinity };
  for (let mask = 1; mask < 1 << m; mask++) {
    const subset = [...Array(m).keys()].filter((j) => mask & (1 << j));
    if (subset.length < best.count) continue;
    for (const order of permutations(subset)) {
      const r = earliest(input, order);
      if (!r) continue;
      if (subset.length > best.count) best = { count: subset.length, dist: Infinity, finish: Infinity };
      best.dist = Math.min(best.dist, r.dist);
      best.finish = Math.min(best.finish, r.finish);
    }
  }
  return best;
}

/** Comprueba que un horario respeta franjas, jornada, viajes y que no se solapan */
function assertValid(input, option) {
  const { durations: T, origin, visits, shift } = input;
  const service = input.serviceMinutes;
  assert.ok(option.departure >= shift.start - 1, 'sale antes de la jornada');
  assert.ok(option.finish_time <= shift.end + 1, 'acaba después de la jornada');
  let prevEnd = option.departure;
  let prevNode = origin;
  for (const v of option.visits) {
    const node = visits[v.visit];
    assert.equal(v.end - v.start, service);
    assert.ok(v.start >= prevEnd + T[prevNode][node] - 1, 'no da tiempo a llegar');
    const ws = input.windows[v.visit];
    if (ws.length > 0) {
      assert.ok(
        ws.some((w) => v.start >= w.start - 1 && v.end <= w.end + 1),
        `la visita ${v.visit} (${v.start}-${v.end}) no cabe en sus franjas`
      );
    }
    prevEnd = v.end;
    prevNode = node;
  }
}

describe('startIntervals', () => {
  it('la visita debe caber entera en la franja', () => {
    // Disponible "a las 9" = 9:00–10:00 → solo puede empezar a las 9
    assert.deepEqual(startIntervals([{ start: H(9), end: H(10) }], { start: H(8), end: H(15) }, 60), [
      [H(9), H(9)],
    ]);
    assert.deepEqual(startIntervals([{ start: H(9), end: H(11) }], { start: H(8), end: H(15) }, 60), [
      [H(9), H(10)],
    ]);
  });

  it('sin franjas vale toda la jornada; franjas cortas o fuera de jornada se descartan', () => {
    assert.deepEqual(startIntervals([], { start: H(8), end: H(15) }, 60), [[H(8), H(14)]]);
    assert.deepEqual(
      startIntervals([{ start: H(9), end: H(9, 30) }, { start: H(16), end: H(18) }], { start: H(8), end: H(15) }, 60),
      []
    );
  });

  it('horario blando: el final de la jornada no limita la visita, pero debe empezar dentro', () => {
    const shift = { start: H(8), end: H(15) };
    assert.deepEqual(startIntervals([], shift, 60, true), [[H(8), Infinity]]);
    // Franja 14–17: puede empezar hasta las 16 aunque la jornada acabe a las 15
    assert.deepEqual(startIntervals([{ start: H(14), end: H(17) }], shift, 60, true), [[H(14), H(16)]]);
    // Franja que empieza después de la jornada: fuera
    assert.deepEqual(startIntervals([{ start: H(16), end: H(18) }], shift, 60, true), []);
  });
});

describe('scheduleVisits', () => {
  // Partida 0, A = 1, B = 2; 10 min entre cualquier par
  const ten = [
    [0, 10, 10],
    [10, 0, 10],
    [10, 10, 0],
  ];
  const base = {
    durations: ten,
    distances: ten.map((r) => r.map((t) => t * 1000)),
    origin: 0,
    visits: [1, 2],
    shift: { start: H(8), end: H(15) },
    finish: 'start',
    serviceMinutes: 60,
  };

  it('A solo a las 9 y B de 9 a 12: no coinciden y B va después', () => {
    const result = scheduleVisits({
      ...base,
      windows: [[{ start: H(9), end: H(10) }], [{ start: H(9), end: H(12) }]],
    });
    assert.equal(result.unscheduled.length, 0);
    const [option] = result.options;
    assert.deepEqual(option.order, [0, 1]);
    assert.equal(option.visits[0].start, H(9));
    assert.equal(option.visits[1].start, H(10, 10));
    assert.equal(option.departure, H(8, 50));
  });

  it('A solo a las 9 y B de 9 a 11: con el viaje B no cabe y se avisa', () => {
    const result = scheduleVisits({
      ...base,
      windows: [[{ start: H(9), end: H(10) }], [{ start: H(9), end: H(11) }]],
    });
    assert.equal(result.options[0].visits.length, 1);
    assert.equal(result.unscheduled.length, 1);
    assert.equal(result.unscheduled[0].reason, 'no_fit');
  });

  it('franja fuera de la jornada → no_window', () => {
    const result = scheduleVisits({
      ...base,
      windows: [[], [{ start: H(17), end: H(19) }]],
    });
    assert.deepEqual(result.unscheduled, [{ visit: 1, reason: 'no_window' }]);
  });

  it('usa la segunda franja de una usuaria si la primera no sirve', () => {
    const result = scheduleVisits({
      ...base,
      windows: [
        [{ start: H(9), end: H(10) }],
        [{ start: H(9), end: H(10) }, { start: H(12), end: H(13) }],
      ],
    });
    assert.equal(result.unscheduled.length, 0);
    const b = result.options[0].visits.find((v) => v.visit === 1);
    assert.equal(b.start, H(12));
  });

  it('retrasa la salida para no esperar en la primera visita', () => {
    const result = scheduleVisits({ ...base, visits: [1], windows: [[{ start: H(11), end: H(13) }]] });
    const [option] = result.options;
    assert.equal(option.departure, H(10, 50));
    assert.equal(option.idle_min, 0);
  });

  it('coincide con fuerza bruta en nº de visitas, km mínimos y fin más temprano', () => {
    const rand = rng(13);
    for (let trial = 0; trial < 60; trial++) {
      const finish = ['start', 'last', 'custom'][trial % 3];
      const input = randomInstance(2 + (trial % 5), rand, finish);
      const result = scheduleVisits(input);
      const brute = bruteForce(input);
      if (brute.count === 0) {
        assert.equal(result.options.length, 0);
        assert.equal(result.unscheduled.length, input.visits.length);
        continue;
      }
      assert.ok(result.exact);
      for (const option of result.options) {
        assert.equal(option.visits.length, brute.count, `trial ${trial}: nº de visitas`);
        assert.equal(option.unscheduled.length, input.visits.length - brute.count);
        assertValid(input, option);
      }
      const byGoal = (goal) => result.options.find((o) => o.goals.includes(goal));
      assert.equal(byGoal('distance').distance_m, brute.dist, `trial ${trial}: km mínimos`);
      assert.equal(byGoal('finish').finish_time, brute.finish, `trial ${trial}: fin más temprano`);
      const minIdle = Math.min(...result.options.map((o) => o.idle_min));
      assert.equal(byGoal('idle').idle_min, minIdle);
    }
  });

  it('14 visitas sin franjas resuelve rápido', () => {
    const input = randomInstance(14, rng(7));
    input.windows = input.windows.map(() => []);
    input.shift = { start: H(0), end: H(24) };
    const result = scheduleVisits(input);
    assert.equal(result.options[0].visits.length, 14);
    assert.ok(result.ms < 10000, `tardó ${result.ms} ms`);
  });
});

describe('evaluateOrder (orden manual)', () => {
  const ten = [
    [0, 10, 10, 10],
    [10, 0, 10, 10],
    [10, 10, 0, 10],
    [10, 10, 10, 0],
  ];
  const base = {
    durations: ten,
    distances: ten.map((r) => r.map((t) => t * 1000)),
    origin: 0,
    visits: [1, 2],
    shift: { start: H(8), end: H(15) },
    finish: 'start',
    serviceMinutes: 60,
  };

  it('respeta el orden dado aunque no sea el óptimo', () => {
    // B (visita 0) de 11 a 13, A (visita 1) de 9 a 14: a mano B primero
    const r = evaluateOrder({
      ...base,
      windows: [[{ start: H(11), end: H(13) }], [{ start: H(9), end: H(14) }]],
    });
    assert.equal(r.feasible, true);
    assert.deepEqual(r.option.order, [0, 1]);
    assert.equal(r.option.visits[0].start, H(11));
    assert.equal(r.option.visits[1].start, H(12, 10));
  });

  it('el orden óptimo de scheduleVisits evaluado a mano da el mismo fin', () => {
    const rand = rng(99);
    for (let trial = 0; trial < 30; trial++) {
      const input = randomInstance(2 + (trial % 4), rand);
      const opt = scheduleVisits(input).options.find((o) => o.goals.includes('finish'));
      if (!opt || opt.visits.length !== input.visits.length) continue;
      const manual = evaluateOrder({
        ...input,
        visits: opt.order.map((i) => input.visits[i]),
        windows: opt.order.map((i) => input.windows[i]),
        goal: 'finish',
      });
      assert.equal(manual.feasible, true);
      assert.equal(manual.option.finish_time, opt.finish_time, `trial ${trial}`);
    }
  });

  it('hora fija a la que no se llega → late con los minutos de retraso', () => {
    // A fija a las 9:00, B fija a las 9:30: B empieza al acabar A + 10 min
    const r = evaluateOrder({
      ...base,
      windows: [[{ start: H(9), end: H(10) }], [{ start: H(9, 30), end: H(10, 30) }]],
      fixed: [H(9), H(9, 30)],
    });
    assert.equal(r.feasible, false);
    assert.deepEqual(r.conflicts, [{ visit: 1, type: 'late', minutes: 40 }]);
    assert.equal(r.option.visits[1].start, H(10, 10));
  });

  it('fuera de su horario y después de la jornada', () => {
    const r = evaluateOrder({
      ...base,
      shift: { start: H(8), end: H(10) },
      windows: [[{ start: H(8), end: H(10) }], [{ start: H(8), end: H(9) }]],
    });
    // B solo puede empezar a las 8:00 y llega a las 9:20 (tras A + 10 min): 80 min tarde
    assert.equal(r.feasible, false);
    assert.deepEqual(r.conflicts, [{ visit: 1, type: 'late', minutes: 80 }]);
    assert.equal(r.option.visits[1].late, 80);
    assert.ok(r.after_shift_min > 0);
  });

  it('pasarse de la jornada no es llegar tarde: solo alarga la jornada', () => {
    // Jornada 8–10, sin franjas: A 8:10–9:10, B 9:20–10:20 y vuelta a las 10:30
    const r = evaluateOrder({ ...base, shift: { start: H(8), end: H(10) }, windows: [[], []] });
    assert.deepEqual(r.conflicts, []);
    assert.equal(r.option.late_min, 0);
    assert.equal(r.option.visits[1].start, H(9, 20));
    assert.equal(r.after_shift_min, 30);
    assert.equal(r.option.overtime_min, 30);
  });

  it('duración distinta por visita: cada una ocupa la suya y empuja a la siguiente', () => {
    // A 30 min y B 90 min, sin franjas: A 8:10–8:40, B 8:50–10:20, vuelta 10:30
    const r = evaluateOrder({ ...base, windows: [[], []], serviceMinutes: [30, 90] });
    assert.deepEqual(r.conflicts, []);
    const [a, b] = r.option.visits;
    assert.equal(a.end - a.start, 30);
    assert.equal(b.end - b.start, 90);
    assert.equal(b.start, H(8, 50));
    assert.equal(r.option.finish_time, H(10, 30));
  });

  it('franja que sigue después de la jornada: dentro de su franja no llega tarde', () => {
    // B disponible de 9 a 11; la jornada acaba a las 10
    const r = evaluateOrder({
      ...base,
      shift: { start: H(8), end: H(10) },
      windows: [[], [{ start: H(9), end: H(11) }]],
    });
    assert.deepEqual(r.conflicts, []);
    assert.equal(r.after_shift_min, 30);
  });
});

describe('planDay (solo se apartan las visitas imposibles)', () => {
  const ten = [
    [0, 10, 10, 10],
    [10, 0, 10, 10],
    [10, 10, 0, 10],
    [10, 10, 10, 0],
  ];
  const base = {
    durations: ten,
    distances: ten.map((r) => r.map((t) => t * 1000)),
    origin: 0,
    visits: [1, 2],
    shift: { start: H(8), end: H(15) },
    finish: 'start',
    serviceMinutes: 60,
  };

  it('A solo a las 9 y B de 9 a 11: B se mantiene y llega 10 min tarde', () => {
    const r = planDay({ ...base, windows: [[{ start: H(9), end: H(10) }], [{ start: H(9), end: H(11) }]] });
    assert.deepEqual(r.unscheduled, []);
    const [option] = r.options;
    assert.equal(option.visits.length, 2);
    assert.equal(option.late_min, 10);
    const b = option.visits.find((v) => v.visit === 1);
    assert.equal(b.start, H(10, 10));
    assert.equal(b.late, 10);
  });

  it('A y B solo a las 9: se solapan y una va a otro día (no_fit)', () => {
    const r = planDay({ ...base, windows: [[{ start: H(9), end: H(10) }], [{ start: H(9), end: H(10) }]] });
    assert.equal(r.unscheduled.length, 1);
    assert.equal(r.unscheduled[0].reason, 'no_fit');
    assert.equal(r.options[0].visits.length, 1);
    assert.equal(r.options[0].late_min, 0);
  });

  it('sin franjas pero sin hueco en la jornada → no_room', () => {
    const r = planDay({
      ...base,
      visits: [1, 2, 3],
      shift: { start: H(8), end: H(10) },
      windows: [[], [], []],
    });
    assert.equal(r.unscheduled.length, 1);
    assert.equal(r.unscheduled[0].reason, 'no_room');
    // Las 2 que caben sin viajes se mantienen; con viajes se pasa de la jornada
    assert.equal(r.options[0].visits.length, 2);
    assert.ok(r.options[0].overtime_min > 0);
    // Alargar la jornada no es llegar tarde a ninguna visita
    assert.equal(r.options[0].late_min, 0);
    assert.ok(r.options[0].visits.every((v) => v.late === 0));
  });

  it('la duración de cada visita sigue a su usuaria aunque otra se aparte', () => {
    // A y B solo a las 9 (se solapan, una va a otro día); C dura 2 h
    const r = planDay({
      ...base,
      visits: [1, 2, 3],
      windows: [[{ start: H(9), end: H(10) }], [{ start: H(9), end: H(10) }], []],
      serviceMinutes: [60, 60, 120],
    });
    assert.equal(r.unscheduled.length, 1);
    const c = r.options[0].visits.find((v) => v.visit === 2);
    assert.equal(c.end - c.start, 120);
  });

  it('si todo cabe a tiempo coincide con scheduleVisits', () => {
    const rand = rng(5);
    for (let trial = 0; trial < 30; trial++) {
      const input = randomInstance(2 + (trial % 4), rand);
      const hard = scheduleVisits(input);
      if (hard.unscheduled.length > 0 || hard.options.length === 0) continue;
      const soft = planDay(input);
      assert.equal(soft.options[0].late_min, 0, `trial ${trial}`);
      const byGoal = (r, goal) => r.options.find((o) => o.goals.includes(goal));
      assert.equal(byGoal(soft, 'distance').distance_m, byGoal(hard, 'distance').distance_m);
      assert.equal(byGoal(soft, 'finish').finish_time, byGoal(hard, 'finish').finish_time);
    }
  });

  it('nunca aparta más visitas que las imposibles sin viajes y el retraso es mínimo (fuerza bruta)', () => {
    const rand = rng(21);
    for (let trial = 0; trial < 25; trial++) {
      const input = randomInstance(2 + (trial % 4), rand);
      const r = planDay(input);
      const zeros = input.durations.map((row) => row.map(() => 0));
      const fit = bruteForce({ ...input, durations: zeros });
      assert.equal(input.visits.length - r.unscheduled.length, fit.count, `trial ${trial}`);
      if (fit.count === 0) continue;
      // Retraso mínimo entre todos los órdenes de las visitas que se mantienen
      const kept = r.options[0].order.slice().sort((a, b) => a - b);
      let bestPenalty = Infinity;
      for (const order of permutations(kept)) {
        const manual = evaluateOrder({
          ...input,
          visits: order.map((i) => input.visits[i]),
          windows: order.map((i) => input.windows[i]),
        });
        bestPenalty = Math.min(bestPenalty, manual.option.late_min + manual.option.overtime_min);
      }
      const penalty = Math.min(...r.options.map((o) => o.late_min + o.overtime_min));
      assert.ok(penalty <= bestPenalty + 1, `trial ${trial}: ${penalty} > ${bestPenalty}`);
    }
  });

  it('14 visitas sin franjas resuelve rápido', () => {
    const input = randomInstance(14, rng(7));
    input.windows = input.windows.map(() => []);
    const r = planDay(input);
    assert.ok(r.ms < 15000, `tardó ${r.ms} ms`);
    assert.equal(r.options[0].visits.length + r.unscheduled.length, 14);
  });
});

describe('margen por trayecto (tráfico + aparcar)', () => {
  const ten = [
    [0, 10, 10, 10],
    [10, 0, 10, 10],
    [10, 10, 0, 10],
    [10, 10, 10, 0],
  ];

  it('10 % del viaje más 3 min para aparcar', () => {
    assert.equal(travelMarginMinutes(10), 4);
    assert.equal(travelMarginMinutes(30), 6);
    assert.equal(travelMarginMinutes(0), 3);
  });

  it('solo en los trayectos que llegan a una visita; la vuelta y la llegada final no', () => {
    // Visitas = nodos 1 y 2; el 0 es la partida y el 3 la llegada
    const m = withTravelMargin(ten, [1, 2]);
    assert.equal(m[0][1], 14);
    assert.equal(m[1][2], 14);
    assert.equal(m[2][0], 10);
    assert.equal(m[2][3], 10);
    assert.equal(m[1][1], 0);
  });

  it('el horario lo incluye y cada visita informa de su margen', () => {
    // Sin franjas: sale 8:00, A 8:14–9:14, B 9:28–10:28, vuelve 10:38 (la vuelta sin margen)
    const r = evaluateOrder({
      durations: withTravelMargin(ten, [1, 2]),
      distances: ten.map((row) => row.map((t) => t * 1000)),
      origin: 0,
      visits: [1, 2],
      windows: [[], []],
      shift: { start: H(8), end: H(15) },
      finish: 'start',
      serviceMinutes: 60,
    });
    const [a, b] = r.option.visits;
    assert.equal(a.start, H(8, 14));
    assert.equal(b.start, H(9, 28));
    assert.equal(r.option.finish_time, H(10, 38));
    const annotated = annotateTravelMargins(r.option, ten, 0, [1, 2]);
    assert.deepEqual(
      annotated.visits.map((v) => v.travel_margin),
      [4, 4]
    );
  });
});

describe('parseScheduleBody', () => {
  const points = [
    { lat: 28.4, lon: -16.3 },
    { lat: 28.5, lon: -16.4 },
  ];
  it('acepta un body válido', () => {
    const r = parseScheduleBody({
      points,
      finish: 'start',
      shift: { start: H(8), end: H(15) },
      windows: [[{ start: H(9), end: H(10) }]],
    });
    assert.equal(r.ok, true);
  });
  it('modo manual con horas fijas; fixedStarts debe tener un valor por visita', () => {
    const body = {
      points,
      finish: 'start',
      shift: { start: H(8), end: H(15) },
      windows: [[]],
      mode: 'manual',
      goal: 'idle',
      fixedStarts: [H(10)],
    };
    const r = parseScheduleBody(body);
    assert.equal(r.ok, true);
    assert.equal(r.mode, 'manual');
    assert.deepEqual(r.fixedStarts, [H(10)]);
    assert.equal(parseScheduleBody({ ...body, fixedStarts: [] }).ok, false);
    // Duración: una para todas o una por visita (5 min – 8 h)
    assert.deepEqual(parseScheduleBody({ ...body, serviceMinutes: [45] }).serviceMinutes, [45]);
    assert.equal(parseScheduleBody({ ...body, serviceMinutes: 90 }).ok, true);
    assert.equal(parseScheduleBody({ ...body, serviceMinutes: [45, 60] }).ok, false);
    assert.equal(parseScheduleBody({ ...body, serviceMinutes: [500] }).ok, false);
    assert.deepEqual(parseScheduleBody({ ...body, fixedStarts: undefined }).fixedStarts, [null]);
  });
  it('rechaza nº de franjas distinto al de visitas y franjas invertidas', () => {
    assert.equal(
      parseScheduleBody({ points, finish: 'start', shift: { start: H(8), end: H(15) }, windows: [] }).ok,
      false
    );
    assert.equal(
      parseScheduleBody({
        points,
        finish: 'start',
        shift: { start: H(8), end: H(15) },
        windows: [[{ start: H(10), end: H(9) }]],
      }).ok,
      false
    );
  });
});
