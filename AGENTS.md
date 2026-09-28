# AGENTS.md

## Project overview

Map-routing app for ACUFADE home-care workers:

- `frontend/`: React 19, TypeScript, Vite, MUI, MapLibre, deck.gl
- `backend/`: Node.js CommonJS, Express 5, Auth0, Velneo ApiRest v2, Google Routes

Primary UX: select workers → show assigned users on a map → routes/km → optional visit planning (manual order + leg distances). No municipality filter in the UI.

## Working guidelines

- Keep frontend and backend changes in their directories.
- Do not edit `node_modules/`, build output, or lockfiles unless the task requires it.
- Never commit secrets (`.env`, `.env.local`, credentials). Use `.env.example` as the template.
- Do not weaken Auth0, cookies, CORS, CSRF, or session protections to “fix” errors.
- Prefer focused diffs; avoid unrelated refactors.
- Spanish UI copy is fine; match nearby tone.

## Frontend

- TypeScript; avoid `any` and unnecessary non-null assertions.
- Functional components. API/auth helpers live under `frontend/src/services/`.
- Chrome: `app_chrome.tsx` — bottom bar (mobile) / right drawer (desktop). Keep filter selection **controlled from App state** so closing the sheet does not clear the map.
- Theme tokens: `frontend/src/theme.ts` + CSS variables in `index.css` (ink/sage surfaces, not flat white).
- Verify from `frontend/`: `npm run lint`, `npm run build`.

## Backend

- CommonJS (`require` / `module.exports`).
- Routes in `backend/routes/`; domain logic in `backend/services/` (`data.js`, `snapshotStore.js`, `routes.js`, `viewport.js`).
- Prefer `VELNEO_API_BASE_URL` ending in `/v2/` so `index` / `filterQuery` work. On v1 they are ignored silently.
- Active workers: `ent_m` with `filterQuery[es_tra_sim]=1` and `filterQuery[off]=0`. Field `off` = “Baja del sistema” (not `desactivado`).
- Snapshot: disk cache under `data/snapshots` (PERF-010). Refresh via `POST /maps/refresh-snapshot` or `npm run snapshot:refresh`.
- Rate-limit expensive routes (maps/routes/refresh). Validate query params (`utils/queryParams.js`).
- Verify: `npm start`, `npm test` from `backend/`.

### Velneo fields the app requests

Agents changing data load must keep API key field ACL in sync:

| Table | Fields |
|--------|--------|
| `ent_m` | `id,name,ape_1,ape_2,cif,es_tra_sim,off` |
| `ent_rel_m` | `ent,ent_rel,off,rel_tip` |
| `tip_ser` | `id,ent_m,mun_m,ser_nom` (interest `ser_nom` 4\|6) |
| `ate_m` | `id,tip_ser,dir_lon,dir_lat,mun_m` |
| `mun_m` | `id,name,pre_cps,cod_num` |
| `tra_m` | `id,tot_hor_con,hor_spapd,hor_pro,hor_cen,hor_uec` |

ACL deny for a listed field returns Velneo 401 `"No se retornan valores del campo…"`.

## Validation

- Run the smallest relevant checks after changes.
- Do not claim a check passed unless it was run.
- After Velneo ACL or filter changes: refresh snapshot and confirm excluded entities (e.g. `off: true`) are absent from `/maps/workers` data.
