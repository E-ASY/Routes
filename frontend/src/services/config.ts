// Configuración base para las llamadas API
const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

// Opciones por defecto para fetch
const defaultOptions: RequestInit = {
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  credentials: 'include'
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
    credentials: 'include',
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Authentication is required for this route');
    }
    
    // Respuesta que no es JSON (p. ej. un 404 de Express porque el backend aún no tiene la ruta)
    const text = await response.text();
    let error: { error?: string; message?: string } = {};
    try {
      error = JSON.parse(text) as { error?: string; message?: string };
    } catch {
      if (response.status === 404) {
        throw new Error('El servidor no tiene esta función. Reinicia el backend y vuelve a intentarlo.');
      }
    }
    throw new Error(
      error.error ||
        error.message ||
        `Error ${response.status}: ${response.statusText || 'respuesta no válida del servidor'}`
    );
  }
  
  return response.json();
}