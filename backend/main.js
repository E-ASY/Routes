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


// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware de seguridad
app.use(helmet());
app.use(express.json());
app.use(cookieParser());

// Configuración de CORS (solo permite origen específico)
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'https://acufade-routes.vercel.app', process.env.FRONTEND_URL],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));


// Configuración de sesiones
app.use(session({
  secret: process.env.SESSION_SECRET || 'tu-secreto-super-seguro',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true, // IMPORTANTE: en producción DEBE ser true
    httpOnly: true,
    sameSite: 'none', // CRUCIAL para cross-domain
    maxAge: 24 * 60 * 60 * 1000
  }
}));

const config = {
  authRequired: false,
  auth0Logout: true,
  secret: 'a long, randomly-generated string stored in env',
  baseURL: process.env.AUTH0_BASE_URL,
  clientID: process.env.AUTH0_CLIENT_ID,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL
};

// auth router attaches /login, /logout, and /callback routes to the baseURL
app.use(auth(config));
app.use('/api/auth', authRoutes);
app.use('/api/maps', requiresAuth(), mapRoutes);

// Añadir después de 'cookieParser'
const jwt = require('jsonwebtoken');

// Y dentro del handler '/'
app.get('/', (req, res) => {
  try {
    const isAuthenticated = req.oidc.isAuthenticated();
    if (isAuthenticated && req.oidc.user) {
      const { user, id_token } = req.oidc;
      req.session.id_token = id_token;
      req.session.user = {
        name: user.name,
        email: user.email,
      };
      
      // Generar token JWT para autenticación alternativa
      const token = jwt.sign(
        { sub: user.sub, email: user.email, name: user.name },
        process.env.JWT_SECRET || 'secreto-temporal',
        { expiresIn: '24h' }
      );
      
      // Redireccionar con token
      const returnTo = req.session.returnTo || req.query.state || process.env.FRONTEND_URL;
      delete req.session.returnTo;
      // Añadir el token como parámetro de consulta
      return res.redirect(`${returnTo}?auth_token=${token}`);
    }
    
    const returnTo = req.session.returnTo || req.query.state || process.env.FRONTEND_URL;
    delete req.session.returnTo;
    return res.redirect(returnTo);
  } catch (error) {
    console.error('Error en callback:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/error`);
  }
});

app.get('/api/health', requiresAuth(), (req, res) => {
  res.json({ status: 'ok', environment: process.env.NODE_ENV });
});

// Manejador de errores global
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