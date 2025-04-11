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

  // Añade esta función para extraer el token de la URL
  getAuthToken(): string | null {
    // Comprobar token en URL
    const params = new URLSearchParams(window.location.search);
    const token = params.get('auth_token');

    if (token) {
      // Guardar token y limpiar URL
      localStorage.setItem('auth_token', token);
      window.history.replaceState({}, document.title, window.location.pathname);
      return token;
    }

    // Devolver token guardado si existe
    return localStorage.getItem('auth_token');
  },

  async checkAuthenticated(): Promise<AuthCheckResponse> {
    try {
      // Usar fetch directamente con posible token de autenticación
      const token = this.getAuthToken();
      const headers: HeadersInit = {
        'Accept': 'application/json'
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${BACKEND_URL}/api/auth/check`, {
        method: 'GET',
        credentials: 'include',
        headers
      });

      const data = await response.json();
      console.log('Raw auth check response:', data);
      return data;
    } catch (error) {
      console.error('Authentication check failed:', error);
      return { isAuthenticated: false };
    }
  }
};