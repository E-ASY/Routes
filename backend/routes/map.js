/**
 * Archivo: map.js
 * Descripción: Define las rutas API relacionadas con los mapas, puntos, trabajadores y rutas
 * Este módulo contiene endpoints para obtener datos geoespaciales y gestionar información de trabajadores
 */
const express = require('express');
const router = express.Router();
const dataService = require('../services/data');
const routeService = require('../services/routes');
console.log('mapRoutes cargado');
/**
 * @route   GET /data
 * @desc    Obtiene todos los datos procesados necesarios para la aplicación de mapas
 * @returns {Object} Datos procesados para visualización en el mapa
 */
router.get('/data', async (req, res) => {
  try {
    const data = await dataService.getProcessedData();
    
    res.json(data);
  } catch (error) {
    console.error('Error al obtener los datos necesarios:', error);
    res.status(500).json({ error: 'Error al obtener los datos necesarios', details: error.message });
  }
});

/**
 * @route   GET /points
 * @desc    Obtiene todos los puntos geográficos asignados a los trabajadores especificados
 * @param   {String|Array} req.query.workers - ID o IDs de trabajadores
 * @returns {Object} Puntos geográficos, total y trabajadores consultados
 */
router.get('/points', async (req, res) => {
  try {
    const { workers } = req.query;
    if (!workers) {
      return res.status(400).json({ 
        error: 'Se requiere el parámetro workers' 
      });
    }
    // Normalizar los IDs de trabajadores (convertir a array si es un único valor)
    const workerIds = Array.isArray(workers) ? workers : [workers];
    // Obtener los puntos utilizando el servicio de datos
    const points = await dataService.getPointsForWorkers(workerIds);
    // Devolver los puntos como respuesta JSON
    res.json({
      points,
      total: points.length,
      workers: workerIds
    });
  } catch (error) {
    console.error('Error al obtener puntos para trabajadores:', error);
    res.status(500).json({ 
      error: 'Error al obtener puntos para trabajadores', 
      details: error.message 
    });
  }
});


/**
 * @route GET /municipalities
 * @desc Obtiene la lista de municipios disponibles
 * @returns {Array} Lista de municipios con sus detalles
 */
router.get('/municipalities', async (req, res) => {
  console.log('Petición recibida para /municipalities');
  try {
    const municipalities = await dataService.getMunicipalities();
    res.json(municipalities);
  } catch (error) {
    console.error('Error al obtener municipios:', error);
    res.status(500).json({ error: 'Error al obtener municipios', details: error.message });
  }
});


/**
 * @route   GET /workers
 * @desc    Obtiene información de todos los trabajadores o un subconjunto específico
 * @param   {String|Array} [req.query.workers] - ID o IDs de trabajadores (opcional)
 * @returns {Array} Lista de trabajadores con su información
 */
router.get('/workers', async (req, res) => {
  console.log('Petición recibida para /workers');
  try {
    // Filtrar por IDs de trabajadores si se proporcionan
    if (req.query.workers) {
      console.log('IDs de trabajadores proporcionados:', req.query.workers);
      const workerIds = Array.isArray(req.query.workers) ? req.query.workers : [req.query.workers];
      const workers = await dataService.getWorkersByID(workerIds);
      return res.json(workers);
    }
    // Filtrar por municipios si se proporcionan
    if (req.query.municipalities) {
      const municipalities = Array.isArray(req.query.municipalities)
        ? req.query.municipalities
        : [req.query.municipalities];
      console.log('Municipios proporcionados:', municipalities);
      const workers = await dataService.getWorkersByMunicipalities(municipalities);
      return res.json(workers);
    }
    // Si no hay filtros, devolver todos los trabajadores
    console.log('No se proporcionaron filtros, obteniendo todos los trabajadores');
    const workers = await dataService.getWorkers();
    res.json(workers);
  } catch (error) {
    console.error('Error al obtener trabajadores:', error);
    res.status(500).json({ error: 'Error al obtener trabajadores', details: error.message });
  }
});


/**
 * @route   GET /routes
 * @desc    Obtiene las rutas optimizadas para los trabajadores seleccionados
 * @param   {String|Array} req.query.workers - ID o IDs de trabajadores
 * @returns {Object} Rutas calculadas para los trabajadores especificados
 */
router.get('/routes', async (req, res) => {
  try {
    const { workers } = req.query;
    if (!workers) {
      return res.status(400).json({ error: 'Se requiere el parámetro workers' });
    }
    const workerIds = Array.isArray(workers) ? workers : [workers];
    const routes = await routeService.getRoutesForWorkers(workerIds);
    res.json(routes);
  } catch (error) {
    console.error('Error al obtener rutas:', error);
    res.status(500).json({ error: 'Error al obtener rutas', details: error.message });
  }
});

module.exports = router;