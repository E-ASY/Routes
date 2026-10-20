import { describe, expect, it } from 'vitest';
import { formatPersonName } from './person_name';

describe('formatPersonName', () => {
  it('añade los apellidos si el nombre no los trae (trabajadoras)', () => {
    expect(formatPersonName('Ana', 'López', 'Díaz')).toBe('Ana López Díaz');
  });

  it('no repite apellidos que ya vienen en el nombre (usuarias de Velneo)', () => {
    expect(formatPersonName('Carmen García Pérez', 'García', 'Pérez')).toBe('Carmen García Pérez');
  });

  it('ignora tildes, mayúsculas y espacios de más al comparar', () => {
    expect(formatPersonName('JOSE  MARTIN  RUIZ', 'Martín', 'ruiz')).toBe('JOSE  MARTIN  RUIZ');
  });

  it('añade solo el apellido que falta', () => {
    expect(formatPersonName('Luis Gómez', 'Gómez', 'Sanz')).toBe('Luis Gómez Sanz');
  });

  it('un apellido dentro de otra palabra no cuenta como repetido', () => {
    expect(formatPersonName('Rosa Garcialópez', 'García', null)).toBe('Rosa Garcialópez García');
  });

  it('sin datos devuelve cadena vacía', () => {
    expect(formatPersonName(null, undefined, '')).toBe('');
    expect(formatPersonName('', 'Pérez', null)).toBe('Pérez');
  });
});
