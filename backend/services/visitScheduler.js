/**
 * PERF-013: horario del día de una trabajadora con franjas de disponibilidad.
 *
 * Problema: la trabajadora sale de la partida dentro de su jornada y tiene que
 * hacer visitas de duración fija (p. ej. 1 h). Cada usuaria está disponible en
 * una o varias franjas y la visita debe caber entera en una de ellas. Entre
 * visitas cuenta el tiempo de desplazamiento. Si no caben todas, se quitan las
 * menos posibles y se avisa para organizarlas otro día.
 *
 * Algoritmo: programación dinámica sobre subconjuntos (como Held–Karp) con
 * etiquetas. Estado = (visitas hechas, última visita); cada estado guarda las
 * etiquetas no dominadas:
 *
 *   E      fin más temprano de la última visita
 *   slack  cuánto se puede retrasar toda la cadena sin salirse de ninguna franja
 *   dist   metros recorridos
 *   idle   minutos de espera entre visitas
 *
 * Con varias franjas por usuaria se ramifica por franja. Para una secuencia y
 * franjas fijas, programar lo antes posible y absorber las esperas retrasando
 * la cadena (slack) da el fin más temprano y la menor espera a la vez.
 *
 * Al final se elige el máximo nº de visitas y, entre esos planes, el mejor
 * según cada objetivo: menos km, terminar antes o menos esperas.
 *
 * Plan del día (planDay), en dos fases:
 *   1. Sin contar desplazamientos: qué visitas es imposible encajar porque sus
 *      franjas se solapan con las de otras o no queda hueco en la jornada.
 *      Solo esas se apartan para otro día.
 *   2. Con los desplazamientos reales y franjas "blandas": todas las demás se
 *      programan; si alguna no llega a tiempo se mantiene y se informa de los
 *      minutos de retraso (decide la trabajadora). Primero se minimiza el
 *      retraso total (visitas + pasarse de la jornada) y después el objetivo.
 *
 * Orden manual (evaluateOrder): la misma DP restringida al orden que eligió la
 * trabajadora, también con franjas blandas, devolviendo los retrasos.
 *
 * Sin dependencias. CommonJS, igual que el backend.
 */

'use strict';

const DEFAULT_SERVICE_MINUTES = 60;
/** Tope de etiquetas por estado; si se alcanza, el resultado deja de ser exacto */
const MAX_LABELS_PER_STATE = 64;
const EPS = 1e-6;

/**
 * Duración de cada visita (minutos), en el orden de `visits`. `serviceMinutes` puede ser
 * un número (la misma para todas) o una lista con una duración por visita.
 * @param {number|number[]|undefined} serviceMinutes
 * @param {number} count
 * @returns {number[]}
 */
function visitDurations(serviceMinutes, count) {
  return Array.from({ length: count }, (_, i) => {
    const value = Array.isArray(serviceMinutes) ? serviceMinutes[i] : serviceMinutes;
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_SERVICE_MINUTES;
  });
}

/**
 * Margen en cada trayecto hacia una visita: Google no cuenta el tráfico ni el tiempo de
 * aparcar, y con varias visitas el desfase se acumula. La vuelta o la llegada final no lo llevan.
 */
const TRAVEL_MARGIN_RATIO = 0.1;
const PARKING_MINUTES = 3;

/** Minutos de margen de un trayecto de `rawMinutes` hacia una visita */
function travelMarginMinutes(rawMinutes) {
  return rawMinutes * TRAVEL_MARGIN_RATIO + PARKING_MINUTES;
}

/**
 * Matriz de tiempos con el margen añadido a los trayectos que llegan a una visita.
 * @param {number[][]} durations - minutos de viaje entre nodos (sin margen)
 * @param {number[]} visitNodes - nodos que son visitas
 * @returns {number[][]}
 */
function withTravelMargin(durations, visitNodes) {
  const isVisit = new Set(visitNodes);
  return durations.map((row, i) =>
    row.map((minutes, j) => (i !== j && isVisit.has(j) ? minutes + travelMarginMinutes(minutes) : minutes))
  );
}

/**
 * Añade a cada visita de una opción los minutos de margen de su trayecto (para mostrarlo).
 * @param {{ visits: Array<{ visit: number }> }} option - `visit` = posición en `visitNodes`
 * @param {number[][]} rawDurations - minutos sin margen
 * @param {number} origin
 * @param {number[]} visitNodes
 */
function annotateTravelMargins(option, rawDurations, origin, visitNodes) {
  let prev = origin;
  return {
    ...option,
    visits: option.visits.map((v) => {
      const node = visitNodes[v.visit];
      const margin = Math.round(travelMarginMinutes(rawDurations[prev][node]));
      prev = node;
      return { ...v, travel_margin: margin };
    }),
  };
}

/** Objetivos que la trabajadora puede elegir */
const GOALS = ['distance', 'finish', 'idle'];

/**
 * Intervalos de inicio válidos [a, b] de una visita: la visita [s, s + service]
 * debe caber en una franja y dentro de la jornada. Sin franjas = toda la jornada.
 *
 * Con `openEnd` (horario blando) el final de la jornada no limita cada visita:
 * pasarse de la jornada se cuenta una sola vez, como jornada alargada (overtime),
 * y "llegar tarde" queda solo para la franja de la usuaria o su hora fija. La
 * visita sí debe empezar dentro de la jornada.
 * @param {Array<{start:number, end:number}>} windows - minutos desde medianoche
 * @param {{start:number, end:number}} shift
 * @param {number} service
 * @param {boolean} [openEnd]
 * @returns {Array<[number, number]>}
 */
function startIntervals(windows, shift, service, openEnd = false) {
  const hasWindows = Array.isArray(windows) && windows.length > 0;
  if (openEnd && !hasWindows) return [[shift.start, Infinity]];
  const source = hasWindows ? windows : [shift];
  const intervals = source
    .map((w) => [Math.max(w.start, shift.start), (openEnd ? w.end : Math.min(w.end, shift.end)) - service])
    .filter(([a, b]) => a <= b + EPS && (!openEnd || a < shift.end - EPS))
    .sort((x, y) => x[0] - y[0]);
  // Unir franjas solapadas
  const merged = [];
  for (const [a, b] of intervals) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1] + EPS) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

/**
 * Etiqueta A domina a B si puede imitarla: acaba antes (y retrasándose llega
 * a acabar cuando B con al menos su holgura), con no más km ni más espera.
 */
function dominates(a, b) {
  return (
    a.late <= b.late + EPS &&
    a.E <= b.E + EPS &&
    a.dist <= b.dist + EPS &&
    a.idle <= b.idle + EPS &&
    a.E + a.slack >= b.E + b.slack - EPS
  );
}

/**
 * Inserta una etiqueta en la lista del estado si nadie la domina.
 * @returns {boolean} si se truncó la lista por el tope
 */
function insertLabel(list, label) {
  for (const other of list) {
    if (dominates(other, label)) return false;
  }
  for (let i = list.length - 1; i >= 0; i--) {
    if (dominates(label, list[i])) list.splice(i, 1);
  }
  list.push(label);
  if (list.length > MAX_LABELS_PER_STATE) {
    // Descartar la que acaba más tarde
    let worst = 0;
    for (let i = 1; i < list.length; i++) if (list[i].E > list[worst].E) worst = i;
    list.splice(worst, 1);
    return true;
  }
  return false;
}

/**
 * Horario final de una secuencia con franjas elegidas: lo antes posible y,
 * desde el fin de la última visita hacia atrás, cada visita lo más tarde posible
 * (así la trabajadora sale más tarde y espera menos entre visitas).
 */
function buildSchedule(sequence, ctx) {
  const { T, D, origin, endNode, finish, services, shift } = ctx;
  const n = sequence.length;
  // Duración de cada visita de la secuencia (por su posición en las visitas enviadas)
  const service = sequence.map((step) => services[step.position]);
  const starts = new Array(n);
  let t = shift.start;
  let prevNode = origin;
  for (let i = 0; i < n; i++) {
    const { visit, interval } = sequence[i];
    const arrival = t + T[prevNode][visit];
    starts[i] = Math.max(arrival, interval[0]);
    t = starts[i] + service[i];
    prevNode = visit;
  }
  for (let i = n - 2; i >= 0; i--) {
    const latest = starts[i + 1] - service[i] - T[sequence[i].visit][sequence[i + 1].visit];
    starts[i] = Math.max(starts[i], Math.min(sequence[i].interval[1], latest));
  }

  const visits = [];
  let distance = 0;
  let travel = 0;
  let idle = 0;
  prevNode = origin;
  let prevEnd = null;
  for (let i = 0; i < n; i++) {
    const node = sequence[i].visit;
    const legMin = T[prevNode][node];
    distance += D[prevNode][node];
    travel += legMin;
    const arrival = prevEnd == null ? starts[i] : prevEnd + legMin;
    const wait = Math.max(0, starts[i] - arrival);
    idle += wait;
    // Retraso: empieza después del último inicio que permite su franja (o de su hora fija)
    const late = Math.max(0, starts[i] - sequence[i].interval[1]);
    visits.push({ node, arrival, start: starts[i], end: starts[i] + service[i], wait, late });
    prevEnd = starts[i] + service[i];
    prevNode = node;
  }

  const departure = n > 0 ? starts[0] - T[origin][sequence[0].visit] : shift.start;
  let finishTime = prevEnd ?? shift.start;
  const closingNode = finish === 'start' ? origin : finish === 'custom' ? endNode : null;
  if (closingNode != null && n > 0) {
    finishTime += T[prevNode][closingNode];
    distance += D[prevNode][closingNode];
    travel += T[prevNode][closingNode];
  }
  const late = visits.reduce((sum, v) => sum + v.late, 0);
  const overtime = Math.max(0, finishTime - shift.end);
  return { visits, departure, finishTime, distance, travel, idle, late, overtime, penalty: late + overtime };
}

/**
 * Comparadores por objetivo (con desempates para que el resultado sea estable).
 */
const BY_GOAL = {
  distance: (a, b) => a.distance - b.distance || a.finishTime - b.finishTime || a.idle - b.idle,
  finish: (a, b) => a.finishTime - b.finishTime || a.distance - b.distance || a.idle - b.idle,
  idle: (a, b) =>
    a.idle - b.idle ||
    (a.finishTime - a.departure) - (b.finishTime - b.departure) ||
    a.distance - b.distance,
};
// Con franjas blandas, antes que el objetivo va llegar lo menos tarde posible
const COMPARE = Object.fromEntries(
  Object.entries(BY_GOAL).map(([goal, cmp]) => [goal, (a, b) => a.penalty - b.penalty || cmp(a, b)])
);

/**
 * @param {{
 *   durations: number[][],       // minutos de viaje entre nodos
 *   distances: number[][],       // metros entre nodos
 *   origin: number,              // nodo de la partida
 *   visits: number[],            // nodos de las visitas
 *   windows: Array<Array<{start:number,end:number}>>, // franjas por visita (mismo orden)
 *   shift: {start:number, end:number},  // jornada (minutos desde medianoche)
 *   finish?: 'start'|'last'|'custom',   // volver, acabar en la última visita u otro sitio
 *   endNode?: number|null,       // nodo de la llegada con finish === 'custom'
 *   serviceMinutes?: number|number[], // una para todas o una por visita (mismo orden)
 *   sequential?: boolean,        // solo el orden dado (visitas 0, 1, 2…), para evaluateOrder
 *   soft?: boolean,              // franjas y jornada blandas: llegar tarde se permite y se cuenta
 * }} input
 * @returns {{
 *   options: Array<{ goals: string[], order: number[], visits: Array<{visit:number, arrival:number,
 *     start:number, end:number, wait:number}>, departure: number, finish_time: number,
 *     distance_m: number, travel_min: number, idle_min: number,
 *     unscheduled: Array<{ visit: number, reason: 'no_window'|'no_fit' }> }>,
 *   unscheduled: Array<{ visit: number, reason: 'no_window'|'no_fit' }>, // de la 1.ª opción
 *   exact: boolean,
 *   ms: number,
 * }}
 *   `visit` / `order` son posiciones en `visits` (0-based).
 */
function scheduleVisits(input) {
  const started = process.hrtime.bigint();
  const T = input.durations;
  const D = input.distances;
  const origin = input.origin;
  const finish = input.finish ?? 'start';
  const endNode = finish === 'custom' ? input.endNode : null;
  const shift = input.shift;
  const visitNodes = input.visits;
  const m = visitNodes.length;
  const services = visitDurations(input.serviceMinutes, m);
  if (finish === 'custom' && (endNode == null || !Number.isInteger(endNode))) {
    throw new Error('Con llegada en otro sitio se requiere endNode');
  }
  if (!(shift.end > shift.start)) throw new Error('La jornada debe acabar después de empezar');
  if (m > 20) throw new Error(`Demasiadas visitas (${m})`);

  const sequential = Boolean(input.sequential);
  const soft = Boolean(input.soft);
  const intervals = visitNodes.map((_, i) => startIntervals(input.windows?.[i], shift, services[i], soft));
  const closing = (node) =>
    finish === 'start' ? T[node][origin] : finish === 'custom' ? T[node][endNode] : 0;

  // labels[mask * m + j]: etiquetas del estado (mask, última visita j)
  const labels = new Array((1 << m) * m);
  let truncated = false;
  const ctx = { T, D, origin, endNode, finish, services, shift };

  // Con franjas duras no se puede acabar una visita después de la jornada
  const pastShift = (label) => !soft && label.E > shift.end + EPS;

  for (let j = 0; j < (sequential ? Math.min(m, 1) : m); j++) {
    const node = visitNodes[j];
    const arrival = shift.start + T[origin][node];
    let lateInterval = null;
    for (const [a, b] of intervals[j]) {
      if (arrival > b + EPS) {
        lateInterval = [a, b];
        continue;
      }
      const start = Math.max(arrival, a);
      const label = {
        E: start + services[j],
        slack: b - start,
        dist: D[origin][node],
        idle: 0,
        late: 0,
        last: j,
        interval: [a, b],
        prev: null,
      };
      if (pastShift(label)) continue;
      const key = (1 << j) * m + j;
      labels[key] ??= [];
      truncated = insertLabel(labels[key], label) || truncated;
    }
    if (soft && lateInterval) {
      // Llega tarde a la última franja que ya pasó: empieza nada más llegar
      const label = {
        E: arrival + services[j],
        slack: 0,
        dist: D[origin][node],
        idle: 0,
        late: arrival - lateInterval[1],
        last: j,
        interval: lateInterval,
        prev: null,
      };
      const key = (1 << j) * m + j;
      labels[key] ??= [];
      truncated = insertLabel(labels[key], label) || truncated;
    }
  }

  for (let mask = 1; mask < 1 << m; mask++) {
    for (let j = 0; j < m; j++) {
      const list = labels[mask * m + j];
      if (!list) continue;
      const from = visitNodes[j];
      for (const L of list) {
        for (let k = sequential ? j + 1 : 0; k < (sequential ? Math.min(m, j + 2) : m); k++) {
          if (mask & (1 << k)) continue;
          const to = visitNodes[k];
          const arrival = L.E + T[from][to];
          const key = (mask | (1 << k)) * m + k;
          let lateInterval = null;
          for (const [a, b] of intervals[k]) {
            if (arrival > b + EPS) {
              lateInterval = [a, b];
              continue;
            }
            const wait = Math.max(0, a - arrival);
            const shiftBy = Math.min(wait, L.slack);
            const start = Math.max(arrival + shiftBy, a);
            const label = {
              E: start + services[k],
              slack: Math.min(L.slack - shiftBy, b - start),
              dist: L.dist + D[from][to],
              idle: L.idle + (wait - shiftBy),
              late: L.late,
              last: k,
              interval: [a, b],
              prev: L,
            };
            if (pastShift(label)) continue;
            labels[key] ??= [];
            truncated = insertLabel(labels[key], label) || truncated;
          }
          if (soft && lateInterval) {
            const label = {
              E: arrival + services[k],
              slack: 0,
              dist: L.dist + D[from][to],
              idle: L.idle,
              late: L.late + (arrival - lateInterval[1]),
              last: k,
              interval: lateInterval,
              prev: L,
            };
            labels[key] ??= [];
            truncated = insertLabel(labels[key], label) || truncated;
          }
        }
      }
    }
  }

  // Máximo nº de visitas que caben, volviendo / llegando dentro de la jornada
  let bestCount = 0;
  const finals = [];
  for (let mask = 1; mask < 1 << m; mask++) {
    let count = 0;
    for (let x = mask; x; x &= x - 1) count++;
    if (count < bestCount) continue;
    for (let j = 0; j < m; j++) {
      for (const L of labels[mask * m + j] ?? []) {
        if (!soft && L.E + closing(visitNodes[j]) > shift.end + EPS) continue;
        if (count > bestCount) {
          bestCount = count;
          finals.length = 0;
        }
        finals.push({ mask, label: L });
      }
    }
  }

  const unscheduledFor = (mask) => {
    const list = [];
    for (let j = 0; j < m; j++) {
      if (mask & (1 << j)) continue;
      list.push({ visit: j, reason: intervals[j].length === 0 ? 'no_window' : 'no_fit' });
    }
    return list;
  };

  const plans = finals.map(({ mask, label }) => {
    const sequence = [];
    for (let L = label; L; L = L.prev) {
      sequence.push({ position: L.last, visit: visitNodes[L.last], interval: L.interval });
    }
    sequence.reverse();
    const schedule = buildSchedule(sequence, ctx);
    return { mask, order: sequence.map((s) => s.position), ...schedule };
  });

  const options = [];
  for (const goal of GOALS) {
    if (plans.length === 0) break;
    const best = plans.reduce((acc, plan) => (COMPARE[goal](plan, acc) < 0 ? plan : acc));
    const same = options.find((o) => o.order.join(',') === best.order.join(','));
    if (same) {
      same.goals.push(goal);
      continue;
    }
    const round = (x) => Math.round(x);
    options.push({
      goals: [goal],
      order: best.order,
      visits: best.visits.map((v, i) => ({
        visit: best.order[i],
        arrival: round(v.arrival),
        start: round(v.start),
        end: round(v.end),
        wait: round(v.wait),
        late: round(v.late),
      })),
      departure: round(best.departure),
      finish_time: round(best.finishTime),
      distance_m: round(best.distance),
      travel_min: round(best.travel),
      idle_min: round(best.idle),
      late_min: round(best.late),
      overtime_min: round(best.overtime),
      unscheduled: unscheduledFor(best.mask),
    });
  }

  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  return {
    options,
    // Sin ninguna opción posible, no cabe ninguna visita
    unscheduled: options.length > 0 ? options[0].unscheduled : unscheduledFor(0),
    exact: !truncated,
    ms,
  };
}

/**
 * Plan del día en dos fases (ver cabecera): aparta solo las visitas imposibles
 * de encajar y programa el resto, aunque alguna llegue tarde (`late` por visita).
 * Misma entrada y salida que scheduleVisits.
 * @param {Parameters<typeof scheduleVisits>[0]} input
 */
function planDay(input) {
  const started = process.hrtime.bigint();
  const zeros = input.durations.map((row) => row.map(() => 0));
  // Fase 1: sin desplazamientos (los km reales solo desempatan qué visitas quedan)
  const fit = scheduleVisits({ ...input, durations: zeros });
  const best = fit.options[0];
  const unscheduled = (best ? best.unscheduled : fit.unscheduled).map((u) => ({
    visit: u.visit,
    // Sin franjas propias: lo que falta es hueco en la jornada, no que se solape
    reason: u.reason === 'no_fit' && !(input.windows?.[u.visit]?.length > 0) ? 'no_room' : u.reason,
  }));
  const keep = best ? [...best.order].sort((a, b) => a - b) : [];
  const ms = () => Number(process.hrtime.bigint() - started) / 1e6;
  if (keep.length === 0) return { options: [], unscheduled, exact: fit.exact, ms: ms() };

  // Fase 2: desplazamientos reales; llegar tarde se permite y se informa
  const sub = scheduleVisits({
    ...input,
    visits: keep.map((i) => input.visits[i]),
    windows: keep.map((i) => input.windows?.[i] ?? []),
    serviceMinutes: Array.isArray(input.serviceMinutes)
      ? keep.map((i) => input.serviceMinutes[i])
      : input.serviceMinutes,
    soft: true,
  });
  const options = sub.options.map((option) => ({
    ...option,
    order: option.order.map((j) => keep[j]),
    visits: option.visits.map((v) => ({ ...v, visit: keep[v.visit] })),
    unscheduled,
  }));
  return { options, unscheduled, exact: fit.exact && sub.exact, ms: ms() };
}

/**
 * Horario del orden elegido a mano (visitas 0, 1, 2… en ese orden).
 *
 * Es el mejor horario posible para ese orden según `goal`, llegando lo menos
 * tarde posible. Conflictos:
 *   late           llega `minutes` tarde a su franja o a su hora fija
 *   outside_window ninguna franja cabe en la jornada (no se puede programar)
 * Además `after_shift_min` > 0 si termina después de la jornada.
 *
 * @param {Parameters<typeof scheduleVisits>[0] & { goal?: 'distance'|'finish'|'idle' }} input
 *   Una hora fija llega como franja exacta de la duración de la visita.
 */
function evaluateOrder(input) {
  const goal = input.goal ?? 'finish';
  const m = input.visits.length;
  const result = scheduleVisits({ ...input, sequential: true, soft: true });
  const best = result.options.find((o) => o.goals.includes(goal));
  if (best && best.visits.length === m) {
    const conflicts = best.visits
      .filter((v) => v.late > 0)
      .map((v) => ({ visit: v.visit, type: 'late', minutes: v.late }));
    return {
      option: { ...best, goals: [goal] },
      conflicts,
      after_shift_min: best.overtime_min,
      feasible: conflicts.length === 0 && best.overtime_min === 0,
    };
  }

  // Alguna visita no tiene ninguna franja dentro de la jornada: se pone nada más llegar

  const T = input.durations;
  const shift = input.shift;
  const services = visitDurations(input.serviceMinutes, m);
  const finish = input.finish ?? 'start';
  const ctx = {
    T,
    D: input.distances,
    origin: input.origin,
    endNode: finish === 'custom' ? input.endNode : null,
    finish,
    services,
    shift,
  };
  const conflicts = [];
  const sequence = [];
  let t = shift.start;
  let prevNode = input.origin;
  for (let j = 0; j < m; j++) {
    const node = input.visits[j];
    const arrival = t + T[prevNode][node];
    const options = startIntervals(input.windows?.[j], shift, services[j], true);
    let interval = options.find(([, b]) => b >= arrival - EPS);
    let start;
    if (interval) {
      start = Math.max(arrival, interval[0]);
    } else {
      start = arrival;
      const passed = options[options.length - 1];
      if (passed) {
        // Sus franjas ya pasaron: llega tarde a la última
        interval = passed;
        conflicts.push({ visit: j, type: 'late', minutes: Math.round(arrival - passed[1]) });
      } else {
        conflicts.push({ visit: j, type: 'outside_window', minutes: null });
      }
    }
    sequence.push({ position: j, visit: node, interval: interval ? [interval[0], interval[1]] : [start, start] });
    t = start + services[j];
    prevNode = node;
  }

  const schedule = buildSchedule(sequence, ctx);
  const round = (x) => Math.round(x);
  const afterShift = Math.max(0, round(schedule.finishTime - shift.end));
  return {
    option: {
      goals: [goal],
      order: sequence.map((s) => s.position),
      visits: schedule.visits.map((v, i) => ({
        visit: i,
        arrival: round(v.arrival),
        start: round(v.start),
        end: round(v.end),
        wait: round(v.wait),
        late: round(v.late),
      })),
      departure: round(schedule.departure),
      finish_time: round(schedule.finishTime),
      distance_m: round(schedule.distance),
      travel_min: round(schedule.travel),
      idle_min: round(schedule.idle),
      late_min: round(schedule.late),
      overtime_min: afterShift,
      unscheduled: [],
    },
    conflicts,
    after_shift_min: afterShift,
    feasible: conflicts.length === 0 && afterShift === 0,
  };
}

module.exports = {
  scheduleVisits,
  planDay,
  evaluateOrder,
  startIntervals,
  buildSchedule,
  DEFAULT_SERVICE_MINUTES,
  visitDurations,
  TRAVEL_MARGIN_RATIO,
  PARKING_MINUTES,
  travelMarginMinutes,
  withTravelMargin,
  annotateTravelMargins,
  GOALS,
};
