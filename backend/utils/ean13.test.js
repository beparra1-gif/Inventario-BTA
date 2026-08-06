import { describe, it, expect } from 'vitest';
import {
  parseEAN13,
  parseArticuloManual,
  agruparCapturas,
  generarLineasExportacion,
  nombreArchivoExportacion,
} from './ean13.js';

describe('parseEAN13', () => {
  it('parsea el ejemplo real de tienda 230 (inventario 22594)', () => {
    const r = parseEAN13('2861336000076');
    expect(r.valido).toBe(true);
    expect(r.codigoProducto).toBe('8613360');
    expect(r.tallaCruda).toBe('07');
    expect(r.codigoCombinado).toBe('861336007');
  });

  it('parsea el ejemplo del enunciado (código 9999999, talla 06)', () => {
    const r = parseEAN13('3999999900067');
    expect(r.codigoProducto).toBe('9999999');
    expect(r.tallaCruda).toBe('06');
  });

  it('rechaza códigos que no tienen 13 dígitos', () => {
    expect(parseEAN13('12345').valido).toBe(false);
  });
});

describe('parseArticuloManual', () => {
  it('acepta código de 7 dígitos y talla, normalizando con ceros a la izquierda', () => {
    const r = parseArticuloManual('8613360', '7');
    expect(r.valido).toBe(true);
    expect(r.tallaCruda).toBe('07');
    expect(r.codigoCombinado).toBe('861336007');
    expect(r.tallaUnica).toBe(false);
  });

  it('rechaza código que no tiene 7 dígitos', () => {
    expect(parseArticuloManual('123', '07').valido).toBe(false);
  });

  it('marca tallaUnica cuando la talla cruda es "01"', () => {
    const r = parseArticuloManual('8613360', '1');
    expect(r.tallaCruda).toBe('01');
    expect(r.tallaUnica).toBe(true);
  });
});

describe('agruparCapturas', () => {
  it('suma cantidades repetidas del mismo codigo+talla', () => {
    const resultado = agruparCapturas([
      { codigo: '8613360', talla: '07', cantidad: 1, reconocido: true, descripcion: 'X', tallaReal: '44' },
      { codigo: '8613360', talla: '07', cantidad: 3, reconocido: true, descripcion: 'X', tallaReal: '44' },
      { codigo: '8613360', talla: '08', cantidad: 2, reconocido: true, descripcion: 'X', tallaReal: '45' },
    ]);
    expect(resultado).toEqual([
      { codigo: '8613360', talla: '07', cantidad: 4, reconocido: true, descripcion: 'X', tallaReal: '44' },
      { codigo: '8613360', talla: '08', cantidad: 2, reconocido: true, descripcion: 'X', tallaReal: '45' },
    ]);
  });

  it('deja tallaReal en null si no viene informada', () => {
    const resultado = agruparCapturas([{ codigo: '2010122', talla: '01', cantidad: 1, reconocido: false }]);
    expect(resultado[0].tallaReal).toBeNull();
  });
});

describe('exportación .txt', () => {
  it('genera el nombre de archivo con el formato INV_BTA_{numero}_{edp}', () => {
    expect(nombreArchivoExportacion({ numeroInventario: '22594', edp: 230 })).toBe(
      'INV_BTA_22594_230.txt'
    );
  });

  it('genera una línea por código+talla con la cantidad total', () => {
    const lineas = generarLineasExportacion({
      numeroInventario: '22594',
      edp: 230,
      capturas: [{ codigo: '8613360', talla: '07', cantidad: 2 }],
    });
    expect(lineas).toEqual(['22594;230;861336007;2;']);
  });

  it('suma capturas repetidas del mismo código+talla en una sola línea', () => {
    const lineas = generarLineasExportacion({
      numeroInventario: '22594',
      edp: 230,
      capturas: [
        { codigo: '8613360', talla: '07', cantidad: 1 },
        { codigo: '8613360', talla: '07', cantidad: 1 },
        { codigo: '8613360', talla: '07', cantidad: 3 },
        { codigo: '2010122', talla: '01', cantidad: 5 },
      ],
    });
    expect(lineas).toEqual(['22594;230;861336007;5;', '22594;230;201012201;5;']);
  });
});
