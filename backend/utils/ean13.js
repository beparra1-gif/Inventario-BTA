// Regla confirmada con datos reales de tienda 230 (inventario 22594):
// EAN 2861336000076 -> se descarta dígito 1 (2), dígitos 2-8 (7) son el
// código de producto (8613360), dígitos 9-10 se descartan (00), dígitos
// 11-12 son la talla cruda (07), dígito 13 (verificador) se descarta.
// codigo+talla = 861336007, que coincide exacto con la "COPIA PARA TXT"
// del Excel de captura y con la línea real del INV_BTA_22594_230.txt.

export function parseEAN13(codigoBarras) {
  const valor = String(codigoBarras ?? '').trim();
  if (!/^\d{13}$/.test(valor)) {
    return { valido: false, motivo: 'longitud' };
  }
  const codigoProducto = valor.slice(1, 8);
  const tallaCruda = valor.slice(10, 12);
  return {
    valido: true,
    codigoProducto,
    tallaCruda,
    codigoCombinado: codigoProducto + tallaCruda,
  };
}

// Regla confirmada por el usuario (2026-08-06): la talla cruda "01" se muestra
// como "talla única" en captura manual en vez de la talla real que traduciría
// reglas_talla, porque para varios artículos ese "01" no representa un punto
// real de la escala de tallas.
export function parseArticuloManual(codigoProducto, talla) {
  const codigo = String(codigoProducto ?? '').trim();
  const tallaStr = String(talla ?? '').trim().padStart(2, '0');
  if (!/^\d{7}$/.test(codigo)) return { valido: false, motivo: 'codigo_invalido' };
  if (!/^\d{2}$/.test(tallaStr)) return { valido: false, motivo: 'talla_invalida' };
  return {
    valido: true,
    codigoProducto: codigo,
    tallaCruda: tallaStr,
    codigoCombinado: codigo + tallaStr,
    tallaUnica: tallaStr === '01',
  };
}

// Consolida capturas individuales (una fila por escaneo/ingreso) sumando
// cantidad por (codigo, talla) — usado tanto en la vista de un tax como en
// el total del admin para todo el inventario.
export function agruparCapturas(capturas) {
  const mapa = new Map();
  for (const c of capturas) {
    const clave = `${c.codigo}-${c.talla}`;
    const actual = mapa.get(clave) ?? {
      codigo: c.codigo,
      talla: c.talla,
      cantidad: 0,
      reconocido: c.reconocido,
      descripcion: c.descripcion ?? null,
      tallaReal: c.tallaReal ?? null,
    };
    actual.cantidad += c.cantidad;
    mapa.set(clave, actual);
  }
  return [...mapa.values()];
}

// Réplica el formato legacy exacto: una línea por unidad física (no por
// fila de captura), verificado contra INV_BTA_22594_230.txt.
export function generarLineasExportacion({ numeroInventario, edp, capturas }) {
  const lineas = [];
  for (const c of capturas) {
    for (let i = 0; i < c.cantidad; i++) {
      lineas.push(`${numeroInventario};${edp};${c.codigo}${c.talla};1;`);
    }
  }
  return lineas;
}

export function nombreArchivoExportacion({ numeroInventario, edp }) {
  return `INV_BTA_${numeroInventario}_${edp}.txt`;
}
