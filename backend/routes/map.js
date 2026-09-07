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
const { parseWorkers, parseMunicipalities } = require('../utils/queryParams');
const { mapsLimiter, routesLimiter } = require('../middleware/rateLimit');
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

module.exports = router;
