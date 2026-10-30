/**
 * Utilidades geográficas sin dependencias.
 */
'use strict';

const EARTH_RADIUS_M = 6371008.8;

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

module.exports = { haversineMeters };
