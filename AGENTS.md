# AGENTS.md

## Project overview

This repository contains a map-routing application split into:

- `frontend/`: React 19, TypeScript, Vite, Material UI, MapLibre and deck.gl.
- `backend/`: Node.js, CommonJS, Express 5 and Auth0.

## Working guidelines

- Keep frontend and backend concerns in their respective directories.
- Do not edit generated files, `node_modules/`, lockfiles, or build output unless the task requires it.
- Preserve the existing language and naming conventions in nearby code.
- Never commit secrets. Read credentials and environment-specific URLs from environment variables.
- Keep authentication, cookies, CORS and session behavior secure; do not weaken protections to bypass errors.
- Make focused changes and avoid unrelated refactors.

## Frontend

- Use TypeScript with strict typing; avoid `any` and non-null assertions when a safe check is possible.
- Use React functional components and hooks.
- Keep reusable API and authentication logic under `frontend/src/services/`.
- Follow the configured ESLint and TypeScript rules.
- Verify frontend changes from `frontend/` with:
  - `npm run lint`
  - `npm run build`

## Backend

- Use CommonJS (`require`/`module.exports`) consistently.
- Keep HTTP route handlers under `backend/routes/`.
- Validate request data and return appropriate HTTP status codes.
- Pass unexpected errors to the global error handler and avoid exposing sensitive details.
- Verify backend startup from `backend/` with `npm start`.

## Validation

- Run the smallest relevant checks after each change.
- When tests are unavailable, report what was validated manually.
- Do not claim a check passed unless it was actually run.
