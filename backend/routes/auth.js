const express = require('express');
const router = express.Router();

/**
 * DTO mínimo para el frontend (SEC-018).
 * No reenviar el objeto oidc.user completo (claims internos Auth0).
 * @param {Record<string, unknown>|undefined|null} oidcUser
 */
function toPublicUser(oidcUser) {
  if (!oidcUser || typeof oidcUser !== 'object') {
    return null;
  }
  return {
    name: typeof oidcUser.name === 'string' ? oidcUser.name : undefined,
    email: typeof oidcUser.email === 'string' ? oidcUser.email : undefined,
    picture: typeof oidcUser.picture === 'string' ? oidcUser.picture : undefined,
  };
}

/**
 * Ruta para verificar el estado de autenticación del usuario.
 *
 * @route GET /check
 * @group Autenticación - Rutas relacionadas con la autenticación de usuarios.
 * @returns {Object} 200 - Si el usuario está autenticado, devuelve un objeto con `isAuthenticated: true` y los datos del usuario.
 * @returns {Object} 200 - Si el usuario no está autenticado, devuelve un objeto con `isAuthenticated: false`.
 */
router.get('/check', (req, res) => {
  if (req.oidc.isAuthenticated()) {
    return res.json({
      isAuthenticated: true,
      user: toPublicUser(req.oidc.user),
    });
  }

  return res.json({
    isAuthenticated: false,
  });
});

module.exports = router;
