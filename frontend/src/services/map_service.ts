import { apiRequest } from './config';

/**
 * Representa los datos completos del mapa devueltos por el backend
 * @interface MapData
 * @property {Array<any>} final_data - Datos procesados de trabajadores con sus entidades geográficas
 */
export interface MapData {
  final_data: Array<any>;
}

/**
 * Representa un punto geográfico en el mapa con información del trabajador asociado
 * @interface MapPoint
 * @property {number} lat - Latitud del punto
 * @property {number} lon - Longitud del punto
 * @property {string|number} id - Identificador del trabajador asociado al punto
 * @property {string} workerName - Nombre del trabajador
 * @property {string} workerApe1 - Primer apellido del trabajador
 * @property {string} workerApe2 - Segundo apellido del trabajador
 * @property {string} workerCif - CIF/Identificador fiscal del trabajador
 */
export interface MapPoint {
    lat: number;
    lon: number;
    id: string | number;
    workerName: string;
    workerApe1: string;
    workerApe2: string;
    workerCif: string;
  }

export interface Municipality {
    id: string;
    name: string;
    pre_cps: string;
    cod_num: string;
}

/**
 * Representa la información básica de un trabajador
 * @interface Worker
 * @property {string} id - Identificador único del trabajador
 * @property {string} name - Nombre del trabajador
 * @property {string} ape_1 - Primer apellido del trabajador
 * @property {string} ape_2 - Segundo apellido del trabajador
 * @property {string} cif - CIF/Identificador fiscal del trabajador
 */
export interface Worker {
    id: string;
    name: string;
    ape_1: string;
    ape_2: string;
    cif: string;
}

/**
 * Representa los datos de rutas optimizadas para trabajadores
 * @interface RouteData
 * @property {Array<any>} routes - Lista de todas las rutas calculadas
 * @property {Record<string, any[]>} workers - Rutas agrupadas por trabajador
 * @property {number} total - Número total de rutas
 */
export interface RouteData {
  routes: Array<any>;
  workers: Record<string, any[]>;
  total: number;
}

/**
 * Servicio de mapas que proporciona métodos para interactuar con la API del backend
 * y obtener datos geográficos, trabajadores y rutas optimizadas
 */
export const mapsService = {
  /**
   * Obtiene todos los datos del mapa incluyendo trabajadores y puntos geográficos
   * @returns {Promise<MapData>} Datos completos del mapa
   */
  async getData(): Promise<MapData> {
    return apiRequest<MapData>('/maps/data');
  },
  
  /**
   * Obtiene rutas optimizadas para los trabajadores seleccionados
   * @param {string[]} workerIds - Array de IDs de trabajadores
   * @returns {Promise<RouteData>} Datos de rutas optimizadas
   */
  async getRoutes(workerIds: string[]): Promise<RouteData> {
    const queryParams = workerIds.map(id => `workers=${encodeURIComponent(id)}`).join('&');
    return apiRequest<RouteData>(`/maps/routes?${queryParams}`);
  },

  /**
   * Obtiene puntos geográficos para los trabajadores seleccionados
   * @param {string[]} workerIds - Array de IDs de trabajadores
   * @returns {Promise<MapPoint[]>} Lista de puntos geográficos
   */
  async getPoints(workerIds: string[]): Promise<MapPoint[]> {
    const queryParams = workerIds.map(id => `workers=${encodeURIComponent(id)}`).join('&');
    const response = await apiRequest<{points: MapPoint[]}>(`/maps/points?${queryParams}`);
    return response.points;
  },

  /**
   * Obtiene la lista de municipios con servicio a domicilio
   * @returns {Promise<Municipality[]>} Lista de municipios
   */
  async getMunicipalities(): Promise<Municipality[]> {
    return apiRequest<Municipality[]>('/maps/municipalities');
  },

  /**
   * Obtiene los trabajadores que prestan servicio en los municipios seleccionados
   * @param {string[]} municipalities - Array de IDs de municipios
   * @returns {Promise<Worker[]>} Lista de trabajadores filtrados por municipio
   */
  async getWorkersByMunicipalities(municipalities: string[]): Promise<Worker[]> {
    const queryParams = municipalities.map(m => `municipalities=${encodeURIComponent(m)}`).join('&');
    return apiRequest<Worker[]>(`/maps/workers?${queryParams}`);
  },

  /**
   * Obtiene la lista completa de trabajadores
   * @returns {Promise<Worker[]>} Lista de trabajadores
   */
  async getWorkers(): Promise<Worker[]> {
    return apiRequest<Worker[]>('/maps/workers');
  },

  /**
   * Obtiene información de trabajadores por sus IDs
   * @param {string[]} workerIds - Array de IDs de trabajadores
   * @returns {Promise<Worker[]>} Lista de trabajadores filtrados por ID
   */
  async getWorkersById(workerIds: string[]): Promise<Worker[]> {
    const queryParams = workerIds.map(id => `workers=${encodeURIComponent(id)}`).join('&');
    return apiRequest<Worker[]>(`/maps/workers?${queryParams}`);
  }
};