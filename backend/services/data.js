/**
 * Archivo: data.js
 * Descripción: Servicio de datos para la gestión de información de trabajadores y ubicaciones geográficas
 * Este módulo se encarga de obtener, procesar y transformar datos desde la API de Velneo
 * para ser utilizados en la aplicación de rutas de ACUFADE
 */
const axios = require('axios');
const dotenv = require('dotenv');
const NodeCache = require('node-cache');
const logger = require('../utils/logger');
const { logMetric } = require('../utils/observability');

dotenv.config();
const API_KEY = process.env.VELNEO_API_KEY;
const BASE_URL = process.env.VELNEO_API_BASE_URL;
/** PERF-004: tamaño de página Velneo (override con VELNEO_PAGE_SIZE) */
const VELNEO_PAGE_SIZE = Number(process.env.VELNEO_PAGE_SIZE) || 500;
const VELNEO_MAX_RETRIES = Number(process.env.VELNEO_MAX_RETRIES) || 3;
const VELNEO_TIMEOUT_MS = Number(process.env.VELNEO_TIMEOUT_MS) || 20000;

/** Velneo puede devolver booleanos como 0/1 o true/false */
function isTraSim(value) {
  return value === true || value === 1 || value === '1';
}

function isUserEntity(value) {
  return value === false || value === 0 || value === '0';
}

/** Relación activa: off = false/0 */
function isRelationActive(off) {
  return off === false || off === 0 || off === '0';
}

function idsEqual(a, b) {
  return String(a) === String(b);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * GET a Velneo con reintentos ante timeout / 5xx / errores de red.
 */
async function axiosGetWithRetry(url, config, endpoint) {
  let lastError;
  for (let attempt = 1; attempt <= VELNEO_MAX_RETRIES; attempt++) {
    try {
      return await axios.get(url, config);
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      const retryable =
        !error.response ||
        status >= 500 ||
        error.code === 'ECONNABORTED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNRESET';
      if (!retryable || attempt === VELNEO_MAX_RETRIES) {
        throw error;
      }
      const delayMs = 500 * (2 ** (attempt - 1));
      logger.warn(
        `Retry ${attempt}/${VELNEO_MAX_RETRIES} endpoint=${endpoint} ` +
        `reason=${status || error.code || error.message} wait_ms=${delayMs}`
      );
      await sleep(delayMs);
    }
  }
  throw lastError;
}

/**
 * Obtiene datos de un endpoint específico de la API de Velneo, recuperando todas las páginas disponibles.
 * PERF-004: page size configurable, push, retry; falla con throw (no [] silencioso).
 * @param {string} endpoint - Nombre del endpoint a consultar
 * @param {Object} params - Parámetros adicionales para la consulta
 * @returns {Array} Datos obtenidos de todas las páginas del endpoint solicitado
 */
async function fetchData(endpoint, params = {}, loadStats = null) {
  // api_key solo en la petición HTTP; nunca en logs (SEC-002)
  const url = `${BASE_URL}/${endpoint}?api_key=${API_KEY}`;
  logger.debug(`Consultando Velneo endpoint=${endpoint} pageSize=${VELNEO_PAGE_SIZE}`);
  const allData = [];
  let currentPage = 1;
  let hasMorePages = true;
  let pages = 0;

  while (hasMorePages) {
    const pageParams = {
      ...params,
      'page[number]': currentPage,
      'page[size]': VELNEO_PAGE_SIZE
    };
    const response = await axiosGetWithRetry(
      url,
      { params: pageParams, timeout: VELNEO_TIMEOUT_MS },
      endpoint
    );

    if (Array.isArray(response.data?.errors) && response.data.errors.length > 0) {
      const messages = response.data.errors
        .map(err => (typeof err === 'string' ? err : err.message || JSON.stringify(err)))
        .join('; ');
      logger.error(`Velneo endpoint=${endpoint} devolvió errors: ${messages}`);
      if (!response.data[endpoint] || response.data[endpoint].length === 0) {
        throw new Error(`Velneo ${endpoint}: ${messages}`);
      }
    }

    const pageData = response.data[endpoint] || [];
    pages += 1;
    logger.debug(`Endpoint ${endpoint} - Página ${currentPage}: ${pageData.length} items recibidos`);
    if (pageData.length > 0) {
      allData.push(...pageData);
      currentPage++;
      if (pageData.length < VELNEO_PAGE_SIZE) {
        hasMorePages = false;
      }
    } else {
      hasMorePages = false;
    }
  }

  if (loadStats) {
    loadStats.velneo_pages += pages;
  }
  logMetric('velneo_endpoint', {
    endpoint,
    items: allData.length,
    pages,
  });
  return allData;
}

/**
 * Obtiene datos de múltiples endpoints en paralelo.
 * Si un endpoint crítico falla o viene vacío, lanza error (no se cachea dataset parcial).
 */
async function fetchAllData(loadStats = null) {
  logger.info('Iniciando obtención de todos los datos...');

  const settled = await Promise.allSettled([
    fetchData('ent_m', { fields: 'id,name,ape_1,ape_2,cif,es_tra_sim' }, loadStats),
    fetchData('ate_m', { fields: 'id,tip_ser,dir_lon,dir_lat,mun_m' }, loadStats),
    fetchData('ent_rel_m', { fields: 'ent,ent_rel,off,rel_tip' }, loadStats),
    fetchData('tip_ser', { fields: 'id,ent_m,mun_m,ser_nom' }, loadStats),
    fetchData('mun_m', { fields: 'id,name,pre_cps,cod_num' }, loadStats),
    fetchData('tra_m', { fields: 'id,tot_hor_con,hor_spapd,hor_pro,hor_cen,hor_uec' }, loadStats)
  ]);

  const names = ['ent_m', 'ate_m', 'ent_rel_m', 'tip_ser', 'mun_m', 'tra_m'];
  const results = {};
  const failures = [];

  settled.forEach((result, index) => {
    const name = names[index];
    if (result.status === 'fulfilled') {
      results[name] = result.value;
    } else {
      results[name] = [];
      failures.push(`${name}: ${result.reason?.message || result.reason}`);
    }
  });

  // mun_m puede fallar (permisos) y usar fallback; el resto es crítico
  const critical = ['ent_m', 'ate_m', 'ent_rel_m', 'tip_ser', 'tra_m'];
  for (const name of critical) {
    if (!results[name] || results[name].length === 0) {
      const detail = failures.find(f => f.startsWith(`${name}:`)) || `${name} vacío`;
      throw new Error(`Carga Velneo incompleta (${detail}). No se cacheará.`);
    }
  }

  if (failures.length > 0) {
    logger.warn('Endpoints no críticos con error:', failures.join(' | '));
  }

  return results;
}

/**
 * Realiza un INNER JOIN indexado O(n+m) entre dos conjuntos de datos.
 * Indexa foreignData por foreignKey y asocia matches a cada fila de primaryData.
 * @param {Array} primaryData - Conjunto de datos principal
 * @param {Array} foreignData - Conjunto de datos secundario a unir
 * @param {string} primaryKey - Nombre de la clave en el conjunto principal
 * @param {string} foreignKey - Nombre de la clave en el conjunto secundario
 * @param {string} relatedField - Nombre del campo donde se almacenarán los datos relacionados
 * @returns {Array} Datos unidos con relaciones preservadas
 */
function joinData(primaryData, foreignData, primaryKey, foreignKey, relatedField = 'related') {
  // PERF-002: índice por foreignKey → O(n+m) en lugar de O(n×m)
  const foreignIndex = new Map();
  for (const foreign of foreignData) {
    const key = String(foreign[foreignKey]);
    let bucket = foreignIndex.get(key);
    if (!bucket) {
      bucket = [];
      foreignIndex.set(key, bucket);
    }
    bucket.push(foreign);
  }

  const joined = [];
  for (const primary of primaryData) {
    const newRelatedItems = foreignIndex.get(String(primary[primaryKey]));
    if (!newRelatedItems || newRelatedItems.length === 0) {
      continue;
    }

    const result = { ...primary };

    if (primary.related && Array.isArray(primary.related)) {
      if (relatedField === 'related') {
        let newFieldName = 'related2';
        let counter = 2;
        while (result[newFieldName]) {
          newFieldName = `related${counter++}`;
        }
        result[newFieldName] = newRelatedItems;
      } else {
        result[relatedField] = newRelatedItems;
      }
    } else {
      result.related = newRelatedItems;
    }

    joined.push(result);
  }

  return joined;
}

/**
 * Limpia y procesa datos geográficos, filtrando según criterios específicos
 * @param {Array} data - Datos geográficos con información relacionada de personas
 * @returns {Array} Datos geográficos limpios y formateados
 */
function cleanGeographicData(data) {
    // Filtrar los datos según las condiciones especificadas
  return data
    .filter(item => {
      // Verificar si tenemos datos relacionados
      if (!item.related || item.related.length === 0) {
        return false;
      }
      const personaInfo = item.related[0];
      const traSim = isUserEntity(personaInfo.es_tra_sim);
        
      // Verificar que dir_lat y dir_lon no sean 0
      const validCoordinates = 
        item.dir_lat !== 0 && 
        item.dir_lon !== 0 && 
        item.dir_lat !== null && 
        item.dir_lon !== null &&
        item.dir_lat !== undefined && 
        item.dir_lon !== undefined;

        // Solo incluir elementos que tengan:
        // 1. Coordenadas válidas (no cero)
        // 2. es_tra_sim = false (usuario, no trabajadora)
        return validCoordinates && traSim;
      })
    .map(item => {
      const personaRelacionada = item.related[0];
      return {
        id: item.id,
        name: personaRelacionada.name || '',
        ape_1: personaRelacionada.ape_1 || '',
        ape_2: personaRelacionada.ape_2 || '',
        cif: personaRelacionada.cif || '',
        es_tra_sim: false,
        dir_lat: parseFloat(item.dir_lat),
        dir_lon: parseFloat(item.dir_lon),
        mun_m: item.mun_m || personaRelacionada.mun_m || null
      };
    });
}

/**
 * Procesa y agrupa datos de trabajadores, filtrando por trabajadores activos (es_tra_sim = true)
 * @param {Array} data - Datos de personas con relaciones
 * @returns {Array} Trabajadores agrupados con sus entidades relacionadas
 */
function cleanWorkersData(data) {
    // Agrupar los datos por ent_rel
    const workerGroups = {};
    data.forEach(item => {
      const entRel = String(item.ent_rel);
      // Si no tenemos info del trabajador todavía o no es válida
      if (!workerGroups[entRel]) {
        if (item.relatedWorker && item.relatedWorker.length > 0) {
          const workerInfo = item.relatedWorker[0];
          if (isTraSim(workerInfo.es_tra_sim) /*&& (item.rel_tip == 2 || item.rel_tip == 14)*/) {
            workerGroups[entRel] = {
              id: item.ent_rel,
              name: workerInfo.name,
              ape_1: workerInfo.ape_1,
              ape_2: workerInfo.ape_2,
              cif: workerInfo.cif,
              es_tra_sim: workerInfo.es_tra_sim,
              disponibilidad: workerInfo.disponibilidad,
              entidades: [] // Lista para almacenar todas las entidades relacionadas
            };
          }
        }
      }
      
      if (workerGroups[entRel]) {
        // Solo incluir entidades con relación activa (off false/0)
        if (isRelationActive(item.off) /*&& (item.rel_tip == 2 || item.rel_tip == 14)*/) {
            workerGroups[entRel].entidades.push({
                ent: item.ent,
                off: item.off,
                ...(item.related && item.related[0] ? item.related[0] : {})
            });
        }
      }
    });
    
    // Convertir el objeto a un array
    return Object.values(workerGroups);
  }

/**
 * Enriquece los datos de trabajadores con información geográfica de usuarios
 * @param {Array} trabajadores - Datos de trabajadores 
 * @param {Object|Array} geoUsers - Datos geográficos de usuarios (puede ser un objeto único o un array)
 * @return {Array} - Trabajadores con datos geográficos añadidos a sus entidades
 */
function enrichWorkerData(trabajadores, geoUsers) {
    const geoUserMap = {};
    if (Array.isArray(geoUsers)) {
      geoUsers.forEach(user => {
        if (user && user.id !== undefined && user.id !== null) {
          geoUserMap[String(user.id)] = user;
        }
      });
    } else if (geoUsers && typeof geoUsers === 'object' && geoUsers.id !== undefined) {
      geoUserMap[String(geoUsers.id)] = geoUsers;
    } else {
      logger.warn('geoUsers no tiene el formato esperado');
    }
    
    // Para cada trabajador, enriquecer sus entidades con datos geográficos
    return trabajadores.map(trabajador => {
      const entidadesEnriquecidas = trabajador.entidades.map(entidad => {
        const geoUser = geoUserMap[String(entidad.ent)];
        
        if (geoUser) {
          return {
            ent: entidad.ent,
            off: entidad.off,
            name: geoUser.name,
            ape_1: geoUser.ape_1,
            ape_2: geoUser.ape_2,
            dir_lat: geoUser.dir_lat,
            dir_lon: geoUser.dir_lon,
            mun_m: geoUser.mun_m,
          };
        } else {
          return entidad;
        }
      });
      return {
        ...trabajador,
        entidades: entidadesEnriquecidas
      };
    });
}

/**
 * Filtrar los municipios que ofrecen los servicios de promoción de la autonomía personal en domicilio y asistencia personal
 * @param {Array} mun_m - Lista de municipios
 * @param {Array} tip_ser - Lista de servicios
 * @returns {Array} Lista de municipios que ofrecen los servicios de promoción de la autonomía personal en domicilio y asistencia personal
 */ 
function filterMunicipalitiesByService(mun_m, tip_ser) {
  const interestServices = new Set(['4', '6']);
  const homeServiceMunicipalityIds = new Set(
    tip_ser
      .filter(service => interestServices.has(String(service.ser_nom)))
      .map(service => String(service.mun_m))
  );

  const filtered = mun_m
    .filter(municipality => homeServiceMunicipalityIds.has(String(municipality.id)))
    .map(municipality => ({
      id: municipality.id,
      name: municipality.name,
      pre_cps: municipality.pre_cps,
      cod_num: municipality.cod_num
    }));

  logger.info(
    `Filtro municipios: tip_ser=${tip_ser.length}, mun_m=${mun_m.length}, ` +
    `con_servicio_4_6=${homeServiceMunicipalityIds.size}, resultado=${filtered.length}`
  );
  if (filtered.length === 0 && tip_ser.length > 0) {
    const sampleSerNom = [...new Set(tip_ser.slice(0, 50).map(s => `${typeof s.ser_nom}:${s.ser_nom}`))];
    logger.warn('Ningún municipio tras filtro. Muestra ser_nom:', sampleSerNom.join(', '));
  }

  return filtered;
}

/**
 * Fallback cuando mun_m no es accesible con la API key:
 * deriva IDs de municipio desde ate_m de entidades con servicios 4/6.
 */
function buildMunicipalitiesFallback(tip_ser, ate_m) {
  const interestServices = new Set(['4', '6']);
  const entityIds = new Set(
    tip_ser
      .filter(service => interestServices.has(String(service.ser_nom)))
      .map(service => String(service.ent_m))
  );
  const munIds = new Set();
  for (const ate of ate_m) {
    if (entityIds.has(String(ate.id)) && ate.mun_m && Number(ate.mun_m) !== 0) {
      munIds.add(String(ate.mun_m));
    }
  }
  const fallback = [...munIds]
    .sort((a, b) => Number(a) - Number(b))
    .map(id => ({
      id,
      name: `Municipio ${id}`,
      pre_cps: '',
      cod_num: id
    }));
  logger.warn(`Fallback municipios desde ate_m: ${fallback.length} ids`);
  return fallback;
}

/**
 * Filtrar los usuarios por municipio
 * @param {Array} tip_ser - Lista de servicios
 * @param {Array} municipalities_available - Lista de municipios disponibles
 * @returns {Array} Lista de IDs de usuarios filtrados por municipio
 */
function filterEntitiesByMunicipality(tip_ser, municipalities_available) {
  const interestServices = new Set(['4', '6']);
  const municipalityIds = new Set(municipalities_available.map(muni => String(muni.id)));
  // tip_ser puede no exponer mun_m con esta API key; en ese caso filtramos solo por servicio
  const hasMunOnTipSer = tip_ser.some(s => s.mun_m !== undefined && s.mun_m !== null && s.mun_m !== '');
  return tip_ser
    .filter(service => {
      if (!interestServices.has(String(service.ser_nom))) {
        return false;
      }
      if (!hasMunOnTipSer) {
        return true;
      }
      return municipalityIds.has(String(service.mun_m));
    })
    .map(service => ({ent_m: service.ent_m}));
}

/**
 * Enriquece los datos de trabajadores con su disponibilidad calculada
 * @param {Array} trabajadores - Lista de trabajadores con información básica
 * @param {Array} tra_m - Lista de trabajadores con horas asignadas
 * @returns {Array} Lista de trabajadores enriquecidos con su disponibilidad calculada
 */
function getAvailableWorkers(ent_m, tra_m) {
  // Crear un mapa rápido de tra_m por id
  const traMap = {};
  tra_m.forEach(t => {
    traMap[String(t.id)] = t;
  });

  return ent_m
    .filter(worker => {
      const tra = traMap[String(worker.id)];
      return isTraSim(worker.es_tra_sim) && tra && Number(tra.hor_spapd) > 0;
    })
    .map(worker => {
      const tra = traMap[String(worker.id)];
      // Calcula la disponibilidad
      const tot = Number(tra.tot_hor_con) || 0;
      const spapd = Number(tra.hor_spapd) || 0;
      const pro = Number(tra.hor_pro) || 0;
      const cen = Number(tra.hor_cen) || 0;
      const uec = Number(tra.hor_uec) || 0;
      const disponibilidad = tot - (spapd + pro + cen + uec) / 4;

      return {
        ...worker,
        disponibilidad
      };
    });
}

const dataCache = new NodeCache({ stdTTL: 3600 }); // Caché de 1 hora

/**
 * PERF-001: promesa in-flight compartida (single-flight).
 * Evita que N peticiones concurrentes con caché fría disparen N× fetchAllData().
 */
let processedDataInFlight = null;

/** PERF-009: último cold start medido */
let lastProcessedLoad = null;

async function loadAndCacheProcessedData() {
  const loadStats = { velneo_pages: 0 };
  const started = Date.now();
  logMetric('processed_data_load', { cache: 'miss', phase: 'start' });
  const fetchStarted = Date.now();
  let datasets;
  try {
    datasets = await fetchAllData(loadStats);
  } catch (error) {
    logger.error('cache=skip Carga Velneo fallida; no se guarda caché:', error.message);
    throw error;
  }
  const { ent_m, ate_m, ent_rel_m, tip_ser, mun_m, tra_m } = datasets;
  const fetchMs = Date.now() - fetchStarted;
  const processStarted = Date.now();
  let avilableMunicipalities = filterMunicipalitiesByService(mun_m, tip_ser);
  if (avilableMunicipalities.length === 0) {
    logger.warn(
      'Lista de municipios vacía tras filtro (¿API key sin GET en mun_m?). ' +
      'Usando fallback temporal desde ate_m.'
    );
    avilableMunicipalities = buildMunicipalitiesFallback(tip_ser, ate_m);
  }
  const userEntities = filterEntitiesByMunicipality(tip_ser, avilableMunicipalities);
  const userEntityIds = new Set(userEntities.map(user => String(user.ent_m)));
  const workers = getAvailableWorkers(ent_m, tra_m);
  const workerIds = new Set(workers.map(worker => String(worker.id)));
  // PERF-003: un solo predicado (antes || entre funciones dejaba solo el primero)
  const entities = ent_m.filter(ent =>
    (isUserEntity(ent.es_tra_sim) && userEntityIds.has(String(ent.id))) ||
    (isTraSim(ent.es_tra_sim) && workerIds.has(String(ent.id)))
  );
  const geoData = joinData(ate_m, entities, 'id', 'id');
  const availableGeoUsers = cleanGeographicData(geoData);
  const relations = joinData(ent_rel_m, entities, 'ent', 'id');
  const relationsWithWorker = joinData(
    relations,
    workers,
    'ent_rel',
    'id',
    'relatedWorker'
  );
  const groupedWorkers = cleanWorkersData(relationsWithWorker);
  const finalData = enrichWorkerData(groupedWorkers, availableGeoUsers);

  const entidadesConMun = finalData.reduce(
    (acc, w) => acc + w.entidades.filter(e => e.mun_m !== undefined && e.mun_m !== null && e.mun_m !== '').length,
    0
  );
  const entidadesSinMun = finalData.reduce(
    (acc, w) => acc + w.entidades.filter(e => e.mun_m === undefined || e.mun_m === null || e.mun_m === '').length,
    0
  );
  const processMs = Date.now() - processStarted;
  const durationMs = Date.now() - started;

  lastProcessedLoad = {
    at: new Date().toISOString(),
    duration_ms: durationMs,
    fetch_ms: fetchMs,
    process_ms: processMs,
    velneo_pages: loadStats.velneo_pages,
    workers: workers.length,
    final_data: finalData.length,
  };

  logMetric('processed_data_load', {
    cache: 'set',
    duration_ms: durationMs,
    fetch_ms: fetchMs,
    process_ms: processMs,
    velneo_pages: loadStats.velneo_pages,
    user_entities: userEntities.length,
    workers: workers.length,
    entities: entities.length,
    geo_users: availableGeoUsers.length,
    final_data: finalData.length,
    entidades_con_mun_m: entidadesConMun,
    entidades_sin_mun_m: entidadesSinMun,
  });

  const result = {
    finalData,
    avilableMunicipalities
  };
  dataCache.set('processed_data', result);
  // PERF-005: mantener caché ligera de municipios alineada con el pipeline completo
  dataCache.set('municipalities', avilableMunicipalities.map(muni => ({
    id: muni.id,
    name: muni.name,
    pre_cps: muni.pre_cps,
    cod_num: muni.cod_num
  })));
  logger.info('cache=set Datos procesados guardados en caché');
  return result;
}

async function getProcessedData() {
  const cachedData = dataCache.get('processed_data');
  if (cachedData) {
    logMetric('processed_data_load', { cache: 'hit' });
    return cachedData;
  }

  if (processedDataInFlight) {
    logMetric('processed_data_load', { cache: 'wait' });
    return processedDataInFlight;
  }

  processedDataInFlight = loadAndCacheProcessedData()
    .finally(() => {
      processedDataInFlight = null;
    });

  return processedDataInFlight;
}

/**
 * Obtiene los puntos geográficos asignados a los trabajadores especificados
 * @param {Array} workers - IDs de los trabajadores 
 * @returns {Array} Puntos geográficos con información de trabajadores
 */
async function getPointsForWorkers(workers) {
  try {
    logger.debug(`Obteniendo puntos workers_count=${workers.length}`);
    const pointsData = await getProcessedData();
    // Filtrar los datos para obtener solo los trabajadores solicitados
    const filteredData = pointsData.finalData.filter(worker => workers.includes(worker.id.toString()));
    // Obtener las entidades de cada trabajador
    const points = filteredData.flatMap(worker => 
        worker.entidades
          .filter(entidad => entidad.dir_lat && entidad.dir_lon) // Asegurar que existen coordenadas
          .map(entidad => ({
            lat: entidad.dir_lat,
            lon: entidad.dir_lon,
            id: worker.id,
            workerName: worker.name,
            workerApe1: worker.ape_1,
            workerApe2: worker.ape_2,
            workerCif: worker.cif,
            workerDisponibilidad: worker.disponibilidad,
          }))
      );

    return points;
  } catch (error) {
    logger.error('Error al obtener puntos para trabajadores:', error.message);
    throw error;
  }
}

/**
 * Obtiene todos los puntos geográficos disponibles
 * @returns {Array} Lista de todos los puntos geográficos
 */
async function getPoints() {
    try {
      const pointsData = await getProcessedData();
      // Filtrar los datos para obtener solo los trabajadores solicitados
      const points = pointsData.finalData.flatMap(worker => 
          worker.entidades
            .filter(entidad => entidad.dir_lat && entidad.dir_lon)
            .map(entidad => ({
              lat: entidad.dir_lat,
              lon: entidad.dir_lon,
              id: worker.id,
              workerName: worker.name,
              workerApe1: worker.ape_1,
              workerApe2: worker.ape_2,
              workerCif: worker.cif,
            }))
        );
  
      return points;
    } catch (error) {
      logger.error('Error al obtener puntos:', error.message);
      throw error;
    }
  }

/**
 * Obtiene la lista de todos los trabajadores
 * @returns {Array} Lista de trabajadores con información básica
 */
async function getWorkers() {
  logger.info('Obteniendo lista de trabajadores');
  try {
    const data = await getProcessedData();
    const workers = data.finalData.map(worker => ({
      id: worker.id,
      name: worker.name,
      ape_1: worker.ape_1,
      ape_2: worker.ape_2,
      cif: worker.cif,
    }));
  
    return workers;
  } catch (error) {
    logger.error('Error al obtener trabajadores:', error.message);
    throw error;
  }
}

/**
 * Obtiene información de trabajadores específicos por su ID
 * @param {Array} ids - Lista de IDs de trabajadores a buscar
 * @returns {Array} Lista de trabajadores que coinciden con los IDs proporcionados
 */
async function getWorkersByID(ids) {
  try {
    const data = await getProcessedData();
    const workers = data.finalData.filter(worker => ids.includes(String(worker.id))).map(worker => ({
      id: worker.id,
      name: worker.name,
      ape_1: worker.ape_1,
      ape_2: worker.ape_2,
      cif: worker.cif,
      disponibilidad: worker.disponibilidad,
    }));
  
    return workers;
  } catch (error) {
    logger.error('Error al obtener trabajadores:', error.message);
    throw error;
  }
}

/**
 * PERF-005: carga ligera de municipios (solo mun_m + tip_ser).
 * Evita el cold start de ~6 tablas al abrir el selector.
 */
let municipalitiesInFlight = null;

async function loadMunicipalitiesLight() {
  const loadStats = { velneo_pages: 0 };
  const started = Date.now();
  logMetric('municipalities_load', { cache: 'miss', phase: 'start' });
  const [munSettled, tipSettled] = await Promise.allSettled([
    fetchData('mun_m', { fields: 'id,name,pre_cps,cod_num' }, loadStats),
    fetchData('tip_ser', { fields: 'id,ent_m,mun_m,ser_nom' }, loadStats)
  ]);

  const mun_m = munSettled.status === 'fulfilled' ? munSettled.value : [];
  const tip_ser = tipSettled.status === 'fulfilled' ? tipSettled.value : [];

  if (tipSettled.status === 'rejected') {
    throw new Error(`Carga ligera tip_ser fallida: ${tipSettled.reason?.message || tipSettled.reason}`);
  }
  if (tip_ser.length === 0) {
    throw new Error('Carga ligera tip_ser vacía. No se cachearán municipios.');
  }

  let list = filterMunicipalitiesByService(mun_m, tip_ser);
  if (list.length === 0) {
    logger.warn('Carga ligera: filtro vacío; intentando fallback con ate_m');
    const ate_m = await fetchData('ate_m', { fields: 'id,tip_ser,dir_lon,dir_lat,mun_m' }, loadStats);
    list = buildMunicipalitiesFallback(tip_ser, ate_m);
  }

  const municipalities = list.map(muni => ({
    id: muni.id,
    name: muni.name,
    pre_cps: muni.pre_cps,
    cod_num: muni.cod_num
  }));

  dataCache.set('municipalities', municipalities);
  logMetric('municipalities_load', {
    cache: 'set',
    count: municipalities.length,
    duration_ms: Date.now() - started,
    velneo_pages: loadStats.velneo_pages,
  });
  return municipalities;
}

/**
 * Obtiene todos los municipios disponibles
 * PERF-005: prioriza caché completa o carga ligera; no dispara el pipeline completo.
 */
async function getMunicipalities() {
  try {
    const fullCached = dataCache.get('processed_data');
    if (fullCached?.avilableMunicipalities) {
      logMetric('municipalities_load', { cache: 'hit', source: 'processed_data' });
      return fullCached.avilableMunicipalities.map(muni => ({
        id: muni.id,
        name: muni.name,
        pre_cps: muni.pre_cps,
        cod_num: muni.cod_num
      }));
    }

    const lightCached = dataCache.get('municipalities');
    if (lightCached) {
      logMetric('municipalities_load', { cache: 'hit', source: 'light' });
      return lightCached;
    }

    if (municipalitiesInFlight) {
      logMetric('municipalities_load', { cache: 'wait' });
      return municipalitiesInFlight;
    }

    municipalitiesInFlight = loadMunicipalitiesLight()
      .finally(() => {
        municipalitiesInFlight = null;
      });

    return municipalitiesInFlight;
  } catch (error) {
    logger.error('Error al obtener municipios:', error.message);
    throw error;
  }
}

/**
 * Obtener trabajadores según lista de municipios
 * @param {Array} municipalities - Lista de IDs de municipios
 * @returns {Array} Lista de trabajadores que pertenecen a los municipios especificados
 */
async function getWorkersByMunicipalities(municipalities) {
  try {
    logger.debug(`Obteniendo trabajadores municipalities_count=${municipalities.length}`);
    const data = await getProcessedData();
    const municipalityIds = municipalities.map(m => String(m));
    // Solo filtra las trabajadoras que tengan al menos una entidad en esos municipios
    const workers = data.finalData
      .filter(worker =>
        worker.entidades.some(entidad =>
          entidad.mun_m !== undefined &&
          entidad.mun_m !== null &&
          entidad.mun_m !== '' &&
          municipalityIds.includes(String(entidad.mun_m))
        )
      )
      .map(worker => ({
        id: worker.id,
        name: worker.name,
        ape_1: worker.ape_1,
        ape_2: worker.ape_2,
        cif: worker.cif,
      }));

    logger.info(
      `trabajadores_filtrados=${workers.length} (finalData=${data.finalData.length}, municipalities_count=${municipalityIds.length})`
    );
  
    return workers;
  } catch (error) {
    logger.error('Error al obtener trabajadores por municipios:', error.message);
    throw error;
  }
}

/**
 * Snapshot para GET /health (PERF-009). Sin PII.
 */
function getHealth() {
  return {
    processed_data_cached: Boolean(dataCache.get('processed_data')),
    municipalities_cached: Boolean(dataCache.get('municipalities')),
    load_in_flight: Boolean(processedDataInFlight),
    last_processed_load: lastProcessedLoad,
  };
}

module.exports = {
  fetchData,
  fetchAllData,
  joinData,
  getProcessedData,
  getPointsForWorkers,
  getPoints,
  getWorkers,
  getWorkersByID,
  getMunicipalities,
  getWorkersByMunicipalities,
  getHealth,
};