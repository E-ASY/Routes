/**
 * PERF-006: viewport agregado (workers + points + routes) con una sola carga de datos.
 */
const dataService = require('./data');
const routeService = require('./routes');
const { logMetric } = require('../utils/observability');

/**
 * @param {string[]} workerIds
 * @returns {Promise<{workers: Array, points: Array, routes: Array, total_points: number, total_routes: number}>}
 */
async function getViewportForWorkers(workerIds) {
  const started = Date.now();
  // Una sola carga / hit de processed_data para toda la operación
  await dataService.getProcessedData();

  const [workers, points] = await Promise.all([
    dataService.getWorkersByID(workerIds),
    dataService.getPointsForWorkers(workerIds),
  ]);

  const routesResult = await routeService.getRoutesForWorkers(workerIds, { points });
  const routes = Array.isArray(routesResult?.routes) ? routesResult.routes : [];

  logMetric('viewport_load', {
    workers_count: workerIds.length,
    points_count: points.length,
    routes_count: routes.length,
    duration_ms: Date.now() - started,
  });

  return {
    workers,
    points,
    routes,
    total_points: points.length,
    total_routes: routes.length,
  };
}

module.exports = { getViewportForWorkers };
