/**
 * computeTravelMatrix (Google Route Matrix) con stub: sin llamadas reales.
 */
const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

const originalPost = axios.post;
const calls = [];
let fail = false;

// 1 min y 1000 m por cada 0.01 grados de diferencia en latitud
axios.post = async (url, body) => {
  assert.match(url, /computeRouteMatrix/);
  calls.push(body);
  if (fail) throw new Error('Google caído');
  const elements = [];
  body.origins.forEach((o, i) => {
    body.destinations.forEach((d, j) => {
      const diff = Math.abs(o.waypoint.location.latLng.latitude - d.waypoint.location.latLng.latitude);
      elements.push({
        originIndex: i,
        destinationIndex: j,
        condition: 'ROUTE_EXISTS',
        duration: `${Math.round(diff * 100 * 60)}s`,
        distanceMeters: Math.round(diff * 100 * 1000),
      });
    });
  });
  return { data: elements };
};

after(() => {
  axios.post = originalPost;
});

const { computeTravelMatrix, clearRouteCache } = require('../services/routes');

describe('computeTravelMatrix', () => {
  const points = [
    { lat: 28.4, lon: -16.3 },
    { lat: 28.45, lon: -16.3 },
    { lat: 28.5, lon: -16.3 },
  ];

  it('una llamada para toda la matriz y la segunda vez sale de caché', async () => {
    clearRouteCache();
    calls.length = 0;
    const first = await computeTravelMatrix(points);
    assert.equal(calls.length, 1);
    assert.equal(first.source, 'google');
    assert.ok(Math.abs(first.durations[0][2] - 10) < 1e-6);
    assert.equal(first.distances[0][1], 5000);
    const second = await computeTravelMatrix(points);
    assert.equal(calls.length, 1);
    assert.deepEqual(second.durations, first.durations);
  });

  it('con un punto nuevo solo pide sus filas y columnas, no la matriz entera', async () => {
    clearRouteCache();
    await computeTravelMatrix(points);
    calls.length = 0;
    const withNew = [...points, { lat: 28.55, lon: -16.3 }];
    const result = await computeTravelMatrix(withNew);
    const elements = calls.reduce((sum, b) => sum + b.origins.length * b.destinations.length, 0);
    assert.equal(calls.length, 2);
    assert.equal(elements, 4 * 1 + 1 * 3); // nuevo → todos (incl. sí mismo) + resto → nuevo
    assert.equal(result.source, 'google');
    assert.ok(Math.abs(result.durations[3][0] - 15) < 1e-6);
    assert.ok(Math.abs(result.durations[1][3] - 10) < 1e-6);
  });

  it('dos peticiones a la vez con los mismos puntos (en otro orden) pagan una sola vez a Google', async () => {
    clearRouteCache();
    calls.length = 0;
    const [a, b] = await Promise.all([
      computeTravelMatrix(points),
      computeTravelMatrix([points[2], points[0], points[1]]),
    ]);
    assert.equal(calls.length, 1);
    assert.equal(a.source, 'google');
    assert.equal(b.source, 'google');
    assert.ok(Math.abs(b.durations[1][0] - 10) < 1e-6); // 28.4 → 28.5 en el orden de la segunda
  });

  it('si Google falla, estima con la línea recta', async () => {
    clearRouteCache();
    fail = true;
    try {
      const result = await computeTravelMatrix(points);
      assert.equal(result.source, 'estimate');
      assert.ok(result.durations[0][2] > 0);
      assert.ok(result.distances[0][2] > 11000);
    } finally {
      fail = false;
    }
  });
});
