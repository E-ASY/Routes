/**
 * Rate limiting para /maps (SEC-007).
 * Clave: IP real (tras trust proxy) + usuario Auth0.
 */
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const MAPS_MAX = Number(process.env.RATE_LIMIT_MAPS_MAX || 60);
const ROUTES_MAX = Number(process.env.RATE_LIMIT_ROUTES_MAX || 20);
/** Refresh snapshot: pocas veces (carga Velneo pesada). Default 2 / 15 min */
const REFRESH_WINDOW_MS = Number(process.env.RATE_LIMIT_REFRESH_WINDOW_MS || 15 * 60_000);
const REFRESH_MAX = Number(process.env.RATE_LIMIT_REFRESH_MAX || 2);

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
 * @param {number} [windowMs]
 */
function createLimiter(max, name, windowMs = WINDOW_MS) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: clientKey,
    message: { error: 'Demasiadas peticiones. Inténtalo de nuevo más tarde.' },
    handler: (req, res, _next, options) => {
      const retryAfterSec = Math.ceil(windowMs / 1000);
      res.set('Retry-After', String(retryAfterSec));
      console.warn(
        `rate_limit name=${name} max=${max} window_ms=${windowMs}`
      );
      res.status(options.statusCode).json(options.message);
    },
  });
}

/** Límite general de lectura /maps */
const mapsLimiter = createLimiter(MAPS_MAX, 'maps');

/** Más estricto: Google Routes */
const routesLimiter = createLimiter(ROUTES_MAX, 'routes');

/** Refresh snapshot Velneo (costoso) */
const refreshLimiter = createLimiter(REFRESH_MAX, 'refresh-snapshot', REFRESH_WINDOW_MS);

module.exports = {
  mapsLimiter,
  routesLimiter,
  refreshLimiter,
  WINDOW_MS,
  MAPS_MAX,
  ROUTES_MAX,
  REFRESH_WINDOW_MS,
  REFRESH_MAX,
};
