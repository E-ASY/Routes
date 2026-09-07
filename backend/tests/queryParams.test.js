/**
 * SEC-017: tests de schema / query params (node:test).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseWorkers,
  parseMunicipalities,
  MAX_WORKERS,
} = require('../utils/queryParams');

describe('parseWorkers (Zod)', () => {
  it('acepta lista válida y deduplica', () => {
    const result = parseWorkers(['1', '2', '1'], { required: true });
    assert.equal(result.ok, true);
    assert.deepEqual(result.ids, ['1', '2']);
  });

  it('acepta un único string', () => {
    const result = parseWorkers('42', { required: true });
    assert.equal(result.ok, true);
    assert.deepEqual(result.ids, ['42']);
  });

  it('rechaza si required y vacío', () => {
    const result = parseWorkers(undefined, { required: true });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.match(result.error, /workers/i);
  });

  it('rechaza más de MAX_WORKERS', () => {
    const ids = Array.from({ length: MAX_WORKERS + 1 }, (_, i) => String(i + 1));
    const result = parseWorkers(ids, { required: true });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.match(result.error, /Máximo/);
  });

  it('rechaza ID con caracteres inválidos', () => {
    const result = parseWorkers(['1', '../etc'], { required: true });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  });

  it('permite vacío si no required', () => {
    const result = parseWorkers(undefined);
    assert.equal(result.ok, true);
    assert.deepEqual(result.ids, []);
  });
});

describe('parseMunicipalities (Zod)', () => {
  it('acepta municipios válidos', () => {
    const result = parseMunicipalities(['10', '20']);
    assert.equal(result.ok, true);
    assert.deepEqual(result.ids, ['10', '20']);
  });

  it('rechaza ID demasiado largo', () => {
    const result = parseMunicipalities(['a'.repeat(65)]);
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  });
});
