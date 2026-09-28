const express = require('express');
const router = express.Router();
const { getSafeReturnTo, isAllowedRequestOrigin } = require('../utils/redirect');
const { config } = require('../config');

/**
 * Ruta para verificar el estado de autenticación del usuario.
 *
 * @route GET /check
 */
router.get('/check', (req, res) => {
  if (req.oidc.isAuthenticated()) {
    const oidcUser = req.oidc.user;
    return res.json({
      isAuthenticated: true,
      user: {
        name: typeof oidcUser?.name === 'string' ? oidcUser.name : undefined,
        email: typeof oidcUser?.email === 'string' ? oidcUser.email : undefined,
        picture: typeof oidcUser?.picture === 'string' ? oidcUser.picture : undefined,
      },
    });
  }

  return res.json({
    isAuthenticated: false,
  });
});

/**
 * SEC-021: logout solo por POST + Origin/Referer en allowlist.
 * GET /logout de OIDC está deshabilitado en main.js.
 *
 * @route POST /logout
 */
router.post('/logout', (req, res) => {
  if (!isAllowedRequestOrigin(req)) {
    return res.status(403).json({ error: 'Origen no permitido para logout' });
  }

  const returnTo = getSafeReturnTo(
    req.body?.returnTo || config.frontendUrl
  );

  res.oidc.logout({ returnTo });
});

module.exports = router;
