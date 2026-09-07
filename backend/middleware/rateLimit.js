/**
 * Rate limiting para /maps (SEC-007).
 * Clave: IP real (tras trust proxy) + usuario Auth0.
 */
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const MAPS_MAX = Number(process.env.RATE_LIMIT_MAPS_MAX || 60);
const ROUTES_MAX = Number(process.env.RATE_LIMIT_ROUTES_MAX || 20);

/**
 * @param {import('express').Request} req
 * @returns {string}
 */
function clientKey(req) {
  const user =
    req.oidc?.user?.sub ||
    req.oidc?.user?.email ||
    'anon';
  const ipPart = req.ip ? ipKeyGenerator(req.ip) : 'unknown';
  return `${ipPart}:${user}`;
}

/**
 * @param {number} max
 * @param {string} name
 */
function createLimiter(max, name) {
  return rateLimit({
    windowMs: WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: clientKey,
    message: { error: 'Demasiadas peticiones. Inténtalo de nuevo más tarde.' },
    handler: (req, res, _next, options) => {
      const retryAfterSec = Math.ceil(WINDOW_MS / 1000);
      res.set('Retry-After', String(retryAfterSec));
      console.warn(
        `rate_limit name=${name} max=${max} window_ms=${WINDOW_MS}`
      );
      res.status(options.statusCode).json(options.message);
    },
  });
}

/** Límite general de lectura /maps */
const mapsLimiter = createLimiter(MAPS_MAX, 'maps');

/** Más estricto: Google Routes */
const routesLimiter = createLimiter(ROUTES_MAX, 'routes');

module.exports = {
  mapsLimiter,
  routesLimiter,
  WINDOW_MS,
  MAPS_MAX,
  ROUTES_MAX,
};
