import { apiRequest } from './config';

// Tipos de datos
export interface MapData {
  final_data: Array<any>;
}

export interface MapPoint {
    lat: number;
    lon: number;
    id: string | number;
    workerName: string;
    workerApe1: string;
    workerApe2: string;
    workerCif: string;
  }

export interface Worker {
    id: string;
    name: string;
    ape_1: string;
    ape_2: string;
    cif: string;
}

export interface RouteData {
  routes: Array<any>;
  workers: Record<string, any[]>;
  total: number;
}

// Funciones para comunicarse con el backend
export const mapsService = {
  // Obtener datos de trabajadores y puntos
  async getData(): Promise<MapData> {
    return apiRequest<MapData>('/maps/data');
  },
  
  // Obtener rutas para los trabajadores seleccionados
  async getRoutes(workerIds: string[]): Promise<RouteData> {
    // Construir URL con parámetros de consulta
    const queryParams = workerIds.map(id => `workers=${encodeURIComponent(id)}`).join('&');
    return apiRequest<RouteData>(`/maps/routes?${queryParams}`);
  },

  async getPoints(workerIds: string[]): Promise<MapPoint[]> {
    // Construir URL con parámetros de consulta
    const queryParams = workerIds.map(id => `workers=${encodeURIComponent(id)}`).join('&');
    const response = await apiRequest<{points: MapPoint[]}>(`/maps/points?${queryParams}`);
    return response.points;
  },

  async getWorkers(): Promise<Worker[]> {
    return apiRequest<Worker[]>('/maps/workers');
  },

  async getWorkersById(workerIds: string[]): Promise<Worker[]> {
    // Construir URL con parámetros de consulta
    const queryParams = workerIds.map(id => `workers=${encodeURIComponent(id)}`).join('&');
    return apiRequest<Worker[]>(`/maps/workers?${queryParams}`);
  }
};