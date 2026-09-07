/**
 * Observabilidad mínima (PERF-009).
 * Logs estructurados key=value fáciles de grepear.
 */
const logger = require('./logger');

/**
 * @param {string} event
 * @param {Record<string, string|number|boolean|undefined|null>} fields
 */
function logMetric(event, fields = {}) {
  const parts = [`event=${event}`];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) {
      continue;
    }
    const safe =
      typeof value === 'string'
        ? value.replace(/\s+/g, '_')
        : value;
    parts.push(`${key}=${safe}`);
  }
  logger.info(parts.join(' '));
}

module.exports = { logMetric };
