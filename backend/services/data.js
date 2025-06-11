/**
 * Archivo: data.js
 * Descripción: Servicio de datos para la gestión de información de trabajadores y ubicaciones geográficas
 * Este módulo se encarga de obtener, procesar y transformar datos desde la API de Velneo
 * para ser utilizados en la aplicación de rutas de ACUFADE
 */
const axios = require('axios');
const dotenv = require('dotenv');
const e = require('express');
const NodeCache = require('node-cache');
const { join } = require('path');

dotenv.config();
const API_KEY = process.env.VELNEO_API_KEY;
const BASE_URL = process.env.VELNEO_API_BASE_URL;

/**
 * Obtiene datos de un endpoint específico de la API de Velneo, recuperando todas las páginas disponibles
 * @param {string} endpoint - Nombre del endpoint a consultar
 * @param {Object} params - Parámetros adicionales para la consulta
 * @returns {Array} Datos obtenidos de todas las páginas del endpoint solicitado
 */
async function fetchData(endpoint, params = {}) {
    try {
    const url = `${BASE_URL}/${endpoint}?api_key=${API_KEY}`;
    console.log(url);
    let allData = [];
    let currentPage = 1;
    let hasMorePages = true;
    const pageSize = 100;
    
    while (hasMorePages) {
      // Actualizar número de página en cada iteración
      const pageParams = { 
        ...params, 
        'page[number]': currentPage,
        'page[size]': pageSize
      };
      const response = await axios.get(url, { params: pageParams, timeout: 10000 });
      // Obtener los datos de esta página
      const pageData = response.data[endpoint] || [];
      console.log(`Endpoint ${endpoint} - Página ${currentPage}: ${pageData.length} items recibidos`);
      if (pageData.length > 0) {
        allData = [...allData, ...pageData];
        currentPage++;
        // Verificar si hay más páginas:
        // Si la cantidad de elementos es menor que el tamaño de página, hemos llegado al final
        if (pageData.length < pageSize) {
          hasMorePages = false;
        }
      } else {
        // No hay más datos
        hasMorePages = false;
      }
    }
    console.log(`Total datos obtenidos de ${endpoint}: ${allData.length}`);
    return allData;
  } catch (error) {
    console.error(`Error fetching data from ${endpoint}:`, error.message);
    return [];
  }
}

/**
 * Obtiene datos de múltiples endpoints en paralelo
 * @returns {Object} Objeto con los datos de los diferentes endpoints (ent_m, ate_m, ent_rel_m, tip_ser, mun_m)
 */
async function fetchAllData() {
  try {
    console.log('Iniciando obtención de todos los datos...');
    
    // Realizar peticiones paralelas a diferentes endpoints para optimizar tiempo
    const [ent_m, ate_m, ent_rel_m, tip_ser, mun_m, tra_m] = await Promise.all([
      fetchData('ent_m', { fields: 'id,name,ape_1,ape_2,cif,es_tra_sim' }),
      fetchData('ate_m', { fields: 'id,tip_ser,dir_lon,dir_lat,mun_m' }),
      fetchData('ent_rel_m', { fields: 'ent,ent_rel,off,rel_tip' }),
      fetchData('tip_ser', { fields: 'id,ent_m,mun_m,ser_nom' }),
      fetchData('mun_m', { fields: 'id,name,pre_cps,cod_num' }),
      fetchData('tra_m', { fields: 'id,tot_hor_con,hor_spapd,hor_pro,hor_cen,hor_uec'})
    ]);

    return { ent_m, ate_m, ent_rel_m, tip_ser, mun_m, tra_m };
  } catch (error) {
    console.error('Error fetching all data:', error.message);
    throw error;
  }
}

/**
 * Realiza un INNER JOIN entre dos conjuntos de datos preservando relaciones anteriores
 * @param {Array} primaryData - Conjunto de datos principal
 * @param {Array} foreignData - Conjunto de datos secundario a unir
 * @param {string} primaryKey - Nombre de la clave en el conjunto principal
 * @param {string} foreignKey - Nombre de la clave en el conjunto secundario
 * @param {string} relatedField - Nombre del campo donde se almacenarán los datos relacionados
 * @returns {Array} Datos unidos con relaciones preservadas
 */
function joinData(primaryData, foreignData, primaryKey, foreignKey, relatedField = 'related') {
    // Filtrar directamente para incluir solo elementos con coincidencias
    return primaryData
      .map(primary => {
        const newRelatedItems = foreignData.filter(foreign => 
          foreign[foreignKey] === primary[primaryKey]
        );
        
        // Si no hay coincidencias, retornamos null para filtrar después
        if (newRelatedItems.length === 0) {
          return null;
        }
        
        // Preservar datos relacionados existentes
        const result = { ...primary };
        
        // Si ya existe un campo 'related', preservarlo con un nombre único
        if (primary.related && Array.isArray(primary.related)) {
          if (relatedField === 'related') {
            // Generar un nombre único para el nuevo campo relacionado
            let newFieldName = 'related2';
            let counter = 2;
            
            while (result[newFieldName]) {
              newFieldName = `related${counter++}`;
            }
            
            result[newFieldName] = newRelatedItems;
          } else {
            // Usar el nombre personalizado proporcionado
            result[relatedField] = newRelatedItems;
          }
        } else {
          // Si no hay datos relacionados previos, usar 'related'
          result.related = newRelatedItems;
        }
        
        return result;
      })
      .filter(item => item !== null); // Eliminar todos los null (registros sin coincidencias)
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
      const traSim = personaInfo.es_tra_sim === false;
        
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
        // 2. es_tra_sim = false
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
      const entRel = item.ent_rel;
      // Si no tenemos info del trabajador todavía o no es válida
      if (!workerGroups[entRel]) {
        if (item.relatedWorker && item.relatedWorker.length > 0) {
          const workerInfo = item.relatedWorker[0];
          if (workerInfo.es_tra_sim === true /*&& (item.rel_tip == 2 || item.rel_tip == 14)*/) {
            workerGroups[entRel] = {
              id: entRel,
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
        // Añadir la entidad relacionada sin información duplicada
        // Solo incluir entidades con off = false y rel_tip 2 o 14 (tipo de relación a domicilio)
        if (item.off === false /*&& (item.rel_tip == 2 || item.rel_tip == 14)*/) {
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
        if (user && user.id) {
          geoUserMap[user.id] = user;
        }
      });
    } else if (geoUsers && typeof geoUsers === 'object' && geoUsers.id) {
      geoUserMap[geoUsers.id] = geoUsers;
    } else {
      console.warn('geoUsers no tiene el formato esperado:', geoUsers);
    }
    
    // Para cada trabajador, enriquecer sus entidades con datos geográficos
    return trabajadores.map(trabajador => {
      const entidadesEnriquecidas = trabajador.entidades.map(entidad => {
        const geoUser = geoUserMap[entidad.ent];
        
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
  const interestServices = ['4', '6'];
  const homeServiceMunicipalities = tip_ser
    .filter(service => interestServices.includes(service.ser_nom))
    .map(service => service.mun_m); 

  return mun_m
    .filter(municipality => homeServiceMunicipalities.includes(municipality.id))
    .map(municipality => ({
      id: municipality.id,
      name: municipality.name,
      pre_cps: municipality.pre_cps,
      cod_num: municipality.cod_num
    }));
}

/**
 * Filtrar los usuarios por municipio
 * @param {Array} tip_ser - Lista de servicios
 * @param {Array} municipalities_available - Lista de municipios disponibles
 * @returns {Array} Lista de IDs de usuarios filtrados por municipio
 */
function filterEntitiesByMunicipality(tip_ser, municipalities_available) {
  const interestServices = ['4', '6'];
  return tip_ser
    .filter(service =>
      municipalities_available.some(muni => muni.id === service.mun_m) &&
      interestServices.includes(service.ser_nom)
    )
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
    traMap[t.id] = t;
  });

  return ent_m
    .filter(worker => {
      const esTraSim = worker.es_tra_sim === true;
      const tra = traMap[worker.id];
      return esTraSim && tra && Number(tra.hor_spapd) > 0;
    })
    .map(worker => {
      const tra = traMap[worker.id];
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


// Modificar getProcessedData para usar caché ---------------------------------------------------------------------------------------------------------------------------
async function getProcessedData() {
  // Verificar si los datos ya están en caché
  const cachedData = dataCache.get('processed_data');
  if (cachedData) {
    console.log('Usando datos de caché');
    return cachedData;
  }

  // Si no están en caché, obtener y procesar
  const { ent_m, ate_m, ent_rel_m, tip_ser, mun_m, tra_m } = await fetchAllData();
  const avilableMunicipalities = filterMunicipalitiesByService(mun_m, tip_ser);
  const userEntities = filterEntitiesByMunicipality(tip_ser, avilableMunicipalities);
  const workers = getAvailableWorkers(ent_m, tra_m);
  const entities = ent_m
    .filter(
      (ent => ent.es_tra_sim === false && userEntities.some(user => user.ent_m === ent.id)) ||
      (ent => ent.es_tra_sim === true && workers.some(worker => worker.id === ent.id))
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

  const result = { 
    finalData,
    avilableMunicipalities
  };
  // Guardar en caché
  dataCache.set('processed_data', result);
  
  return result;
}

/**
 * Obtiene los puntos geográficos asignados a los trabajadores especificados
 * @param {Array} workers - IDs de los trabajadores 
 * @returns {Array} Puntos geográficos con información de trabajadores
 */
async function getPointsForWorkers(workers) {
  try {
    console.log(`Obteniendo puntos para: ${workers.join(', ')}`);
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
    console.error('Error al obtener puntos para trabajadores:', error.message);
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
      console.error('Error al obtener puntos:', error.message);
      throw error;
    }
  }

/**
 * Obtiene la lista de todos los trabajadores
 * @returns {Array} Lista de trabajadores con información básica
 */
async function getWorkers() {
  console.log('Obteniendo lista de trabajadores');
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
    console.error('Error al obtener trabajadores:', error.message);
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
    const workers = data.finalData.filter(worker => ids.includes(worker.id.toString())).map(worker => ({
      id: worker.id,
      name: worker.name,
      ape_1: worker.ape_1,
      ape_2: worker.ape_2,
      cif: worker.cif,
      disponibilidad: worker.disponibilidad,
    }));
  
    return workers;
  } catch (error) {
    console.error('Error al obtener trabajadores:', error.message);
    throw error;
  }
}

/**
 * Obtiene todos los municipios disponibles
 * @returns {Array} Lista de todos los municipios
 */
async function getMunicipalities() {
  console.log('Obteniendo lista de municipios disponibles');
  try {
    console.log('Obteniendo lista de municipios');
    const data = await getProcessedData();
    const municipalities = data.avilableMunicipalities.map(muni => ({
      id: muni.id,
      name: muni.name,
      pre_cps: muni.pre_cps,
      cod_num: muni.cod_num
    }));
  
    return municipalities;
  } catch (error) {
    console.error('Error al obtener municipios:', error.message);
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
    console.log(`Obteniendo trabajadores para municipios: ${municipalities.join(', ')}`);
    const data = await getProcessedData();
    // Solo filtra las trabajadoras que tengan al menos una entidad en esos municipios, pero devuelve todas sus entidades
    const workers = data.finalData
      .filter(worker => 
        worker.entidades.some(entidad => 
          entidad.mun_m && municipalities.includes(entidad.mun_m.toString())
        )
      )
      .map(worker => ({
        id: worker.id,
        name: worker.name,
        ape_1: worker.ape_1,
        ape_2: worker.ape_2,
        cif: worker.cif,
      }));      
  
    return workers;
  } catch (error) {
    console.error('Error al obtener trabajadores por municipios:', error.message);
    throw error;
  }
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
  getWorkersByMunicipalities
};