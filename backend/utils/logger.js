/**
 * Logger con niveles (SEC-022).
 * LOG_LEVEL=error|warn|info|debug — default: info en production, debug en development.
 * DEBUG_ACUFADE_DATA=true fuerza debug.
 */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

function resolveLevel() {
  if (process.env.DEBUG_ACUFADE_DATA === 'true') {
    return LEVELS.debug;
  }
  const fromEnv = String(process.env.LOG_LEVEL || '').toLowerCase();
  if (fromEnv in LEVELS) {
    return LEVELS[fromEnv];
  }
  return process.env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug;
}

let current = resolveLevel();

function should(level) {
  return LEVELS[level] <= current;
}

const logger = {
  error: (...args) => {
    if (should('error')) console.error(...args);
  },
  warn: (...args) => {
    if (should('warn')) console.warn(...args);
  },
  info: (...args) => {
    if (should('info')) console.log(...args);
  },
  debug: (...args) => {
    if (should('debug')) console.log(...args);
  },
};

module.exports = logger;
