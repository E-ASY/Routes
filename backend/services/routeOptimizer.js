/**
 * PERF-013: optimización del orden de visitas (origen: prototipo-orden-visitas).
 *
 * Problema: dado un conjunto de puntos y una matriz de distancias D (puede ser
 * asimétrica, como las distancias por carretera), encontrar el orden de visita
 * que minimiza la distancia total.
 *
 *   - Camino abierto con partida fija  (modo Plan: partida + visitas, sin volver)
 *   - Camino abierto con partida libre (rutas por trabajadora que pinta hoy el mapa)
 *   - Circuito cerrado (volver a la partida), opcional
 *   - Llegada fija distinta de la partida (acabar en otro sitio), opcional
 *
 * Algoritmos:
 *   - Held–Karp (programación dinámica, exacto). Coste O(m² · 2^m) con m = nº de paradas.
 *     Para m ≤ 15 tarda milisegundos → cubre el modo Plan (máx. 14 visitas).
 *   - Vecino más cercano (multi-arranque) + búsqueda local (2-opt + reubicación).
 *     Heurístico, para instancias grandes.
 *
 * Sin dependencias. CommonJS, igual que el backend.
 */

'use strict';

const EARTH_RADIUS_M = 6371008.8;
const DEFAULT_EXACT_MAX_STOPS = 15;

// ---------------------------------------------------------------------------
// Distancias
// ---------------------------------------------------------------------------

/**
 * Distancia ortodrómica (fórmula del haversine) en metros.
 * Es una cota inferior de la distancia por carretera.
 * @param {{lat:number, lon:number}} a
 * @param {{lat:number, lon:number}} b
 */
function haversineMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Matriz D[i][j] = distFn(points[i], points[j]).
 * @param {Array<{lat:number, lon:number}>} points
 * @param {(a, b) => number} [distFn]
 * @returns {number[][]}
 */
function buildDistanceMatrix(points, distFn = haversineMeters) {
  const n = points.length;
  const D = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) D[i][j] = distFn(points[i], points[j]);
    }
  }
  return D;
}

// ---------------------------------------------------------------------------
// Coste de un orden
// ---------------------------------------------------------------------------

/**
 * Coste de recorrer los nodos en el orden `tour`.
 * @param {number[]} tour - permutación de índices de nodos
 * @param {number[][]} D
 * @param {boolean} [returnToStart=false] - sumar el tramo de vuelta al primero
 */
function tourCost(tour, D, returnToStart = false) {
  let cost = 0;
  for (let i = 0; i < tour.length - 1; i++) {
    cost += D[tour[i]][tour[i + 1]];
  }
  if (returnToStart && tour.length > 1) {
    cost += D[tour[tour.length - 1]][tour[0]];
  }
  return cost;
}

// ---------------------------------------------------------------------------
// Exacto: Held–Karp
// ---------------------------------------------------------------------------

/**
 * Programación dinámica de Held–Karp.
 *
 * dp[S][j] = coste mínimo de un camino que sale de la partida, visita
 *            exactamente las paradas del conjunto S y termina en j ∈ S.
 *
 * dp[{j}][j]   = D[s][j]               (o 0 si la partida es libre)
 * dp[S ∪ {k}][k] = min_{j∈S} dp[S][j] + D[j][k]
 *
 * Con llegada fija e, e queda fuera de S y el cierre suma D[j][e].
 * Los conjuntos se codifican como máscaras de bits.
 *
 * @param {number[][]} D
 * @param {{ start?: number|null, end?: number|null, returnToStart?: boolean, maxStops?: number }} [opts]
 * @returns {{ tour: number[], cost: number }}
 */
function heldKarp(D, opts = {}) {
  const n = D.length;
  let start = opts.start ?? null;
  const end = opts.end ?? null;
  const returnToStart = Boolean(opts.returnToStart);
  const maxStops = opts.maxStops ?? 20;

  if (n === 0) return { tour: [], cost: 0 };
  assertEndOptions(n, start, end, returnToStart);
  // Un circuito cerrado es invariante por rotación: fijar el nodo 0 no pierde óptimos.
  if (returnToStart && start === null) start = 0;

  const stops = [];
  for (let i = 0; i < n; i++) if (i !== start && i !== end) stops.push(i);
  const m = stops.length;
  if (m === 0) {
    const tour = [start, end].filter((i) => i !== null);
    return { tour, cost: tourCost(tour, D, returnToStart) };
  }
  if (m > maxStops) {
    throw new Error(`Held–Karp: ${m} paradas supera el máximo (${maxStops})`);
  }

  const size = 1 << m;
  const dp = new Float64Array(size * m).fill(Infinity);
  const parent = new Int8Array(size * m).fill(-1);

  for (let j = 0; j < m; j++) {
    dp[(1 << j) * m + j] = start === null ? 0 : D[start][stops[j]];
  }

  for (let mask = 1; mask < size; mask++) {
    for (let j = 0; j < m; j++) {
      if (!(mask & (1 << j))) continue;
      const base = dp[mask * m + j];
      if (base === Infinity) continue;
      const from = stops[j];
      for (let k = 0; k < m; k++) {
        if (mask & (1 << k)) continue;
        const next = mask | (1 << k);
        const value = base + D[from][stops[k]];
        if (value < dp[next * m + k]) {
          dp[next * m + k] = value;
          parent[next * m + k] = j;
        }
      }
    }
  }

  const full = size - 1;
  let bestJ = -1;
  let bestCost = Infinity;
  for (let j = 0; j < m; j++) {
    const closing = returnToStart
      ? D[stops[j]][start]
      : end !== null ? D[stops[j]][end] : 0;
    const value = dp[full * m + j] + closing;
    if (value < bestCost) {
      bestCost = value;
      bestJ = j;
    }
  }

  // Reconstrucción hacia atrás
  const reversed = [];
  let mask = full;
  let j = bestJ;
  while (j !== -1) {
    reversed.push(stops[j]);
    const prev = parent[mask * m + j];
    mask &= ~(1 << j);
    j = prev;
  }
  const tour = reversed.reverse();
  if (start !== null) tour.unshift(start);
  if (end !== null) tour.push(end);
  return { tour, cost: bestCost };
}

/**
 * La llegada fija es incompatible con el circuito cerrado y debe ser otro nodo.
 */
function assertEndOptions(n, start, end, returnToStart) {
  if (end === null) return;
  if (returnToStart) throw new Error('Llegada fija y volver a la partida son excluyentes');
  if (!Number.isInteger(end) || end < 0 || end >= n) throw new Error(`Llegada inválida: ${end}`);
  if (end === start) throw new Error('La llegada no puede ser la partida');
}

// ---------------------------------------------------------------------------
// Heurísticos
// ---------------------------------------------------------------------------

/**
 * Vecino más cercano desde un nodo inicial. La llegada fija (si hay) va al final.
 * @param {number[][]} D
 * @param {number} first
 * @param {number|null} [end]
 */
function nearestNeighborFrom(D, first, end = null) {
  const n = D.length;
  const visited = new Array(n).fill(false);
  const tour = [first];
  visited[first] = true;
  if (end !== null) visited[end] = true;
  let current = first;
  const steps = end !== null ? n - 1 : n;
  for (let step = 1; step < steps; step++) {
    let best = -1;
    let bestDist = Infinity;
    for (let k = 0; k < n; k++) {
      if (!visited[k] && D[current][k] < bestDist) {
        bestDist = D[current][k];
        best = k;
      }
    }
    visited[best] = true;
    tour.push(best);
    current = best;
  }
  if (end !== null) tour.push(end);
  return tour;
}

/**
 * Vecino más cercano. Con partida libre prueba todos los nodos iniciales
 * y se queda con el mejor (multi-arranque).
 * @param {number[][]} D
 * @param {{ start?: number|null, end?: number|null, returnToStart?: boolean }} [opts]
 */
function nearestNeighbor(D, opts = {}) {
  const n = D.length;
  if (n === 0) return { tour: [], cost: 0 };
  const start = opts.start ?? null;
  const end = opts.end ?? null;
  const returnToStart = Boolean(opts.returnToStart);
  assertEndOptions(n, start, end, returnToStart);
  if (end !== null && n === 1) return { tour: [end], cost: 0 };
  const firsts = start === null ? [...Array(n).keys()].filter((i) => i !== end) : [start];
  let best = null;
  for (const first of firsts) {
    const tour = nearestNeighborFrom(D, first, end);
    const cost = tourCost(tour, D, returnToStart);
    if (!best || cost < best.cost) best = { tour, cost };
  }
  return best;
}

/**
 * Búsqueda local: 2-opt (invertir un tramo) + reubicación (mover un nodo).
 * Recalcula el coste completo en cada movimiento, así que es válida para
 * matrices asimétricas (al invertir un tramo cambian sus sentidos).
 * Complejidad O(n³) por pasada; suficiente para n ≲ 60.
 *
 * @param {number[]} initialTour
 * @param {number[][]} D
 * @param {{ start?: number|null, end?: number|null, returnToStart?: boolean, maxPasses?: number }} [opts]
 */
function localSearch(initialTour, D, opts = {}) {
  const returnToStart = Boolean(opts.returnToStart);
  const fixedFirst = opts.start !== null && opts.start !== undefined;
  const fixedLast = opts.end !== null && opts.end !== undefined;
  const maxPasses = opts.maxPasses ?? 50;
  const lo = fixedFirst || returnToStart ? 1 : 0;
  // Con llegada fija, la última posición no se mueve
  const n = fixedLast ? initialTour.length - 1 : initialTour.length;

  let tour = initialTour.slice();
  let cost = tourCost(tour, D, returnToStart);
  const EPS = 1e-9;

  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;

    // 2-opt: invertir tour[i..k]
    for (let i = lo; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const candidate = tour
          .slice(0, i)
          .concat(tour.slice(i, k + 1).reverse(), tour.slice(k + 1));
        const c = tourCost(candidate, D, returnToStart);
        if (c < cost - EPS) {
          tour = candidate;
          cost = c;
          improved = true;
        }
      }
    }

    // Reubicación: sacar tour[i] e insertarlo en la posición j
    for (let i = lo; i < n; i++) {
      for (let j = lo; j < n; j++) {
        if (i === j) continue;
        const candidate = tour.slice();
        const [node] = candidate.splice(i, 1);
        candidate.splice(j, 0, node);
        const c = tourCost(candidate, D, returnToStart);
        if (c < cost - EPS) {
          tour = candidate;
          cost = c;
          improved = true;
        }
      }
    }

    if (!improved) break;
  }
  return { tour, cost };
}

// ---------------------------------------------------------------------------
// Punto de entrada
// ---------------------------------------------------------------------------

/**
 * Elige el algoritmo según el tamaño: exacto si cabe, heurístico si no.
 *
 * @param {number[][]} D
 * @param {{
 *   start?: number|null,          // índice de la partida fija (null = libre)
 *   end?: number|null,            // índice de la llegada fija (null = libre)
 *   returnToStart?: boolean,      // circuito cerrado
 *   exactMaxStops?: number,       // umbral para usar Held–Karp
 *   method?: 'auto'|'exact'|'heuristic'|'nn'
 * }} [opts]
 * @returns {{ tour: number[], cost: number, method: string, ms: number }}
 */
function optimizeOrder(D, opts = {}) {
  const started = process.hrtime.bigint();
  const start = opts.start ?? null;
  const end = opts.end ?? null;
  const returnToStart = Boolean(opts.returnToStart);
  const exactMaxStops = opts.exactMaxStops ?? DEFAULT_EXACT_MAX_STOPS;
  const stops = D.length - (start === null && !returnToStart ? 0 : 1) - (end === null ? 0 : 1);
  let method = opts.method ?? 'auto';
  if (method === 'auto') method = stops <= exactMaxStops ? 'exact' : 'heuristic';

  let result;
  if (method === 'exact') {
    result = heldKarp(D, { start, end, returnToStart, maxStops: Math.max(exactMaxStops, stops) });
  } else if (method === 'nn') {
    result = nearestNeighbor(D, { start, end, returnToStart });
  } else {
    const nn = nearestNeighbor(D, { start, end, returnToStart });
    result = localSearch(nn.tour, D, { start, end, returnToStart });
  }
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  return { ...result, method, ms };
}

/**
 * Modo Plan: points[0] es la partida (fija), el resto son visitas.
 * Con endAtLast, el último punto es la llegada (fija) y no se reordena.
 * Ordena con haversine (escenario A del README): no gasta llamadas a Google;
 * los km por carretera del orden final los calcula después POST /maps/legs.
 *
 * @param {Array<{lat:number, lon:number}>} points
 * @param {{ returnToStart?: boolean, endAtLast?: boolean }} [opts]
 * @returns {{ order: number[], method: string, ms: number,
 *             straight_km_before: number, straight_km_after: number, changed: boolean }}
 */
function optimizePlanOrder(points, opts = {}) {
  const returnToStart = Boolean(opts.returnToStart);
  const end = opts.endAtLast ? points.length - 1 : null;
  const D = buildDistanceMatrix(points);
  const current = [...points.keys()];
  const before = tourCost(current, D, returnToStart);
  const result = optimizeOrder(D, { start: 0, end, returnToStart });
  // Si el actual ya es óptimo (empate numérico), no reordenar la lista de la usuaria
  const changed = result.cost < before - 1e-6;
  const order = changed ? result.tour : current;
  const after = changed ? result.cost : before;
  const toKm = (m) => Math.round(m) / 1000;
  return {
    order,
    method: result.method,
    ms: result.ms,
    straight_km_before: toKm(before),
    straight_km_after: toKm(after),
    changed,
  };
}

module.exports = {
  optimizePlanOrder,
  haversineMeters,
  buildDistanceMatrix,
  tourCost,
  heldKarp,
  nearestNeighbor,
  localSearch,
  optimizeOrder,
  DEFAULT_EXACT_MAX_STOPS,
};
