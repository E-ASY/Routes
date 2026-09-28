import { apiRequest } from './config';

/**
 * Punto geográfico: ubicación de una usuaria, coloreado por trabajadora asignada.
 * @interface MapPoint
 */
export interface MapPoint {
    lat: number;
    lon: number;
    /** ID de la trabajadora (color / leyenda) */
    id: string | number;
    /** user = usuaria atendida; worker = ubicación de la trabajadora */
    kind?: 'user' | 'worker';
    userId?: string | number;
    userName?: string;
    userApe1?: string;
    userApe2?: string;
    userCif?: string;
    userMunId?: string | number | null;
    workerName: string;
    workerApe1: string;
    workerApe2: string;
    workerCif: string;
    workerDisponibilidad?: number;
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
    disponibilidad?: number | string;
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
  mileage_by_worker?: MileageByWorker;
}

export interface WorkerMileage {
  distance_m: number;
  distance_km: number;
  legs: number;
  legs_with_distance: number;
}

export type MileageByWorker = Record<string, WorkerMileage>;

/** PERF-006: respuesta agregada points + routes + workers (leyenda) */
export interface ViewportData {
  workers: Worker[];
  points: MapPoint[];
  routes: Array<any>;
  mileage_by_worker?: MileageByWorker;
  total_points: number;
  total_routes: number;
}

/**
 * Servicio de mapas que proporciona métodos para interactuar con la API del backend
 * y obtener datos geográficos, trabajadores y rutas optimizadas
 */

/** PERF-007: caché en sesión + dedupe de peticiones concurrentes de municipios */
let municipalitiesCache: Municipality[] | null = null;
let municipalitiesInFlight: Promise<Municipality[]> | null = null;

function clearMunicipalitiesClientCache() {
  municipalitiesCache = null;
  municipalitiesInFlight = null;
}

export const mapsService = {
  /**
   * PERF-006: points + routes + workers en una sola petición
   */
  async getViewport(workerIds: string[]): Promise<ViewportData> {
    const queryParams = workerIds.map(id => `workers=${encodeURIComponent(id)}`).join('&');
    return apiRequest<ViewportData>(`/maps/viewport?${queryParams}`);
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
   * Obtiene la lista de municipios con servicio a domicilio.
   * PERF-007: una sola petición por sesión de página (caché en memoria).
   * @returns {Promise<Municipality[]>} Lista de municipios
   */
  async getMunicipalities(): Promise<Municipality[]> {
    if (municipalitiesCache) {
      return municipalitiesCache;
    }
    if (municipalitiesInFlight) {
      return municipalitiesInFlight;
    }
    municipalitiesInFlight = apiRequest<Municipality[]>('/maps/municipalities')
      .then((data) => {
        municipalitiesCache = data;
        return data;
      })
      .finally(() => {
        municipalitiesInFlight = null;
      });
    return municipalitiesInFlight;
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
  },

  /** Estado global de frescura del snapshot / datos Velneo */
  async getDataStatus(): Promise<DataStatus> {
    return apiRequest<DataStatus>('/maps/data-status');
  },

  /** Regenera snapshot desde Velneo (afecta a todos). Puede tardar. */
  async refreshSnapshot(): Promise<RefreshSnapshotResult> {
    const result = await apiRequest<RefreshSnapshotResult>('/maps/refresh-snapshot', {
      method: 'POST',
      body: '{}',
    });
    clearMunicipalitiesClientCache();
    return result;
  },

  /** Tramos ordenados (partida + visitas) vía Google Routes */
  async computeLegs(points: LatLon[]): Promise<LegsResult> {
    return apiRequest<LegsResult>('/maps/legs', {
      method: 'POST',
      body: JSON.stringify({ points }),
    });
  },
};

export interface DataStatus {
  updated_at: string | null;
  snapshot_fresh: boolean;
  snapshot_enabled: boolean;
  processed_data_cached: boolean;
  refresh_in_flight: boolean;
}

export interface RefreshSnapshotResult {
  ok: boolean;
  updated_at: string | null;
  workers: number;
  municipalities: number;
}

export interface LatLon {
  lat: number;
  lon: number;
}

export interface RouteLeg {
  from_index: number;
  to_index: number;
  origin: LatLon;
  destination: LatLon;
  polyline: number[][] | null;
  distance_m: number | null;
  distance_km: number | null;
}

export interface LegsResult {
  legs: RouteLeg[];
  total_distance_m: number;
  total_distance_km: number;
  legs_with_distance?: number;
  points_count: number;
}

/** Punto de partida o visita en el planificador */
export interface VisitPlanPoint {
  lat: number;
  lon: number;
  label: string;
  /** Si viene de un MapPoint */
  sourceKind?: 'user' | 'worker' | 'map';
  userId?: string | number;
  mapPointId?: string | number;
}