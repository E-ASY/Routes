const axios = require('axios');
const dotenv = require('dotenv');
const { getPointsForWorkers } = require('./data');
const logger = require('../utils/logger');
const { logMetric } = require('../utils/observability');

dotenv.config();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const ROUTE_SERVICE_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const BATCH_SIZE = Number(process.env.GOOGLE_ROUTES_BATCH_SIZE) || 5;
const BATCH_DELAY = Number(process.env.GOOGLE_ROUTES_BATCH_DELAY_MS) || 1000;
const GOOGLE_TIMEOUT_MS = Number(process.env.GOOGLE_ROUTES_TIMEOUT_MS) || 15000;
const GOOGLE_MAX_RETRIES = Number(process.env.GOOGLE_ROUTES_MAX_RETRIES) || 3;
const ROUTE_CACHE_TTL_MS = Number(process.env.ROUTE_CACHE_TTL_MS) || 60 * 60 * 1000;
const ROUTE_CACHE_MAX = Number(process.env.ROUTE_CACHE_MAX) || 1000;
const WORKER_CACHE_MAX = Number(process.env.WORKER_ROUTES_CACHE_MAX) || 200;

/**
 * Caché LRU con TTL (SEC-016).
 * No guarda valores indefinidos; get elimina entradas caducadas.
 */
class TtlLruCache {
  constructor({ maxEntries, ttlMs }) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.map = new Map();
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      this.map.delete(oldestKey);
    }
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  clear() {
    this.map.clear();
  }

  get size() {
    return this.map.size;
  }
}

const routeCache = new TtlLruCache({ maxEntries: ROUTE_CACHE_MAX, ttlMs: ROUTE_CACHE_TTL_MS });
const workerRoutesCache = new TtlLruCache({ maxEntries: WORKER_CACHE_MAX, ttlMs: ROUTE_CACHE_TTL_MS });

let googleRoutesCalls = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateRouteKey(origin, destination) {
  return `${origin.lat}|${origin.lon}|${destination.lat}|${destination.lon}`;
}

function samePoint(origin, destination) {
  return (
    Number(origin.lat) === Number(destination.lat) &&
    Number(origin.lon) === Number(destination.lon)
  );
}

/**
 * Normaliza resultado de tramo (caché antigua = solo array polyline).
 * @returns {{ polyline: Array, distanceMeters: number|null }|null}
 */
function normalizeRouteResult(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    return { polyline: value, distanceMeters: null };
  }
  if (Array.isArray(value.polyline)) {
    return {
      polyline: value.polyline,
      distanceMeters:
        typeof value.distanceMeters === 'number' && Number.isFinite(value.distanceMeters)
          ? value.distanceMeters
          : null,
    };
  }
  return null;
}

/**
 * Totales de km por trabajadora a partir de tramos.
 * @param {Array} routes
 */
function buildMileageByWorker(routes) {
  const byWorker = {};
  for (const route of routes || []) {
    const workerId = String(route.worker_id);
    if (!byWorker[workerId]) {
      byWorker[workerId] = {
        distance_m: 0,
        distance_km: 0,
        legs: 0,
        legs_with_distance: 0,
      };
    }
    const entry = byWorker[workerId];
    entry.legs += 1;
    if (typeof route.distance_m === 'number' && Number.isFinite(route.distance_m)) {
      entry.distance_m += route.distance_m;
      entry.legs_with_distance += 1;
    }
  }
  for (const entry of Object.values(byWorker)) {
    entry.distance_km = Math.round((entry.distance_m / 1000) * 10) / 10;
  }
  return byWorker;
}

/**
 * POST a Google Routes con retry ante 429/503/timeout (PERF-008).
 */
async function postGoogleRoute(requestBody) {
  let lastError;
  for (let attempt = 1; attempt <= GOOGLE_MAX_RETRIES; attempt++) {
    try {
      googleRoutesCalls += 1;
      return await axios.post(ROUTE_SERVICE_URL, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_API_KEY,
          'X-Goog-FieldMask': 'routes.polyline,routes.distanceMeters'
        },
        timeout: GOOGLE_TIMEOUT_MS
      });
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      const retryable =
        status === 429 ||
        status === 503 ||
        error.code === 'ECONNABORTED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNRESET';
      if (!retryable || attempt === GOOGLE_MAX_RETRIES) {
        throw error;
      }
      const retryAfterHeader = error.response?.headers?.['retry-after'];
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
      const delayMs = Number.isFinite(retryAfterMs) && retryAfterMs > 0
        ? retryAfterMs
        : 500 * (2 ** (attempt - 1));
      logger.warn(
        `Google Routes retry ${attempt}/${GOOGLE_MAX_RETRIES} ` +
        `status=${status || error.code} wait_ms=${delayMs}`
      );
      await sleep(delayMs);
    }
  }
  throw lastError;
}

/**
 * Obtiene una ruta desde Google Routes API o de la caché.
 * Devuelve { polyline, distanceMeters } o null.
 * No cachea fallos (null) para no bloquear reintentos tras arreglar la API key.
 */
async function getRouteFromGoogle(origin, destination) {
  try {
    if (samePoint(origin, destination)) {
      return null;
    }

    const routeKey = generateRouteKey(origin, destination);
    const cached = normalizeRouteResult(routeCache.get(routeKey));
    if (cached) {
      logger.debug('Usando ruta en caché');
      return cached;
    }

    const getRoute = async (travelMode, includeRouteModifiers = true) => {
      const requestBody = {
        origin: {
          location: {
            latLng: {
              latitude: Number(origin.lat),
              longitude: Number(origin.lon)
            }
          }
        },
        destination: {
          location: {
            latLng: {
              latitude: Number(destination.lat),
              longitude: Number(destination.lon)
            }
          }
        },
        travelMode,
        computeAlternativeRoutes: false,
        polylineEncoding: 'GEO_JSON_LINESTRING',
        languageCode: 'es-ES',
        units: 'METRIC'
      };
      if (includeRouteModifiers && travelMode !== 'TRANSIT') {
        requestBody.routeModifiers = {
          avoidTolls: false,
          avoidHighways: false,
          avoidFerries: false
        };
      }

      const response = await postGoogleRoute(requestBody);
      if (response.data.routes && response.data.routes.length > 0) {
        const route = response.data.routes[0];
        const polyline = route.polyline?.geoJsonLinestring?.coordinates;
        if (!Array.isArray(polyline) || polyline.length === 0) {
          return null;
        }
        const distanceMeters =
          typeof route.distanceMeters === 'number' && Number.isFinite(route.distanceMeters)
            ? route.distanceMeters
            : null;
        return { polyline, distanceMeters };
      }
      return null;
    };

    let route = null;
    try {
      route = await getRoute('TRANSIT', false);
    } catch (transitError) {
      const detail = transitError.response?.data?.error?.message || transitError.message;
      logger.warn(`TRANSIT falló: ${detail}`);
    }
    if (!route) {
      logger.debug('Intentando fallback DRIVE');
      route = await getRoute('DRIVE', true);
    }

    if (route) {
      routeCache.set(routeKey, route);
    }
    return route;
  } catch (error) {
    const detail = error.response?.data?.error?.message || error.message;
    logger.error(`Error al obtener ruta de Google: ${detail}`);
    return null;
  }
}

function prepareRoutePoints(points) {
  if (!Array.isArray(points) || points.length === 0) {
    logger.info('No hay puntos para preparar rutas');
    return [];
  }

  // Solo tramos entre usuarias; la ubicación de la trabajadora no entra en la ruta
  const routeEligible = points.filter((point) => point.kind !== 'worker');

  const pointsByWorker = routeEligible.reduce((acc, point) => {
    const workerIdStr = String(point.id);
    if (!acc[workerIdStr]) {
      acc[workerIdStr] = [];
    }
    acc[workerIdStr].push(point);
    return acc;
  }, {});

  const routeRequests = [];
  Object.entries(pointsByWorker).forEach(([worker, workerPoints]) => {
    if (workerPoints.length < 2) {
      logger.warn(
        `Trabajador con ${workerPoints.length} punto(s); se necesitan >= 2 para ruta`
      );
      return;
    }
    logger.debug(`Creando ${workerPoints.length - 1} tramos`);

    for (let i = 0; i < workerPoints.length - 1; i++) {
      routeRequests.push({
        worker,
        origin: { lat: workerPoints[i].lat, lon: workerPoints[i].lon },
        destination: { lat: workerPoints[i + 1].lat, lon: workerPoints[i + 1].lon }
      });
    }
  });
  return routeRequests;
}

async function getRoutesForWorkers(workers, options = {}) {
  try {
    if (!workers || workers.length === 0) {
      return { routes: [], workers: {}, total: 0, mileage_by_worker: {} };
    }

    const cachedWorkers = [];
    const workersToFetch = [];
    let workerRoutes = [];
    workers.forEach((worker) => {
      const workerId = String(worker);
      const cachedRoutes = workerRoutesCache.get(workerId);
      if (!cachedRoutes) {
        workersToFetch.push(workerId);
        return;
      }
      // Caché antigua sin distance_m: recalcular tramos para kilometraje
      const needsDistance = cachedRoutes.some(
        (r) =>
          Array.isArray(r.polyline) &&
          r.polyline.length > 0 &&
          typeof r.distance_m !== 'number'
      );
      if (needsDistance) {
        workersToFetch.push(workerId);
        return;
      }
      cachedWorkers.push(workerId);
      workerRoutes = [...workerRoutes, ...cachedRoutes];
    });

    if (workersToFetch.length === 0) {
      logger.info('Todas las rutas se obtuvieron de la caché');
      return {
        routes: workerRoutes,
        workers: Object.fromEntries(
          cachedWorkers.map((worker) => [worker, workerRoutesCache.get(worker)])
        ),
        total: workerRoutes.length,
        mileage_by_worker: buildMileageByWorker(workerRoutes),
      };
    }

    logger.info(`Obteniendo rutas workers_to_fetch=${workersToFetch.length}`);
    const fetchSet = new Set(workersToFetch.map(String));
    let pointsData;
    if (Array.isArray(options.points)) {
      pointsData = options.points.filter((p) => fetchSet.has(String(p.id)));
    } else {
      pointsData = await getPointsForWorkers(workersToFetch);
    }
    if (!pointsData || pointsData.length === 0) {
      logger.info('No se encontraron puntos para los trabajadores solicitados');
      return {
        routes: workerRoutes,
        workers: {},
        total: workerRoutes.length,
        mileage_by_worker: buildMileageByWorker(workerRoutes),
      };
    }

    const workerRouteRequests = prepareRoutePoints(pointsData);
    const newWorkerRoutes = [];
    const workerRoutesMap = new Map();
    const callsBefore = googleRoutesCalls;

    for (let i = 0; i < workerRouteRequests.length; i += BATCH_SIZE) {
      const batch = workerRouteRequests.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (request) => {
        try {
          const result = await getRouteFromGoogle(request.origin, request.destination);
          const workerRoute = {
            worker_id: request.worker,
            polyline: result?.polyline || null,
            distance_m: result?.distanceMeters ?? null,
            origin: request.origin,
            destination: request.destination
          };
          if (!workerRoutesMap.has(request.worker)) {
            workerRoutesMap.set(request.worker, []);
          }
          workerRoutesMap.get(request.worker).push(workerRoute);
          return workerRoute;
        } catch (error) {
          logger.error('Error obteniendo tramo de ruta:', error.message);
          return {
            worker_id: request.worker,
            polyline: null,
            distance_m: null,
            origin: request.origin,
            destination: request.destination,
            error: error.message
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      newWorkerRoutes.push(...batchResults);
      if (i + BATCH_SIZE < workerRouteRequests.length) {
        await sleep(BATCH_DELAY);
      }
    }

    // Solo cachear trabajadores con al menos una polyline válida (no cachear fallos)
    workerRoutesMap.forEach((routes, worker) => {
      const hasValid = routes.some((r) => Array.isArray(r.polyline) && r.polyline.length > 0);
      if (hasValid) {
        workerRoutesCache.set(String(worker), routes);
      }
    });

    workerRoutes = [...workerRoutes, ...newWorkerRoutes];
    const callsDelta = googleRoutesCalls - callsBefore;
    logMetric('google_routes_batch', {
      google_routes_calls: callsDelta,
      google_routes_calls_total: googleRoutesCalls,
      route_cache_size: routeCache.size,
      worker_cache_size: workerRoutesCache.size,
      workers_fetched: workersToFetch.length,
      workers_cached: cachedWorkers.length,
    });

    return {
      routes: workerRoutes,
      workers: Object.fromEntries([...workerRoutesMap.entries()]),
      total: workerRoutes.length,
      mileage_by_worker: buildMileageByWorker(workerRoutes),
    };
  } catch (error) {
    logger.error('Error al obtener rutas:', error);
    return { error: error.message, routes: [], mileage_by_worker: {} };
  }
}

function clearRouteCache() {
  routeCache.clear();
  workerRoutesCache.clear();
  logger.info('Caché de rutas limpiada');
  return { success: true, message: 'Caché de rutas limpiada correctamente' };
}

/**
 * Un tramo entre dos puntos (reutiliza caché Google).
 * @returns {Promise<{ polyline: Array|null, distance_m: number|null }>}
 */
async function getLeg(origin, destination) {
  if (samePoint(origin, destination)) {
    return { polyline: null, distance_m: 0 };
  }
  const result = await getRouteFromGoogle(origin, destination);
  if (!result) {
    return { polyline: null, distance_m: null };
  }
  return {
    polyline: result.polyline,
    distance_m: result.distanceMeters,
  };
}

const MAX_LEG_POINTS = 15;

/**
 * Calcula tramos consecutivos para un orden de puntos (partida + visitas).
 * @param {Array<{lat: number, lon: number}>} pointsOrdered
 */
async function computeLegs(pointsOrdered) {
  if (!Array.isArray(pointsOrdered) || pointsOrdered.length < 2) {
    return {
      legs: [],
      total_distance_m: 0,
      total_distance_km: 0,
      points_count: pointsOrdered?.length || 0,
    };
  }
  if (pointsOrdered.length > MAX_LEG_POINTS) {
    const err = new Error(`Máximo ${MAX_LEG_POINTS} puntos (partida + visitas)`);
    err.status = 400;
    throw err;
  }

  const legs = [];
  let total_distance_m = 0;
  let legsWithDistance = 0;

  for (let i = 0; i < pointsOrdered.length - 1; i++) {
    const origin = {
      lat: Number(pointsOrdered[i].lat),
      lon: Number(pointsOrdered[i].lon),
    };
    const destination = {
      lat: Number(pointsOrdered[i + 1].lat),
      lon: Number(pointsOrdered[i + 1].lon),
    };
    if (
      !Number.isFinite(origin.lat) ||
      !Number.isFinite(origin.lon) ||
      !Number.isFinite(destination.lat) ||
      !Number.isFinite(destination.lon)
    ) {
      const err = new Error(`Coordenadas inválidas en el punto ${i} o ${i + 1}`);
      err.status = 400;
      throw err;
    }

    const leg = await getLeg(origin, destination);
    const distance_m = leg.distance_m;
    if (typeof distance_m === 'number' && Number.isFinite(distance_m)) {
      total_distance_m += distance_m;
      legsWithDistance += 1;
    }
    legs.push({
      from_index: i,
      to_index: i + 1,
      origin,
      destination,
      polyline: leg.polyline,
      distance_m,
      distance_km:
        typeof distance_m === 'number' && Number.isFinite(distance_m)
          ? Math.round((distance_m / 1000) * 10) / 10
          : null,
    });
  }

  return {
    legs,
    total_distance_m,
    total_distance_km: Math.round((total_distance_m / 1000) * 10) / 10,
    legs_with_distance: legsWithDistance,
    points_count: pointsOrdered.length,
  };
}

function getMetrics() {
  return {
    google_routes_calls_total: googleRoutesCalls,
    route_cache_size: routeCache.size,
    worker_cache_size: workerRoutesCache.size,
  };
}

module.exports = {
  getRoutesForWorkers,
  clearRouteCache,
  getMetrics,
  buildMileageByWorker,
  getLeg,
  computeLegs,
  MAX_LEG_POINTS,
};
