import { apiRequest } from './config';

/**
 * Interfaz que define la estructura de datos de un usuario autenticado
 * @interface AuthUser
 * @property {string} [name] - Nombre del usuario
 * @property {string} [email] - Correo electrónico del usuario
 * @property {string} [picture] - URL de la imagen de perfil del usuario
 */
export interface AuthUser {
  name?: string;
  email?: string;
  picture?: string;
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
   * SEC-021: logout vía POST (form) + Origin allowlist en backend.
   * Evita CSRF por simple GET cross-site a /logout.
   */
  logout(): void {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `${BACKEND_URL}/auth/logout`;
    form.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'returnTo';
    input.value = FRONTEND_URL;
    form.appendChild(input);

    document.body.appendChild(form);
    form.submit();
  },

  /**
   * Verifica si el usuario está autenticado
   * Realiza una solicitud al backend para comprobar el estado de autenticación
   * @returns {Promise<AuthCheckResponse>} Respuesta con el estado de autenticación
   */
  async checkAuthenticated(): Promise<AuthCheckResponse> {
    try {
      const response = await apiRequest<AuthCheckResponse>('/auth/check');
      return response;
    } catch (error) {
      console.error('Authentication check failed:', error);
      return { isAuthenticated: false };
    }
  }
};