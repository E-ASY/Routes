import { apiRequest } from './config';

export interface AuthUser {
  name?: string;
  email?: string;
  picture?: string;
  sub?: string;
  [key: string]: any;
}

interface AuthCheckResponse {
  isAuthenticated: boolean;
  user?: AuthUser;
}

// Get the frontend URL for redirect
const FRONTEND_URL = window.location.origin; // e.g. http://localhost:5173
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export const authService = {
  /**
   * Redirects to the Auth0 login page with proper returnTo params
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
   * Redirects to the Auth0 logout page
   */
  logout(): void {
    // CORRECCIÓN: Usar la ruta API para cerrar sesión en lugar de la ruta directa
    const returnTo = encodeURIComponent(FRONTEND_URL);
    
    // Usar la ruta de API en lugar de la ruta directa de Auth0
    window.location.href = `${BACKEND_URL}/logout?returnTo=${returnTo}`;
  },

  /**
   * Checks if the user is authenticated
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