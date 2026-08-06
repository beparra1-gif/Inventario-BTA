import { describe, expect, it } from 'vitest';
import { derivarAlias, aliasDisponible } from './alias.js';

describe('derivarAlias', () => {
  it('arma inicial del nombre + apellido, en minúscula', () => {
    expect(derivarAlias('Javier Mena')).toBe('jmena');
  });

  it('quita tildes', () => {
    expect(derivarAlias('José Peña')).toBe('jpena');
  });

  it('usa el último apellido cuando hay varios nombres', () => {
    expect(derivarAlias('Maria Jose Soto Rivas')).toBe('mrivas');
  });

  it('un solo nombre se usa tal cual', () => {
    expect(derivarAlias('Javier')).toBe('javier');
  });
});

describe('aliasDisponible', () => {
  it('devuelve el mismo alias si no está tomado', () => {
    expect(aliasDisponible('jmena', ['jperez'])).toBe('jmena');
  });

  it('agrega un número si ya existe', () => {
    expect(aliasDisponible('jmena', ['jmena'])).toBe('jmena2');
    expect(aliasDisponible('jmena', ['jmena', 'jmena2'])).toBe('jmena3');
  });
});
