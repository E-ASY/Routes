import { apiRequest } from './config';

/**
 * Interfaz que define la estructura de datos de un usuario autenticado
 * @interface AuthUser
 * @property {string} [name] - Nombre del usuario
 * @property {string} [email] - Correo electrónico del usuario
 * @property {string} [picture] - URL de la imagen de perfil del usuario
 * @property {string} [sub] - Identificador único del usuario en Auth0
 * @property {any} [key: string] - Propiedad dinámica para campos adicionales
 */
export interface AuthUser {
  name?: string;
  email?: string;
  picture?: string;
  sub?: string;
  [key: string]: any;
}

/**
 * Interfaz para la respuesta de verificación de autenticación
 * @interface AuthCheckResponse
 * @property {boolean} isAuthenticated - Indica si el usuario está autenticado
 * @property {AuthUser} [user] - Información del usuario si está autenticado
 */
interface AuthCheckResponse {
  isAuthenticated: boolean;
  user?: AuthUser;
}

/**
 * URLs de base para redirecciones de autenticación
 * FRONTEND_URL: Obtenido automáticamente del origen actual
 * BACKEND_URL: Configurado desde variables de entorno o valor por defecto
 */
const FRONTEND_URL = window.location.origin;
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

/**
 * Servicio de autenticación que gestiona login, logout y verificación
 * de estado de autenticación mediante Auth0
 */
export const authService = {
  /**
   * Redirige al usuario a la página de login de Auth0 con parámetros de retorno
   * Guarda la ruta actual para volver a ella después de autenticarse
   * @returns {void}
   */
  login(): void {
    // Guarda la ruta actual para volver a ella después de login
    const currentPath = window.location.pathname;
    const returnTo = `${FRONTEND_URL}${currentPath}`;
    
    // Puedes pasar esto como state o como returnTo dependiendo de tu backend
    const encodedReturnTo = encodeURIComponent(returnTo);
    
    // Redirige al login incluyendo la URL de retorno
    window.location.href = `${BACKEND_URL}/login?returnTo=${encodedReturnTo}`;
  },

  /**
   * Redirige al usuario a la página de logout de Auth0
   * Cierra la sesión en Auth0 y redirige de vuelta al frontend
   * @returns {void}
   */
  logout(): void {
    // CORRECCIÓN: Usar la ruta API para cerrar sesión en lugar de la ruta directa
    const returnTo = encodeURIComponent(FRONTEND_URL);
    
    // Usar la ruta de API en lugar de la ruta directa de Auth0
    window.location.href = `${BACKEND_URL}/logout?returnTo=${returnTo}`;
  },

  /**
   * Verifica si el usuario está autenticado
   * Realiza una solicitud al backend para comprobar el estado de autenticación
   * @returns {Promise<AuthCheckResponse>} Respuesta con el estado de autenticación
   */
  async checkAuthenticated(): Promise<AuthCheckResponse> {
    try {
      const response = await apiRequest<AuthCheckResponse>('/auth/check');
      console.log('Raw auth check response:', response);
      return response;
    } catch (error) {
      console.error('Authentication check failed:', error);
      return { isAuthenticated: false };
    }
  }
};