const axios = require('axios');
const dotenv = require('dotenv');
const { getPointsForWorkers } = require('./data'); // Importar la función desde data.js

dotenv.config();

// Configuración de Google Routes API
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const ROUTE_SERVICE_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const BATCH_SIZE = 5;
const BATCH_DELAY = 1000;

// Caché de rutas
const routeCache = new Map();
const workerRoutesCache = new Map();

/**
 * Genera una clave única para cada ruta basada en origen y destino
 */
function generateRouteKey(origin, destination) {
  return `${origin.lat}|${origin.lon}|${destination.lat}|${destination.lon}`;
}

/**
 * Obtiene una ruta desde Google Routes API o de la caché
 */
async function getRouteFromGoogle(origin, destination) {
  try {
    // Verificar caché
    const routeKey = generateRouteKey(origin, destination);
    if (routeCache.has(routeKey)) {
      console.log(`Usando ruta en caché para ${origin.lat},${origin.lon} a ${destination.lat},${destination.lon}`);
      return routeCache.get(routeKey);
    }

    // Función para obtener ruta con un modo específico
    const getRoute = async (travelMode) => {
      const requestBody = {
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lon } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lon } } },
        travelMode: travelMode,
        computeAlternativeRoutes: false,
        routeModifiers: {
          avoidTolls: false,
          avoidHighways: false,
          avoidFerries: false
        },
        polylineEncoding: "GEO_JSON_LINESTRING",
        languageCode: "es-ES",
        units: "METRIC"
      };

      const response = await axios.post(ROUTE_SERVICE_URL, requestBody, {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_API_KEY,
          "X-Goog-FieldMask": "routes.polyline"
        }
      });

      if (response.data.routes && response.data.routes.length > 0) {
        return response.data.routes[0].polyline.geoJsonLinestring.coordinates;
      }
      return null;
    };

    // Intentar primero con TRANSIT, luego con DRIVE si falla
    let route = await getRoute("TRANSIT");
    if (!route) {
      console.log(`No se encontró ruta con TRANSIT de ${origin.lat},${origin.lon} a ${destination.lat},${destination.lon}. Intentando con DRIVE...`);
      route = await getRoute("DRIVE");
    }

    // Guardar en caché
    if (route) {
      routeCache.set(routeKey, route);
    }

    return route;
  } catch (error) {
    console.error(`Error al obtener ruta de Google:`, error.message);
    return null;
  }
}

/**
 * Prepara puntos para crear rutas (origen y destino para cada punto)
 */
function prepareRoutePoints(points) {
    if (!Array.isArray(points) || points.length === 0) {
      console.log("No hay puntos para preparar rutas");
      return [];
    } 
    // Agrupar puntos por trabajador (soporta tanto worker como workerId)
    const pointsByWorker = points.reduce((acc, point) => {
      // Usar worker O workerId, cualquiera que esté definido
      const workerId = point.id;
      // Convertir a string para asegurar consistencia como clave del objeto
      const workerIdStr = String(workerId);
      if (!acc[workerIdStr]) {
        acc[workerIdStr] = [];
      }
      acc[workerIdStr].push(point);
      return acc;
    }, {});
    // Para cada trabajador, crear pares de origen-destino
    const routeRequests = [];
    Object.entries(pointsByWorker).forEach(([worker, workerPoints]) => {
      // Verificar que hay suficientes puntos para crear rutas
      if (workerPoints.length < 2) {
        console.warn(`El trabajador ${worker} solo tiene ${workerPoints.length} punto(s), necesita al menos 2 para crear una ruta`);
        return;
      }
      console.log(`Creando ${workerPoints.length - 1} rutas para trabajador ${worker}`);
      
      // Crear pares de origen-destino
      for (let i = 0; i < workerPoints.length - 1; i++) {
        const origin = {
          lat: workerPoints[i].lat, 
          lon: workerPoints[i].lon
        };
        const destination = {
          lat: workerPoints[i + 1].lat, 
          lon: workerPoints[i + 1].lon
        };
        routeRequests.push({
          worker: worker,
          origin,
          destination
        });
      }
    });
    return routeRequests;
  }

/**
 * Obtiene rutas para los trabajadores seleccionados
 */
async function getRoutesForWorkers(workers) {
  try {
    // Verificar input
    if (!workers || workers.length === 0) {
      return [];
    }

    // Verificar qué trabajadores ya tienen rutas en caché
    const cachedWorkers = [];
    const workersToFetch = [];
    workers.forEach(worker => {
      if (workerRoutesCache.has(worker)) {
        cachedWorkers.push(worker);
      } else {
        workersToFetch.push(worker);
      }
    });

    // Obtener rutas de la caché para los trabajadores que ya tienen datos
    let workerRoutes = [];
    cachedWorkers.forEach(worker => {
      const cachedRoutes = workerRoutesCache.get(worker);
      if (cachedRoutes) {
        workerRoutes = [...workerRoutes, ...cachedRoutes];
      }
    });

    // Si todos los trabajadores solicitados ya tienen datos en caché, devolver los datos
    if (workersToFetch.length === 0) {
      console.log("Todas las rutas se obtuvieron de la caché");
      return {
        routes: workerRoutes,
        workers: Object.fromEntries(
          cachedWorkers.map(worker => [worker, workerRoutesCache.get(worker)])
        ),
        total: workerRoutes.length
      };
    }

    // Obtener puntos para rutas de trabajadores que no están en caché
    console.log(`Obteniendo rutas para: ${workersToFetch.join(', ')}`);
    const pointsData = await getPointsForWorkers(workersToFetch);
    
    // Si no hay puntos, retornar las rutas que ya tenemos
    if (!pointsData || pointsData.length === 0) {
      console.log("No se encontraron puntos para los trabajadores solicitados");
      return workerRoutes;
    }
    
    // Preparar pares de origen-destino para calcular rutas
    const workerRouteRequests = prepareRoutePoints(pointsData);

    // Procesar las rutas por lotes para evitar exceder los límites de recursos
    const newWorkerRoutes = [];
    const workerRoutesMap = new Map();

    for (let i = 0; i < workerRouteRequests.length; i += BATCH_SIZE) {
      const batch = workerRouteRequests.slice(i, i + BATCH_SIZE);
      
      // Procesar el lote actual
      const batchPromises = batch.map(async (request) => {
        try {
          const polyline = await getRouteFromGoogle(request.origin, request.destination);
          const workerRoute = {
            worker_id: request.worker,
            polyline,
            origin: request.origin,
            destination: request.destination
          };
          
          // Agrupar rutas por trabajador
          if (!workerRoutesMap.has(request.worker)) {
            workerRoutesMap.set(request.worker, []);
          }
          workerRoutesMap.get(request.worker).push(workerRoute);
          
          return workerRoute;
        } catch (error) {
          console.error(`Error obteniendo ruta para ${request.worker}:`, error);
          return {
            worker_id: request.worker,
            polyline: null,
            origin: request.origin,
            destination: request.destination,
            error: error.message
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      newWorkerRoutes.push(...batchResults);
      
      // Añadir un pequeño retraso entre lotes para no sobrecargar la API
      if (i + BATCH_SIZE < workerRouteRequests.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    // Guardar las nuevas rutas en la caché
    workerRoutesMap.forEach((routes, worker) => {
      workerRoutesCache.set(worker, routes);
    });

    // Combinar las rutas existentes con las nuevas
    workerRoutes = [...workerRoutes, ...newWorkerRoutes];
    
    return {
      routes: workerRoutes,
      workers: Object.fromEntries([...workerRoutesMap.entries()]), // Devolver también las rutas agrupadas por trabajador
      total: workerRoutes.length
    };
  } catch (error) {
    console.error("Error al obtener rutas:", error);
    return { error: error.message, routes: [] };
  }
}

/**
 * Limpia la caché de rutas
 */
function clearRouteCache() {
  routeCache.clear();
  workerRoutesCache.clear();
  console.log("Caché de rutas limpiada");
  return { success: true, message: "Caché de rutas limpiada correctamente" };
}

module.exports = {
  getRoutesForWorkers,
  clearRouteCache
};