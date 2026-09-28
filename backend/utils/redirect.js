/**
 * Redirects seguros (SEC-003 / SEC-013).
 */
const { config } = require('../config');

/**
 * @param {unknown} candidate
 * @returns {string}
 */
function getSafeReturnTo(candidate) {
  const fallback = config.frontendUrl;
  if (typeof candidate !== 'string' || !candidate.trim()) {
    return fallback;
  }
  try {
    const url = new URL(candidate);
    if (config.allowedOrigins.includes(url.origin)) {
      return url.toString();
    }
  } catch {
    // URL inválida → fallback
  }
  console.warn('Redirect rechazado (fuera de allowlist):', candidate);
  return fallback;
}

/**
 * SEC-021: exige Origin o Referer en allowlist (anti CSRF en POST logout).
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function isAllowedRequestOrigin(req) {
  const origin = req.get('Origin');
  if (origin) {
    return config.allowedOrigins.includes(origin);
  }
  const referer = req.get('Referer');
  if (referer) {
    try {
      return config.allowedOrigins.includes(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  return false;
}

module.exports = { getSafeReturnTo, isAllowedRequestOrigin };
