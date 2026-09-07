/**
 * Punto de entrada del API ACUFADE Routes.
 * SEC-019: config valida env antes de montar Express.
 */
const { config } = require('./config');

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const mapRoutes = require('./routes/map');
const authRoutes = require('./routes/auth');
const { globalErrorHandler } = require('./utils/errors');
const { logMetric } = require('./utils/observability');
const dataService = require('./services/data');
const routeService = require('./services/routes');

const { auth } = require('express-openid-connect');
const { requiresAuth } = require('express-openid-connect');

const app = express();

/** SEC-009 */
app.set('trust proxy', config.trustProxy);

/**
 * Valida que una URL de retorno pertenezca a la allowlist de orígenes.
 * @param {unknown} candidate
 * @returns {string}
 */
function getSafeReturnTo(candidate) {
  const fallback = config.frontendUrl;
  if (typeof candidate !== 'string' || !candidate.trim()) {
    return fallback;
  }
  try {
    const url = new URL(candidate);
    if (config.allowedOrigins.includes(url.origin)) {
      return url.toString();
    }
  } catch {
    // URL inválida → fallback
  }
  console.warn('Redirect rechazado (fuera de allowlist):', candidate);
  return fallback;
}

app.use(helmet());
app.use(express.json());
app.use(cookieParser());

app.use(cors({
  origin: config.allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.isProduction,
    httpOnly: true,
    sameSite: config.isProduction ? 'None' : 'Lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

const authConfig = {
  authRequired: false,
  auth0Logout: true,
  secret: config.auth0Secret,
  baseURL: config.auth0BaseUrl,
  clientID: config.auth0ClientId,
  issuerBaseURL: config.auth0IssuerBaseUrl,
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

app.get('/', (req, res) => {
  try {
    const isAuthenticated = req.oidc.isAuthenticated();
    if (isAuthenticated && req.oidc.user) {
      const { user } = req.oidc;
      // SEC-010: no persistir id_token en express-session.
      delete req.session.id_token;
      req.session.user = {
        name: user.name,
        email: user.email,
      };
    }

    const returnTo = getSafeReturnTo(req.session.returnTo);
    delete req.session.returnTo;
    return res.redirect(returnTo);
  } catch (error) {
    console.error('Error en callback:', error);
    res.redirect(getSafeReturnTo(`${config.frontendUrl}/error`));
  }
});

app.use(globalErrorHandler);

app.listen(config.port, () => {
  console.log(`Servidor corriendo en el puerto ${config.port}`);
});
