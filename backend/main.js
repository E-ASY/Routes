/**
 * Punto de entrada del API ACUFADE Routes.
 * SEC-019: config valida env antes de montar Express.
 * SEC-014: solo sesión de express-openid-connect (sin express-session).
 * SEC-021: logout OIDC GET deshabilitado; usar POST /auth/logout.
 */
const { config } = require('./config');

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const mapRoutes = require('./routes/map');
const authRoutes = require('./routes/auth');
const { globalErrorHandler } = require('./utils/errors');
const { logMetric } = require('./utils/observability');
const dataService = require('./services/data');
const routeService = require('./services/routes');
const { getSafeReturnTo } = require('./utils/redirect');

const { auth } = require('express-openid-connect');
const { requiresAuth } = require('express-openid-connect');

const app = express();

/** SEC-009 */
app.set('trust proxy', config.trustProxy);

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use(cors({
  origin: config.allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

/**
 * Auth0 OIDC — única sesión de aplicación (cookie appSession).
 * Login: GET /login?returnTo=...
 * Logout: POST /auth/logout (SEC-021); ruta GET /logout deshabilitada.
 */
const authConfig = {
  authRequired: false,
  auth0Logout: true,
  secret: config.auth0Secret,
  baseURL: config.auth0BaseUrl,
  clientID: config.auth0ClientId,
  issuerBaseURL: config.auth0IssuerBaseUrl,
  routes: {
    login: '/login',
    logout: false,
    callback: '/callback',
  },
  session: {
    cookie: {
      secure: config.isProduction,
      httpOnly: true,
      sameSite: config.isProduction ? 'None' : 'Lax',
    }
  }
};

/** PERF-009: liveness sin auth ni secretos */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime_s: Math.floor(process.uptime()),
    env: config.nodeEnv,
    data: dataService.getHealth(),
    routes: routeService.getMetrics(),
  });
});

app.use(auth(authConfig));
app.use('/auth', authRoutes);

/** PERF-009: duración de peticiones /maps (sin query ni PII) */
app.use('/maps', (req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    logMetric('http_request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - started,
    });
  });
  next();
});
app.use('/maps', requiresAuth(), mapRoutes);

/**
 * Raíz: si Auth0/OIDC deja al usuario en baseURL, redirigir al frontend.
 */
app.get('/', (req, res) => {
  try {
    return res.redirect(getSafeReturnTo(config.frontendUrl));
  } catch (error) {
    console.error('Error en redirect /:', error);
    res.redirect(getSafeReturnTo(`${config.frontendUrl}/error`));
  }
});

app.use(globalErrorHandler);

app.listen(config.port, () => {
  console.log(`Servidor corriendo en el puerto ${config.port}`);
});
