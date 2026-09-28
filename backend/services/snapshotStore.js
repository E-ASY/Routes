/**
 * PERF-010: persistencia local de vistas materializadas (snapshot en disco).
 * Sustituible por S3/volumen montado vía DATA_SNAPSHOT_DIR.
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const logger = require('../utils/logger');

const PROCESSED_FILE = 'processed.json';
const MUNICIPALITIES_FILE = 'municipalities.json';
const META_FILE = 'meta.json';

function snapshotEnabled() {
  const raw = process.env.DATA_SNAPSHOT_ENABLED;
  if (raw === undefined || raw === '') return true;
  return raw !== '0' && raw !== 'false';
}

function snapshotDir() {
  return (
    process.env.DATA_SNAPSHOT_DIR ||
    path.join(__dirname, '..', 'data', 'snapshots')
  );
}

/** TTL por defecto 24 h */
function snapshotTtlMs() {
  const n = Number(process.env.DATA_SNAPSHOT_TTL_MS);
  return Number.isFinite(n) && n > 0 ? n : 24 * 60 * 60 * 1000;
}

function filePath(name) {
  return path.join(snapshotDir(), name);
}

async function ensureDir() {
  await fsp.mkdir(snapshotDir(), { recursive: true });
}

/**
 * Escritura atómica: tmp + rename.
 * @param {string} name
 * @param {unknown} data
 */
async function writeJsonAtomic(name, data) {
  await ensureDir();
  const target = filePath(name);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  const payload = `${JSON.stringify(data)}\n`;
  await fsp.writeFile(tmp, payload, 'utf8');
  await fsp.rename(tmp, target);
}

/**
 * @param {string} name
 * @returns {Promise<unknown|null>}
 */
async function readJson(name) {
  const target = filePath(name);
  try {
    const raw = await fsp.readFile(target, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    logger.warn(`snapshot read fail file=${name} err=${error.message}`);
    return null;
  }
}

/**
 * @param {{ createdAt?: string }|null} meta
 * @param {number} [now]
 */
function isFresh(meta, now = Date.now()) {
  if (!meta?.createdAt) return false;
  const created = Date.parse(meta.createdAt);
  if (!Number.isFinite(created)) return false;
  return now - created <= snapshotTtlMs();
}

async function readMeta() {
  const meta = await readJson(META_FILE);
  return meta && typeof meta === 'object' ? meta : null;
}

/**
 * @returns {Promise<{ finalData: Array, avilableMunicipalities: Array }|null>}
 */
async function loadProcessedSnapshot() {
  if (!snapshotEnabled()) return null;
  const meta = await readMeta();
  if (!isFresh(meta)) {
    if (meta) {
      logger.info(
        `event=snapshot_load cache=stale age_ms=${Date.now() - Date.parse(meta.createdAt || 0)}`
      );
    }
    return null;
  }
  const data = await readJson(PROCESSED_FILE);
  if (!data?.finalData || !data?.avilableMunicipalities) {
    logger.warn('snapshot processed inválido o incompleto');
    return null;
  }
  logger.info(
    `event=snapshot_load cache=hit source=disk workers=${data.finalData.length} ` +
      `municipalities=${data.avilableMunicipalities.length}`
  );
  return data;
}

/**
 * @returns {Promise<Array|null>}
 */
async function loadMunicipalitiesSnapshot() {
  if (!snapshotEnabled()) return null;
  const meta = await readMeta();
  if (!isFresh(meta)) return null;
  const list = await readJson(MUNICIPALITIES_FILE);
  if (!Array.isArray(list) || list.length === 0) return null;
  logger.info(`event=snapshot_load cache=hit source=disk kind=municipalities count=${list.length}`);
  return list;
}

/**
 * Persiste vistas tras un fetch Velneo exitoso.
 * @param {{ finalData: Array, avilableMunicipalities: Array }} processed
 * @param {Record<string, unknown>} [extraMeta]
 */
async function saveProcessedSnapshot(processed, extraMeta = {}) {
  if (!snapshotEnabled()) return null;
  if (!processed?.finalData || !processed?.avilableMunicipalities) {
    throw new Error('saveProcessedSnapshot: payload incompleto');
  }

  const municipalities = processed.avilableMunicipalities.map((muni) => ({
    id: muni.id,
    name: muni.name,
    pre_cps: muni.pre_cps,
    cod_num: muni.cod_num,
  }));

  const meta = {
    createdAt: new Date().toISOString(),
    ttl_ms: snapshotTtlMs(),
    workers: processed.finalData.length,
    municipalities: municipalities.length,
    ...extraMeta,
  };

  await writeJsonAtomic(PROCESSED_FILE, {
    finalData: processed.finalData,
    avilableMunicipalities: processed.avilableMunicipalities,
  });
  await writeJsonAtomic(MUNICIPALITIES_FILE, municipalities);
  await writeJsonAtomic(META_FILE, meta);

  logger.info(
    `event=snapshot_save workers=${meta.workers} municipalities=${meta.municipalities} ` +
      `dir=${snapshotDir()}`
  );
  return meta;
}

function getSnapshotHealth() {
  if (!snapshotEnabled()) {
    return { enabled: false };
  }
  const dir = snapshotDir();
  let meta = null;
  try {
    const raw = fs.readFileSync(filePath(META_FILE), 'utf8');
    meta = JSON.parse(raw);
  } catch {
    meta = null;
  }
  return {
    enabled: true,
    dir,
    ttl_ms: snapshotTtlMs(),
    fresh: isFresh(meta),
    createdAt: meta?.createdAt || null,
    workers: meta?.workers ?? null,
    municipalities: meta?.municipalities ?? null,
  };
}

module.exports = {
  snapshotEnabled,
  snapshotDir,
  snapshotTtlMs,
  isFresh,
  loadProcessedSnapshot,
  loadMunicipalitiesSnapshot,
  saveProcessedSnapshot,
  getSnapshotHealth,
  PROCESSED_FILE,
  MUNICIPALITIES_FILE,
  META_FILE,
};
