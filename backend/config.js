/**
 * SEC-019: carga y valida variables de entorno obligatorias.
 * SEC-015: AUTH0_SECRET obligatorio (cookies OIDC ≠ client secret).
 * SEC-013: allowlist CORS desde ALLOWED_ORIGINS (+ FRONTEND_URL).
 * Debe requerirse antes que el resto de módulos de la app.
 */
const dotenv = require('dotenv');

dotenv.config();

const REQUIRED = [
  'AUTH0_CLIENT_ID',
  'AUTH0_CLIENT_SECRET',
  'AUTH0_SECRET',
  'AUTH0_BASE_URL',
  'AUTH0_ISSUER_BASE_URL',
  'FRONTEND_URL',
  'VELNEO_API_BASE_URL',
  'VELNEO_API_KEY',
  'GOOGLE_API_KEY',
];

/**
 * @param {string[]} names
 * @returns {string[]}
 */
function missingEnv(names) {
  return names.filter((name) => {
    const value = process.env[name];
    return value === undefined || String(value).trim() === '';
  });
}

const missing = missingEnv(REQUIRED);
if (missing.length > 0) {
  console.error(
    'Faltan variables de entorno obligatorias:\n' +
      missing.map((name) => `  - ${name}`).join('\n') +
      '\nCopia backend/.env.example a backend/.env y completa los valores.'
  );
  process.exit(1);
}

/**
 * @returns {boolean|number}
 */
function resolveTrustProxy() {
  const trustProxyEnv = process.env.TRUST_PROXY;
  if (trustProxyEnv === 'false' || trustProxyEnv === '0') {
    return false;
  }
  if (trustProxyEnv === 'true') {
    return true;
  }
  if (trustProxyEnv && !Number.isNaN(Number(trustProxyEnv))) {
    return Number(trustProxyEnv);
  }
  return 1;
}

/**
 * SEC-013: orígenes CORS / redirects.
 * - ALLOWED_ORIGINS: lista separada por comas
 * - Siempre se añade FRONTEND_URL
 * - En development, si no hay ALLOWED_ORIGINS: localhost por defecto
 * - En production: sin localhost implícito
 * @param {boolean} isProduction
 * @param {string} frontendUrl
 * @returns {string[]}
 */
function resolveAllowedOrigins(isProduction, frontendUrl) {
  const fromEnv = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const defaults =
    !isProduction && fromEnv.length === 0
      ? ['http://localhost:5173', 'http://localhost:5000']
      : [];

  const merged = [...defaults, ...fromEnv, frontendUrl].filter(Boolean);
  return [...new Set(merged)];
}

const isProduction = process.env.NODE_ENV === 'production';
const frontendUrl = process.env.FRONTEND_URL;

const config = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  /** SEC-014/015: único secreto de cookie de app (OIDC appSession). */
  auth0Secret: process.env.AUTH0_SECRET,
  auth0ClientId: process.env.AUTH0_CLIENT_ID,
  auth0ClientSecret: process.env.AUTH0_CLIENT_SECRET,
  auth0BaseUrl: process.env.AUTH0_BASE_URL,
  auth0IssuerBaseUrl: process.env.AUTH0_ISSUER_BASE_URL,
  frontendUrl,
  trustProxy: resolveTrustProxy(),
  allowedOrigins: resolveAllowedOrigins(isProduction, frontendUrl),
};

module.exports = { config, REQUIRED, resolveAllowedOrigins };
