const express = require('express');
const router = express.Router();
const dataService = require('../services/data');
const routeService = require('../services/routes');

/**
 * Obtiene la tabla de información con los puntos y trabajadores
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
 * Obtiene todos los puntos por trabajadores
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
 * Obtiene todos los trabajadores
 * Si se proporcionan IDs específicos, filtrar por ellos
 */
router.get('/workers', async (req, res) => {
  try {
    // Si se proporcionan IDs específicos, filtrar por ellos
    if (req.query.workers) {
      const workerIds = Array.isArray(req.query.workers) ? req.query.workers : [req.query.workers];
      const workers = await dataService.getWorkersByID(workerIds);
      return res.json(workers);
    }
    
    // Si no hay IDs, devolver todos los trabajadores
    const workers = await dataService.getWorkers();
    res.json(workers);
  } catch (error) {
    console.error('Error al obtener trabajadores:', error);
    res.status(500).json({ error: 'Error al obtener trabajadores', details: error.message });
  }
});


/**
 * Obtiene rutas para los trabajadores seleccionados
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