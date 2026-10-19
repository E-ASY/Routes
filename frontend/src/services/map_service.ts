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

  /** Tramos ordenados (partida + visitas) vía Google Routes; con returnToStart, también la vuelta */
  async computeLegs(points: LatLon[], returnToStart = false): Promise<LegsResult> {
    return apiRequest<LegsResult>('/maps/legs', {
      method: 'POST',
      body: JSON.stringify({ points, returnToStart }),
    });
  },

  /**
   * PERF-013: orden de visitas con menos km (points[0] = partida fija). Sin llamadas a Google.
   * Con endAtLast, el último punto es la llegada fija y no se reordena.
   */
  async optimizeOrder(
    points: LatLon[],
    { returnToStart = false, endAtLast = false }: { returnToStart?: boolean; endAtLast?: boolean } = {}
  ): Promise<OptimizeOrderResult> {
    return apiRequest<OptimizeOrderResult>('/maps/optimize-order', {
      method: 'POST',
      body: JSON.stringify({ points, returnToStart, endAtLast }),
    });
  },

  /**
   * PERF-013: horario del día con franjas de disponibilidad. points = partida, visitas
   * y (con finish 'custom') llegada; windows = una lista de franjas por visita.
   */
  async scheduleVisits(points: LatLon[], request: ScheduleRequest): Promise<ScheduleResult> {
    return apiRequest<ScheduleResult>('/maps/schedule-visits', {
      method: 'POST',
      body: JSON.stringify({ points, ...request, mode: 'optimize' }),
    });
  },

  /** Horario del orden actual (cambiado a mano), con los conflictos si no encaja */
  async evaluateSchedule(
    points: LatLon[],
    request: ScheduleRequest & { goal: ScheduleGoal }
  ): Promise<ManualScheduleResult> {
    return apiRequest<ManualScheduleResult>('/maps/schedule-visits', {
      method: 'POST',
      body: JSON.stringify({ points, ...request, mode: 'manual' }),
    });
  },
};

/** Franja horaria en minutos desde medianoche (09:30 = 570) */
export interface TimeRange {
  start: number;
  end: number;
}

export interface ScheduleRequest {
  finish: PlanFinish;
  shift: TimeRange;
  /** Franjas por visita (vacío = cualquier hora) */
  windows: TimeRange[][];
  /** Hora fija de inicio por visita (null = sin fijar); manda sobre sus franjas */
  fixedStarts: (number | null)[];
}

/** Qué prioriza una opción de horario */
export type ScheduleGoal = 'distance' | 'finish' | 'idle';

/** Visita programada; `visit` = posición en las visitas enviadas */
export interface ScheduledVisit {
  visit: number;
  arrival: number;
  start: number;
  end: number;
  wait: number;
  /** Minutos que llega tarde a su franja u hora fija (0 = a tiempo) */
  late: number;
}

export interface UnscheduledVisit {
  visit: number;
  /**
   * no_window: ninguna franja cabe en la jornada; no_fit: su franja se solapa con las de
   * otras visitas; no_room: sin franjas propias, pero no queda hueco en la jornada
   */
  reason: 'no_window' | 'no_fit' | 'no_room';
}

export interface ScheduleOption {
  goals: ScheduleGoal[];
  /** Orden de las visitas programadas (posiciones en las visitas enviadas) */
  order: number[];
  visits: ScheduledVisit[];
  departure: number;
  finish_time: number;
  distance_m: number;
  travel_min: number;
  idle_min: number;
  /** Suma de minutos de retraso de las visitas que llegan tarde */
  late_min: number;
  /** Minutos que se pasa de la jornada */
  overtime_min: number;
  unscheduled: UnscheduledVisit[];
}

export interface ScheduleResult {
  options: ScheduleOption[];
  unscheduled: UnscheduledVisit[];
  exact: boolean;
  ms: number;
  service_minutes: number;
  /** google = tiempos reales; estimate / mixed = alguno estimado en línea recta */
  travel_source: 'google' | 'estimate' | 'mixed';
}

export interface OptimizeOrderResult {
  /** Índices sobre los puntos enviados; order[0] === 0 (partida) y, con llegada, el último fijo */
  order: number[];
  method: 'exact' | 'heuristic' | 'nn';
  ms: number;
  straight_km_before: number;
  straight_km_after: number;
  changed: boolean;
}

/** Dónde acaba la trabajadora: en la última visita, de vuelta en la partida o en otro sitio */
export type PlanFinish = 'last' | 'start' | 'custom';

/** Resultado de "Optimizar orden" en el planificador */
export interface PlanOptimization {
  /** Visitas tal como quedaron tras optimizar (para saber si siguen vigentes) */
  stops: VisitPlanPoint[];
  /** Final con el que se optimizó (los km solo son comparables con el mismo final) */
  finish: PlanFinish;
  end: VisitPlanPoint | null;
  changed: boolean;
  /** Total Google del orden anterior, si estaba calculado */
  kmBefore: number | null;
  straightKmBefore: number;
  straightKmAfter: number;
}

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
  /** Si incluye el tramo de vuelta (último legs[] con to_index = 0) */
  return_to_start?: boolean;
}

/** Punto de partida, visita o llegada en el planificador */
export interface VisitPlanPoint {
  lat: number;
  lon: number;
  label: string;
  /** Si viene de un MapPoint */
  sourceKind?: 'user' | 'worker' | 'map';
  userId?: string | number;
  mapPointId?: string | number;
  /** Trabajadora a la que pertenece la usuaria o la casa (MapPoint.id) */
  workerId?: string | number;
}

/** Problema del horario de una visita en el orden elegido a mano */
export interface ScheduleConflict {
  visit: number;
  /** late: no llega a su hora fija; outside_window: ninguna franja sirve a esa hora */
  type: 'late' | 'outside_window';
  minutes: number | null;
}

export interface ManualScheduleResult {
  option: ScheduleOption;
  conflicts: ScheduleConflict[];
  /** Minutos que se pasa de la jornada (0 si acaba a tiempo) */
  after_shift_min: number;
  feasible: boolean;
  service_minutes: number;
  travel_source: 'google' | 'estimate' | 'mixed';
}
