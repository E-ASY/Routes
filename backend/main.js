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

app.use(helmet());
app.use(express.json());
app.use(cookieParser());

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5000', 'https://acufade-routes.vercel.app', process.env.FRONTEND_URL],
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
  secret: process.env.SESSION_SECRET || 'tu-secreto-super-seguro',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    httpOnly: true,
    sameSite: 'none',
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
      secure: true, 
      httpOnly: true,
      sameSite: 'None',
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
    
    // Obtener la URL de redirección del parámetro state o de la sesión
    const returnTo = req.session.returnTo || req.query.state || process.env.FRONTEND_URL;
    // Limpiar la sesión
    delete req.session.returnTo;
    // Redireccionar al frontend
    return res.redirect(returnTo);
  } catch (error) {
    console.error('Error en callback:', error);
    res.redirect('http://localhost:5173/error');
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