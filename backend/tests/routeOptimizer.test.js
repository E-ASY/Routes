/**
 * PERF-013: tests del optimizador (node:test).
 *
 * Idea principal: en instancias pequeñas se puede probar TODAS las permutaciones
 * (fuerza bruta). Held–Karp debe dar exactamente ese mínimo, y los heurísticos
 * nunca pueden quedar por debajo.
 */
'use strict';

const test = require('node:test');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  haversineMeters,
  buildDistanceMatrix,
  tourCost,
  heldKarp,
  nearestNeighbor,
  optimizeOrder,
  optimizePlanOrder,
} = require('../services/routeOptimizer');
const { parseOptimizeOrderBody, MAX_PLAN_POINTS } = require('../utils/queryParams');

// Generador pseudoaleatorio reproducible (mulberry32)
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

function randomPoints(n, rand) {
  // Caja aproximada de Tenerife
  return Array.from({ length: n }, () => ({
    lat: 28.0 + rand() * 0.6,
    lon: -16.9 + rand() * 0.8,
  }));
}

/** Matriz asimétrica: perturba cada sentido por separado (como en carretera). */
function asymmetricMatrix(points, rand) {
  return buildDistanceMatrix(points).map((row) =>
    row.map((d) => d * (1.2 + 0.4 * rand()))
  );
}

function* permutations(arr) {
  if (arr.length <= 1) {
    yield arr.slice();
    return;
  }
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest)) yield [arr[i], ...p];
  }
}

function bruteForce(D, { start = null, end = null, returnToStart = false } = {}) {
  const n = D.length;
  const nodes = [...Array(n).keys()].filter((i) => i !== start && i !== end);
  let best = Infinity;
  for (const p of permutations(nodes)) {
    const tour = [...(start === null ? [] : [start]), ...p, ...(end === null ? [] : [end])];
    best = Math.min(best, tourCost(tour, D, returnToStart));
  }
  return best;
}

function assertIsPermutation(tour, n) {
  assert.equal(tour.length, n);
  assert.deepEqual([...tour].sort((a, b) => a - b), [...Array(n).keys()]);
}

const MODES = [
  { name: 'partida fija, camino abierto', opts: { start: 0, returnToStart: false } },
  { name: 'partida libre, camino abierto', opts: { start: null, returnToStart: false } },
  { name: 'circuito cerrado', opts: { start: 0, returnToStart: true } },
];

test('haversine: 1 grado de latitud ≈ 111.2 km', () => {
  const d = haversineMeters({ lat: 28, lon: -16 }, { lat: 29, lon: -16 });
  assert.ok(Math.abs(d - 111195) < 50, `d=${d}`);
});

for (const { name, opts } of MODES) {
  test(`Held–Karp = fuerza bruta (${name})`, () => {
    const rand = rng(42);
    for (let trial = 0; trial < 30; trial++) {
      const n = 2 + Math.floor(rand() * 7); // 2..8 puntos
      const pts = randomPoints(n, rand);
      const D = trial % 2 === 0 ? buildDistanceMatrix(pts) : asymmetricMatrix(pts, rand);
      const exact = heldKarp(D, opts);
      assertIsPermutation(exact.tour, n);
      if (opts.start !== null) assert.equal(exact.tour[0], opts.start);
      assert.ok(Math.abs(exact.cost - tourCost(exact.tour, D, opts.returnToStart)) < 1e-6);
      assert.ok(Math.abs(exact.cost - bruteForce(D, opts)) < 1e-6);
    }
  });

  test(`heurístico: válido, ≥ óptimo y ≤ vecino más cercano (${name})`, () => {
    const rand = rng(7);
    for (let trial = 0; trial < 30; trial++) {
      const n = 3 + Math.floor(rand() * 6);
      const pts = randomPoints(n, rand);
      const D = asymmetricMatrix(pts, rand);
      const optimum = bruteForce(D, opts);
      const nn = nearestNeighbor(D, opts);
      const h = optimizeOrder(D, { ...opts, method: 'heuristic' });
      assertIsPermutation(h.tour, n);
      if (opts.start !== null) assert.equal(h.tour[0], opts.start);
      assert.ok(h.cost >= optimum - 1e-6);
      assert.ok(h.cost <= nn.cost + 1e-6);
    }
  });
}

// Llegada fija (acabar en otro sitio): el índice depende de n, va aparte de MODES
for (const start of [0, null]) {
  const name = start === null ? 'partida libre' : 'partida fija';
  test(`llegada fija: Held–Karp = fuerza bruta y heurístico válido (${name})`, () => {
    const rand = rng(11);
    for (let trial = 0; trial < 30; trial++) {
      const n = 3 + Math.floor(rand() * 6); // 3..8 puntos
      const pts = randomPoints(n, rand);
      const D = trial % 2 === 0 ? buildDistanceMatrix(pts) : asymmetricMatrix(pts, rand);
      const opts = { start, end: n - 1 };
      const optimum = bruteForce(D, opts);
      for (const method of ['exact', 'heuristic', 'nn']) {
        const r = optimizeOrder(D, { ...opts, method });
        assertIsPermutation(r.tour, n);
        if (start !== null) assert.equal(r.tour[0], start);
        assert.equal(r.tour[n - 1], n - 1, method);
        assert.ok(Math.abs(r.cost - tourCost(r.tour, D)) < 1e-6);
        if (method === 'exact') assert.ok(Math.abs(r.cost - optimum) < 1e-6);
        else assert.ok(r.cost >= optimum - 1e-6);
      }
    }
  });
}

test('llegada fija: rechaza combinarla con la vuelta o con la partida', () => {
  const D = buildDistanceMatrix(randomPoints(4, rng(5)));
  assert.throws(() => heldKarp(D, { start: 0, end: 3, returnToStart: true }), /excluyentes/);
  assert.throws(() => heldKarp(D, { start: 0, end: 0 }), /partida/);
});

test('modo Plan: partida + 14 visitas se resuelve exacto en < 1 s', () => {
  const rand = rng(1);
  const D = buildDistanceMatrix(randomPoints(15, rand));
  const result = optimizeOrder(D, { start: 0 });
  assert.equal(result.method, 'exact');
  assert.equal(result.tour[0], 0);
  assertIsPermutation(result.tour, 15);
  assert.ok(result.ms < 1000, `ms=${result.ms}`);
});

test('casos borde: 0, 1 y 2 puntos', () => {
  assert.deepEqual(optimizeOrder([], {}).tour, []);
  assert.deepEqual(optimizeOrder([[0]], { start: 0 }).tour, [0]);
  const D = [[0, 5], [7, 0]];
  assert.deepEqual(optimizeOrder(D, { start: 1 }).tour, [1, 0]);
  assert.equal(optimizeOrder(D, {}).cost, 5); // partida libre: elige 0 → 1
});

// ---------------------------------------------------------------------------
// Modo Plan (POST /maps/optimize-order)
// ---------------------------------------------------------------------------

test('optimizePlanOrder: partida fija en 0 y orden óptimo en línea recta', () => {
  // Partida al oeste; visitas en línea hacia el este pero dadas desordenadas
  const points = [
    { lat: 28.4, lon: -16.5 },
    { lat: 28.4, lon: -16.2 },
    { lat: 28.4, lon: -16.4 },
    { lat: 28.4, lon: -16.3 },
  ];
  const r = optimizePlanOrder(points);
  assert.deepEqual(r.order, [0, 2, 3, 1]);
  assert.equal(r.method, 'exact');
  assert.equal(r.changed, true);
  assert.ok(r.straight_km_after < r.straight_km_before);
});

test('optimizePlanOrder: con endAtLast la llegada queda al final', () => {
  // Partida al oeste, llegada en medio: sin llegada fija la mejor ruta acabaría al este
  const points = [
    { lat: 28.4, lon: -16.5 },
    { lat: 28.4, lon: -16.2 },
    { lat: 28.4, lon: -16.4 },
    { lat: 28.4, lon: -16.35 },
  ];
  const r = optimizePlanOrder(points, { endAtLast: true });
  assert.deepEqual(r.order, [0, 2, 1, 3]);
  assert.equal(r.changed, true);
  assert.ok(r.straight_km_after < r.straight_km_before);
});

test('optimizePlanOrder: si el orden ya es óptimo no lo cambia', () => {
  const points = [
    { lat: 28.4, lon: -16.5 },
    { lat: 28.4, lon: -16.4 },
    { lat: 28.4, lon: -16.3 },
  ];
  const r = optimizePlanOrder(points);
  assert.deepEqual(r.order, [0, 1, 2]);
  assert.equal(r.changed, false);
  assert.equal(r.straight_km_after, r.straight_km_before);
});

test('optimizePlanOrder: nunca empeora el orden actual', () => {
  const rand = rng(3);
  for (let trial = 0; trial < 20; trial++) {
    const pts = randomPoints(2 + Math.floor(rand() * 14), rand);
    for (const opts of [{}, { returnToStart: true }, { endAtLast: true }]) {
      const r = optimizePlanOrder(pts, opts);
      assertIsPermutation(r.order, pts.length);
      assert.equal(r.order[0], 0);
      if (opts.endAtLast) assert.equal(r.order[pts.length - 1], pts.length - 1);
      assert.ok(r.straight_km_after <= r.straight_km_before);
    }
  }
});

describe('parseOptimizeOrderBody (Zod)', () => {
  const p = { lat: 28.4, lon: -16.3 };

  it('acepta partida + visitas y descarta campos extra', () => {
    const r = parseOptimizeOrderBody({ points: [{ ...p, label: 'x' }, p] });
    assert.equal(r.ok, true);
    assert.deepEqual(r.points, [p, p]);
    assert.equal(r.returnToStart, false);
  });

  it('rechaza menos de 2 puntos', () => {
    const r = parseOptimizeOrderBody({ points: [p] });
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
    assert.match(r.error, /al menos 2/);
  });

  it('rechaza más de MAX_PLAN_POINTS', () => {
    const r = parseOptimizeOrderBody({ points: Array(MAX_PLAN_POINTS + 1).fill(p) });
    assert.equal(r.ok, false);
    assert.match(r.error, /Máximo/);
  });

  it('rechaza coordenadas no numéricas o fuera de rango', () => {
    for (const bad of [{ lat: '28', lon: -16 }, { lat: 91, lon: 0 }, { lat: 0, lon: NaN }, null]) {
      const r = parseOptimizeOrderBody({ points: [p, bad] });
      assert.equal(r.ok, false, JSON.stringify(bad));
      assert.equal(r.status, 400);
    }
  });

  it('acepta endAtLast y lo rechaza junto a returnToStart o sin visitas', () => {
    assert.equal(parseOptimizeOrderBody({ points: [p, p, p], endAtLast: true }).endAtLast, true);
    const both = parseOptimizeOrderBody({ points: [p, p, p], endAtLast: true, returnToStart: true });
    assert.equal(both.ok, false);
    assert.match(both.error, /excluyentes/);
    const short = parseOptimizeOrderBody({ points: [p, p], endAtLast: true });
    assert.equal(short.ok, false);
    assert.match(short.error, /al menos 3/);
  });

  it('rechaza body vacío', () => {
    assert.equal(parseOptimizeOrderBody(undefined).ok, false);
  });
});
