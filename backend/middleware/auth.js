const axios = require('axios');

/**
 * Middleware para verificar sesión de usuario
 */
exports.verifySession = (req, res, next) => {
  // Verificar si el usuario está autenticado mediante la sesión
  if (!req.session.user) {
    return res.status(401).json({
      error: 'No autenticado',
      message: 'Debe iniciar sesión para acceder a este recurso'
    });
  }
  
  // Si la sesión está a punto de expirar, extenderla
  if (req.session.expiresAt && Date.now() > req.session.expiresAt - (60 * 60 * 1000)) {
    // Renovar token si está por expirar (1 hora antes)
    this.refreshToken(req.session.refreshToken)
      .then(tokenData => {
        req.session.accessToken = tokenData.access_token;
        req.session.expiresAt = Date.now() + tokenData.expires_in * 1000;
        next();
      })
      .catch(error => {
        // Si falla la renovación, solicitar nuevo login
        req.session.destroy();
        return res.status(401).json({
          error: 'Sesión expirada',
          message: 'Su sesión ha expirado, por favor inicie sesión nuevamente'
        });
      });
  } else {
    // Sesión válida, continuar
    next();
  }
};

/**
 * Función para renovar token con Auth0
 */
exports.refreshToken = async (refreshToken) => {
  try {
    const response = await axios.post(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
      grant_type: 'refresh_token',
      client_id: process.env.AUTH0_CLIENT_ID,
      client_secret: process.env.AUTH0_CLIENT_SECRET,
      refresh_token: refreshToken
    });
    
    return response.data;
  } catch (error) {
    console.error('Error al refrescar token:', error);
    throw error;
  }
};