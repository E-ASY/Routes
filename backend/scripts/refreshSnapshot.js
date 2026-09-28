/**
 * PERF-010: job de refresco — extrae Velneo, procesa y escribe snapshot en disco.
 * Uso: npm run snapshot:refresh
 * Cron ejemplo (baja demanda): 0 3 * * * cd /path/backend && npm run snapshot:refresh
 */
require('dotenv').config();
require('../config');

const { refreshSnapshotFromVelneo } = require('../services/data');
const { snapshotDir } = require('../services/snapshotStore');
const logger = require('../utils/logger');

(async () => {
  const started = Date.now();
  logger.info(`snapshot:refresh start dir=${snapshotDir()}`);
  try {
    const result = await refreshSnapshotFromVelneo();
    logger.info(
      `snapshot:refresh ok workers=${result.workers} municipalities=${result.municipalities} ` +
        `duration_ms=${Date.now() - started} fresh=${result.health.fresh}`
    );
    process.exit(0);
  } catch (error) {
    logger.error(`snapshot:refresh fail err=${error.message}`);
    process.exit(1);
  }
})();
