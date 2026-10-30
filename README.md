# ACUFADE Routes

Aplicación web para visualizar en mapa las asignaciones de trabajadoras de atención domiciliaria y planificar visitas con distancias.

## Qué hace

- Login con Auth0
- Mapa (MapLibre + deck.gl) con usuarias y trabajadoras
- Selector de trabajadoras (sin filtro por municipio)
- Rutas y kilometraje por trabajadora en coche (Google Routes)
- Planificación del día de una trabajadora (PERF-013):
  - partida, visitas tocando usuarias en el mapa y final (volver, acabar en la última u otro sitio)
  - jornada, franjas de disponibilidad por usuaria (varias), hora fija y duración de cada visita
  - **Organizar**: horario con tiempos reales de coche y 3 opciones (menos km / termina antes / menos esperas), más «Tu orden»; vista previa de cada opción en el mapa
  - ajuste a mano (flechas o arrastrar), avisos de retraso o jornada alargada, «Para otro día» solo si es imposible encajarla
  - agenda con resumen del día, enviar/copiar agenda y enlaces a Google Maps
  - el plan se guarda en el navegador (el del día caduca; franjas y duraciones se recuerdan) y se borra al cerrar sesión
- Datos Velneo cacheados en snapshot local (menos carga a la API)
- UI responsive pensada para móvil (barra inferior, franja de guía sobre el mapa / panel lateral en desktop)

## Estructura

```
Routes/
├── backend/     # Express 5 + Auth0 + Velneo + Google Routes
│   ├── main.js
│   ├── routes/
│   ├── services/   # data.js, snapshotStore, routes, viewport, visitScheduler (horario)
│   ├── scripts/    # snapshot:refresh
│   └── tests/
└── frontend/    # React 19 + TypeScript + Vite + MUI
    └── src/
        ├── components/   # map, chrome, plan (agenda, opciones), filtros, leyenda…
        ├── services/     # API, auth y lógica pura del plan (con tests *.test.ts)
        └── theme.ts
```

## Requisitos

- Node.js 18+
- Auth0
- API Velneo ApiRest **v2** (index / `filterQuery`)
- Google Routes API key
- (Frontend mapa) clave CARTO / tiles según `.env.local`

## Backend

```bash
cd backend
cp .env.example .env   # completar valores
npm install
npm start
```

Variables importantes (ver `.env.example`):

| Variable | Notas |
|----------|--------|
| `AUTH0_*` / `AUTH0_SECRET` | OIDC; `AUTH0_SECRET` es el secreto de cookie de sesión |
| `AUTH0_BASE_URL` / `FRONTEND_URL` | En local: `http://localhost:5000` y `http://localhost:5173` |
| `VELNEO_API_BASE_URL` | Debe acabar en `/v2/` |
| `VELNEO_API_KEY` | GET en campos usados (ver abajo) |
| `GOOGLE_API_KEY` | Routes |
| `DATA_SNAPSHOT_*` | Snapshot en disco (opcional) |

Scripts útiles:

```bash
npm test
npm run snapshot:refresh   # re-extrae Velneo y reescribe snapshot
```

### Tablas Velneo y campos usados

La API key debe permitir **GET** de estos campos (o “Todos campos” en la tabla):

| Tabla | Campos |
|--------|--------|
| `ent_m` | `id`, `name`, `ape_1`, `ape_2`, `cif`, `es_tra_sim`, `off` |
| `ent_rel_m` | `ent`, `ent_rel`, `off`, `rel_tip` |
| `tip_ser` | `id`, `ent_m`, `mun_m`, `ser_nom` |
| `ate_m` | `id`, `tip_ser`, `dir_lon`, `dir_lat`, `mun_m` |
| `mun_m` | `id`, `name`, `pre_cps`, `cod_num` |
| `tra_m` | `id`, `tot_hor_con`, `hor_spapd`, `hor_pro`, `hor_cen`, `hor_uec` |

Filtros relevantes:

- Trabajadoras activas: `es_tra_sim=1` y `off=0` (`off` = Baja del sistema en UI)
- Relaciones activas: `ent_rel_m.off=0`
- Servicios de interés: `ser_nom` ∈ {4, 6}

## Frontend

```bash
cd frontend
# .env.local
# VITE_BACKEND_URL=http://localhost:5000
# VITE_CARTO_API_KEY=...
npm install
npm run dev
```

App en http://localhost:5173 (backend en :5000).

Comprobaciones:

```bash
npm test         # vitest
npm run lint
npm run build
```

En el backend, en Windows `npm test` no expande el glob: usar `node --test tests/*.test.js`.

## Uso rápido

1. Inicia sesión
2. **Filtros**: elige trabajadoras (máx. 12)
3. El mapa carga puntos, rutas y leyenda con km
4. **Plan** (abrirlo activa la planificación): elige a quién planificar, toca la salida y las usuarias que visitará; la franja sobre el mapa indica el siguiente paso
5. En cada visita: **Duración**, franjas («Disponible») u hora fija; ordena con flechas o arrastrando
6. **Organizar**: elige una opción (o «Tu orden»); el botón de mapa la muestra antes de aplicarla
7. **Enviar/Copiar agenda** para la trabajadora (WhatsApp, correo) o abrir en Google Maps
8. **Datos**: “Actualizar datos” regenera el snapshot Velneo (afecta a todos)

## Tecnologías

**Backend:** Express 5, Auth0, Axios, NodeCache, snapshot en disco, Google Routes  
**Frontend:** React 19, TypeScript, Vite, MUI, MapLibre, deck.gl, react-select

## Roadmap (alto nivel)

- Persistencia/caché en nube (p. ej. S3) y refresco en baja demanda
- Más interacción en mapa y filtros avanzados
