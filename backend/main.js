const express = require('express');
const cors = require('cors');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const helmet = require('helmet');
const mapRoutes = require('./routes/map');
const authRoutes = require('./routes/auth');

const { auth } = require('express-openid-connect');
const { requiresAuth } = require('express-openid-connect');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

/**
 * SEC-001: sin SESSION_SECRET no arrancar (evita secreto por defecto predecible).
 */
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  console.error('Falta SESSION_SECRET. Define la variable de entorno antes de arrancar.');
  process.exit(1);
}

/**
 * Orígenes permitidos para CORS y redirecciones post-login (SEC-003 / base SEC-013).
 */
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5000',
  'https://acufade-routes.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean);

/**
 * Valida que una URL de retorno pertenezca a la allowlist de orígenes.
 * @param {unknown} candidate
 * @returns {string|null}
 */
function getSafeReturnTo(candidate) {
  const fallback = process.env.FRONTEND_URL || 'http://localhost:5173';
  if (typeof candidate !== 'string' || !candidate.trim()) {
    return fallback;
  }
  try {
    const url = new URL(candidate);
    const origin = url.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
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
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));


/**
 * Configuración de sesiones de usuario
 * Almacena información de sesión con cookies seguras
 * Utiliza un secreto para firmar cookies y evitar manipulación
 */
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

/**
 * Configuración de Auth0 para autenticación
 * Define los parámetros necesarios para conectar con el servicio de Auth0
 * Los valores sensibles se obtienen de variables de entorno
 */
const config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.AUTH0_CLIENT_SECRET,
  baseURL: process.env.AUTH0_BASE_URL,
  clientID: process.env.AUTH0_CLIENT_ID,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  session: {
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
    }
  }
};

/**
 * Configuración de rutas de autenticación
 * El middleware de Auth0 agrega automáticamente rutas para /login, /logout y /callback
 */
app.use(auth(config));
app.use('/auth', authRoutes);
app.use('/maps', requiresAuth(), mapRoutes);

/**
 * Ruta principal / - gestiona la autenticación y redirecciones
 * @route GET /
 * @description Procesa la información de autenticación y redirige al frontend
 */
app.get('/', (req, res) => {
  try {
    const isAuthenticated = req.oidc.isAuthenticated();
    if (isAuthenticated && req.oidc.user) {
      // Procesar la autenticación con Auth0 solo si el usuario está autenticado
      const { user, id_token } = req.oidc;
      // Guardar el token en la sesión
      req.session.id_token = id_token;
      // Guardar la información del usuario en la sesión
      req.session.user = {
        name: user.name,
        email: user.email,
      };
    }
    
    // SEC-003: no usar req.query.state como URL (en OAuth, state es anti-CSRF).
    // Solo session.returnTo o FRONTEND_URL, validados contra allowlist.
    const returnTo = getSafeReturnTo(req.session.returnTo);
    delete req.session.returnTo;
    return res.redirect(returnTo);
  } catch (error) {
    console.error('Error en callback:', error);
    res.redirect(getSafeReturnTo(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/error`));
  }
});

/**
 * Middleware de manejo global de errores
 * Captura cualquier error no controlado en las rutas y devuelve una respuesta apropiada
 * En entornos de producción, oculta detalles técnicos del error al usuario
 */
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Ocurrió un error en el servidor'
  });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});