/**
 * Validación de query params de /maps (SEC-008).
 * Límites alineados con la UI (12 workers) y margen API (20).
 */
const MAX_WORKERS = Number(process.env.MAX_WORKERS || 20);
const MAX_MUNICIPALITIES = Number(process.env.MAX_MUNICIPALITIES || 50);
/** IDs Velneo tipados: numéricos o alfanuméricos cortos. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

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
 * Parsea y valida una lista de IDs desde query string.
 * @param {unknown} value
 * @param {{ name: string, max: number, required?: boolean }} options
 * @returns {{ ok: true, ids: string[] } | { ok: false, status: number, error: string }}
 */
function parseIdList(value, { name, max, required = false }) {
  const raw = normalizeQueryList(value);

  if (required && raw.length === 0) {
    return { ok: false, status: 400, error: `Se requiere el parámetro ${name}` };
  }

  if (raw.length > max) {
    return {
      ok: false,
      status: 400,
      error: `Máximo ${max} valores permitidos para ${name}`,
    };
  }

  const ids = [];
  for (const item of raw) {
    const id = String(item).trim();
    if (!ID_PATTERN.test(id)) {
      return {
        ok: false,
        status: 400,
        error: `Valor inválido en ${name}`,
      };
    }
    ids.push(id);
  }

  return { ok: true, ids: [...new Set(ids)] };
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
  parseWorkers,
  parseMunicipalities,
  parseIdList,
};
