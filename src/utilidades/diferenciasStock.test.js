import { describe, expect, it } from 'vitest';
import { fueraDeTolerancia, agruparPorCodigo, participantesDe, calcularEstadisticas } from './diferenciasStock.js';

function item(codigo, talla, cantidadCapturada, cantidadStock, tax = []) {
  return {
    codigo,
    talla,
    descripcion: `PRODUCTO ${codigo}`,
    fotoUrl: `foto-${codigo}.jpg`,
    cantidadCapturada,
    cantidadStock,
    diferencia: cantidadCapturada - cantidadStock,
    revisadoEn: null,
    tax,
  };
}

describe('fueraDeTolerancia', () => {
  it('con tolerancia 0, cualquier diferencia distinta de 0 cuenta', () => {
    expect(fueraDeTolerancia(item('0015032', '05', 5, 5), 0)).toBe(false);
    expect(fueraDeTolerancia(item('0015032', '05', 6, 5), 0)).toBe(true);
  });

  it('con tolerancia > 0, diferencias chicas quedan dentro de rango', () => {
    expect(fueraDeTolerancia(item('0015032', '05', 6, 5), 1)).toBe(false); // diff +1, tolerancia 1
    expect(fueraDeTolerancia(item('0015032', '05', 7, 5), 1)).toBe(true); // diff +2, tolerancia 1
    expect(fueraDeTolerancia(item('0015032', '05', 4, 5), 1)).toBe(false); // diff -1, tolerancia 1
    expect(fueraDeTolerancia(item('0015032', '05', 3, 5), 1)).toBe(true); // diff -2, tolerancia 1
  });
});

describe('agruparPorCodigo', () => {
  it('suma capturado/stock/diferencia de todas las tallas del mismo código', () => {
    const items = [item('5516376', '03', 6, 4), item('5516376', '05', 3, 5)];
    const grupos = agruparPorCodigo(items);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({ codigo: '5516376', cantidadCapturada: 9, cantidadStock: 9, diferencia: 0 });
    expect(grupos[0].tallas).toHaveLength(2);
  });

  it('un código con diferencias que se cancelan sigue trayendo ambas tallas para revisar', () => {
    // Caso real verificado en producción (DEMO-10): 5516376 talla 03 +2,
    // talla 05 -2 — el neto es 0 pero cada talla individual sí difiere.
    const items = [item('5516376', '03', 6, 4), item('5516376', '05', 3, 5)];
    const [grupo] = agruparPorCodigo(items);
    expect(grupo.diferencia).toBe(0);
    const tallasConDiferencia = grupo.tallas.filter((t) => t.diferencia !== 0);
    expect(tallasConDiferencia).toHaveLength(2);
  });

  it('códigos distintos quedan en grupos separados, ordenados por diferencia absoluta', () => {
    const items = [item('A', '01', 1, 1), item('B', '01', 20, 2), item('C', '01', 5, 3)];
    const grupos = agruparPorCodigo(items);
    expect(grupos.map((g) => g.codigo)).toEqual(['B', 'C', 'A']);
  });
});

describe('participantesDe', () => {
  it('junta nombres únicos de todos los tax de todas las tallas del código', () => {
    const grupo = agruparPorCodigo([
      item('X', '01', 3, 3, [{ participanteId: 1, nombre: 'Camila Bravo', alias: 'cbravo' }]),
      item('X', '02', 2, 2, [
        { participanteId: 1, nombre: 'Camila Bravo', alias: 'cbravo' },
        { participanteId: 2, nombre: 'Ignacio Torres', alias: 'itorres' },
      ]),
    ])[0];
    expect(participantesDe(grupo)).toEqual(['Camila Bravo', 'Ignacio Torres']);
  });

  it('sin capturas asociadas devuelve lista vacía', () => {
    const grupo = agruparPorCodigo([item('X', '01', 0, 5)])[0];
    expect(participantesDe(grupo)).toEqual([]);
  });
});

describe('calcularEstadisticas', () => {
  it('reproduce los totales verificados del inventario de prueba DEMO-10', () => {
    const items = [
      item('0015038', '03', 5, 8),
      item('5516368', '03', 5, 5),
      item('5516372', '05', 3, 8),
      item('5516373', '04', 10, 4),
      item('5516374', '02', 4, 0),
      item('5516375', '06', 0, 7),
      item('5516376', '03', 6, 4),
      item('5516376', '05', 3, 5),
      item('5516377', '07', 5, 6),
      item('5516379', '02', 20, 2),
      item('5516380', '01', 8, 8),
    ];
    const stats = calcularEstadisticas(items, 0);
    expect(stats.lineasCapturadas).toBe(9);
    expect(stats.lineasStockTeorico).toBe(9);
    expect(stats.totalStockTeorico).toBe(57);
    expect(stats.articulosConDiferencia).toBe(8);
    expect(stats.pendientes).toBe(9);
  });

  it('con tolerancia, las diferencias chicas dejan de contar como pendientes', () => {
    const items = [item('A', '01', 6, 5), item('B', '01', 20, 2)]; // diff 1 y diff 18
    const stats = calcularEstadisticas(items, 1);
    expect(stats.articulosConDiferencia).toBe(1); // solo B queda fuera de tolerancia
    expect(stats.pendientes).toBe(1);
  });

  it('un renglón ya revisado no cuenta como pendiente aunque tenga diferencia', () => {
    const items = [{ ...item('A', '01', 6, 5), revisadoEn: '2026-01-01T00:00:00Z' }];
    const stats = calcularEstadisticas(items, 0);
    expect(stats.articulosConDiferencia).toBe(1);
    expect(stats.pendientes).toBe(0);
  });
});
