/**
 * SEC-019: carga y valida variables de entorno obligatorias.
 * Debe requerirse antes que el resto de módulos de la app.
 */
const dotenv = require('dotenv');

dotenv.config();

const REQUIRED = [
  'SESSION_SECRET',
  'AUTH0_CLIENT_ID',
  'AUTH0_CLIENT_SECRET',
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

const isProduction = process.env.NODE_ENV === 'production';

const config = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  sessionSecret: process.env.SESSION_SECRET,
  /** Firma cookies OIDC; AUTH0_SECRET opcional (SEC-015), fallback al client secret. */
  auth0Secret: process.env.AUTH0_SECRET || process.env.AUTH0_CLIENT_SECRET,
  auth0ClientId: process.env.AUTH0_CLIENT_ID,
  auth0ClientSecret: process.env.AUTH0_CLIENT_SECRET,
  auth0BaseUrl: process.env.AUTH0_BASE_URL,
  auth0IssuerBaseUrl: process.env.AUTH0_ISSUER_BASE_URL,
  frontendUrl: process.env.FRONTEND_URL,
  trustProxy: resolveTrustProxy(),
  allowedOrigins: [
    'http://localhost:5173',
    'http://localhost:5000',
    'https://acufade-routes.vercel.app',
    process.env.FRONTEND_URL,
  ].filter(Boolean),
};

module.exports = { config, REQUIRED };
