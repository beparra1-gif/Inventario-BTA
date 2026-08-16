import { describe, expect, it } from 'vitest';
import { parsearStock } from './stock.js';

describe('parsearStock', () => {
  it('suma varias líneas por unidad física del mismo código+talla', () => {
    const filas = parsearStock('0015032;05;1\n0015032;05;1\n0015032;05;1');
    expect(filas).toEqual([{ codigo: '0015032', talla: '05', cantidad: 3 }]);
  });

  it('acepta una sola línea ya con la cantidad sumada', () => {
    const filas = parsearStock('5516371;07;12');
    expect(filas).toEqual([{ codigo: '5516371', talla: '07', cantidad: 12 }]);
  });

  it('rellena código a 7 dígitos y talla a 2 dígitos', () => {
    const filas = parsearStock('15032;5;1');
    expect(filas).toEqual([{ codigo: '0015032', talla: '05', cantidad: 1 }]);
  });

  it('ignora líneas vacías, mal formadas o con cantidad inválida', () => {
    const filas = parsearStock([
      '',
      '   ',
      '0015032;05', // faltan columnas
      '0015032;05;0', // cantidad 0
      '0015032;05;-3', // cantidad negativa
      'abc;05;1', // código no numérico
      '0015032;ab;1', // talla no numérica
      '0015032;05;abc', // cantidad no numérica
    ].join('\n'));
    expect(filas).toEqual([]);
  });

  it('mantiene código+talla distintos como líneas separadas', () => {
    const filas = parsearStock('0015032;05;1\n0015032;06;2\n5516371;05;3');
    expect(filas).toEqual([
      { codigo: '0015032', talla: '05', cantidad: 1 },
      { codigo: '0015032', talla: '06', cantidad: 2 },
      { codigo: '5516371', talla: '05', cantidad: 3 },
    ]);
  });

  it('tolera espacios alrededor de cada campo y saltos de línea \\r\\n', () => {
    const filas = parsearStock('0015032 ; 05 ; 2\r\n5516371;06;1\r\n');
    expect(filas).toEqual([
      { codigo: '0015032', talla: '05', cantidad: 2 },
      { codigo: '5516371', talla: '06', cantidad: 1 },
    ]);
  });
});
