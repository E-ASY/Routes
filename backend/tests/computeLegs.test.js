/**
 * computeLegs con y sin vuelta a la partida (node:test).
 * Google se sustituye por un stub: el test no hace llamadas reales ni gasta cuota.
 */
const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

const originalPost = axios.post;
const requests = [];

// Stub antes de cargar routes.js: ninguna petición puede llegar a Google.
// Distancia falsa determinista: 1000 m por grado de diferencia en latitud.
axios.post = async (url, body) => {
  assert.match(url, /routes\.googleapis\.com/);
  const o = body.origin.location.latLng;
  const d = body.destination.location.latLng;
  requests.push({ from: o, to: d, travelMode: body.travelMode });
  return {
    data: {
      routes: [{
        distanceMeters: Math.round(Math.abs(d.latitude - o.latitude) * 1000),
        polyline: { geoJsonLinestring: { coordinates: [[o.longitude, o.latitude], [d.longitude, d.latitude]] } },
      }],
    },
  };
};

after(() => {
  axios.post = originalPost;
});

const { computeLegs, clearRouteCache, MAX_LEG_POINTS } = require('../services/routes');

const points = [
  { lat: 1, lon: 0 },
  { lat: 3, lon: 0 },
  { lat: 6, lon: 0 },
];

describe('computeLegs', () => {
  it('sin vuelta: n−1 tramos consecutivos', async () => {
    clearRouteCache();
    const r = await computeLegs(points);
    assert.equal(r.return_to_start, false);
    assert.deepEqual(r.legs.map((l) => [l.from_index, l.to_index]), [[0, 1], [1, 2]]);
    assert.equal(r.total_distance_m, 2000 + 3000);
    assert.equal(requests.length, 2, 'cada tramo pasa por el stub, no por Google');
    // km de coche (reembolso), una sola llamada por tramo: nunca TRANSIT
    assert.ok(requests.every((req) => req.travelMode === 'DRIVE'));
  });

  it('con vuelta: añade el tramo última visita → partida (to_index 0)', async () => {
    clearRouteCache();
    const r = await computeLegs(points, { returnToStart: true });
    assert.equal(r.return_to_start, true);
    assert.deepEqual(r.legs.map((l) => [l.from_index, l.to_index]), [[0, 1], [1, 2], [2, 0]]);
    const last = r.legs[r.legs.length - 1];
    assert.deepEqual(last.destination, points[0]);
    assert.equal(last.distance_km, 5);
    assert.equal(r.total_distance_m, 2000 + 3000 + 5000);
    assert.equal(r.points_count, 3);
  });

  it('con vuelta admite el máximo de puntos (la vuelta no cuenta)', async () => {
    clearRouteCache();
    const many = Array.from({ length: MAX_LEG_POINTS }, (_, i) => ({ lat: i, lon: 0 }));
    const r = await computeLegs(many, { returnToStart: true });
    assert.equal(r.legs.length, MAX_LEG_POINTS);
  });
});
