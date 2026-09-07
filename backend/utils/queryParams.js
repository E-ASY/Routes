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

module.exports = {
  MAX_WORKERS,
  MAX_MUNICIPALITIES,
  idSchema,
  parseWorkers,
  parseMunicipalities,
  parseIdList,
  normalizeQueryList,
};
