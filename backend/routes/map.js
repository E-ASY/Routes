/**
 * Archivo: map.js
 * Descripción: Define las rutas API relacionadas con los mapas, puntos, trabajadores y rutas
 * Este módulo contiene endpoints para obtener datos geoespaciales y gestionar información de trabajadores
 */
const express = require('express');
const router = express.Router();
const dataService = require('../services/data');
const routeService = require('../services/routes');
const viewportService = require('../services/viewport');
const { sendServerError } = require('../utils/errors');
const { optimizePlanOrder } = require('../services/routeOptimizer');
const {
  parseWorkers,
  parseMunicipalities,
  parseOptimizeOrderBody,
} = require('../utils/queryParams');
const { mapsLimiter, routesLimiter, refreshLimiter } = require('../middleware/rateLimit');
const logger = require('../utils/logger');

logger.debug('mapRoutes cargado');

router.use(mapsLimiter);

/**
 * @route   GET /points
 * @desc    Obtiene todos los puntos geográficos asignados a los trabajadores especificados
 * @param   {String|Array} req.query.workers - ID o IDs de trabajadores
 * @returns {Object} Puntos geográficos, total y trabajadores consultados
 */
router.get('/points', async (req, res) => {
  try {
    const parsed = parseWorkers(req.query.workers, { required: true });
    if (!parsed.ok) {
      return res.status(parsed.status).json({ error: parsed.error });
    }
    logger.debug(`GET /points workers_count=${parsed.ids.length}`);
    const points = await dataService.getPointsForWorkers(parsed.ids);
    res.json({
      points,
      total: points.length,
      workers: parsed.ids,
    });
  } catch (error) {
    return sendServerError(res, error, 'Error al obtener puntos para trabajadores');
  }
});

/**
 * @route GET /municipalities
 * @desc Obtiene la lista de municipios disponibles
 * @returns {Array} Lista de municipios con sus detalles
 */
router.get('/municipalities', async (req, res) => {
  try {
    const municipalities = await dataService.getMunicipalities();
    res.json(municipalities);
  } catch (error) {
    return sendServerError(res, error, 'Error al obtener municipios');
  }
});

/**
 * @route   GET /workers
 * @desc    Obtiene información de todos los trabajadores o un subconjunto específico
 * @param   {String|Array} [req.query.workers] - ID o IDs de trabajadores (opcional)
 * @returns {Array} Lista de trabajadores con su información
 */
router.get('/workers', async (req, res) => {
  try {
    if (req.query.workers) {
      const parsed = parseWorkers(req.query.workers);
      if (!parsed.ok) {
        return res.status(parsed.status).json({ error: parsed.error });
      }
      logger.debug(`GET /workers by_id count=${parsed.ids.length}`);
      const workers = await dataService.getWorkersByID(parsed.ids);
      return res.json(workers);
    }
    if (req.query.municipalities) {
      const parsed = parseMunicipalities(req.query.municipalities);
      if (!parsed.ok) {
        return res.status(parsed.status).json({ error: parsed.error });
      }
      logger.debug(`GET /workers by_muni count=${parsed.ids.length}`);
      const workers = await dataService.getWorkersByMunicipalities(parsed.ids);
      return res.json(workers);
    }
    logger.debug('GET /workers sin filtro');
    const workers = await dataService.getWorkers();
    res.json(workers);
  } catch (error) {
    return sendServerError(res, error, 'Error al obtener trabajadores');
  }
});

/**
 * @route   GET /routes
 * @desc    Obtiene las rutas optimizadas para los trabajadores seleccionados
 * @param   {String|Array} req.query.workers - ID o IDs de trabajadores
 * @returns {Object} Rutas calculadas para los trabajadores especificados
 */
router.get('/routes', routesLimiter, async (req, res) => {
  try {
    const parsed = parseWorkers(req.query.workers, { required: true });
    if (!parsed.ok) {
      return res.status(parsed.status).json({ error: parsed.error });
    }
    logger.debug(`GET /routes workers_count=${parsed.ids.length}`);
    const routes = await routeService.getRoutesForWorkers(parsed.ids);
    res.json(routes);
  } catch (error) {
    return sendServerError(res, error, 'Error al obtener rutas');
  }
});

/**
 * @route   GET /viewport
 * @desc    PERF-006: workers + points + routes en una petición
 */
router.get('/viewport', routesLimiter, async (req, res) => {
  try {
    const parsed = parseWorkers(req.query.workers, { required: true });
    if (!parsed.ok) {
      return res.status(parsed.status).json({ error: parsed.error });
    }
    logger.debug(`GET /viewport workers_count=${parsed.ids.length}`);
    const viewport = await viewportService.getViewportForWorkers(parsed.ids);
    res.json(viewport);
  } catch (error) {
    return sendServerError(res, error, 'Error al obtener viewport');
  }
});

/**
 * @route   GET /data-status
 * @desc    Fecha de última materialización / snapshot (global, sin PII)
 */
router.get('/data-status', async (req, res) => {
  try {
    res.json(dataService.getDataStatus());
  } catch (error) {
    return sendServerError(res, error, 'Error al obtener estado de datos');
  }
});

/**
 * @route   POST /refresh-snapshot
 * @desc    Regenera datos desde Velneo + snapshot (afecta a todos los usuarios)
 */
router.post('/refresh-snapshot', refreshLimiter, async (req, res) => {
  try {
    logger.info('POST /refresh-snapshot start');
    const result = await dataService.refreshSnapshotFromVelneo();
    try {
      routeService.clearRouteCache();
    } catch (cacheErr) {
      logger.warn(`clearRouteCache: ${cacheErr.message}`);
    }
    logger.info(
      `POST /refresh-snapshot ok workers=${result.workers} municipalities=${result.municipalities}`
    );
    res.json({
      ok: true,
      updated_at: result.updated_at,
      workers: result.workers,
      municipalities: result.municipalities,
      snapshot: result.health,
    });
  } catch (error) {
    return sendServerError(res, error, 'Error al refrescar datos desde Velneo');
  }
});

/**
 * @route   POST /legs
 * @desc    Tramos Google entre puntos ordenados (partida + visitas)
 * @body    { points: [{ lat, lon }, ...], returnToStart?: boolean } — con
 *          returnToStart se añade el tramo última visita → partida. Para acabar
 *          en otro sitio, la llegada va como último punto.
 */
router.post('/legs', routesLimiter, async (req, res) => {
  try {
    const points = req.body?.points;
    if (!Array.isArray(points) || points.length < 2) {
      return res.status(400).json({
        error: 'Se requieren al menos 2 puntos en body.points [{ lat, lon }, ...]',
      });
    }
    const returnToStart = req.body?.returnToStart === true;
    logger.debug(`POST /legs points_count=${points.length} return_to_start=${returnToStart}`);
    const result = await routeService.computeLegs(points, { returnToStart });
    res.json(result);
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    return sendServerError(res, error, 'Error al calcular tramos');
  }
});

/**
 * @route   POST /optimize-order
 * @desc    PERF-013: orden de visitas que minimiza km (points[0] = partida fija;
 *          con endAtLast, el último punto es la llegada fija).
 *          Haversine, sin llamadas a Google; los km reales los da después /legs.
 * @body    { points: [{ lat, lon }, ...], returnToStart?: boolean, endAtLast?: boolean }
 * @returns { order, method, ms, straight_km_before, straight_km_after, changed }
 */
router.post('/optimize-order', routesLimiter, (req, res) => {
  try {
    const parsed = parseOptimizeOrderBody(req.body);
    if (!parsed.ok) {
      return res.status(parsed.status).json({ error: parsed.error });
    }
    const result = optimizePlanOrder(parsed.points, {
      returnToStart: parsed.returnToStart,
      endAtLast: parsed.endAtLast,
    });
    logger.debug(
      `POST /optimize-order points_count=${parsed.points.length} end_at_last=${parsed.endAtLast} ` +
      `method=${result.method} ` +
      `ms=${result.ms.toFixed(1)} changed=${result.changed}`
    );
    res.json(result);
  } catch (error) {
    return sendServerError(res, error, 'Error al optimizar el orden de visitas');
  }
});

module.exports = router;
