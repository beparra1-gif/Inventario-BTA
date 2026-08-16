// Lógica pura del reporte de diferencias — separada de CruceStockScreen
// para poder testearla sin montar el componente. "Fuera de tolerancia" es
// el criterio único que decide si un renglón cuenta como diferencia real en
// cualquier parte del reporte (evita que el gate del backend y las
// estadísticas del frontend diverjan).
export function fueraDeTolerancia(item, tolerancia) {
  return Math.abs(item.diferencia) > tolerancia;
}

// Agrupa las filas código+talla en un solo renglón por código (un
// "artículo" = un producto, sin importar cuántas tallas distintas tenga)
// — así "línea capturada" cuenta productos, no código+talla.
export function agruparPorCodigo(items) {
  const mapa = new Map();
  for (const item of items) {
    if (!mapa.has(item.codigo)) {
      mapa.set(item.codigo, {
        codigo: item.codigo,
        descripcion: item.descripcion,
        fotoUrl: item.fotoUrl,
        cantidadCapturada: 0,
        cantidadStock: 0,
        diferencia: 0,
        tallas: [],
      });
    }
    const grupo = mapa.get(item.codigo);
    grupo.cantidadCapturada += item.cantidadCapturada;
    grupo.cantidadStock += item.cantidadStock;
    grupo.diferencia += item.diferencia;
    grupo.tallas.push(item);
  }
  return [...mapa.values()].sort(
    (a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia) || a.codigo.localeCompare(b.codigo)
  );
}

export function participantesDe(grupo) {
  const mapa = new Map();
  for (const talla of grupo.tallas) {
    for (const t of talla.tax) {
      if (!mapa.has(t.participanteId)) mapa.set(t.participanteId, t.nombre || t.alias);
    }
  }
  return [...mapa.values()];
}

export function calcularEstadisticas(items, tolerancia) {
  const codigosCapturados = new Set(items.filter((i) => i.cantidadCapturada > 0).map((i) => i.codigo));
  const codigosStock = new Set(items.filter((i) => i.cantidadStock > 0).map((i) => i.codigo));
  const codigosConDiferencia = new Set(items.filter((i) => fueraDeTolerancia(i, tolerancia)).map((i) => i.codigo));
  const totalStockTeorico = items.reduce((acc, i) => acc + i.cantidadStock, 0);
  const pendientes = items.filter((i) => fueraDeTolerancia(i, tolerancia) && !i.revisadoEn).length;

  return {
    lineasCapturadas: codigosCapturados.size,
    lineasStockTeorico: codigosStock.size,
    totalStockTeorico,
    articulosConDiferencia: codigosConDiferencia.size,
    pendientes,
  };
}
