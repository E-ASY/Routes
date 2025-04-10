const axios = require('axios');
const dotenv = require('dotenv');
const { join } = require('path');

dotenv.config();

// URLs base y configuración
const API_KEY = process.env.VELNEO_API_KEY;
const BASE_URL = process.env.VELNEO_API_BASE_URL;

// Función para obtener datos de un endpoint específico
async function fetchData(endpoint, params = {}) {
  try {
    const url = `${BASE_URL}/${endpoint}`;
    const response = await axios.get(url, { params: { ...params, api_key: API_KEY } });
    return response.data[endpoint];
  } catch (error) {
    console.error(`Error fetching data from ${endpoint}:`, error.message);
    return [];
  }
}

// Obtener datos de múltiples endpoints
async function fetchAllData() {
  try {
    // Ejemplo de peticiones a diferentes endpoints
    const [ent_m, ate_m, ent_rel_m] = await Promise.all([
      fetchData('ent_m', { 'page[number]': 1, fields: 'id,name,ape_1,ape_2,cif,es_tra_sim' }),
      fetchData('ate_m', { 'page[number]': 1, fields: 'id,dir_lon,dir_lat' }),
      fetchData('ent_rel_m', { 'page[number]': 1, fields: 'ent,ent_rel,off' })
    ]);

    return { ent_m, ate_m, ent_rel_m };
  } catch (error) {
    console.error('Error fetching all data:', error.message);
    throw error;
  }
}

// Realizar INNER JOIN entre datasets preservando datos relacionados anteriores
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

  function cleanGeographicData(data) {
    // Filtrar los datos según las condiciones especificadas
    return data
      .filter(item => {
        // Verificar si tenemos datos relacionados
        if (!item.related || item.related.length === 0) {
          return false;
        }
        
        // Obtener datos personales del registro relacionado
        const personaInfo = item.related[0];
        
        // Verificar que es_tra_sim sea false (rechazar cuando es true)
        const traSim = personaInfo.es_tra_sim === false;
        
        // Verificar que dir_lat y dir_lon no sean 0
        const validCoordinates = 
          item.dir_lat !== 0 && 
          item.dir_lon !== 0 && 
          item.dir_lat !== null && 
          item.dir_lon !== null &&
          item.dir_lat !== undefined && 
          item.dir_lon !== undefined;
        
        // Para el ejemplo que proporcionaste:
        // 1. Las coordenadas son 0,0 -> validCoordinates = false
        // 2. es_tra_sim es false -> traSim = true
        // El resultado final sería (false && true) = false, por lo que se excluiría este registro
        
        // Solo incluir elementos que tengan:
        // 1. Coordenadas válidas (no cero)
        // 2. es_tra_sim = false
        return validCoordinates && traSim;
      })
      .map(item => {
        // Obtener el registro de datos personales
        const personaRelacionada = item.related[0];
        
        // Transformar el resultado para devolverlo en el formato deseado
        return {
          id: item.id,
          // Datos personales
          name: personaRelacionada.name || '',
          ape_1: personaRelacionada.ape_1 || '',
          ape_2: personaRelacionada.ape_2 || '',
          cif: personaRelacionada.cif || '',
          es_tra_sim: false, // Sabemos que es false porque lo filtramos arriba
          // Coordenadas (ya validadas para que no sean 0)
          dir_lat: parseFloat(item.dir_lat),
          dir_lon: parseFloat(item.dir_lon)
        };
      });
  }


  function cleanWorkersData(data) {
    // Agrupar los datos por ent_rel
    const workerGroups = {};
    
    // Primera pasada: agrupar por ent_rel
    data.forEach(item => {
      const entRel = item.ent_rel;
      // Si no tenemos info del trabajador todavía o no es válida
      if (!workerGroups[entRel]) {
        // Verificar que hay datos personales relacionados
        if (item.related && item.related.length > 0) {
          const workerInfo = item.related[0];
          
          // Solo incluir trabajadores con es_tra_sim = true
          if (workerInfo.es_tra_sim === true) {
            workerGroups[entRel] = {
              id: entRel,
              name: workerInfo.name,
              ape_1: workerInfo.ape_1,
              ape_2: workerInfo.ape_2,
              cif: workerInfo.cif,
              es_tra_sim: workerInfo.es_tra_sim,
              entidades: [] // Lista para almacenar todas las entidades relacionadas
            };
          }
        }
      }
      
      // Si existe la información del trabajador (ya sea que acabamos de crearla o ya existía)
      if (workerGroups[entRel]) {
        // Añadir la entidad relacionada sin información duplicada
        if (item.off === false) {
            workerGroups[entRel].entidades.push({
                ent: item.ent,
                off: item.off
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
    // Crear un mapa para buscar usuarios geográficos por id rápidamente
    const geoUserMap = {};
    // Manejar tanto si geoUsers es un objeto único como si es un array
    if (Array.isArray(geoUsers)) {
      // Si es un array, procesarlo como antes
      geoUsers.forEach(user => {
        if (user && user.id) {
          geoUserMap[user.id] = user;
        }
      });
    } else if (geoUsers && typeof geoUsers === 'object' && geoUsers.id) {
      // Si es un objeto único, agregarlo al mapa directamente
      geoUserMap[geoUsers.id] = geoUsers;
    } else {
      console.warn('geoUsers no tiene el formato esperado:', geoUsers);
    }
    
    // Para cada trabajador, enriquecer sus entidades con datos geográficos
    return trabajadores.map(trabajador => {
      // Procesar cada entidad del trabajador
      const entidadesEnriquecidas = trabajador.entidades.map(entidad => {
        // Buscar si existe un usuario geográfico con el mismo id que el ent
        const geoUser = geoUserMap[entidad.ent];
        
        if (geoUser) {
          // Si existe, combinar la información
          return {
            ent: entidad.ent,
            off: entidad.off,
            // Datos del usuario geográfico
            name: geoUser.name,
            ape_1: geoUser.ape_1,
            ape_2: geoUser.ape_2,
            dir_lat: geoUser.dir_lat,
            dir_lon: geoUser.dir_lon,
          };
        } else {
          // Si no existe, devolver la entidad original
          return entidad;
        }
      });
      // Devolver el trabajador con sus entidades enriquecidas
      return {
        ...trabajador,
        entidades: entidadesEnriquecidas
      };
    });
}

async function getProcessedData() {
  const { ent_m, ate_m, ent_rel_m } = await fetchAllData();
  const geograficos_datos_persona = joinData(ate_m, ent_m, 'id', 'id');
  const geo_users = cleanGeographicData(geograficos_datos_persona);
  const datos_personas = joinData(ent_rel_m, ent_m, 'ent_rel', 'id');
  const datos_trabajadores = cleanWorkersData(datos_personas);
  const final_data = enrichWorkerData(datos_trabajadores, geo_users);
  
  return {
    final_data,
  };
}

async function getPointsForWorkers(workers) {
  try {
    // Obtener puntos para rutas de trabajadores que no están en caché
    console.log(`Obteniendo puntos para: ${workers.join(', ')}`);
    const pointsData = await getProcessedData();
    // Filtrar los datos para obtener solo los trabajadores solicitados
    const filteredData = pointsData.final_data.filter(worker => workers.includes(worker.id.toString()));
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
            workerCif: worker.cif
          }))
      );

    return points;
  } catch (error) {
    console.error('Error al obtener puntos para trabajadores:', error.message);
    throw error;
  }
}

async function getPoints() {
    try {
      const pointsData = await getProcessedData();
      // Filtrar los datos para obtener solo los trabajadores solicitados
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
            }))
        );
  
      return points;
    } catch (error) {
      console.error('Error al obtener puntos:', error.message);
      throw error;
    }
  }

async function getWorkers() {
  try {
    const data = await getProcessedData();
    // Filtrar los datos para obtener solo los trabajadores solicitados
    const workers = data.final_data.map(worker => ({
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

async function getWorkersByID(ids) {
  try {
    const data = await getProcessedData();
    // Filtrar los datos para obtener solo los trabajadores solicitados
    const workers = data.final_data.filter(worker => ids.includes(worker.id.toString())).map(worker => ({
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

module.exports = {
  fetchData,
  fetchAllData,
  joinData,
  getProcessedData,
  getPointsForWorkers,
  getPoints,
  getWorkers,
  getWorkersByID
};