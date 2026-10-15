/**
 * Validación de query params de /maps (SEC-008 + SEC-017).
 * Schemas Zod: tipo, longitud, max items, regex de ID.
 */
const { z } = require('zod');

const MAX_WORKERS = Number(process.env.MAX_WORKERS || 20);
const MAX_MUNICIPALITIES = Number(process.env.MAX_MUNICIPALITIES || 50);

/** IDs Velneo tipados: alfanuméricos cortos. */
const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'ID inválido');

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizeQueryList(value) {
  if (value == null || value === '') {
    return [];
  }
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

/**
 * @param {number} max
 * @param {boolean} required
 */
function idListSchema(max, required) {
  let schema = z.array(idSchema).max(max, `Máximo ${max} valores permitidos`);
  if (required) {
    schema = schema.min(1, 'Se requiere al menos un ID');
  }
  return schema.transform((ids) => [...new Set(ids)]);
}

/**
 * Parsea y valida una lista de IDs desde query string con Zod.
 * @param {unknown} value
 * @param {{ name: string, max: number, required?: boolean }} options
 * @returns {{ ok: true, ids: string[] } | { ok: false, status: number, error: string }}
 */
function parseIdList(value, { name, max, required = false }) {
  const raw = normalizeQueryList(value);
  const result = idListSchema(max, required).safeParse(raw);

  if (!result.success) {
    const first = result.error.issues[0];
    let error = `Valor inválido en ${name}`;
    if (first) {
      if (first.code === 'too_big') {
        error = `Máximo ${max} valores permitidos para ${name}`;
      } else if (first.code === 'too_small' && required) {
        error = `Se requiere el parámetro ${name}`;
      } else if (first.message && first.message !== 'Invalid') {
        error = first.path.length
          ? `Valor inválido en ${name}`
          : first.message.includes('Máximo')
            ? `Máximo ${max} valores permitidos para ${name}`
            : first.message.includes('al menos')
              ? `Se requiere el parámetro ${name}`
              : `Valor inválido en ${name}`;
      }
    }
    return { ok: false, status: 400, error };
  }

  return { ok: true, ids: result.data };
}

/**
 * @param {unknown} value
 * @param {{ required?: boolean }} [opts]
 */
function parseWorkers(value, opts = {}) {
  return parseIdList(value, {
    name: 'workers',
    max: MAX_WORKERS,
    required: opts.required === true,
  });
}

/**
 * @param {unknown} value
 * @param {{ required?: boolean }} [opts]
 */
function parseMunicipalities(value, opts = {}) {
  return parseIdList(value, {
    name: 'municipalities',
    max: MAX_MUNICIPALITIES,
    required: opts.required === true,
  });
}

/** PERF-013: misma cota que POST /legs (partida + 14 visitas + llegada). */
const MAX_PLAN_POINTS = 16;

const latLonSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lon: z.number().finite().min(-180).max(180),
});

const optimizeOrderBodySchema = z
  .object({
    points: z
      .array(latLonSchema)
      .min(2, 'Se requieren al menos 2 puntos (partida + 1 visita)')
      .max(MAX_PLAN_POINTS, `Máximo ${MAX_PLAN_POINTS} puntos (partida + visitas + llegada)`),
    returnToStart: z.boolean().optional(),
    // El último punto es la llegada fija (acabar en otro sitio)
    endAtLast: z.boolean().optional(),
  })
  .refine((b) => !(b.returnToStart && b.endAtLast), {
    message: 'returnToStart y endAtLast son excluyentes',
  })
  .refine((b) => !b.endAtLast || b.points.length >= 3, {
    message: 'Con llegada se requieren al menos 3 puntos (partida + 1 visita + llegada)',
  });

/**
 * Valida el body de POST /maps/optimize-order.
 * @param {unknown} body
 * @returns {{ ok: true, points: Array<{lat:number, lon:number}>, returnToStart: boolean, endAtLast: boolean }
 *   | { ok: false, status: number, error: string }}
 */
function parseOptimizeOrderBody(body) {
  const result = optimizeOrderBodySchema.safeParse(body ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    if (first && first.code === 'custom') {
      return { ok: false, status: 400, error: first.message };
    }
    const isCount = first && first.path.length === 1 && first.path[0] === 'points'
      && (first.code === 'too_big' || first.code === 'too_small');
    return {
      ok: false,
      status: 400,
      error: isCount ? first.message : 'body.points debe ser [{ lat, lon }, ...] con coordenadas válidas',
    };
  }
  return {
    ok: true,
    points: result.data.points.map(({ lat, lon }) => ({ lat, lon })),
    returnToStart: result.data.returnToStart === true,
    endAtLast: result.data.endAtLast === true,
  };
}

module.exports = {
  MAX_PLAN_POINTS,
  parseOptimizeOrderBody,
  MAX_WORKERS,
  MAX_MUNICIPALITIES,
  idSchema,
  parseWorkers,
  parseMunicipalities,
  parseIdList,
  normalizeQueryList,
};
