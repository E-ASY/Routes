// Configuración base para las llamadas API
const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/api';

// Opciones por defecto para fetch
const defaultOptions: RequestInit = {
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  credentials: 'include' // Para enviar cookies de sesión si usas autenticación
};

// Función auxiliar para hacer llamadas a la API
export async function apiRequest<T>(
  endpoint: string, 
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...defaultOptions,
    ...options,
  });
  
  if (!response.ok) {
    // Handle authentication errors specifically
    if (response.status === 401) {
      throw new Error('Authentication is required for this route');
    }
    
    const error = await response.json().catch(() => ({
      message: 'Error desconocido en la API'
    }));
    throw new Error(error.message || `Error ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}