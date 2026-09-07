/**
 * Respuestas de error seguras (SEC-006).
 * En producción no se expone `details`; sí un requestId correlacionable en logs.
 */
const crypto = require('crypto');

/**
 * @returns {string}
 */
function createRequestId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Respuesta 500 genérica. Loguea el error completo con requestId.
 * @param {import('express').Response} res
 * @param {unknown} error
 * @param {string} publicMessage
 */
function sendServerError(res, error, publicMessage) {
  const requestId = createRequestId();
  console.error(`[${requestId}] ${publicMessage}`, error);
  const body = {
    error: publicMessage,
    requestId,
  };
  if (process.env.NODE_ENV !== 'production') {
    body.details = error instanceof Error ? error.message : String(error);
  }
  return res.status(500).json(body);
}

/**
 * Middleware Express de errores no controlados.
 */
function globalErrorHandler(err, req, res, _next) {
  const requestId = createRequestId();
  console.error(`[${requestId}] Unhandled error`, err);
  const body = {
    error: 'Error interno del servidor',
    requestId,
  };
  if (process.env.NODE_ENV !== 'production') {
    body.details = err?.message || String(err);
  }
  res.status(500).json(body);
}

module.exports = {
  createRequestId,
  sendServerError,
  globalErrorHandler,
};
