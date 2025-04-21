const express = require('express');
const router = express.Router();
const { requiresAuth } = require('express-openid-connect');

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
      user: req.oidc.user
    });
  }
  
  return res.json({
    isAuthenticated: false
  });
});

module.exports = router;