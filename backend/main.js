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
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));


// Configuración de sesiones
app.use(session({
  secret: process.env.SESSION_SECRET || 'tu-secreto-super-seguro',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS en producción
    httpOnly: true, // Previene acceso desde JS
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
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
    const returnTo = req.session.returnTo || req.query.state || 'http://localhost:5173';
    
    // Limpiar la sesión
    delete req.session.returnTo;
    
    // Redireccionar al frontend
    return res.redirect(returnTo);
  } catch (error) {
    console.error('Error en callback:', error);
    res.redirect('http://localhost:5173/error');
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