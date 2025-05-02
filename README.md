# ACUFADE Routes

Sistema de gestión de rutas para trabajadores.

## Descripción

ACUFADE Routes es una aplicación web que permite visualizar y optimizar las rutas de los trabajadores que prestan servicios domiciliarios. El sistema muestra en un mapa interactivo las ubicaciones de los usuarios y calcula las rutas más eficientes entre ellos.

### Características principales

-  Autenticación segura mediante Auth0
-  Visualización de ubicaciones en mapa interactivo
-  Cálculo de rutas optimizadas entre puntos
-  Gestión de trabajadores y sus asignaciones
-  Interfaz responsive y moderna
-  Actualización en tiempo real de los datos

## Estructura del Proyecto

El proyecto está dividido en dos partes principales:

```
acufade-routes/
├── backend/           # API REST con Express y Auth0
│   ├── main.js        # Punto de entrada del servidor
│   ├── routes/        # Definiciones de rutas API
│   └── services/      # Lógica y servicios
└── frontend/          # Cliente React con TypeScript y Vite
    ├── src/           # Código fuente del cliente
        ├── components/# Componentes React
        └── services/  # Servicios para comunicación con la API
```

## Instalación y Configuración

### Requisitos Previos

- Node.js (v18 o superior)
- npm (v8 o superior)
- Cuenta en Auth0
- Cuenta en Google Cloud Platform (para la API de Routes)

### Backend

1. Navegar al directorio del backend:
   ```
   cd acufade-routes/backend
   ```

2. Instalar dependencias:
   ```
   npm install
   ```

3. Crear archivo `.env` con las siguientes variables:
   ```
   # Auth0
   AUTH0_CLIENT_ID=tu_client_id
   AUTH0_CLIENT_SECRET=tu_client_secret
   AUTH0_BASE_URL=https://tu-dominio.com
   FRONTEND_URL=https://tu-frontend.com
   AUTH0_ISSUER_BASE_URL=https://tu-tenant.auth0.com
   AUTH0_AUDIENCE=https://tu-api-identifier

   # Servidor
   PORT=5000
   SESSION_SECRET=una_cadena_aleatoria_y_segura
   NODE_ENV=development

   # API VELNEO
   VELNEO_API_BASE_URL=https://tu-api-velneo.com
   VELNEO_API_KEY=tu_api_key

   # Google
   GOOGLE_API_KEY=tu_api_key_google
   ```

4. Iniciar servidor:
   ```
   npm run start
   ```

### Frontend

1. Navegar al directorio del frontend:
   ```
   cd acufade-routes/frontend
   ```

2. Instalar dependencias:
   ```
   npm install
   ```

3. Crear archivo `.env` con las siguientes variables:
   ```
   VITE_BACKEND_URL=http://localhost:5000
   ```

4. Iniciar servidor de desarrollo:
   ```
   npm run dev
   ```

## Uso

1. Accede a la aplicación en el navegador (por defecto en http://localhost:5173)
2. Inicia sesión con tus credenciales de Auth0
3. Selecciona los trabajadores para ver sus ubicaciones asignadas
4. Las rutas se generarán automáticamente para los trabajadores seleccionados

## Despliegue

### Backend

El backend está preparado para ser desplegado en Heroku:

```bash
heroku create
git push heroku main
```

### Frontend

El frontend puede desplegarse en Vercel

## Tecnologías Utilizadas

### Backend
- Express.js - Framework web
- Auth0 - Autenticación y autorización
- Axios - Cliente HTTP
- Google Directions API - Cálculo de rutas

### Frontend
- React - Biblioteca de UI
- TypeScript - Lenguaje tipado
- Vite - Herramienta de construcción
- MapLibre GL - Biblioteca de mapas
- deck.gl - Visualización de datos geoespaciales
- Material-UI - Componentes de UI
- React Select - Componente de selección