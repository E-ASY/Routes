'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { haversineMeters } = require('../utils/geo');

test('haversine: 1 grado de latitud ≈ 111.2 km', () => {
  const d = haversineMeters({ lat: 28, lon: -16 }, { lat: 29, lon: -16 });
  assert.ok(Math.abs(d - 111195) < 50, `d=${d}`);
});

test('haversine: mismo punto = 0 y es simétrica', () => {
  const a = { lat: 28.4636, lon: -16.2518 };
  const b = { lat: 28.0916, lon: -16.6291 };
  assert.equal(haversineMeters(a, a), 0);
  assert.equal(haversineMeters(a, b), haversineMeters(b, a));
});
